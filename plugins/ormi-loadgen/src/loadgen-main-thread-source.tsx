"use client";

import { useEffect, useRef, useState } from "react";

import {
	DatasourceTopic,
	DatasourceTopicFilter,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import { metrics, MessageCoalescer } from "@workspace/utils";

import { LoadgenGenerator, LoadgenSettings } from "./index";
import { resolveGenerators } from "./presets";
import {
	burstOpen,
	createGeneratorState,
	decodeFrame,
	decodeCapMsFor,
	getGeneratorForTopic,
	losslessFor,
	produceRaw,
	topicTypeFor,
	type GeneratorState,
	type RawFrame,
} from "./loadgen-generators";
import {
	createAccumulator,
	drawEmissions,
	SCHEDULER_TICK_MS,
	type EmitAccumulator,
} from "./loadgen-scheduler";

/** Built-in 1 Hz self-report topic mirroring the worker transport's stats. */
const STATS_TOPIC = "/loadgen/stats";

/**
 * Per-topic live generation state kept by the main-thread provider: the
 * generator that drives the topic, its mutable production state, its emission
 * accumulator, and the cached per-topic push parameters. The single driver loop
 * fans out over these; the `generator` is what the coalescer's dispatch resolves
 * against by topic name to decode the raw frame.
 */
interface TopicRuntime {
	generator: LoadgenGenerator;
	state: GeneratorState;
	acc: EmitAccumulator;
	/** Per-topic produced counter id (worker-parity: counts every generated frame). */
	producedId: ReturnType<typeof metrics.counter>;
	/** Cached coalescer push params for this generator's payload shape. */
	lossless: boolean;
	decodeCapMs: number;
}

/**
 * Main-thread lifecycle component for the load generator datasource.
 *
 * The worker transport decodes inside the worker and posts finished values; this
 * transport reproduces the `ws://` main-thread pipeline instead — every subscribed
 * topic pushes its cheap raw frame into a shared {@link MessageCoalescer}, and the
 * expensive {@link decodeFrame} runs on the coalescer's fixed-rate drain tick
 * (coalesce-to-latest per topic, a per-topic decode-rate cap for point clouds, an
 * honest overwrite/drop counter, and a per-tick time budget). It is the loadgen
 * analogue of the Foxglove/rosbridge main-thread paths, minus the socket and
 * reconnect machinery, so a benchmark on this transport faithfully mirrors them.
 *
 * A plain lifecycle component (pattern 5): it exposes no reactive context, all
 * data flows through the plugins-manager hooks it registers.
 */
const LoadgenMainThreadProvider = (props: LoadgenSettings) => {
	const pluginsManager = usePluginsManager();

	const datasource_id = props.id;
	const available_topics_hook = `${datasource_id}-available-topics`;
	const subscribe_hook = `${datasource_id}-subscribe`;
	const unsubscribe_hook = `${datasource_id}-unsubscribe`;
	const definition_hook = `${datasource_id}-definition`;

	// Live per-topic timers/state, refcount, and worker-parity produced counters.
	const runtimesRef = useRef(new Map<string, TopicRuntime>());
	const subscribersCountRef = useRef(new Map<string, number>());
	const producedRef = useRef(new Map<string, number>());
	const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	// ONE driver loop fans out every subscribed topic (see loadgen-scheduler).
	const driverIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	const lastTickRef = useRef(0);

	// One coalescer per provider instance, keyed by topic name. Its dispatch
	// resolves the topic's generator from the live runtime map and runs the
	// decode + publish off the shared ~30 Hz drain tick. Per-message errors are
	// isolated by the engine, so one bad frame cannot starve the other topics.
	// Coarse per-datasource metrics (overwrites, decoded, dispatch time) feed the
	// diagnostics panel — the same signals the rosbridge main-thread path emits.
	const [coalescer] = useState(
		() =>
			new MessageCoalescer<RawFrame, string>(
				(raw, topicName) => {
					const runtime = runtimesRef.current.get(topicName);
					if (!runtime) return;
					const decoded = decodeFrame(raw, runtime.generator);
					// Latency stamp is the production time (raw.time), so
					// wire.latencyMs = coalescer hold + decode + fanout.
					pluginsManager.doAction(
						`${datasource_id}-${topicName}-published`,
						decoded,
						raw.time,
						undefined,
					);
				},
				{
					metrics: {
						overwrites: metrics.counter(
							`ds.${datasource_id}.coalescer.overwrites`,
						),
						decoded: metrics.counter(
							`ds.${datasource_id}.coalescer.decoded`,
						),
						dispatchMs: metrics.ring(
							`ds.${datasource_id}.coalescer.dispatchMs`,
						),
					},
					onError: (error) =>
						console.error(
							"[Loadgen Main-Thread] frame dispatch failed:",
							error,
						),
				},
			),
	);

	useEffect(() => {
		if (!props.enable) return;

		const runtimes = runtimesRef.current;
		const subscribersCount = subscribersCountRef.current;
		const produced = producedRef.current;

		/**
		 * The single scheduler pass. Measures real elapsed `dt`, then for each
		 * subscribed topic draws `floor(owed)` frames and pushes them into the
		 * coalescer. `produced`/`producedId` increment per GENERATED frame so the
		 * produced counter reflects the true configured rate; the coalescer then
		 * coalesces a same-pass lossy batch to the latest, so `delivered` and the
		 * drop ratio stay honest. A burst topic whose window is closed resets its
		 * accumulator so no suppressed backlog dumps when it reopens.
		 */
		const tick = (): void => {
			const now = Date.now();
			const dt = now - lastTickRef.current;
			lastTickRef.current = now;
			for (const [topicName, runtime] of runtimes) {
				const { generator, state, acc } = runtime;
				if (!burstOpen(generator.burst)) {
					acc.owed = 0;
					continue;
				}
				const n = drawEmissions(acc, generator.rateHz, dt);
				for (let i = 0; i < n; i++) {
					produced.set(topicName, (produced.get(topicName) ?? 0) + 1);
					metrics.add(runtime.producedId);
					coalescer.push(
						topicName,
						produceRaw(generator, state),
						runtime.lossless,
						runtime.decodeCapMs,
					);
				}
			}
		};

		/** Start the single driver loop on first subscribe (idempotent). */
		const ensureDriver = (): void => {
			if (driverIntervalRef.current !== null) return;
			lastTickRef.current = Date.now();
			driverIntervalRef.current = setInterval(tick, SCHEDULER_TICK_MS);
		};

		/** Stop the single driver loop once no topic remains subscribed. */
		const stopDriverIfIdle = (): void => {
			if (driverIntervalRef.current !== null && runtimes.size === 0) {
				clearInterval(driverIntervalRef.current);
				driverIntervalRef.current = null;
			}
		};

		/** Register a topic's generation runtime (idempotent per topic). */
		const startTopic = (
			topicName: string,
			generator: LoadgenGenerator,
		): void => {
			runtimes.set(topicName, {
				generator,
				state: createGeneratorState(generator),
				acc: createAccumulator(),
				producedId: metrics.counter(
					`ds.${datasource_id}.topic.${topicName}.produced`,
				),
				lossless: losslessFor(generator),
				decodeCapMs: decodeCapMsFor(generator),
			});
		};

		/** Drop a topic's runtime + coalescer stash (idempotent). */
		const stopTopic = (topicName: string): void => {
			runtimes.delete(topicName);
			coalescer.remove(topicName);
		};

		/** Run the 1 Hz stats self-report only while some topic is subscribed. */
		const ensureStatsInterval = (): void => {
			const anyActive = Array.from(subscribersCount.values()).some(
				(count) => count > 0,
			);
			if (anyActive && statsIntervalRef.current === null) {
				statsIntervalRef.current = setInterval(() => {
					pluginsManager.doAction(
						`${datasource_id}-${STATS_TOPIC}-published`,
						{
							produced: Object.fromEntries(produced),
							t: Date.now(),
						},
						Date.now(),
						undefined,
					);
				}, 1000);
			} else if (!anyActive && statsIntervalRef.current !== null) {
				clearInterval(statsIntervalRef.current);
				statsIntervalRef.current = null;
			}
		};

		// AVAILABLE_TOPICS: list every generator topic plus the stats topic,
		// mirroring the worker transport's listTopics so topic discovery is
		// transport-identical.
		pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: available_topics_hook,
			priority: 10,
			filter: (
				topics: DatasourceTopic[],
				filter?: DatasourceTopicFilter,
			) => {
				const produced_topics: DatasourceTopic[] = [];
				for (const generator of resolveGenerators(props)) {
					for (let i = 0; i < generator.topicCount; i++) {
						produced_topics.push({
							topic: `${generator.topicPrefix}/${i}`,
							datasource_id: datasource_id,
							source: props,
							type: topicTypeFor(generator),
							rawType: generator.type,
						});
					}
				}
				produced_topics.push({
					topic: STATS_TOPIC,
					datasource_id: datasource_id,
					source: props,
					type: "object",
					rawType: "object",
				});
				const toAdd = filter
					? produced_topics.filter((topic) => filter.filter(topic))
					: produced_topics;
				topics.push(...toAdd);
				return topics;
			},
		});

		pluginsManager.addAction(subscribe_hook, {
			id: subscribe_hook,
			priority: 10,
			action: async (topic: SelectedTopic) => {
				const isStats = topic.topic === STATS_TOPIC;
				const generator = isStats
					? undefined
					: getGeneratorForTopic(
							topic.topic,
							resolveGenerators(props),
						);
				if (!isStats && !generator) return;

				// Refcount: a re-flushed subscribe for an already-live topic
				// only bumps the count (idempotent under registry re-flush).
				const count = subscribersCount.get(topic.topic) ?? 0;
				subscribersCount.set(topic.topic, count + 1);

				if (generator && !runtimes.has(topic.topic)) {
					startTopic(topic.topic, generator);
					coalescer.start();
					ensureDriver();
				}
				ensureStatsInterval();
			},
		});

		pluginsManager.addAction(unsubscribe_hook, {
			id: unsubscribe_hook,
			priority: 10,
			action: async (
				topic: SelectedTopic,
				ignoreCount: boolean = false,
			) => {
				if (ignoreCount) {
					stopTopic(topic.topic);
					subscribersCount.delete(topic.topic);
					if (runtimes.size === 0) {
						coalescer.stop();
						stopDriverIfIdle();
					}
					ensureStatsInterval();
					return;
				}

				// Tolerate an unsubscribe for a topic that is not subscribed.
				const count = subscribersCount.get(topic.topic) ?? 0;
				if (count <= 0) {
					ensureStatsInterval();
					return;
				}

				const newCount = count - 1;
				if (newCount <= 0) {
					subscribersCount.delete(topic.topic);
					stopTopic(topic.topic);
					if (runtimes.size === 0) {
						coalescer.stop();
						stopDriverIfIdle();
					}
				} else {
					subscribersCount.set(topic.topic, newCount);
				}
				ensureStatsInterval();
			},
		});

		pluginsManager.addFilter(definition_hook, {
			id: definition_hook,
			priority: 10,
			filter: () => props,
		});

		// Actions are registered — let the subscription registry flush any
		// intents parked before this provider mounted.
		pluginsManager.doAction(PluginsHooks.DATASOURCE_READY, datasource_id);

		return () => {
			pluginsManager.doAction(
				PluginsHooks.DATASOURCE_DISPOSED,
				datasource_id,
			);

			pluginsManager.removeFilter(available_topics_hook);
			pluginsManager.removeAction(subscribe_hook);
			pluginsManager.removeAction(unsubscribe_hook);
			pluginsManager.removeFilter(definition_hook);

			if (driverIntervalRef.current !== null) {
				clearInterval(driverIntervalRef.current);
				driverIntervalRef.current = null;
			}
			runtimes.clear();
			subscribersCount.clear();
			produced.clear();
			if (statsIntervalRef.current !== null) {
				clearInterval(statsIntervalRef.current);
				statsIntervalRef.current = null;
			}
			coalescer.stop();
		};
	}, [
		pluginsManager,
		coalescer,
		datasource_id,
		available_topics_hook,
		subscribe_hook,
		unsubscribe_hook,
		definition_hook,
		props,
	]);

	return null;
};

export { LoadgenMainThreadProvider };
