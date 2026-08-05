import { createDatasourceWorker } from "@workspace/ormi-core/datasources/worker";
import type {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import type {
	RemoteCallDefinition,
	RemoteCallOptions,
	RemoteCallResult,
} from "@workspace/ormi-core/datasources";
import { transferablesFor } from "@workspace/utils/transferables";
import type { LoadgenGenerator, LoadgenSettings } from "./index";
import { resolveGenerators } from "./presets";
import {
	burstOpen,
	createGeneratorState,
	decodeFrame,
	getGeneratorForTopic,
	produceRaw,
	topicTypeFor,
	type GeneratorState,
} from "./loadgen-generators";
import {
	createAccumulator,
	drawEmissions,
	SCHEDULER_TICK_MS,
	type EmitAccumulator,
} from "./loadgen-scheduler";

/** Built-in 1 Hz self-report topic publishing worker-local produced counters. */
const STATS_TOPIC = "/loadgen/stats";

/** Per-topic live generation state driven by the single scheduler loop. */
interface TopicRuntime {
	generator: LoadgenGenerator;
	state: GeneratorState;
	acc: EmitAccumulator;
}

createDatasourceWorker<LoadgenSettings>((context) => {
	// Subscribed generator topics → their generation state + emission accumulator.
	const runtimes = new Map<string, TopicRuntime>();
	const subscribersCount = new Map<string, number>();
	const produced = new Map<string, number>();
	// ONE driver interval fans out every subscribed topic (see loadgen-scheduler).
	let driverInterval: ReturnType<typeof setInterval> | null = null;
	let lastTick = 0;
	let statsInterval: ReturnType<typeof setInterval> | null = null;
	let crashTimeout: ReturnType<typeof setTimeout> | null = null;
	let settings: LoadgenSettings;
	let callCounter = 0;

	const incrementProduced = (topicName: string) => {
		produced.set(topicName, (produced.get(topicName) ?? 0) + 1);
	};

	/**
	 * Emit one topic's owed frames for this pass. Produces + decodes IN the
	 * worker before publishing, so the worker path mirrors the Foxglove `wss://`
	 * worker (decode off the main thread, then a transferable hand-off). The
	 * shared generator core is the single source of truth for both this transport
	 * and the main-thread coalescer path.
	 */
	const emitTopic = (topicName: string, runtime: TopicRuntime, n: number) => {
		const { generator, state } = runtime;
		for (let i = 0; i < n; i++) {
			const raw = produceRaw(generator, state);
			const decoded = decodeFrame(raw, generator);
			// Transfer this iteration's freshly-produced owned buffers:
			// decodeFrame materializes a new payload each call, so its buffers
			// are never read again after this publish. `transferablesFor`
			// returns the point cloud's points (+ colors/intensities when
			// present) and `[]` for JSON payloads. The `transfer` flag is the
			// benchmark toggle for the copy-vs-transfer comparison.
			const transfer = generator.transfer
				? transferablesFor(decoded)
				: undefined;
			context.publish(topicName, decoded, raw.time, undefined, transfer);
			incrementProduced(topicName);
		}
	};

	/**
	 * The single scheduler pass. Measures real elapsed `dt`, then for every
	 * subscribed topic draws `floor(owed)` messages from its accumulator and emits
	 * them. A burst topic whose duty-cycle is closed resets its accumulator so no
	 * suppressed backlog dumps when the window reopens.
	 */
	const tick = () => {
		const now = Date.now();
		const dt = now - lastTick;
		lastTick = now;
		for (const [topicName, runtime] of runtimes) {
			if (!burstOpen(runtime.generator.burst)) {
				runtime.acc.owed = 0;
				continue;
			}
			const n = drawEmissions(runtime.acc, runtime.generator.rateHz, dt);
			if (n > 0) emitTopic(topicName, runtime, n);
		}
	};

	/** Start the single driver loop on first subscribe (idempotent). */
	const ensureDriver = () => {
		if (driverInterval !== null) return;
		lastTick = Date.now();
		driverInterval = setInterval(tick, SCHEDULER_TICK_MS);
	};

	/** Stop the single driver loop once no generator topic remains subscribed. */
	const stopDriverIfIdle = () => {
		if (driverInterval !== null && runtimes.size === 0) {
			clearInterval(driverInterval);
			driverInterval = null;
		}
	};

	/** Run the 1 Hz stats self-report only while at least one topic is subscribed. */
	const ensureStatsInterval = () => {
		const anyActive = Array.from(subscribersCount.values()).some(
			(count) => count > 0,
		);
		if (anyActive && statsInterval === null) {
			statsInterval = setInterval(() => {
				context.publish(
					STATS_TOPIC,
					{
						produced: Object.fromEntries(produced),
						t: Date.now(),
					},
					Date.now(),
				);
			}, 1000);
		} else if (!anyActive && statsInterval !== null) {
			clearInterval(statsInterval);
			statsInterval = null;
		}
	};

	const listTopics = async (): Promise<DatasourceTopic[]> => {
		const topics: DatasourceTopic[] = [];
		for (const generator of resolveGenerators(settings)) {
			for (let i = 0; i < generator.topicCount; i++) {
				topics.push({
					topic: `${generator.topicPrefix}/${i}`,
					datasource_id: settings.id,
					source: settings,
					type: topicTypeFor(generator),
					rawType: generator.type,
				});
			}
		}
		topics.push({
			topic: STATS_TOPIC,
			datasource_id: settings.id,
			source: settings,
			type: "object",
			rawType: "object",
		});
		return topics;
	};

	return {
		init: async (newSettings) => {
			settings = newSettings;
			context.setRemoteCalls([]);

			const crashAfterMs = settings.faults?.crashAfterMs;
			if (crashAfterMs && crashTimeout === null) {
				crashTimeout = setTimeout(() => {
					self.close();
				}, crashAfterMs);
			}
		},
		listTopics,
		subscribe: async (topic: SelectedTopic) => {
			const hangMs = settings.faults?.subscribeHangMs;
			if (hangMs) {
				await new Promise((resolve) => setTimeout(resolve, hangMs));
			}

			const isStats = topic.topic === STATS_TOPIC;
			const generator = isStats
				? undefined
				: getGeneratorForTopic(
						topic.topic,
						resolveGenerators(settings),
					);
			if (!isStats && !generator) {
				return;
			}

			const count = subscribersCount.get(topic.topic) ?? 0;
			subscribersCount.set(topic.topic, count + 1);

			if (generator && !runtimes.has(topic.topic)) {
				runtimes.set(topic.topic, {
					generator,
					state: createGeneratorState(generator),
					acc: createAccumulator(),
				});
				ensureDriver();
			}
			ensureStatsInterval();
		},
		unsubscribe: async (topic, ignoreCount = false) => {
			if (ignoreCount) {
				runtimes.delete(topic.topic);
				subscribersCount.delete(topic.topic);
				stopDriverIfIdle();
				ensureStatsInterval();
				return;
			}

			const count = subscribersCount.get(topic.topic) ?? 0;
			const newCount = count - 1;
			if (newCount <= 0) {
				subscribersCount.delete(topic.topic);
				runtimes.delete(topic.topic);
				stopDriverIfIdle();
			} else {
				subscribersCount.set(topic.topic, newCount);
			}
			ensureStatsInterval();
		},
		executeRemoteCall: async (
			_definition: RemoteCallDefinition,
			_request: unknown,
			_options?: RemoteCallOptions,
		) => {
			const callId = `loadgen-${Date.now()}-${callCounter++}`;
			const result: RemoteCallResult = {
				success: false,
				error: "Remote calls are not supported by the loadgen datasource",
				duration: 0,
				status: "failed",
			};
			context.emitRemoteCallStatus(callId, "executing");
			context.emitRemoteCallResult(callId, result);
			return {
				callId,
				status: "failed",
			};
		},
		cancelRemoteCall: async () => false,
		shutdown: async () => {
			if (driverInterval !== null) {
				clearInterval(driverInterval);
				driverInterval = null;
			}
			runtimes.clear();
			subscribersCount.clear();
			produced.clear();
			if (statsInterval !== null) {
				clearInterval(statsInterval);
				statsInterval = null;
			}
			if (crashTimeout !== null) {
				clearTimeout(crashTimeout);
				crashTimeout = null;
			}
		},
	};
});

// Global error handler for uncaught errors in worker
self.addEventListener("error", (event) => {
	console.error("[Loadgen Worker] Uncaught error:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
	console.error(
		"[Loadgen Worker] Unhandled promise rejection:",
		event.reason,
	);
});
