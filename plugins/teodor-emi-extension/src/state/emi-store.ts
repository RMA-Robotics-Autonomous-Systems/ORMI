"use client";

/**
 * The one run every EMI widget reads, and the one subscription that fills it.
 *
 * ## Why this is a module singleton rather than a context
 *
 * The panels are ordinary widgets. An operator can drop the signal stack on a
 * dashboard that has no EMI page around it, and two panels on two dashboards
 * must not each open their own copy of the same six topics. A module-level store
 * with a refcount gives both: the first widget to mount starts the ingest, the
 * last to unmount stops it, and nothing needs a provider above it.
 *
 * It is pinned on `globalThis` for the reason recorded in `AGENTS.md`: a package
 * imported through two specifiers (barrel vs subpath, `src` vs `dist`) is two
 * modules and would be two stores, which fails as "the widget shows nothing
 * while the data is plainly arriving".
 *
 * ## Why `useSyncExternalStore` and not a version counter
 *
 * The web app builds with `reactCompiler: true`, which infers memo dependencies
 * from the callback body and drops reads it decides are dead. A `useMemo` keyed
 * on a bumped counter whose body reads this module would be frozen on its first
 * result — the failure that stranded every TF widget. The snapshot below is
 * identity-stable and change-fresh so it can be a real dependency.
 */

import {
	getDatasourceSubscriptionRegistry,
	type SubscriptionHandle,
	type SubscriptionManagerLike,
} from "@workspace/utils";
import type { EmiRun } from "../detector/run-types";
import { clearMadCache } from "../detector/replay";
import { clearReplayCache } from "./use-emi-run";
import { EmiRunBuilder, type BuilderStatus } from "./run-builder";
import { bundleKey, type EmiTopicBundle } from "./emi-topics";
import type {
	EMIGnssMessage,
	EMIMessage,
	EMITargetListMessage,
	QuaternionStamped,
} from "../msgs/emi-types";
import type { TFMessage } from "../msgs/frames";

/**
 * How often an accumulating run is published to React, milliseconds.
 *
 * Messages land at the EMI rate; re-rendering four canvases and re-running the
 * detector at that rate would spend the whole frame budget redrawing a curve
 * that moved by one pixel. The buffers are appended to at full rate regardless —
 * this throttles only the notification.
 */
const COMMIT_MS = 100;

/** What every EMI widget reads. */
export interface EmiSnapshot {
	/** The run, or null before the first sample. */
	readonly run: EmiRun | null;
	/** Bumped on every commit; part of the identity, never read on its own. */
	readonly rev: number;
	/** Samples resolved so far. */
	readonly n: number;
	/** Build diagnostics — geometry provenance, drops, seeks. */
	readonly status: BuilderStatus | null;
	/** GNSS antenna offset in the body frame, from the tree when it resolved. */
	readonly leverArm: readonly [number, number];
	/** Topics currently feeding the run; null when nothing is wired. */
	readonly bundle: EmiTopicBundle | null;
	/** True while the ingest holds live subscriptions. */
	readonly ingesting: boolean;
	/**
	 * True when the run on show was opened from storage rather than ingested.
	 *
	 * A reviewed mission is not a stalled live source, and the difference has to
	 * be visible: the panels are correct and complete, the ingest is deliberately
	 * stopped, and "back to live" is a button rather than a reconnection.
	 */
	readonly adopted: boolean;
	/**
	 * Runs opened earlier in this session, newest first.
	 *
	 * Switching the source archives the run it replaces instead of discarding
	 * it, which is what lets the repeatability overlay compare several passes
	 * over the same ground. In memory only: a reload starts an empty library,
	 * and nothing here is persisted.
	 */
	readonly library: readonly EmiRun[];
}

/** The empty snapshot — also the server snapshot. */
const EMPTY: EmiSnapshot = Object.freeze({
	run: null,
	rev: 0,
	n: 0,
	status: null,
	leverArm: [0.165, 0.15] as const,
	bundle: null,
	ingesting: false,
	adopted: false,
	library: [],
});

