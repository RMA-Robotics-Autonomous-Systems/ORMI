"use client";
/**
 * Publisher datasource provider for advertising and publishing topics.
 */

import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { SelectedTopic } from "../datasource-interface";
import { Spinner } from "@workspace/ui/components/spinner";
import { PluginsManager, usePluginsManager } from "@workspace/ormi-plugins";
import {
	createSafeContext,
	getDatasourceSubscriptionRegistry,
	type AdvertiseHandle,
} from "@workspace/utils";

/** Publisher datasource context value. */
interface PublisherDataSources {
	publishers: Map<string, Publisher>;
}

/** Props for PublisherDataSourcesProvider. */
interface PublisherDataSourcesProviderProps {
	children: ReactNode;
	SelectedTopics: SelectedTopic[];
}

/**
 * Publisher wrapper for a selected topic.
 *
 * The advertise/unadvertise lifecycle is owned by the subscription registry
 * (intent-based, re-flush on DATASOURCE_READY so a publisher that
 * advertised before the datasource was ready isn't left as a phantom).
 * This class is now a thin handle over the unchanged `publish` wire path.
 */
class Publisher {
	topic: SelectedTopic;

	pm: PluginsManager;

	constructor(topic: SelectedTopic, pluginManager: PluginsManager) {
		this.topic = topic;
		this.pm = pluginManager;
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

const [PublisherDataSourcesContextProvider, usePublisherDataSourcesContext] =
	createSafeContext<PublisherDataSources>("PublisherDataSources");

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

	// Always keep a ref in sync so the effect closure reads the current topics
	// without needing the array itself as a dependency.
	const selectedTopicsRef = useRef(SelectedTopics);
	selectedTopicsRef.current = SelectedTopics;

	// Stable key: only changes when the actual topic set changes.
	// Prevents the effect from re-running (and tearing down publishers) when
	// a parent re-render passes a new array with the same topics.
	const topicsKey = useMemo(
		() => SelectedTopics.map((t) => `${t.source.id}:${t.topic}`).join(","),
		[SelectedTopics],
	);

	const [publishers, setPublishers] = useState<Map<string, Publisher>>(
		new Map(),
	);
	const [initialized, setInitialized] = useState(false);

	// One subscription registry per PluginsManager instance (memoized off it).
	const registry = useMemo(
		() => getDatasourceSubscriptionRegistry(pluginsManager),
		[pluginsManager],
	);

	useEffect(() => {
		const Topics = selectedTopicsRef.current;

		// Declare an advertise intent per topic. The registry owns the
		// advertise/unadvertise wire lifecycle: it waits for DATASOURCE_READY
		// (no phantom publisher before the -advertise filter exists) and
		// re-advertises on reconnect. Publishers are available
		// immediately for the publish path; advertise resolves in the
		// background once the datasource is READY.
		const handles: AdvertiseHandle[] = [];
		const nextPublishers = new Map<string, Publisher>();

		Topics.forEach((topic) => {
			const publisher = new Publisher(topic, pluginsManager);
			nextPublishers.set(topic.topic, publisher);
			handles.push(registry.advertise(topic));
		});

		setPublishers(nextPublishers);

		// `initialized` now means "advertise intents registered" — set
		// synchronously, no await.
		setInitialized(true);

		return () => {
			handles.forEach((handle) => handle.unadvertise());
			setPublishers(new Map());
			setInitialized(false);
		};

		// Rerun effect only when the topic set content changes, not on array reference churn.
	}, [topicsKey, pluginsManager, registry]);

	return (
		<PublisherDataSourcesContextProvider value={{ publishers }}>
			{initialized && children}
			{!initialized && <Spinner />} {/* Use Spinner */}
		</PublisherDataSourcesContextProvider>
	);
};

/**
 * Access publisher datasource context.
 * @returns Publisher datasource context value.
 */
const usePublisherDataSource = () => {
	return usePublisherDataSourcesContext();
};

export { PublisherDataSourcesProvider, usePublisherDataSource };
