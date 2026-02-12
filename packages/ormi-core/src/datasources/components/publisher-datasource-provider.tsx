"use client";
/**
 * Publisher datasource provider for advertising and publishing topics.
 */

import React, {
	createContext,
	ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import { SelectedTopic } from "../datasource-interface";
import { Spinner } from "@workspace/ui/components/spinner";
import { toast } from "sonner";
import { PluginsManager, usePluginsManager } from "@workspace/ormi-plugins";

/** Publisher datasource context value. */
interface PublisherDataSources {
	publishers: Map<string, Publisher>;
}

/** Props for PublisherDataSourcesProvider. */
interface PublisherDataSourcesProviderProps {
	children: ReactNode;
	SelectedTopics: SelectedTopic[];
}

/** Publisher wrapper for a selected topic. */
class Publisher {
	topic: SelectedTopic;

	pm: PluginsManager;

	constructor(topic: SelectedTopic, pluginManager: PluginsManager) {
		this.topic = topic;
		this.pm = pluginManager;
	}

	async advertise() {
		return await this.pm.applyFilterAsync(
			`${this.topic.source.id}-advertise`,
			this.topic,
		);
	}

	unadvertise() {
		this.pm.doAction(`${this.topic.source.id}-unadvertise`, this.topic);
	}

	publish<T>(data: T, webtype: string) {
		this.pm.doAction(
			`${this.topic.source.id}-${this.topic.topic}-publish`,
			this.topic,
			data,
			webtype,
		);
	}
}

const PublisherDataSourcesContext = createContext<PublisherDataSources>({
	publishers: new Map<string, Publisher>(),
});

/**
 * Provide publisher instances for selected topics.
 * @param props - Component props.
 * @returns React element.
 */
const PublisherDataSourcesProvider = (
	props: PublisherDataSourcesProviderProps,
) => {
	const { children, SelectedTopics } = props;

	const pluginsManager = usePluginsManager();

	const Topics = SelectedTopics;

	const [publishers, setPublishers] = useState<Map<string, Publisher>>(
		new Map(),
	);
	const publishersRef = useRef<Map<string, Publisher>>(new Map()); // Ref to hold publishers for cleanup
	const [initialized, setInitialized] = useState(false);

	useEffect(() => {
		// Differential update: only change what's actually different
		const currentTopicKeys = new Set(
			Array.from(publishersRef.current.keys()),
		);
		const newTopicKeys = new Set(Topics.map((topic) => topic.topic));

		// Find topics to remove (in current but not in new)
		const topicsToRemove = Array.from(currentTopicKeys).filter(
			(key) => !newTopicKeys.has(key),
		);

		// Find topics to add (in new but not in current)
		const topicsToAdd = Topics.filter(
			(topic) => !currentTopicKeys.has(topic.topic),
		);

		// Remove topics that are no longer needed
		topicsToRemove.forEach((topicKey) => {
			const publisher = publishersRef.current.get(topicKey);
			if (publisher) {
				try {
					publisher.unadvertise();
				} catch (error) {
					console.error(
						`Error unadvertising topic ${topicKey}:`,
						error,
					);
				}

				// Update both state and ref
				setPublishers((prev) => {
					const newPublishers = new Map(prev);
					newPublishers.delete(topicKey);
					publishersRef.current = newPublishers;
					return newPublishers;
				});
			}
		});

		// Add new topics
		if (topicsToAdd.length > 0) {
			const addTopics = async () => {
				const initializedTopics = new Map<string, boolean>();

				function setInitializedTopic(topic: string, state: boolean) {
					initializedTopics.set(topic, state);

					// Check if all new topics have been processed
					if (initializedTopics.size === topicsToAdd.length) {
						// Show toast for failed topics
						const notInitializedTopics = topicsToAdd.filter(
							(topic) => !initializedTopics.get(topic.topic),
						);

						if (notInitializedTopics.length > 0) {
							toast(
								"Failed to initialize publishers for topics: " +
									notInitializedTopics
										.map((topic) => topic.topic)
										.join(", "),
							);
						}

						setInitialized(true);
					}
				}

				// Add each new topic
				for (const topic of topicsToAdd) {
					const publisher = new Publisher(topic, pluginsManager);
					let result = false;

					try {
						result = (await publisher.advertise()) as boolean;
						if (result) {
							// Update state and ref
							setPublishers((prev) => {
								const newPublishers = new Map(prev);
								newPublishers.set(topic.topic, publisher);
								publishersRef.current = newPublishers;
								return newPublishers;
							});
						}
					} catch (error) {
						console.error(
							`Failed to advertise topic ${topic.topic}:`,
							error,
						);
					} finally {
						setInitializedTopic(topic.topic, result);
					}
				}
			};

			addTopics();
		} else if (topicsToRemove.length === 0) {
			// No changes at all, just mark as initialized
			setInitialized(true);
		}

		// If we only removed topics and didn't add any, mark as initialized
		if (topicsToAdd.length === 0 && topicsToRemove.length > 0) {
			setInitialized(true);
		}

		// Initial case: no publishers exist and we have topics to add
		if (
			publishersRef.current.size === 0 &&
			Topics.length > 0 &&
			topicsToAdd.length === 0
		) {
			// This means it's the initial load
			const initializeAllTopics = async () => {
				const initializedTopics = new Map<string, boolean>();

				function setInitializedTopic(topic: string, state: boolean) {
					initializedTopics.set(topic, state);
					if (initializedTopics.size === Topics.length) {
						const notInitializedTopics = Topics.filter(
							(topic) => !initializedTopics.get(topic.topic),
						);
						if (notInitializedTopics.length > 0) {
							toast(
								"Failed to initialize publishers for topics: " +
									notInitializedTopics
										.map((topic) => topic.topic)
										.join(", "),
							);
						}
						setInitialized(true);
					}
				}

				if (Topics.length === 0) {
					setInitialized(true);
					return;
				}

				for (const topic of Topics) {
					const publisher = new Publisher(topic, pluginsManager);
					let result = false;

					try {
						result = (await publisher.advertise()) as boolean;
						if (result) {
							setPublishers((prev) => {
								const newPublishers = new Map(prev);
								newPublishers.set(topic.topic, publisher);
								publishersRef.current = newPublishers;
								return newPublishers;
							});
						}
					} catch (error) {
						console.error(
							`Failed to advertise topic ${topic.topic}:`,
							error,
						);
					} finally {
						setInitializedTopic(topic.topic, result);
					}
				}
			};

			initializeAllTopics();
		}

		// Cleanup function for component unmount only
		return () => {
			publishersRef.current.forEach((publisher) => {
				try {
					publisher.unadvertise();
				} catch (error) {
					console.error(
						`Error unadvertising topic ${publisher.topic.topic}:`,
						error,
					);
				}
			});
			publishersRef.current.clear();
			setPublishers(new Map());
			setInitialized(false);
		};

		// Rerun effect if SelectedTopics change
	}, [SelectedTopics, pluginsManager]);

	return (
		<PublisherDataSourcesContext.Provider value={{ publishers }}>
			{initialized && children}
			{!initialized && <Spinner />} {/* Use Spinner */}
		</PublisherDataSourcesContext.Provider>
	);
};

/**
 * Access publisher datasource context.
 * @returns Publisher datasource context value.
 */
const usePublisherDataSource = () => {
	const context = useContext(PublisherDataSourcesContext);
	if (!context) {
		throw new Error(
			"useLocalDataSource must be used within a GlobalDataSourcesProvider",
		);
	}

	return context;
};

export { PublisherDataSourcesProvider, usePublisherDataSource };
