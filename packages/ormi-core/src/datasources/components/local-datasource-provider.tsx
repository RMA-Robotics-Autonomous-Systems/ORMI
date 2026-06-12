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
	metrics,
	type SubscriptionHandle,
} from "@workspace/utils";

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

/** Local datasource context value. */
interface LocalDataSources {
	sources: Map<string, Source>;
	version: number; // Increment on every update to force re-renders
	getSource: (topic: SelectedTopic) => Source | undefined;
	getSourceId: (topic: SelectedTopic) => string;
	/**
	 * Widget-facing health of a single topic's backing datasource, derived from
	 * the global per-datasource status. Returns `connecting` when the datasource
	 * is not yet tracked.
	 */
	getTopicHealth: (topic: SelectedTopic) => DatasourceHealth;
	/**
	 * Aggregate worst-case health across all of this provider's selected topics,
	 * ordered `offline > connecting > online` (any topic offline → `offline`;
	 * else any connecting → `connecting`; else `online`). For a single-topic
	 * widget this is just that topic's health. `online` when there are no topics.
	 */
	health: DatasourceHealth;
}

/** Buffered source data. */
interface Source {
	data: unknown[];
	times: number[];
	referenceFrameId: string;
}

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

	// getSource reads from sources state
	const getSource = useCallback(
		(topic: SelectedTopic): Source | undefined => {
			const key = createTopicKey(topic);
			return sources.get(key);
		},
		[sources],
	);

	const getSourceId = useCallback((topic: SelectedTopic): string => {
		return createTopicKey(topic);
	}, []);

	// Read the raw per-datasource statuses from the always-present global
	// provider so widgets can gate on derived health. Status changes flow through
	// this map identity, so getTopicHealth/health stay current.
	const { datasourceStatuses } = useGlobalDataSources();

	const getTopicHealth = useCallback(
		(topic: SelectedTopic): DatasourceHealth =>
			deriveHealth(datasourceStatuses.get(topic.source.id)),
		[datasourceStatuses],
	);

	const pluginsManager = usePluginsManager();
	const Topics = SelectedTopics;

	// Aggregate worst-case health across this provider's topics:
	// offline > connecting > online.
	const health = useMemo<DatasourceHealth>(() => {
		let sawConnecting = false;
		for (const topic of Topics) {
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
		// Clear any pending updates
		pendingUpdates.clear();

		// Initialize the sources map with empty sources for all topics
		const newSources = new Map<string, Source>();
		Topics.forEach((topic) => {
			const sourceId = createTopicKey(topic);
			newSources.set(sourceId, {
				data: [],
				times: [],
				referenceFrameId: "unknown",
			});
		});
		setSources(newSources);

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
					const topic = Topics.find(
						(t) => createTopicKey(t) === sourceId,
					);

					const bufferLimit = topic?.bufferSize || buffersSize;
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
		const handles: SubscriptionHandle[] = Topics.map((topic) => {
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
	}, [
		SelectedTopics,
		buffersSize,
		updateFrequency,
		pluginsManager,
		registry,
	]);
	// Note: Removed datasources from deps - it's only used for subscription lifecycle
	// which is controlled by SelectedTopics. Including it causes unnecessary re-subscriptions
	// when dashboard layout changes.

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
