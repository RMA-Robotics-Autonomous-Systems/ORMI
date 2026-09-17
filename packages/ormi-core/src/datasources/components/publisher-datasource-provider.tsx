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
	isBoundTopic,
	type AdvertiseHandle,
} from "@workspace/utils";
import { createSourcesKey } from "../source-reconcile";
import { getCreatedTopicsStore } from "../created-topics";

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
	// a parent re-render passes a new array with the same topics — every
	// consumer builds that array inline.
	//
	// Built from the same `createTopicKey` the registry refcounts advertise
	// intents on, so two slots that differ only by `property` are two keys here
	// too; a hand-rolled `id:topic` key collapsed them and left the second one
	// un-advertised.
	const topicsKey = useMemo(
		() => createSourcesKey(SelectedTopics),
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

	// The topics this dashboard declares. A publish topic usually does not
	// exist on the wire — that is the whole reason the operator created it — so
	// nothing else can answer `AVAILABLE_TOPICS` for it. Retaining it here is
	// also what makes a control widget restored from a saved workspace put its
	// own topic back in the list on mount, with nothing persisted anywhere.
	const createdTopics = useMemo(
		() => getCreatedTopicsStore(pluginsManager),
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
		const releases: (() => void)[] = [];
		const nextPublishers = new Map<string, Publisher>();

		// Unbound slots are dropped first, exactly as `LocalDataSourcesProvider`
		// drops them: a widget is configured one field at a time, so a settings
		// object legitimately holds publish slots the operator has not filled.
		// They own no wire — `createTopicKey` has no key for them, so a whole
		// set of them collapsed onto one registry entry and fired `-advertise`
		// for a topic with no name. `topicsKey` filters identically, so this run
		// owns exactly the wires that key describes.
		Topics.filter((topic) => isBoundTopic(topic)).forEach((topic) => {
			const publisher = new Publisher(topic, pluginsManager);
			nextPublishers.set(topic.topic, publisher);
			handles.push(registry.advertise(topic));
			// Listed as a topic, not as this widget's binding: `property` and
			// `bufferSize` are one consumer's view of a message, and a list
			// entry carrying them would hand the next widget a pre-narrowed
			// topic it never asked for.
			releases.push(
				createdTopics.retain({
					topic: topic.topic,
					datasource_id: topic.datasource_id,
					source: topic.source,
					type: topic.type,
					rawType: topic.rawType,
				}),
			);
		});

		setPublishers(nextPublishers);

		// `initialized` now means "advertise intents registered" — set
		// synchronously, no await.
		setInitialized(true);

		return () => {
			handles.forEach((handle) => handle.unadvertise());
			releases.forEach((release) => release());
			setPublishers(new Map());
			setInitialized(false);
		};

		// Rerun effect only when the topic set content changes, not on array reference churn.
	}, [topicsKey, pluginsManager, registry, createdTopics]);

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