/** Mutable store state. */
interface EmiStoreState {
	snapshot: EmiSnapshot;
	builder: EmiRunBuilder | null;
	listeners: Set<() => void>;
	handles: SubscriptionHandle[];
	manager: SubscriptionManagerLike | null;
	bundle: EmiTopicBundle | null;
	refs: number;
	timer: ReturnType<typeof setTimeout> | null;
	runSeq: number;
	library: EmiRun[];
	/** A run opened from storage, shown in place of the ingested one. */
	adopted: EmiRun | null;
}

const PIN = "__ormi_teodor_emi_store__" as const;

/** The single store instance, pinned across duplicate module copies. */
function store(): EmiStoreState {
	const g = globalThis as unknown as Record<
		string,
		EmiStoreState | undefined
	>;
	let s = g[PIN];
	if (!s) {
		s = {
			snapshot: EMPTY,
			builder: null,
			listeners: new Set(),
			handles: [],
			manager: null,
			bundle: null,
			refs: 0,
			timer: null,
			runSeq: 0,
			library: [],
			adopted: null,
		};
		g[PIN] = s;
	}
	return s;
}

/** Subscribe to run changes. */
export function subscribeEmiStore(listener: () => void): () => void {
	const s = store();
	s.listeners.add(listener);
	return () => {
		s.listeners.delete(listener);
	};
}

/** Current snapshot. Identity changes exactly when something changed. */
export function getEmiSnapshot(): EmiSnapshot {
	return store().snapshot;
}

/** Server snapshot — nothing has been ingested during SSR, by construction. */
export function getEmiServerSnapshot(): EmiSnapshot {
	return EMPTY;
}

/** Rebuild the snapshot and notify. */
function commit(): void {
	const s = store();
	if (s.timer) {
		clearTimeout(s.timer);
		s.timer = null;
	}
	// An opened mission wins over the builder. Not a fallback: while a run is
	// adopted the builder is idle by construction, and reading it here would
	// replace the mission under review with an empty live run at the next commit.
	const run = s.adopted ?? s.builder?.finalize() ?? null;
	// One read: `status` allocates, and two reads would put two objects that
	// cannot differ into one snapshot, so a consumer comparing them by identity
	// would see a change on every commit.
	const status = s.adopted ? null : (s.builder?.status ?? null);
	s.snapshot = Object.freeze({
		run,
		rev: s.snapshot.rev + 1,
		n: run?.n ?? 0,
		status,
		leverArm: status?.geometry.leverArm ?? EMPTY.leverArm,
		bundle: s.bundle,
		ingesting: s.handles.length > 0,
		adopted: s.adopted !== null,
		library: s.library,
	});
	for (const l of s.listeners) l();
}

/** Coalesce a commit onto the publish interval. */
function scheduleCommit(): void {
	const s = store();
	if (s.timer) return;
	s.timer = setTimeout(commit, COMMIT_MS);
}

/**
 * Route one message to the builder.
 *
 * Wrapped so a single malformed payload — a truncated CDR frame, a topic whose
 * type was guessed wrong — costs one message rather than the subscription.
 */
function route(role: keyof typeof ROUTES, value: unknown): void {
	const s = store();
	const b = s.builder;
	if (!b) return;
	try {
		ROUTES[role](b, value);
	} catch (err) {
		console.error(`[EMI] dropped a ${role} message:`, err);
		return;
	}
	if (b.dirty) scheduleCommit();
}

/** Per-role handlers, so the subscription loop stays declarative. */
const ROUTES = {
	primary: (b: EmiRunBuilder, v: unknown) => b.onEmiGnss(v as EMIGnssMessage),
	alert: (b: EmiRunBuilder, v: unknown) => b.onAlert(v as EMIGnssMessage),
	targets: (b: EmiRunBuilder, v: unknown) =>
		b.onTargets(v as EMITargetListMessage),
	fix: (b: EmiRunBuilder, v: unknown) => b.onFix(v),
	quaternion: (b: EmiRunBuilder, v: unknown) =>
		b.onQuaternion(v as QuaternionStamped),
	tfStatic: (b: EmiRunBuilder, v: unknown) => b.onTfStatic(v as TFMessage),
	raw: (b: EmiRunBuilder, v: unknown) => b.onEmiRaw(v as EMIMessage),
} as const;

