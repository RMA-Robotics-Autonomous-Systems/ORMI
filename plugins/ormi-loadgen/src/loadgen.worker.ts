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
import type { PointsCloud } from "@workspace/ormi-core/types";
import type { LoadgenGenerator, LoadgenSettings } from "./index";
import { resolveGenerators } from "./presets";
import {
	burstOpen,
	createGeneratorState,
	decodeFrame,
	getGeneratorForTopic,
	produceRaw,
	topicTypeFor,
} from "./loadgen-generators";

/** Built-in 1 Hz self-report topic publishing worker-local produced counters. */
const STATS_TOPIC = "/loadgen/stats";

createDatasourceWorker<LoadgenSettings>((context) => {
	const intervals = new Map<string, ReturnType<typeof setInterval>>();
	const subscribersCount = new Map<string, number>();
	const produced = new Map<string, number>();
	let statsInterval: ReturnType<typeof setInterval> | null = null;
	let crashTimeout: ReturnType<typeof setTimeout> | null = null;
	let settings: LoadgenSettings;
	let callCounter = 0;

	const incrementProduced = (topicName: string) => {
		produced.set(topicName, (produced.get(topicName) ?? 0) + 1);
	};

	/**
	 * Start the publish interval for one generator topic. Each tick produces a
	 * raw frame and decodes it IN the worker before publishing, so the worker
	 * path mirrors the Foxglove `wss://` worker (decode off the main thread, then
	 * a transferable hand-off). The shared generator core is the single source of
	 * truth for both this transport and the main-thread coalescer path.
	 */
	const startGenerator = (
		topicName: string,
		generator: LoadgenGenerator,
	): ReturnType<typeof setInterval> => {
		const intervalMs = 1000 / generator.rateHz;
		const state = createGeneratorState(generator);

		return setInterval(() => {
			if (!burstOpen(generator.burst)) return;
			const raw = produceRaw(generator, state);
			const decoded = decodeFrame(raw, generator);
			// Transfer only the freshly-decoded point buffer, matching the prior
			// zero-copy path; JSON payloads have nothing transferable.
			const transfer =
				generator.type === "pointcloud" &&
				generator.transfer &&
				decoded !== null &&
				typeof decoded === "object" &&
				"points" in decoded
					? [(decoded as PointsCloud).points.buffer]
					: undefined;
			context.publish(topicName, decoded, raw.time, undefined, transfer);
			incrementProduced(topicName);
		}, intervalMs);
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

			if (generator && !intervals.has(topic.topic)) {
				intervals.set(
					topic.topic,
					startGenerator(topic.topic, generator),
				);
			}
			ensureStatsInterval();
		},
		unsubscribe: async (topic, ignoreCount = false) => {
			const interval = intervals.get(topic.topic);

			if (ignoreCount) {
				if (interval) {
					clearInterval(interval);
					intervals.delete(topic.topic);
				}
				subscribersCount.delete(topic.topic);
				ensureStatsInterval();
				return;
			}

			const count = subscribersCount.get(topic.topic) ?? 0;
			const newCount = count - 1;
			if (newCount <= 0) {
				subscribersCount.delete(topic.topic);
				if (interval) {
					clearInterval(interval);
					intervals.delete(topic.topic);
				}
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
			intervals.forEach((interval) => clearInterval(interval));
			intervals.clear();
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
