"use client";

/**
 * Start, stop and reopen a survey.
 *
 * The ingest already builds a run from whatever source is wired — it has since
 * the first widget mounted. What is missing without this file is a *boundary*:
 * a run that begins when the operator says "recording" rather than when a panel
 * happened to mount, that survives the tab being closed, and that can be opened
 * again tomorrow. That is all a mission is.
 *
 * ## The three states
 *
 * `idle` → `recording` → `stopped`, and back to `idle` on discard or on
 * starting the next one. There is no `paused`: a gap in a survey is a gap in the
 * ground covered, and a run whose timebase silently skips four minutes would put
 * a straight line through unswept terrain on every map in the cockpit.
 *
 * ## Spilling
 *
 * Samples are written in fixed blocks as they accumulate (see
 * `run-codec.ts`), so what a crash costs is bounded by the block size rather
 * than by how long the survey has been running. The header is rewritten with
 * each block because the alerts and targets are sparse and ride in it.
 *
 * ## Failure is reported, not swallowed
 *
 * If persistence refuses — private mode, a full disk, another tab holding an
 * older schema — the mission keeps recording, because the run in memory is
 * still complete and still worth having. What must not happen is that it keeps
 * recording *quietly*: the snapshot carries the error, and the widget says the
 * mission is not being written down.
 */

import {
	adoptEmiRun,
	getEmiSnapshot,
	releaseAdoptedRun,
	resetEmiRun,
	subscribeEmiStore,
} from "../state/emi-store";
import { readEmiParams } from "../state/atoms";
import type { EmiRun } from "../detector/run-types";
import {
	createIndexedDbStorage,
	createMemoryStorage,
	type MissionStorage,
} from "./mission-db";
import {
	CHUNK_SAMPLES,
	chunkFromRun,
	headerFromRun,
	missionBytes,
	runFromMission,
	type MissionHeader,
} from "./run-codec";

/** Where a mission is in its life. */
export type MissionPhase = "idle" | "recording" | "stopped";

/** A mission as the picker lists it. */
export interface StoredMission {
	id: string;
	name: string;
	startedAt: number;
	/** Null when the page went away before the mission was stopped. */
	endedAt: number | null;
	n: number;
	sampleRateHz: number;
	/** Approximate size on disk. */
	bytes: number;
	/** Datasource the mission was recorded from. */
	label: string;
}

/** What the mission control widget reads. */
export interface MissionSnapshot {
	readonly phase: MissionPhase;
	/** The mission being recorded, or the one just stopped. */
	readonly id: string | null;
	readonly name: string;
	/** Wall clock at start, epoch milliseconds; 0 when idle. */
	readonly startedAt: number;
	/** Samples in the run right now. */
	readonly samples: number;
	/** Samples durably written. */
	readonly spilled: number;
	/** Stored missions, newest first. */
	readonly missions: readonly StoredMission[];
	/** The mission currently open for review, if any. */
	readonly openId: string | null;
	/** Which backing store is in use. */
	readonly persistence: "indexeddb" | "memory";
	/** True while an open, delete or stop is in flight. */
	readonly busy: boolean;
	/**
	 * True once a write failed and the survey stopped being persisted.
	 *
	 * Separate from {@link error} because it is a *state*, not an event: the
	 * error line is cleared by the next successful action, and clearing it while
	 * the mission is still not being written down would tell the operator the
	 * survey is safe when it is not.
	 */
	readonly writeFailed: boolean;
	/** The last thing that went wrong, for the operator. Cleared by the next action. */
	readonly error: string | null;
	/** Bumped on every change; part of the identity, never read alone. */
	readonly rev: number;
}

/** The empty snapshot, also the server snapshot. */
const EMPTY: MissionSnapshot = Object.freeze({
	phase: "idle" as const,
	id: null,
	name: "",
	startedAt: 0,
	samples: 0,
	spilled: 0,
	missions: [],
	openId: null,
	persistence: "memory" as const,
	busy: false,
	writeFailed: false,
	error: null,
	rev: 0,
});

