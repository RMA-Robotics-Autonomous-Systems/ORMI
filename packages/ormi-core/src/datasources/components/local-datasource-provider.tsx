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
import { SelectedTopic } from "../datasource-interface";

import { toast } from "sonner";
import { Spinner } from "@workspace/ui/components/spinner";

import { usePluginsManager } from "@workspace/ormi-plugins";
import { atom, useAtom } from "jotai";
import { createSafeContext } from "@workspace/utils";

/** Create a stable key for a selected topic. */
const createTopicKey = (selectedTopic: SelectedTopic): string => {
	return `${selectedTopic.source.id}::${selectedTopic.topic}${selectedTopic.property ? "::" + selectedTopic.property : ""}`;
};

/** Local datasource context value. */
interface LocalDataSources {
	sources: Map<string, Source>;
	version: number; // Increment on every update to force re-renders
	getSource: (topic: SelectedTopic) => Source | undefined;
	getSourceId: (topic: SelectedTopic) => string;
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

	// Context value only includes version (changes) and stable functions
	const contextValue = useMemo(
		() => ({
			sources: sources,
			version: sources.size, // Just a value to indicate change, though sources itself changes
			getSource,
			getSourceId,
		}),
		[sources, getSource, getSourceId],
	);

	const pluginsManager = usePluginsManager();
	const Topics = SelectedTopics;
	const local_id = useRef(Math.random().toString(36).substring(7)).current;
	const [initialized, setInitialized] = useState(false);

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
		}, updateInterval);

		// Initialize all subscriptions in parallel using Promise.all
		Promise.all(
			Topics.map(async (topic) => {
				const sourceId = createTopicKey(topic);

				try {
					// subscribe to the topic, this starts the data flow inside the datasource
					const result = await pluginsManager.WaitAndDoAction(
						`${topic.source.id}-subscribe`,
						1,
						topic,
					);

					if (result === false) {
						return { sourceId, topic, success: false };
					}

					// add an action on the data hook of the topic, will only be triggered when the data is published, and if the topic is subscribed
					pluginsManager.addAction(
						`${topic.source.id}-${topic.topic}-published`,
						{
							id: `${local_id}-${topic.source.id}-${topic.topic}_${topic.property}-published`,
							priority: 10,
							action: (
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

								// Store in pendingUpdates
								pendingUpdatesRef.current.set(sourceId, {
									value: processedValue,
									time,
									referenceFrameId:
										referenceFrameId || "unknown",
								});
							},
						},
					);

					return { sourceId, topic, success: true };
				} catch (error) {
					console.error(
						`Failed to subscribe to topic ${topic.topic}:`,
						error,
					);
					return { sourceId, topic, success: false };
				}
			}),
		).then((subscriptionResults) => {
			if (!isMounted) return;

			// Check for failed subscriptions
			const failedSubscriptions = subscriptionResults.filter(
				(result) => !result.success,
			);

			if (failedSubscriptions.length > 0) {
				toast.error(
					"Failed to initialize topics: " +
						failedSubscriptions
							.map((result) => result.topic.topic)
							.join(", "),
				);
			}

			// Mark as initialized only after all subscriptions complete
			setInitialized(true);
		});

		return () => {
			isMounted = false;
			clearInterval(intervalId);

			// Clean up subscriptions
			Topics.forEach(async (topic) => {
				// unsubscribe from the topic, if no other widget is subscribed to the topic, the data flow will stop
				await pluginsManager.WaitAndDoAction(
					`${topic.source.id}-unsubscribe`,
					1,
					topic,
				);

				// remove the action that was added to the data hook of the topic,
				pluginsManager.removeAction(
					`${local_id}-${topic.source.id}-${topic.topic}_${topic.property}-published`,
				);
			});
		};
	}, [SelectedTopics, buffersSize, updateFrequency, pluginsManager]);
	// Note: Removed datasources from deps - it's only used for subscription lifecycle
	// which is controlled by SelectedTopics. Including it causes unnecessary re-subscriptions
	// when dashboard layout changes.

	return (
		<LocalDataSourcesContextProvider value={contextValue}>
			{initialized && children}
			{!initialized && (
				<>
					<h1>Waiting for subscriptions</h1>
					<p>
						Please wait while we establish connections to the data
						sources.
					</p>
					<Spinner />
				</>
			)}
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