/** Drop every subscription. */
function stopIngest(): void {
	const s = store();
	for (const h of s.handles) h.unsubscribe();
	s.handles = [];
}

/** Open subscriptions for the current bundle. */
function startIngest(): void {
	const s = store();
	if (!s.manager || !s.bundle || s.refs === 0) return;
	// Reviewing a recorded mission deliberately stops reading the robot: a live
	// message arriving while a mission is on show would append to a builder
	// nothing is displaying, and the operator would be paying for six
	// subscriptions to fill a run they cannot see.
	if (s.adopted) return;
	const registry = getDatasourceSubscriptionRegistry(s.manager);
	const b = s.bundle;

	const add = (
		topic: EmiTopicBundle["primary"] | undefined,
		role: keyof typeof ROUTES,
	) => {
		if (!topic) return;
		s.handles.push(
			registry.subscribe({
				topic,
				onData: (value) => route(role, value),
			}),
		);
	};

	add(b.primary, "primary");
	add(b.alert, "alert");
	for (const t of b.targets) {
		s.handles.push(
			registry.subscribe({
				topic: t,
				onData: (value) => route("targets", value),
			}),
		);
	}
	add(b.fix, "fix");
	add(b.quaternion, "quaternion");
	add(b.tfStatic, "tfStatic");
	add(b.raw, "raw");
}

/**
 * Point the ingest at a set of topics.
 *
 * Idempotent on the bundle's identity: discovery re-runs on a poll interval and
 * hands back an equivalent bundle every time, so re-wiring on each poll would
 * restart the run twice a second.
 *
 * @param manager - Plugins manager owning the subscription registry.
 * @param bundle - Topics to read, or null to stop reading.
 */
export function setEmiSource(
	manager: SubscriptionManagerLike,
	bundle: EmiTopicBundle | null,
): void {
	const s = store();
	const sameManager = s.manager === manager;
	if (sameManager && bundleKey(s.bundle) === bundleKey(bundle)) return;

	stopIngest();
	// The adopted run survives a re-wire. Discovery re-runs every two seconds and
	// calls this whenever the topic list shifts — a robot going away, a
	// reconnect — and dropping the mission under review there would swap a
	// complete survey for an empty live run while the operator was reading it.
	// Only `releaseAdoptedRun` ends a review, and `startIngest` stays refused
	// until it does.
	if (!s.adopted) archiveCurrentRun();
	s.manager = manager;
	s.bundle = bundle;
	s.runSeq += 1;
	s.builder = bundle
		? new EmiRunBuilder({
				id: `${bundle.datasourceId}#${s.runSeq}`,
				// A replayed recording and a live robot are the same code path
				// but not the same provenance, and the distinction is baked into
				// every archived run and every future export.
				source: bundle.isReplay ? "bag" : "mission",
				label: bundle.datasourceTitle,
			})
		: null;
	startIngest();
	commit();
}

/**
 * Largest number of finished runs kept for comparison.
 *
 * Each is the whole recording in typed arrays — tens of megabytes for a long
 * survey — so this is a memory ceiling, not a preference. The oldest is dropped
 * rather than the newest: an operator comparing passes is working forwards.
 */
const LIBRARY_MAX = 6;

/**
 * Move the current run into the library, if it has anything in it.
 *
 * The buffers are trimmed to the samples actually resolved. A growing run is
 * over-allocated by up to a factor of two (the columns double), and an archived
 * run is kept for the rest of the session — so keeping the slack would roughly
 * double a ceiling that is already the reason {@link LIBRARY_MAX} exists.
 */
