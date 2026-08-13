/// <reference lib="webworker" />

/**
 * A recording, answering the datasource protocol.
 *
 * This is the piece that makes "offline" stop being a mode. It opens a `.db3`
 * with sql.js, enumerates the bag's own topics, and on `subscribe` replays that
 * topic's messages against a virtual clock — so every widget above it
 * subscribes through the ordinary registry and never learns whether the data
 * came from a file or from a robot.
 *
 * Split of work, mirroring the reference tool's server/browser split: this
 * worker does everything fixed for a recording (decode, project, publish);
 * everything downstream of a tunable parameter happens on the main thread over
 * arrays already in memory.
 *
 * Two properties are deliberate:
 *
 * - **Nothing is skipped.** When a tick cannot publish everything due, the
 *   clock is held back rather than the surplus dropped. A replay that runs at
 *   0.8× is slow; a detector that never sees a sample is wrong.
 * - **Messages are streamed, not loaded.** A prepared statement per topic steps
 *   through `messages` in timestamp order, so a long recording costs one row of
 *   memory per subscription rather than the whole table.
 */

import initSqlJs, { type Database, type Statement } from "sql.js";
// The runtime import comes from `…/datasources/worker`, NOT from
// `…/datasources`. The latter barrel re-exports `global-datasource-provider`,
// which reaches the dashboard barrel, which imports react-grid-layout's
// stylesheet — and a stylesheet in a worker's chunk list is fetched by
// `importScripts`, which cannot execute CSS. The worker then dies before
// `init`, every panel reads offline, and none of the load guards can fire
// because they all live downstream of a worker that runs. Invisible in dev
// (source aliases, no CSS chunk split); fatal in a production build.
// Type-only imports of the full barrel are fine — they are erased.
import { createDatasourceWorker } from "@workspace/ormi-core/datasources/worker";
import type {
	DatasourceWorkerContext,
	DatasourceWorkerImplementation,
} from "@workspace/ormi-core/datasources";
import type {
	DatasourceProviderSettings,
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import type {
	RemoteCallDefinition,
	RemoteCallResult,
} from "@workspace/ormi-core/datasources";

import { canDecode } from "../msgs/schemas";
import { decodeMessage } from "../msgs/readers";
import { convertToWebapp, webappTypeFor } from "../msgs/ros-to-webapp";
import { EMI_TYPES } from "../msgs/emi-types";
import { ReplayClock } from "./replay-clock";
import {
	REPLAY_PROBLEM_MESSAGE,
	type ReplayProblemKind,
	type ReplayProblemMessage,
} from "./replay-status";
import {
	REPLAY_CALLS,
	type ReplayStatus,
	replayCallDefinitions,
} from "./replay-calls";

/** Settings the provider hands over at init. */
export interface EmiReplaySettings extends DatasourceProviderSettings {
	/** Display name of the recording. */
	bagName: string;
	/**
	 * The `.db3` bytes. Runtime-only — the provider adds this when it spawns
	 * the worker; it is never part of the persisted datasource settings.
	 */
	buffer?: ArrayBuffer;
	/** Start playing as soon as the recording opens. */
	autoplay?: boolean;
	/** Initial playback rate. */
	rate?: number;
	/**
	 * Deliver the whole recording at open instead of playing it back.
	 *
	 * Default. A bag is being *read*, not watched: waiting twenty minutes of
	 * wall clock for twenty minutes of survey to arrive is time spent looking at
	 * a chart that is still filling in. Draining hands every panel a complete
	 * run within a second or two, after which the playhead is a cursor over the
	 * whole recording rather than a live edge chasing the end of it.
	 *
	 * The transport is not removed by this — play, pause, seek and rate are
	 * still remote calls, and setting this false gives back real-time playback.
	 */
	drain?: boolean;
}

/** How often the replay pump runs while playing back, milliseconds. */
const TICK_MS = 50;

/**
 * Most messages one tick may publish, across all topics.
 *
 * A ceiling rather than a target: at 1× nothing comes close to it, and at 50×
 * it is what stops a single tick from blocking the worker for a second. When it
 * bites, the clock is held back so the surplus is replayed next tick rather
 * than skipped.
 */
const TICK_BUDGET = 4000;

/**
 * Wall-clock milliseconds one drain pass may spend before yielding.
 *
 * A drain has no clock to pace it, so the only thing standing between "deliver
 * everything" and a frozen tab is this. Each published message crosses to the
 * main thread and is fanned out there, so a pass that ran to completion would
 * hand the UI thread one unbroken block of work the length of the recording.
 * Twelve milliseconds keeps every pass inside a frame, and the whole bag still
 * lands in a second or two because the passes run back to back.
 */
const DRAIN_SLICE_MS = 12;

/** A topic being replayed. */
interface Subscription {
	topic: string;
	rosType: string;
	topicId: number;
	/** How many widgets asked for it. */
	refs: number;
	/** Cursor over `messages`, or null once exhausted. */
	stmt: Statement | null;
	/** The next row, read ahead so the pump can test its time without consuming it. */
	pending: { tsNs: number; data: Uint8Array } | null;
}

/**
 * A failure the operator can do something about.
 *
 * Distinguished from an ordinary throw so the message that reaches the panels
 * carries a *kind* and a next step, rather than whatever sql.js happened to say.
 */
class BagProblem extends Error {
	constructor(
		readonly kind: ReplayProblemKind,
		message: string,
		readonly advice: string,
	) {
		super(message);
		this.name = "BagProblem";
	}
}

/**
 * Tell the main thread the recording will not play.
 *
 * A bare `postMessage`, because `DatasourceWorkerContext` has no failure
 * channel and core is immutable. The RPC client on the other side dispatches
 * only on `rpc/response` and `rpc/event`, so this passes it by untouched and is
 * picked up by the provider, which owns the `Worker`.
 *
 * @param kind - What sort of problem.
 * @param message - What happened.
 * @param advice - What to do about it.
 */
function reportProblem(
	kind: ReplayProblemKind,
	message: string,
	advice: string,
): void {
	const payload: ReplayProblemMessage = {
		type: REPLAY_PROBLEM_MESSAGE,
		kind,
		message,
		advice,
	};
	(self as unknown as DedicatedWorkerGlobalScope).postMessage(payload);
}

createDatasourceWorker<EmiReplaySettings>(
	(
		ctx: DatasourceWorkerContext,
	): DatasourceWorkerImplementation<EmiReplaySettings> => {
		let db: Database | null = null;
		/**
		 * Settings WITHOUT the recording's bytes.
		 *
		 * Every `DatasourceTopic` carries `source`, and every remote-call
		 * definition carries it too — both are structured-cloned back to the
		 * main thread, topics on every `AVAILABLE_TOPICS` poll (every 2 s while
		 * any auto-discovery widget is mounted) and remote calls into Jotai
		 * state for the datasource's lifetime. Handing those the settings object
		 * that still holds `buffer` would copy the whole recording across the
		 * boundary, repeatedly. This is the object everything published uses.
		 */
		let settings: EmiReplaySettings | null = null;
		let clock: ReplayClock | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		/** Set when the recording could not be opened. */
		let openError: string | null = null;
		/** Autoplay is deferred to the first subscribe; see `subscribe`. */
		let autoplayPending = false;
		/** True once the end has been reached and the clock parked there. */
		let ended = false;
		/**
		 * Delivering the whole recording as fast as the main thread will take it.
		 *
		 * Set from `drain` at open and cleared the moment every cursor runs out,
		 * after which the datasource behaves exactly as it did before — a clock,
		 * a 50 ms pump, and a transport that can seek back into what was
		 * delivered. A seek while draining is meaningless and is ignored by
		 * `reseekAll` being a no-op on exhausted cursors, not by a special case.
		 */
		let draining = false;

		/** Bag timestamp of the first message, so positions are recording-relative. */
		let startNs = 0;
		let durationNs = 0;
		let topics: DatasourceTopic[] = [];
		const subs = new Map<string, Subscription>();

		// ------------------------------------------------------------------
		// opening
		// ------------------------------------------------------------------

		async function open(s: EmiReplaySettings): Promise<void> {
			if (!s.buffer) {
				throw new Error(
					`No recording loaded for "${s.bagName}". Pick a .db3 file on the datasource before enabling it.`,
				);
			}

			// In a worker a bare path has no base origin, and sql.js may ask for
			// either wasm file name — map both onto the one served from public/.
			const SQL = await initSqlJs({
				locateFile: () => `${self.location.origin}/sql-wasm.wasm`,
			});
			db = new SQL.Database(new Uint8Array(s.buffer));

			// A SQLite file is not necessarily a rosbag2. The picker checks the
			// magic bytes, which is as far as the main thread can get; whether
			// the two tables the replay reads actually exist is only knowable
			// here, and "no such table: messages" thrown out of the first query
			// is not a sentence anyone should have to translate.
			const tables = query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('topics','messages')",
			).map(([name]) => String(name));
			if (!tables.includes("topics") || !tables.includes("messages")) {
				throw new BagProblem(
					"not-a-bag",
					`"${s.bagName}" is a SQLite database, but not a rosbag2 recording — it has no \`topics\`/\`messages\` tables.`,
					"Open the `.db3` from inside a rosbag2 bag directory.",
				);
			}

			const range = query(
				"SELECT MIN(timestamp), MAX(timestamp) FROM messages",
			);
			startNs = Number(range[0]?.[0] ?? 0);
			durationNs = Math.max(0, Number(range[0]?.[1] ?? 0) - startNs);

			// `settings` deliberately drops `buffer`: see its declaration.
			topics = query("SELECT id, name, type FROM topics")
				.filter(([, , rosType]) => canDecode(String(rosType)))
				.map(([id, name, rosType]) => ({
					topic: String(name),
					datasource_id: s.id,
					source: settings!,
					type: webappTypeFor(String(rosType)),
					rawType: String(rosType),
					// Carried so `subscribe` can find the row without a second query.
					__topicId: Number(id),
				})) as unknown as DatasourceTopic[];

			// A valid bag full of topics this cockpit cannot read is the quietest
			// failure of all: the datasource goes ready, the topic list is
			// non-empty, and every EMI panel still gates to offline because
			// nothing resolves a bundle. Said plainly instead.
			if (!topics.some((t) => t.rawType === EMI_TYPES.emiGnss)) {
				throw new BagProblem(
					"no-emi-topics",
					`"${s.bagName}" opened, but carries no \`${EMI_TYPES.emiGnss}\` topic, so there is nothing for the EMI cockpit to read.`,
					"Check `ros2 bag info` — this is usually the wrong bag, or one filtered without the EMI topics.",
				);
			}

			clock = new ReplayClock(durationNs, Date.now());
			if (s.rate) clock.setRate(Date.now(), s.rate);
			// NOT played here. Between `init` resolving and the registry issuing
			// its first subscribe there is a DATASOURCE_READY round trip, and a
			// clock already running through it would step over the head of every
			// topic — silently breaking this file's "nothing is skipped" claim
			// on every open. Deferred to the first subscribe instead.
			autoplayPending = s.autoplay !== false;
			// Same deferral, same reason: a drain that started here would race
			// the first subscribe and deliver the head of the recording to a
			// registry that has nobody wired to it yet.
			draining = s.drain !== false;

			schedule();
		}

		/**
		 * Queue the next pump pass.
		 *
		 * Two cadences, because they are answering different questions. Playback
		 * runs on a fixed 50 ms tick — the clock decides what is due, and running
		 * more often would only ask more often. A drain has nothing to wait for,
		 * so it re-queues immediately and is bounded by {@link DRAIN_SLICE_MS}
		 * instead; the yield between passes is what keeps the main thread able to
		 * paint while a twenty-minute survey lands.
		 */
		function schedule(): void {
			if (timer !== null) clearTimeout(timer);
			// A drain with nothing subscribed yet waits on the normal tick. Going
			// round at 0 ms would spin the worker between `open` and the first
			// subscribe, which is a gap of one DATASOURCE_READY round trip.
			const fast = draining && subs.size > 0;
			timer = setTimeout(pump, fast ? 0 : TICK_MS);
		}

		/** Run a query and return its rows, or `[]`. */
		function query(sql: string): unknown[][] {
			if (!db) return [];
			const res = db.exec(sql);
			return res[0]?.values ?? [];
		}

		// ------------------------------------------------------------------
		// the pump
		// ------------------------------------------------------------------

		/** Refill a subscription's look-ahead row. */
		function advance(sub: Subscription): void {
			if (sub.pending || !sub.stmt) return;
			if (!sub.stmt.step()) {
				sub.stmt.free();
				sub.stmt = null;
				return;
			}
			const row = sub.stmt.get();
			sub.pending = {
				tsNs: Number(row[0]) - startNs,
				data: row[1] as Uint8Array,
			};
		}

		/** Open a cursor over a topic's messages at or after a position. */
		function seekSub(sub: Subscription, fromNs: number): void {
			if (!db) return;
			sub.stmt?.free();
			sub.pending = null;
			sub.stmt = db.prepare(
				"SELECT timestamp, data FROM messages WHERE topic_id = ? AND timestamp >= ? ORDER BY timestamp",
			);
			sub.stmt.bind([sub.topicId, fromNs + startNs]);
			advance(sub);
		}

		/**
		 * Publish everything now due, oldest first.
		 *
		 * A k-way merge over the subscriptions' look-ahead rows, not a
		 * round-robin: within one tick a round-robin delivers in subscription
		 * order, which reorders topics against each other by up to
		 * `TICK_MS * rate` of bag time — 50 ms at 1x, but 2.5 s at 50x. Any
		 * consumer that fuses on arrival ("pair this EMI sample with the last
		 * pose I saw") would then pair across that gap, which is exactly what a
		 * live datasource never does. Always taking the oldest pending message
		 * makes the ordering identical to the wire, and makes starvation
		 * impossible by construction.
		 */
		function pump(): void {
			timer = null;
			if (!clock || !db) return;
			const nowMs = Date.now();
			const playing = clock.state(nowMs).playing;
			// A drain has no due-time: everything is due. The k-way merge below
			// is unchanged, so the delivery order is still exactly the wire
			// order — draining changes when messages arrive, never in what order.
			const until = draining ? Infinity : clock.positionAt(nowMs);
			const deadline = draining ? nowMs + DRAIN_SLICE_MS : 0;

			let budget = draining ? Infinity : TICK_BUDGET;
			let lastPublishedNs = -1;
			let published = 0;

			for (;;) {
				if (budget <= 0) break;
				// Time-bounded while draining, count-bounded while playing. The
				// clock check is amortised over 64 messages because during a
				// drain it is the only thing in this loop that is not work.
				if (
					draining &&
					(published & 63) === 63 &&
					Date.now() >= deadline
				)
					break;

				// Oldest due message across every subscription.
				let oldest: Subscription | null = null;
				for (const sub of subs.values()) {
					advance(sub);
					const next = sub.pending;
					if (!next || next.tsNs > until) continue;
					if (!oldest || next.tsNs < oldest.pending!.tsNs)
						oldest = sub;
				}
				if (!oldest) break;

				const next = oldest.pending!;
				oldest.pending = null;
				budget--;
				published++;
				lastPublishedNs = next.tsNs;
				publish(oldest, next.tsNs, next.data);
			}

			// Every cursor exhausted: the recording is delivered. Park the clock
			// at the end and hand the datasource back to normal playback, so a
			// later seek into what was delivered behaves exactly as it always
			// did. Only when there is something to exhaust — a drain that runs
			// before the first subscribe would otherwise declare itself finished
			// against an empty subscription map.
			if (
				draining &&
				subs.size > 0 &&
				[...subs.values()].every((s) => s.stmt === null && !s.pending)
			) {
				draining = false;
				ended = true;
				clock.seek(nowMs, durationNs);
				clock.pause(nowMs);
			}

			// Ran out of budget with work still due: hold the clock at the last
			// message actually delivered, so the surplus is replayed next tick
			// instead of being stepped over. Only meaningful while playing — a
			// paused clock is where the user put it.
			if (playing && budget <= 0 && lastPublishedNs >= 0) {
				clock.holdAt(nowMs, lastPublishedNs);
			}

			// Reaching the end is a state, not a stall. Park the clock once so
			// `status()` stops claiming the replay is still playing.
			if (
				playing &&
				!ended &&
				clock.atEnd(nowMs) &&
				[...subs.values()].every((s) => s.stmt === null && !s.pending)
			) {
				ended = true;
				clock.pause(nowMs);
			}

			schedule();
		}

		/** Decode one message and hand it to the host. */
		function publish(
			sub: Subscription,
			tsNs: number,
			data: Uint8Array,
		): void {
			const decoded = decodeMessage(sub.rosType, data);
			// A message this plugin cannot read is skipped rather than allowed to
			// stop the replay; `decodeMessage` is total for exactly this reason.
			if (decoded === null) return;
			const timeMs = (tsNs + startNs) / 1e6;
			ctx.publish(
				sub.topic,
				convertToWebapp(sub.rosType, decoded, timeMs),
				timeMs,
				frameIdOf(decoded),
			);
		}

		/** The frame a decoded message names, when it names one. */
		function frameIdOf(msg: unknown): string | undefined {
			const header = (msg as { header?: { frame_id?: string } }).header;
			return header?.frame_id || undefined;
		}

		// ------------------------------------------------------------------
		// replay control, as remote calls
		// ------------------------------------------------------------------

		function status(): ReplayStatus {
			const s = clock?.state(Date.now());
			return {
				bagName: settings?.bagName ?? "",
				playing: s?.playing ?? false,
				rate: s?.rate ?? 1,
				positionNs: s?.positionNs ?? 0,
				durationNs: s?.durationNs ?? 0,
				subscribedTopics: subs.size,
			};
		}

		/** Re-open every cursor at the current position. */
		function reseekAll(): void {
			if (!clock) return;
			const at = clock.positionAt(Date.now());
			for (const sub of subs.values()) seekSub(sub, at);
		}

		return {
			async init(s) {
				// `buffer` is stripped here and nowhere else: everything this
				// worker publishes carries `settings`, and all of it is cloned
				// back to the main thread.
				settings = { ...s, buffer: undefined };
				try {
					await open(s);
				} catch (err) {
					// `init` deliberately does not reject. The host calls
					// `listTopics` from inside the AVAILABLE_TOPICS filter
					// chain, and that chain has no per-filter isolation — so a
					// rejection here would take topic discovery down for EVERY
					// datasource in the app, not just this one.
					//
					// But not rejecting must not mean not reporting. An empty
					// topic list plus a console line is what left ten panels
					// saying "offline" with nothing tying that to the file the
					// operator had just picked, so the reason is posted to the
					// provider as well — see `replay-status.ts` for why this is
					// a bare `postMessage` and not a context method.
					openError =
						err instanceof Error ? err.message : String(err);
					console.error("[EMI replay]", openError);
					reportProblem(
						err instanceof BagProblem ? err.kind : "unopenable",
						openError,
						err instanceof BagProblem ? err.advice : "",
					);
					return;
				}
				ctx.setRemoteCalls(replayCallDefinitions(settings));
			},

			listTopics() {
				return openError ? [] : topics;
			},

			subscribe(topic: SelectedTopic) {
				const existing = subs.get(topic.topic);
				if (existing) {
					// Re-flush after a reconnect must not open a second cursor.
					existing.refs++;
					return;
				}
				const meta = topics.find((t) => t.topic === topic.topic) as
					(DatasourceTopic & { __topicId?: number }) | undefined;
				if (!meta || meta.__topicId === undefined) return;

				const sub: Subscription = {
					topic: topic.topic,
					rosType: meta.rawType,
					topicId: meta.__topicId,
					refs: 1,
					stmt: null,
					pending: null,
				};
				subs.set(topic.topic, sub);
				seekSub(sub, clock?.positionAt(Date.now()) ?? 0);

				// Start on the first real subscriber, so the head of the
				// recording is delivered rather than played to nobody. A drain
				// needs no clock — it publishes everything regardless — and
				// leaving the clock parked means it ends up where the drain
				// leaves it rather than wherever it happened to run to.
				if (draining) {
					autoplayPending = false;
					schedule();
				} else if (autoplayPending && clock) {
					autoplayPending = false;
					clock.play(Date.now());
				}
			},

			unsubscribe(topic: SelectedTopic, ignoreCount?: boolean) {
				const sub = subs.get(topic.topic);
				if (!sub) return;
				sub.refs--;
				if (!ignoreCount && sub.refs > 0) return;
				sub.stmt?.free();
				subs.delete(topic.topic);
			},

			executeRemoteCall(
				definition: RemoteCallDefinition,
				request: unknown,
			) {
				const startedMs = Date.now();
				const callId = `${definition.name}-${startedMs}`;
				const nowMs = startedMs;
				const req = (request ?? {}) as Record<string, number>;

				switch (definition.name) {
					case REPLAY_CALLS.play:
						// Playing again after the end restarts from the end,
						// which is a no-op; seek first if you want a replay.
						ended = false;
						autoplayPending = false;
						clock?.play(nowMs);
						break;
					case REPLAY_CALLS.pause:
						clock?.pause(nowMs);
						break;
					case REPLAY_CALLS.seek:
						ended = false;
						clock?.seek(nowMs, Number(req.positionNs ?? 0));
						// Cursors are positional, so a seek must re-open them —
						// otherwise the pump keeps stepping from where it was and
						// a backwards seek delivers nothing at all.
						reseekAll();
						break;
					case REPLAY_CALLS.setRate:
						clock?.setRate(nowMs, Number(req.rate ?? 1));
						break;
					case REPLAY_CALLS.status:
						break;
					default:
						break;
				}

				const result: RemoteCallResult<ReplayStatus> = {
					success: true,
					data: status(),
					duration: Date.now() - startedMs,
					status: "succeeded",
				};
				// Deferred past this return on purpose. The host only registers
				// its result handler after the RPC response for THIS call
				// arrives, so emitting synchronously puts the event on the wire
				// first and it is dropped — leaving `handle.result` pending
				// forever, which would make returning a status pointless.
				queueMicrotask(() => {
					ctx.emitRemoteCallStatus(callId, "succeeded");
					ctx.emitRemoteCallResult(
						callId,
						result as RemoteCallResult,
					);
				});
				return { callId, status: "succeeded" as const };
			},

			cancelRemoteCall() {
				// Every call completes synchronously; there is nothing to cancel.
				return false;
			},

			shutdown() {
				if (timer !== null) clearTimeout(timer);
				timer = null;
				draining = false;
				for (const sub of subs.values()) sub.stmt?.free();
				subs.clear();
				db?.close();
				db = null;
			},
		};
	},
);
