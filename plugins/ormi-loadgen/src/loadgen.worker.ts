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

/** Built-in 1 Hz self-report topic publishing worker-local produced counters. */
const STATS_TOPIC = "/loadgen/stats";

interface Vec3 {
	x: number;
	y: number;
	z: number;
}

interface Quat extends Vec3 {
	w: number;
}

/** Odom-like nested message; fields are optional so the malformed generator can omit them. */
interface OdomMessage {
	pose: { position?: Vec3; orientation?: Quat };
	velocity: { linear?: Vec3; angular?: Vec3 };
	pad: string;
}

createDatasourceWorker<LoadgenSettings>((context) => {
	const intervals = new Map<string, ReturnType<typeof setInterval>>();
	const subscribersCount = new Map<string, number>();
	const produced = new Map<string, number>();
	let statsInterval: ReturnType<typeof setInterval> | null = null;
	let crashTimeout: ReturnType<typeof setTimeout> | null = null;
	let settings: LoadgenSettings;
	let callCounter = 0;

	/** Map a generator topic name back to its generator definition. */
	const getGeneratorForTopic = (
		topicName: string,
	): LoadgenGenerator | undefined => {
		for (const generator of settings.generators) {
			const prefix = `${generator.topicPrefix}/`;
			if (!topicName.startsWith(prefix)) continue;
			const index = Number(topicName.slice(prefix.length));
			if (
				Number.isInteger(index) &&
				index >= 0 &&
				index < generator.topicCount
			) {
				return generator;
			}
		}
		return undefined;
	};

	/** Advertised topic type for a generator payload shape. */
	const topicTypeFor = (type: LoadgenGenerator["type"]): string => {
		switch (type) {
			case "scalar":
				return "number";
			case "pointcloud":
				return "PointsCloud";
			default:
				return "object";
		}
	};

	/** True when the topic's burst duty-cycle window is open (always true without burst). */
	const burstOpen = (burst?: { periodMs: number; dutyPct: number }) =>
		!burst ||
		Date.now() % burst.periodMs < (burst.periodMs * burst.dutyPct) / 100;

	const incrementProduced = (topicName: string) => {
		produced.set(topicName, (produced.get(topicName) ?? 0) + 1);
	};

	/** Fresh odom-like message from a random-walk state. */
	const makeOdomMessage = (
		state: { position: Vec3; yaw: number; velocity: Vec3 },
		pad: string,
	): OdomMessage => ({
		pose: {
			position: { ...state.position },
			orientation: {
				x: 0,
				y: 0,
				z: Math.sin(state.yaw / 2),
				w: Math.cos(state.yaw / 2),
			},
		},
		velocity: {
			linear: { ...state.velocity },
			angular: { x: 0, y: 0, z: (Math.random() - 0.5) * 0.2 },
		},
		pad,
	});

	const makeOdomState = () => ({
		position: { x: 0, y: 0, z: 0 },
		yaw: 0,
		velocity: { x: 0, y: 0, z: 0 },
	});

	const walkOdomState = (state: ReturnType<typeof makeOdomState>) => {
		state.velocity.x += (Math.random() - 0.5) * 0.1;
		state.velocity.y += (Math.random() - 0.5) * 0.1;
		state.velocity.z += (Math.random() - 0.5) * 0.02;
		state.position.x += state.velocity.x * 0.033;
		state.position.y += state.velocity.y * 0.033;
		state.position.z += state.velocity.z * 0.033;
		state.yaw += (Math.random() - 0.5) * 0.05;
	};

	/** Padding string sized so the serialized odom message is roughly payloadBytes. */
	const makePad = (payloadBytes: number) => {
		const baseLength = JSON.stringify(
			makeOdomMessage(makeOdomState(), ""),
		).length;
		return "x".repeat(Math.max(0, payloadBytes - baseLength));
	};

	/** Start the publish interval for one generator topic. */
	const startGenerator = (
		topicName: string,
		generator: LoadgenGenerator,
	): ReturnType<typeof setInterval> => {
		const intervalMs = 1000 / generator.rateHz;

		switch (generator.type) {
			case "scalar": {
				let value = Math.random();
				return setInterval(() => {
					value += Math.random() * 0.1 - 0.05;
					if (!burstOpen(generator.burst)) return;
					context.publish(topicName, value, Date.now());
					incrementProduced(topicName);
				}, intervalMs);
			}

			case "object": {
				const state = makeOdomState();
				const pad = makePad(generator.payloadBytes);
				return setInterval(() => {
					walkOdomState(state);
					if (!burstOpen(generator.burst)) return;
					context.publish(
						topicName,
						makeOdomMessage(state, pad),
						Date.now(),
					);
					incrementProduced(topicName);
				}, intervalMs);
			}

			case "malformed": {
				const state = makeOdomState();
				const pad = makePad(generator.payloadBytes);
				let publishSeq = 0;
				return setInterval(() => {
					walkOdomState(state);
					if (!burstOpen(generator.burst)) return;
					const message = makeOdomMessage(state, pad);
					publishSeq++;
					if (publishSeq % 10 === 0) {
						const omissions: ReadonlyArray<() => void> = [
							() => delete message.pose.position,
							() => delete message.pose.orientation,
							() => delete message.velocity.linear,
							() => delete message.velocity.angular,
						];
						omissions[
							Math.floor(Math.random() * omissions.length)
						]!();
					}
					context.publish(topicName, message, Date.now());
					incrementProduced(topicName);
				}, intervalMs);
			}

			case "pointcloud": {
				const numPoints = Math.max(
					1,
					Math.floor(generator.payloadBytes / 12),
				);
				const base = new Float32Array(numPoints * 3);
				const phases = new Float32Array(numPoints);
				const colors = new Float32Array(numPoints * 3);
				for (let i = 0; i < numPoints; i++) {
					const idx = i * 3;
					base[idx] = (Math.random() - 0.5) * 2;
					base[idx + 1] = (Math.random() - 0.5) * 2;
					base[idx + 2] = (Math.random() - 0.5) * 2;
					phases[i] = Math.random() * Math.PI * 2;
					colors[idx] = Math.random();
					colors[idx + 1] = Math.random();
					colors[idx + 2] = Math.random();
				}
				// Reused when transfer is off; structured clone copies it per publish.
				const reusable = generator.transfer
					? null
					: new Float32Array(numPoints * 3);

				return setInterval(() => {
					if (!burstOpen(generator.burst)) return;
					const t = Date.now() / 1000;
					const amplitude = 0.05;
					const positions = generator.transfer
						? new Float32Array(numPoints * 3)
						: reusable!;
					for (let i = 0; i < numPoints; i++) {
						const idx = i * 3;
						const phase = phases[i]!;
						positions[idx] =
							base[idx]! + Math.sin(t + phase) * amplitude;
						positions[idx + 1] =
							base[idx + 1]! +
							Math.sin(t + phase * 1.3) * amplitude;
						positions[idx + 2] =
							base[idx + 2]! +
							Math.sin(t + phase * 1.7) * amplitude;
					}
					context.publish(
						topicName,
						{
							points: positions,
							colors,
						} as PointsCloud,
						Date.now(),
						undefined,
						generator.transfer ? [positions.buffer] : undefined,
					);
					incrementProduced(topicName);
				}, intervalMs);
			}
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
		for (const generator of settings.generators) {
			for (let i = 0; i < generator.topicCount; i++) {
				topics.push({
					topic: `${generator.topicPrefix}/${i}`,
					datasource_id: settings.id,
					source: settings,
					type: topicTypeFor(generator.type),
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
				: getGeneratorForTopic(topic.topic);
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