function archiveCurrentRun(): void {
	const s = store();
	const run = s.adopted ?? s.builder?.finalize();
	if (!run || run.n === 0) return;
	// A run rebuilt from storage was allocated at exactly its sample count, so
	// there is no slack to trim and trimming would copy every column for nothing.
	const already = run.t.length === run.n;
	const kept = already ? run : trimRun(run);
	// Re-opening the same mission twice must not put two copies in the library
	// and make the overlay draw a run against itself.
	s.library = [kept, ...s.library.filter((r) => r.id !== kept.id)].slice(
		0,
		LIBRARY_MAX,
	);
}

/** A copy of a run holding exactly its resolved samples. */
function trimRun(run: EmiRun): EmiRun {
	const n = run.n;
	const nc = run.ncoil;
	const cut = <T extends Float64Array | Int32Array>(
		a: T,
		stride: number,
	): T => a.slice(0, n * stride) as T;
	return {
		...run,
		t: cut(run.t, 1),
		fixLat: cut(run.fixLat, 1),
		fixLon: cut(run.fixLon, 1),
		sx: cut(run.sx, 1),
		sy: cut(run.sy, 1),
		sigma: cut(run.sigma, 1),
		yaw: cut(run.yaw, 1),
		coilLat: cut(run.coilLat, nc),
		coilLon: cut(run.coilLon, nc),
		raw1: cut(run.raw1, nc),
		raw2: cut(run.raw2, nc),
		// The pre-removal channels are only read by the walkthrough, and only
		// when the source carried `/emi/raw`; an archived run that never saw it
		// has no reason to carry two more columns of zeros.
		pre1: run.hasPre ? cut(run.pre1, nc) : new Int32Array(0),
		pre2: run.hasPre ? cut(run.pre2, nc) : new Int32Array(0),
		recorded: {
			...run.recorded,
			atrThreshold: cut(run.recorded.atrThreshold, 1),
		},
	};
}

/** Forget every archived run. */
export function clearEmiLibrary(): void {
	const s = store();
	s.library = [];
	commit();
}

/**
 * Declare that a widget is reading the run.
 *
 * @returns A release function; the ingest stops when the last one is called.
 */
export function acquireEmiIngest(): () => void {
	const s = store();
	s.refs += 1;
	if (s.refs === 1 && s.handles.length === 0) startIngest();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		s.refs -= 1;
		if (s.refs <= 0) {
			s.refs = 0;
			stopIngest();
			commit();
		}
	};
}

/**
 * Throw the run away and start again.
 *
 * The subscriptions are left open: this is "clear the survey", not "disconnect".
 */
export function resetEmiRun(): void {
	const s = store();
	s.builder?.reset();
	commit();
}

/**
 * Show a run that was opened from storage instead of the ingested one.
 *
 * The live ingest stops for as long as it is shown — see {@link startIngest} —
 * and the run being replaced is archived, so opening two missions in a row is
 * how the repeatability overlay gets two passes to compare.
 *
 * @param run - The opened run.
 */
export function adoptEmiRun(run: EmiRun): void {
	const s = store();
	stopIngest();
	archiveCurrentRun();
	s.builder?.reset();
	s.adopted = run;
	commit();
}

/**
 * Stop showing an opened run and go back to the live source.
 *
 * @returns True if a run was being shown.
 */
export function releaseAdoptedRun(): boolean {
	const s = store();
	if (!s.adopted) return false;
	archiveCurrentRun();
	s.adopted = null;
	startIngest();
	commit();
	return true;
}

/** The run currently on show, without subscribing. For exports and writers. */
export function getEmiRun(): EmiRun | null {
	return store().snapshot.run;
}

/** Test seam: drop every subscription, listener and buffer. */
export function __resetEmiStoreForTests(): void {
	const s = store();
	stopIngest();
	s.builder = null;
	s.bundle = null;
	s.manager = null;
	s.refs = 0;
	s.library = [];
	s.adopted = null;
	// The shared replay is keyed on `rev`, which restarts from 0 here — without
	// this, the first commit after a reset returns the previous run's result.
	clearReplayCache();
	clearMadCache();
	s.listeners.clear();
	if (s.timer) clearTimeout(s.timer);
	s.timer = null;
	s.snapshot = EMPTY;
}
