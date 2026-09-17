"use client";
/**
 * Local datasource provider for widget subscriptions and buffering.
 */

import React, {
	ReactNode,
	useEffect,
	useRef,
	useState,
	useCallback,
	useMemo,
} from "react";
import {
	SelectedTopic,
	DatasourceHealth,
	deriveHealth,
} from "../datasource-interface";
import { useGlobalDataSources } from "./global-datasource-provider";

import { usePluginsManager } from "@workspace/ormi-plugins";
import { atom, useAtom } from "jotai";
import {
	createSafeContext,
	createTopicKey,
	getDatasourceSubscriptionRegistry,
	isBoundTopic,
	metrics,
	type SubscriptionHandle,
} from "@workspace/utils";
import {
	createSourcesKey,
	prunePendingUpdates,
	reconcileSources,
	type TopicBuffer,
} from "../source-reconcile";

/**
 * Flush-pump metric ids, registered once per runtime (cold path).
 * `flush.ticks` counts interval ticks that drained a non-empty batch;
 * `flush.updates` counts drained entries; `flush.overwrites` counts pending
 * entries replaced before a tick drained them (last-wins drops); `flush.tickMs`
 * samples tick durations while the heavy tier is on.
 */
const flushTicksId = metrics.counter("flush.ticks");
const flushUpdatesId = metrics.counter("flush.updates");
const flushOverwritesId = metrics.counter("flush.overwrites");
const flushTickMsRing = metrics.ring("flush.tickMs");

/**
 * Key of one selected topic, or `undefined` when that topic is unbound.
 *
 * Overloaded so a caller whose own type already guarantees a bound topic keeps
 * a plain `string`, while a caller holding a possibly-unconfigured slot is
 * forced by the type to decide what an absent key means for it. See
 * {@link createTopicKey}.
 */
interface TopicIdResolver {
	(topic: SelectedTopic): string;
	(topic: SelectedTopic | null | undefined): string | undefined;
}

/**
 * Local datasource context value.
 *
 * Every topic-taking member accepts a possibly-unbound topic on purpose. A
 * widget is configured one field at a time, so a settings object legitimately
 * holds empty topic slots, and a widget body reads them during render. An
 * operator-facing failure is a named state, never a `TypeError` thrown out of
 * a render path: an unbound topic has no buffer (`undefined`), no key
 * (`undefined`) and no datasource to be healthy or unhealthy (`connecting`).
 */
interface LocalDataSources {
	sources: Map<string, Source>;
	version: number; // Increment on every update to force re-renders
	/** Buffered samples for a topic, or `undefined` when unbound or unsubscribed. */
	getSource: (topic: SelectedTopic | null | undefined) => Source | undefined;
	/** Stable per-topic key, or `undefined` when the topic is unbound. */
	getSourceId: TopicIdResolver;
	/**
	 * Widget-facing health of a single topic's backing datasource, derived from
	 * the global per-datasource status. Returns `connecting` when the datasource
	 * is not yet tracked, and likewise for an unbound topic — there is no
	 * datasource behind it to call offline.
	 */
	getTopicHealth: (
		topic: SelectedTopic | null | undefined,
	) => DatasourceHealth;
	/**
	 * Aggregate worst-case health across all of this provider's selected topics,
	 * ordered `offline > connecting > online` (any topic offline → `offline`;
	 * else any connecting → `connecting`; else `online`). For a single-topic
	 * widget this is just that topic's health. `online` when there are no topics.
	 *
	 * Unbound topics are skipped rather than counted as `connecting`: they own
	 * no wire, and letting an unconfigured slot hold a fully connected widget at
	 * `connecting` forever would gate its body on a datasource that does not
	 * exist.
	 */
	health: DatasourceHealth;
}

/** Buffered source data (see `source-reconcile`). */
type Source = TopicBuffer;

/** Props for LocalDataSourcesProvider. */
interface LocalDataSourcesProviderProps {
	children: ReactNode;
	SelectedTopics: SelectedTopic[];
	buffersSize: number;
	updateFrequency?: number; // Hz, default is 30Hz
}

const [LocalDataSourcesContextProvider, useLocalDataSourcesContext] =
	createSafeContext<LocalDataSources>("LocalDataSources");

/**
 * Provide local datasource buffering and subscription lifecycle.
 * @param props - Component props.
 * @returns React element.
 */