/** Mutable state. */
interface MissionState {
	snapshot: MissionSnapshot;
	listeners: Set<() => void>;
	storage: MissionStorage | null;
	persistence: "indexeddb" | "memory";
	/** Unsubscribe from the run store while recording. */
	unwatch: (() => void) | null;
	/**
	 * The run object the mission is recording into.
	 *
	 * The **object**, not its id. `EmiRunBuilder.reset()` — a backwards seek, or
	 * an explicit clear — builds a fresh run under the *same* id, so an id
	 * comparison cannot tell one timebase from the next and two surveys would be
	 * spliced into one mission with no warning.
	 */
	runRef: EmiRun | null;
	/**
	 * Bumped by every action that ends the current mission.
	 *
	 * A spill is a loop of awaits, and start/discard/abort can land in the middle
	 * of one. Without a token the loop would carry on writing the previous run's
	 * samples under the *next* mission's id, at the previous mission's offsets —
	 * producing a mission whose first block is missing and which therefore
	 * recovers as empty.
	 *
	 * Every bump goes through `(s.epoch ?? 0) + 1` rather than `+= 1`. This
	 * record is pinned on `globalThis` and can therefore have been created by a
	 * *duplicate copy* of this module (the `src` vs `dist` hazard recorded in
	 * `AGENTS.md`) that predates this field. `undefined + 1` is `NaN`, and since
	 * `NaN !== NaN` every generation check would then bail — silently disabling
	 * spilling and error reporting rather than failing loudly.
	 */
	epoch: number;
	/**
	 * True once the mission's header exists in storage.
	 *
	 * It cannot be written when recording starts: starting clears the run, and a
	 * cleared builder has no run at all until the next message rebuilds it — so
	 * there is nothing to take the coil ids, the offsets or the projection origin
	 * from. The header is written at the first commit instead, which is the first
	 * moment the mission has a shape.
	 */
	headerWritten: boolean;
	/** Next chunk sequence number. */
	seq: number;
	/**
	 * The spill in flight, if any.
	 *
	 * Two callers must be told apart. A routine spill arriving while one is
	 * running has nothing to add — the running one will pick up whatever
	 * accumulated — and simply returns. The **final** spill must not: skipping it
	 * because a write happened to be in flight is how a survey loses its last
	 * minute at the exact moment the operator presses stop.
	 */
	flushing: Promise<void> | null;
	/** True once a write failed; stops retrying on every commit. */
	writeFailed: boolean;
	refs: number;
	seed: number;
}

const PIN = "__ormi_teodor_emi_missions__" as const;

/** The one mission state, pinned for the reason recorded in `AGENTS.md`. */
function state(): MissionState {
	const g = globalThis as unknown as Record<string, MissionState | undefined>;
	let s = g[PIN];
	if (!s) {
		s = {
			snapshot: EMPTY,
			listeners: new Set(),
			storage: null,
			persistence: "memory",
			unwatch: null,
			runRef: null,
			epoch: 0,
			headerWritten: false,
			seq: 0,
			flushing: null,
			writeFailed: false,
			refs: 0,
			seed: 0,
		};
		g[PIN] = s;
	}
	return s;
}

/** Resolve the backing store on first use. */
function storage(): MissionStorage {
	const s = state();
	if (!s.storage) {
		const idb = createIndexedDbStorage();
		s.storage = idb ?? createMemoryStorage();
		s.persistence = idb ? "indexeddb" : "memory";
	}
	return s.storage;
}

/** Replace the snapshot and notify. */
function set(patch: Partial<MissionSnapshot>): void {
	const s = state();
	s.snapshot = Object.freeze({
		...s.snapshot,
		...patch,
		persistence: s.persistence,
		rev: s.snapshot.rev + 1,
	});
	for (const l of s.listeners) l();
}

/** Subscribe to mission changes. */
export function subscribeMissionStore(listener: () => void): () => void {
	const s = state();
	s.listeners.add(listener);
	return () => {
		s.listeners.delete(listener);
	};
}

/** The current mission snapshot. */
export function getMissionSnapshot(): MissionSnapshot {
	return state().snapshot;
}