const LocalDataSourcesProvider = (props: LocalDataSourcesProviderProps) => {
	const {
		children,
		SelectedTopics,
		buffersSize,
		updateFrequency = 30,
	} = props;

	// Use Jotai atom for sources state
	const sourcesAtom = useMemo(() => atom(new Map<string, Source>()), []);
	const [sources, setSources] = useAtom(sourcesAtom);

	// Store pendingUpdates in useRef to persist between renders but not trigger re-renders
	const pendingUpdatesRef = useRef<
		Map<string, { value: any; time: number; referenceFrameId: string }>
	>(
		new Map<
			string,
			{ value: any; time: number; referenceFrameId: string }
		>(),
	);
	// Access the pendingUpdates through the .current property
	const pendingUpdates = pendingUpdatesRef.current;

	// getSource reads from sources state. An unbound topic has no key, so it
	// has no buffer either — the same answer as a topic whose first sample has
	// not arrived, which every caller already handles.
	const getSource = useCallback(
		(topic: SelectedTopic | null | undefined): Source | undefined => {
			const key = createTopicKey(topic);
			return key === undefined ? undefined : sources.get(key);
		},
		[sources],
	);

	const getSourceId = useCallback(
		(topic: SelectedTopic | null | undefined) => createTopicKey(topic),
		[],
	) as TopicIdResolver;

	// Read the raw per-datasource statuses from the always-present global
	// provider so widgets can gate on derived health. Status changes flow through
	// this map identity, so getTopicHealth/health stay current.
	const { datasourceStatuses } = useGlobalDataSources();

	const getTopicHealth = useCallback(
		(topic: SelectedTopic | null | undefined): DatasourceHealth =>
			isBoundTopic(topic)
				? deriveHealth(datasourceStatuses.get(topic.source.id))
				: // No datasource behind an unconfigured slot, so nothing to
					// report as offline. `connecting` is what `deriveHealth`
					// already answers for a datasource it does not track.
					deriveHealth(undefined),
		[datasourceStatuses],
	);

	const pluginsManager = usePluginsManager();
	const Topics = SelectedTopics;

	/**
	 * Content-addressed identity of the subscription this provider owns.
	 *
	 * Every consumer builds `SelectedTopics` inline, so the array is a new
	 * object on every render while describing the same wires. Keying the
	 * lifecycle effect on this string instead of on the array identity is what
	 * stops an unrelated re-render from tearing down and re-establishing every
	 * subscription (and, before the reconcile below, wiping every buffer).
	 *
	 * The body genuinely reads `SelectedTopics`, which the React Compiler
	 * requires: a memo keyed on a value its body does not read is stripped and
	 * frozen on its first result.
	 */
	const topicsKey = useMemo(
		() => createSourcesKey(SelectedTopics),
		[SelectedTopics],
	);

	// Live reads for everything the effect needs but must NOT re-subscribe for:
	// the flush pump resolves each topic's trim depth on every tick, and a depth
	// change must not cost the operator the history already collected.
	//
	// Synced in an effect rather than assigned during render. Writing a ref
	// while rendering is what the React Compiler's lint rules reject, and this
	// app compiles with the compiler on; the sync effect is declared before the
	// lifecycle effect below, so that effect always reads the current values.
	const topicsRef = useRef(SelectedTopics);
	const buffersSizeRef = useRef(buffersSize);
	useEffect(() => {
		topicsRef.current = SelectedTopics;
		buffersSizeRef.current = buffersSize;
	});

	// Aggregate worst-case health across this provider's topics:
	// offline > connecting > online.
	const health = useMemo<DatasourceHealth>(() => {
		let sawConnecting = false;
		for (const topic of Topics) {
			if (!isBoundTopic(topic)) continue;
			const topicHealth = deriveHealth(
				datasourceStatuses.get(topic.source.id),
			);
			if (topicHealth === "offline") return "offline";
			if (topicHealth === "connecting") sawConnecting = true;
		}
		return sawConnecting ? "connecting" : "online";
	}, [Topics, datasourceStatuses]);

	// Context value only includes version (changes) and stable functions
	const contextValue = useMemo(
		() => ({
			sources: sources,
			version: sources.size, // Just a value to indicate change, though sources itself changes
			getSource,
			getSourceId,
			getTopicHealth,
			health,
		}),
		[sources, getSource, getSourceId, getTopicHealth, health],
	);
	const [initialized, setInitialized] = useState(false);

	// One subscription registry per PluginsManager instance (memoized off it).
	const registry = useMemo(
		() => getDatasourceSubscriptionRegistry(pluginsManager),
		[pluginsManager],
	);

	useEffect(() => {
		// Snapshot the topics this run owns. Safe to read off the ref: the
		// effect re-runs exactly when `topicsKey` changes, and `topicsKey` is
		// derived from these topics' wire identity.
		// Unbound entries are dropped before anything else: they own no wire,
		// so they get no buffer, no pending slot and — critically — no intent
		// in the subscription registry, which refcounts on a key they do not
		// have. `topicsKey` filters identically, so this run owns exactly the
		// wires that key describes.
		const topics = topicsRef.current.filter(isBoundTopic);
		const keys = topics.map((topic) => createTopicKey(topic));

		// Reconcile rather than rebuild: a topic that is still selected keeps
		// the buffer it has already filled, a newly added topic starts empty,
		// and a removed topic is dropped. Rebuilding the map here is what made
		// appending a second series to a live chart restart the first one from
		// zero. An unchanged set returns the same Map instance, so Jotai bails
		// out and no consumer re-renders.
		prunePendingUpdates(pendingUpdates, keys);
		setSources((previous) => reconcileSources(previous, keys));

		const propertiesGetter = (data: any, property: string) => {
			if (!property || property === "") {
				return data;
			}

			const properties = property.split(".");

			let value = data;
			for (const prop of properties) {
				value = value[prop];
			}

			return value;
		};

		let isMounted = true;

		// Set up the throttling interval
		const updateInterval = 1000 / updateFrequency; // milliseconds between updates

		const intervalId = setInterval(() => {
			if (!isMounted) return;

			if (pendingUpdatesRef.current.size === 0) return;

			// Capture pending updates and clear the ref immediately
			const updatesToProcess = new Map(pendingUpdatesRef.current);
			pendingUpdatesRef.current.clear();

			metrics.add(flushTicksId);
			metrics.add(flushUpdatesId, updatesToProcess.size);
			const t0 = metrics.heavy ? Date.now() : 0;

			setSources((prevSources) => {
				// Create a completely new Map to ensure immutability
				const newSources = new Map(prevSources);

				// Then apply updates
				updatesToProcess.forEach((update, sourceId) => {
					const currentSource = newSources.get(sourceId);
					if (!currentSource) {
						return;
					}

					// Create new arrays for immutability
					const newData = [...currentSource.data, update.value];
					const newTimes = [...currentSource.times, update.time];

					// Apply buffer limit
					const topic = topicsRef.current.find(
						(t) => createTopicKey(t) === sourceId,
					);

					// A per-topic depth is a FLOOR, never a cap: the widget
					// declares what it needs to render, and a value stored on
					// the topic may only ask for more history, never less.
					// Dashboards saved by earlier builds carry `bufferSize: 1`
					// stamped on every picked topic, and resolving that with
					// `||` capped every chart at a single sample.
					const bufferLimit = Math.max(
						topic?.bufferSize ?? 0,
						buffersSizeRef.current,
					);
					if (newData.length > bufferLimit) {
						newData.shift(); // Remove oldest element
						newTimes.shift(); // Remove corresponding time
					}

					// Update the source with new data - create a new object
					newSources.set(sourceId, {
						data: newData,
						times: newTimes,
						referenceFrameId: update.referenceFrameId || "unknown",
					});
				});

				return newSources;
			});

			if (t0) metrics.observe(flushTickMsRing, Date.now() - t0);
		}, updateInterval);

		// Declare a subscribe intent per topic. The registry owns all wire
		// traffic: it waits for DATASOURCE_READY (no polling/timeout), refcounts
		// per wire key, re-flushes on reconnect, and is StrictMode/unmount-safe.
		// Each intent's onData runs the existing propertiesGetter then writes the
		// last value into pendingUpdatesRef (drained by the 30 Hz pump above).
		const handles: SubscriptionHandle[] = topics.map((topic) => {
			const sourceId = createTopicKey(topic);
			return registry.subscribe({
				topic,
				onData: (
					value: any,
					time: number,
					referenceFrameId: string,
				) => {
					if (!isMounted) return;

					let processedValue = value;
					if (topic.property && topic.property !== "") {
						processedValue = propertiesGetter(
							value,
							topic.property,
						);
					}

					// An undrained pending entry is about to be replaced —
					// last-wins drop (the flush pump keeps only the newest
					// value per source between ticks).
					if (pendingUpdatesRef.current.has(sourceId)) {
						metrics.add(flushOverwritesId);
					}
					pendingUpdatesRef.current.set(sourceId, {
						value: processedValue,
						time,
						referenceFrameId: referenceFrameId || "unknown",
					});
				},
			});
		});

		// `initialized` now means "intents registered" — set synchronously,
		// no await. The registry establishes the real wire subscribe when the
		// datasource is (or becomes) READY.
		setInitialized(true);

		return () => {
			isMounted = false;
			clearInterval(intervalId);

			// Release every intent; the registry handles wire unsubscribe/cleanup.
			handles.forEach((handle) => handle.unsubscribe());
		};
		// Keyed on the topics' wire identity, never on the array's — every
		// consumer rebuilds `SelectedTopics` inline, so the array is a new object
		// on every render. `buffersSize` and the topic list itself are read
		// through refs above, so a widget that only changes its trim depth keeps
		// its subscriptions and its history. `setSources` is a Jotai setter and
		// the pending map lives in a ref, so both are stable for the provider's
		// lifetime.
	}, [topicsKey, updateFrequency, registry, setSources]);
	// Note: datasource statuses are deliberately absent - they drive health
	// gating, not the subscription lifecycle, and including them would
	// re-subscribe every widget on every reconnect.

	return (
		<LocalDataSourcesContextProvider value={contextValue}>
			{initialized && children}
		</LocalDataSourcesContextProvider>
	);
};

/**
 * Access local datasource context.
 * @returns Local datasource context value.
 */
const useLocalDataSource = () => {
	return useLocalDataSourcesContext();
};

export { LocalDataSourcesProvider, useLocalDataSource };