/** Server snapshot — nothing is recorded there. */
export function getMissionServerSnapshot(): MissionSnapshot {
	return EMPTY;
}

/** Human-readable form of whatever was thrown. */
function reason(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** A stored mission, from its header. */
function toStored(h: MissionHeader): StoredMission {
	return {
		id: h.id,
		name: h.name,
		startedAt: h.startedAt,
		endedAt: h.endedAt,
		n: h.n,
		sampleRateHz: h.sampleRateHz,
		bytes: missionBytes(h),
		label: h.label,
	};
}

/**
 * Re-read the stored mission list.
 *
 * Also the recovery path: a header still carrying a null `endedAt` is a mission
 * the browser was closed on, and appears in the list marked as such rather than
 * being cleaned up. Deleting it is the operator's call — it is their survey, and
 * an interrupted one is still most of a survey.
 */
export async function refreshMissions(): Promise<void> {
	try {
		const headers = await storage().listHeaders();
		const missions = headers
			.map(toStored)
			.sort((a, b) => b.startedAt - a.startedAt);
		// Deliberately does not touch `error`. Clearing a message is the job of
		// the action that begins something, and this runs after almost every
		// other one — including `abort`, whose whole purpose is to leave an
		// explanation on screen, and after a write failure, where the warning
		// must stand for as long as nothing is being written.
		set({ missions });
	} catch (err) {
		set({ error: `Could not read stored missions: ${reason(err)}` });
	}
}

/**
 * Write the header for the mission in progress.
 *
 * Called on start and on every spill: the alerts and targets live in the header,
 * and they are what a recovered mission would otherwise be missing.
 */
async function writeHeader(
	run: EmiRun,
	upTo: number,
	endedAt: number | null,
): Promise<void> {
	const s = state();
	const snap = s.snapshot;
	if (!snap.id) return;
	// The header describes the run *as of* `upTo`, not as of now. Stop unhooks
	// the mission but not the ingest, so `run.n` keeps climbing while the final
	// blocks are written — and a header claiming samples no chunk holds makes a
	// clean mission reopen as "the rest was never written".
	const frozen = upTo >= run.n ? run : { ...run, n: upTo };
	await storage().putHeader(
		headerFromRun(frozen, {
			id: snap.id,
			name: snap.name,
			startedAt: snap.startedAt,
			endedAt,
			params: readEmiParams(),
		}),
	);
	s.headerWritten = true;
}

/**
 * The mission is still recording the run it started on.
 *
 * Compares the run **object**, because `EmiRunBuilder.reset()` — a backwards
 * seek, or an explicit clear — rebuilds a fresh run under the same id. A shrunk
 * sample count catches the same thing from the other side.
 */
function stillOurs(run: EmiRun | null): boolean {
	const s = state();
	if (!run) return false;
	if (!s.runRef) return true;
	return run === s.runRef && run.n >= s.snapshot.spilled;
}

/**
 * Write whatever whole blocks have accumulated.
 *
 * @param tail - Also write a final partial block; used by stop.
 * @param upTo - Highest sample index to write; defaults to everything.
 */
async function spill(tail: boolean, upTo?: number): Promise<void> {
	const s = state();
	if (s.writeFailed) return;
	if (s.flushing) {
		// A routine spill has nothing to add — the one already running will take
		// whatever accumulated. The final one waits its turn instead: returning
		// here would drop the tail of the survey precisely when stop was pressed
		// during a write.
		if (!tail) return;
		await s.flushing.catch(() => undefined);
	}
	if (s.snapshot.phase !== "recording" && !tail) return;

	const run = getEmiSnapshot().run;
	if (!run) return;
	s.runRef ??= run;

	// Everything below is captured now and re-checked after every await. A
	// start, a discard or an abort landing mid-loop bumps the epoch; without
	// that check the loop would carry on writing this run's samples under the
	// *next* mission's id, leaving that mission missing its first block and
	// recovering as empty.
	const epoch = s.epoch;
	const missionId = s.snapshot.id;
	if (!missionId) return;
	const ceiling = upTo ?? Number.POSITIVE_INFINITY;

	const work = (async () => {
		try {
			let spilled = s.snapshot.spilled;
			let wrote = false;
			for (;;) {
				const end = Math.min(run.n, ceiling);
				const left = end - spilled;
				// Whole blocks always; the remainder only when the mission is
				// ending. A partial block written mid-run would be rewritten under
				// the same sequence number a minute later — a write for nothing,
				// and a second chance to get the offset wrong.
				const count =
					left >= CHUNK_SAMPLES ? CHUNK_SAMPLES : tail ? left : 0;
				if (count <= 0) break;
				const chunk = chunkFromRun(
					run,
					missionId,
					s.seq,
					spilled,
					count,
				);
				if (!chunk) break;
				await storage().putChunk(chunk);
				if (s.epoch !== epoch) return;
				s.seq += 1;
				spilled += count;
				wrote = true;
				set({ spilled, samples: run.n });
			}
			set({ samples: run.n });
			// Refresh the header behind the chunks just written: it carries the
			// alert and target lists, and its sample count is what a recovery
			// compares its chunks against. Deliberately the run's count and not
			// the spilled one — the difference between them is exactly what a
			// crash would cost, and recording it is how the reopened mission can
			// say "N of M" instead of quietly presenting a short survey as whole.
			// Stop writes its own header, with an end time and a fixed ceiling.
			if (wrote && !tail) {
				await writeHeader(run, run.n, null);
				if (s.epoch !== epoch) return;
			}
		} catch (err) {
			if (s.epoch !== epoch) return;
			s.writeFailed = true;
			set({
				writeFailed: true,
				error: `The mission is recording but is no longer being written to disk: ${reason(err)}`,
			});
		}
	})();
	s.flushing = work;
	try {
		await work;
	} finally {
		if (s.flushing === work) s.flushing = null;
	}
}

/** React to a run commit while recording. */
function onRunCommit(): void {
	const s = state();
	if (s.snapshot.phase !== "recording") return;
	const run = getEmiSnapshot().run;
	set({ samples: run?.n ?? 0 });
	if (!run) return;

	// Checked here, not inside `spill`: the spill is only *called* once a whole
	// block has accumulated, so a guard living inside it cannot see a run that
	// shrank — and by the time the new run has grown past the old offset the
	// evidence is gone and two timebases get spliced into one mission.
	if (!stillOurs(run)) {
		void abort("the datasource changed while recording");
		return;
	}

	// The first commit is where the mission acquires its shape, and therefore
	// where its header can first be written. It is also the earliest a crash can
	// leave something recoverable, so it happens before any chunk.
	if (!s.headerWritten) {
		s.runRef = run;
		const epoch = s.epoch;
		void writeHeader(run, run.n, null)
			.then(() => {
				if (s.epoch === epoch) return refreshMissions();
			})
			.catch((err: unknown) => {
				if (s.epoch !== epoch) return;
				s.writeFailed = true;
				set({
					writeFailed: true,
					error: `The mission is recording but is not being written to disk: ${reason(err)}`,
				});
			});
		return;
	}
	if (run.n - s.snapshot.spilled >= CHUNK_SAMPLES) void spill(false);
}

/** Stop watching the run. */
function unwatch(): void {
	const s = state();
	s.unwatch?.();
	s.unwatch = null;
}

/**
 * Begin a mission.
 *
 * The run is cleared first: the mission's first sample must be the one after
 * the operator pressed record, not whatever the panels had already accumulated
 * since the page was opened.
 *
 * @param name - Operator's name for it.
 * @returns The mission id, or null if there is nothing to record.
 */
export function startMission(name: string): string | null {
	const s = state();
	if (s.snapshot.phase === "recording") return s.snapshot.id;

	// Checked before the reset, not after: clearing the builder drops its run
	// until the next message rebuilds it, so a check on the far side would refuse
	// every mission that was about to succeed.
	const before = getEmiSnapshot();
	if (!before.run && !before.bundle) {
		set({ error: "No EMI source is wired — nothing to record." });
		return null;
	}

	releaseAdoptedRun();
	resetEmiRun();

	const startedAt = Date.now();
	s.seed += 1;
	// Time plus a per-page counter: two missions started inside one millisecond
	// is not a scenario, but two started from the same page and colliding on the
	// key would silently interleave their chunks.
	const id = `mission-${startedAt}-${s.seed}`;
	// Bumped before anything else: a spill from the previous mission may be
	// mid-await, and this is what makes it stop rather than write the old run's
	// samples under this mission's id. `flushing` is deliberately left alone —
	// clearing it would let a second loop start beside the one still unwinding.
	s.epoch = (s.epoch ?? 0) + 1;
	s.runRef = null;
	s.seq = 0;
	s.writeFailed = false;
	s.headerWritten = false;

	set({
		phase: "recording",
		id,
		name: name.trim() || new Date(startedAt).toLocaleString(),
		startedAt,
		samples: 0,
		spilled: 0,
		openId: null,
		writeFailed: false,
		error: null,
	});

	unwatch();
	s.unwatch = subscribeEmiStore(onRunCommit);
	// The source may already have samples buffered from before the reset landed.
	onRunCommit();
	return id;
}

/**
 * End the mission and flush what is left.
 *
 * @returns True if a mission was recording.
 */
export async function stopMission(): Promise<boolean> {
	const s = state();
	if (s.snapshot.phase !== "recording") return false;
	unwatch();
	// Every action clears the previous message on entry, so the one on screen
	// always belongs to the last thing the operator did.
	set({ busy: true, error: null });

	// Nothing arrived between the two presses. There is no survey to keep, and
	// leaving a "stopped" mission pointing at a header that was never written
	// would offer the operator a recording they cannot open.
	const run = getEmiSnapshot().run;
	if (!run || run.n === 0) {
		set({
			phase: "idle",
			id: null,
			samples: 0,
			spilled: 0,
			busy: false,
			error: "Nothing was recorded — no samples arrived.",
		});
		return true;
	}

	// The mission ends *here*, at this sample count. Stopping unhooks the mission
	// but not the ingest, so the run keeps growing while the final blocks are
	// written; without a ceiling the header would claim samples no chunk holds
	// and a clean mission would reopen as "the rest was never written".
	const end = run.n;

	// A failed write earlier in the run must not stop the final flush from being
	// attempted: whatever went wrong may have cleared, and the tail is the part
	// the operator most expects to be there.
	s.writeFailed = false;
	set({ writeFailed: false });
	await spill(true, end);
	try {
		await writeHeader(run, end, Date.now());
	} catch (err) {
		set({
			error: `The mission ended but could not be finalised: ${reason(err)}`,
		});
	}
	set({ phase: "stopped", busy: false });
	await refreshMissions();
	return true;
}

/** End a mission that cannot continue, and say why. */
async function abort(why: string): Promise<void> {
	const s = state();
	if (s.snapshot.phase !== "recording") return;
	unwatch();
	// The run that is on show is no longer the mission's, so it cannot supply the
	// header — whatever was spilled is what the mission is, and the header it
	// already has describes exactly that. Ending it is a state change, not a
	// write.
	s.epoch = (s.epoch ?? 0) + 1;
	s.runRef = null;
	set({ phase: "stopped", error: `Recording stopped: ${why}.` });
	await refreshMissions();
}

/**
 * Throw away the mission that was just recorded.
 *
 * @returns True if there was one to discard.
 */
export async function discardMission(): Promise<boolean> {
	const s = state();
	const id = s.snapshot.id;
	if (!id || s.snapshot.phase === "idle") return false;
	unwatch();
	// Same reason as `startMission`: a spill may be mid-await, and without the
	// bump it would write chunks back under an id whose header has just been
	// deleted — tens of megabytes left in the database with nothing to reach or
	// remove them by.
	s.epoch = (s.epoch ?? 0) + 1;
	s.runRef = null;
	s.seq = 0;
	s.headerWritten = false;
	s.writeFailed = false;
	set({ busy: true, writeFailed: false });
	try {
		await storage().deleteMission(id);
		set({ phase: "idle", id: null, samples: 0, spilled: 0, error: null });
	} catch (err) {
		set({ error: `Could not discard the mission: ${reason(err)}` });
	}
	set({ busy: false });
	await refreshMissions();
	return true;
}

/**
 * Open a stored mission for review.
 *
 * The live ingest stops for as long as it is open. What comes back is the same
 * {@link EmiRun} the panels were drawing while it was recorded — not a
 * re-derivation of it — so the numbers are identical by construction rather
 * than by argument.
 *
 * @param id - The mission to open.
 * @returns True if it opened.
 */
export async function openMission(id: string): Promise<boolean> {
	const s = state();
	if (s.snapshot.phase === "recording") {
		set({ error: "Stop the mission before opening another one." });
		return false;
	}
	set({ busy: true, error: null });
	try {
		const header = await storage().getHeader(id);
		if (!header) {
			set({ busy: false, error: "That mission is no longer stored." });
			return false;
		}
		const chunks = await storage().loadChunks(id);
		const recovered = runFromMission(header, chunks);
		if (!recovered) {
			set({
				busy: false,
				error: "That mission was written by a newer version of this plugin.",
			});
			return false;
		}
		if (recovered.n === 0) {
			set({ busy: false, error: "That mission holds no samples." });
			return false;
		}
		adoptEmiRun(recovered.run);
		set({
			busy: false,
			openId: id,
			phase: "idle",
			id: null,
			samples: recovered.n,
			spilled: 0,
			error:
				recovered.missing > 0
					? `Opened ${recovered.n} of ${header.n} samples — the rest was never written${recovered.truncated ? " and the sequence has a gap" : ""}.`
					: null,
		});
		return true;
	} catch (err) {
		set({
			busy: false,
			error: `Could not open the mission: ${reason(err)}`,
		});
		return false;
	}
}

/** Close the mission under review and go back to the live source. */
export function closeMission(): void {
	if (releaseAdoptedRun()) set({ openId: null, samples: 0 });
	else set({ openId: null });
}

/**
 * Delete a stored mission.
 *
 * @param id - The mission to delete.
 */
export async function deleteMission(id: string): Promise<void> {
	const s = state();
	if (s.snapshot.phase === "recording" && s.snapshot.id === id) {
		set({ error: "That mission is still recording." });
		return;
	}
	set({ busy: true, error: null });
	try {
		await storage().deleteMission(id);
		if (s.snapshot.openId === id) closeMission();
		// The stopped mission was the one just deleted, so there is nothing left
		// to discard — leaving the phase at `stopped` would keep offering it.
		if (s.snapshot.id === id) {
			set({ phase: "idle", id: null, samples: 0, spilled: 0 });
		}
	} catch (err) {
		set({ error: `Could not delete the mission: ${reason(err)}` });
	}
	set({ busy: false });
	await refreshMissions();
}

/**
 * Declare that the mission controls are on screen.
 *
 * The list is read once for the first caller — that is also when an interrupted
 * mission from a previous session surfaces.
 *
 * @returns A release function.
 */
export function acquireMissionStore(): () => void {
	const s = state();
	s.refs += 1;
	if (s.refs === 1) void refreshMissions();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		s.refs = Math.max(0, s.refs - 1);
	};
}

/** Test seam: forget everything, including which storage was resolved. */
export function __resetMissionStoreForTests(
	storageOverride?: MissionStorage,
): void {
	const s = state();
	unwatch();
	s.listeners.clear();
	s.storage = storageOverride ?? null;
	// An injected double is always the in-memory kind; without one the next
	// `storage()` call resolves the real backing and sets this itself.
	s.persistence = "memory";
	// Bumped, not reset: a spill from the previous test may still be unwinding,
	// and it must not write into the store the next test is about to build.
	s.epoch = (s.epoch ?? 0) + 1;
	s.runRef = null;
	s.seq = 0;
	s.flushing = null;
	s.writeFailed = false;
	s.headerWritten = false;
	s.refs = 0;
	s.seed = 0;
	s.snapshot = EMPTY;
}
