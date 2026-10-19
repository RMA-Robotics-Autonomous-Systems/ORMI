"use client";

import { Fragment, JSX, useCallback, useMemo, useState } from "react";
import { MapRef } from "react-map-gl/maplibre";
import {
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { createTopicKey, isBoundTopic } from "@workspace/utils";

import { GPS_ENTRY_SLOTS, isEntryConfigured } from "../unconfigured-entries";

import { MapControlPanel } from "../topics-overlay";
import { isFollowableMarker, toggleFollow } from "../follow-camera";
import { FollowCamera } from "./FollowCamera";
import type { RasterOverlayLayer } from "@workspace/ormi-core/map-layers/map";
import TopicMarker from "../gps-components/marker-simple";
import HeatMarker from "../gps-components/marker-heat";
import PathMarker from "../gps-components/marker-path";
import MultiPoints from "../gps-components/marker-multipoints";

/**
 * Configuration for a GPS topic marker.
 */
interface GpsTopicConfig {
	name: string;
	topic: SelectedTopic;
	makerType: "simple" | "heatmap" | "path" | "multipoints" | any;
	numericalTopic?: SelectedTopic;
}

/**
 * Props for GpsTopicsLayer.
 */
interface GpsTopicsLayerProps extends Record<string, unknown> {
	topics: GpsTopicConfig[];
	mapRef?: React.RefObject<MapRef | null>;
	/** Map-server raster layers the map draws, listed in the control panel. */
	mapLayers: readonly RasterOverlayLayer[];
}

/**
 * Renders GPS-based topics (already in GPS coordinates).
 * @param props - Component props.
 * @returns React element or null when there is nothing to render.
 */
export function GpsTopicsLayer({
	topics,
	mapRef,
	mapLayers,
}: GpsTopicsLayerProps) {
	const pluginsManager = usePluginsManager();

	// Memoize all topics to prevent unnecessary re-computation. Unbound slots
	// are skipped here rather than filtered afterwards: an entry the operator
	// has not finished configuring carries no key to dedupe on, and the
	// provider would drop it anyway.
	const allTopics = useMemo(() => {
		const topicsList: SelectedTopic[] = [];
		const seenSourceIds = new Set<string>();

		const add = (topic: SelectedTopic | undefined) => {
			const key = createTopicKey(topic);
			if (key === undefined || seenSourceIds.has(key)) return;
			topicsList.push(topic as SelectedTopic);
			seenSourceIds.add(key);
		};

		topics.forEach((t) => {
			add(t.topic);
			add(t.numericalTopic);
		});

		return topicsList;
	}, [topics]);

	// Per-entry instance identity. A topic can legitimately appear in several
	// entries (e.g. a `path` and a `multipoints` view of the same fix), so the
	// topic key alone is not unique: compose it with the list index. Markers and
	// the control panel must agree on this id — it keys the ButtonHolder toggle,
	// the panel rows and the MapLibre source/layer ids.
	//
	// An entry whose own topic is not bound is not drawable at all — every
	// marker reads `topic.source.id` — so it is skipped here and reported by
	// the viewer's notice instead. Skipping it silently is what made a
	// half-configured entry look like a map bug.
	const entries = useMemo(
		() =>
			topics
				.map((t, i) => ({ entry: t, index: i }))
				.filter(({ entry }) =>
					isEntryConfigured(entry, GPS_ENTRY_SLOTS),
				)
				.map(({ entry, index }) => ({
					...entry,
					instanceId: `${entry.topic.source.id}::${entry.topic.topic}::${entry.topic.property ?? ""}::${index}`,
				})),
		[topics],
	);

	// The entry the camera follows. Held here, not in the control panel: the
	// panel unmounts its rows when collapsed, and the follow must outlive that.
	// An id that no longer names a followable entry (removed or retyped in the
	// settings) follows nothing.
	const [followedId, setFollowedId] = useState<string | null>(null);
	const followed = entries.find(
		(e) => e.instanceId === followedId && isFollowableMarker(e.makerType),
	);
	const handleToggleFollow = useCallback((instanceId: string) => {
		setFollowedId((current) => toggleFollow(current, instanceId));
	}, []);
	const handleStopFollow = useCallback(() => setFollowedId(null), []);

	// Render nothing only when there is neither a topic nor a layer to control.
	if ((!topics || topics.length === 0) && mapLayers.length === 0) {
		return null;
	}

	return (
		<LocalDataSourcesProvider SelectedTopics={allTopics} buffersSize={50}>
			{entries.map((t) => {
				const instanceId = t.instanceId;
				if (t.makerType === "simple") {
					return (
						<TopicMarker
							key={instanceId}
							instanceId={instanceId}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				} else if (t.makerType === "heatmap") {
					return (
						<HeatMarker
							key={instanceId}
							instanceId={instanceId}
							topic={t.topic}
							name={t.name}
							scale={1}
							numericalTopic={
								isBoundTopic(t.numericalTopic)
									? t.numericalTopic
									: undefined
							}
						/>
					);
				} else if (t.makerType === "path") {
					return (
						<PathMarker
							key={instanceId}
							instanceId={instanceId}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				} else if (t.makerType === "multipoints") {
					return (
						<MultiPoints
							key={instanceId}
							instanceId={instanceId}
							topic={t.topic}
							name={t.name}
							scale={1}
						/>
					);
				}
				// Plugin-provided marker: wrap in a keyed Fragment — the returned element
				// is arbitrary JSX we cannot attach a key to directly. The filter payload
				// keeps its shape (a single entry object) and now also carries
				// `instanceId` for plugins that need a per-entry identity.
				return (
					<Fragment key={instanceId}>
						{pluginsManager.applyFilter<JSX.Element | null>(
							"std-widgets-map-components",
							null,
							t,
						)}
					</Fragment>
				);
			})}

			{followed && (
				<FollowCamera
					key={followed.instanceId}
					name={followed.name}
					topic={followed.topic}
					onStop={handleStopFollow}
				/>
			)}

			<MapControlPanel
				topics={entries}
				mapLayers={mapLayers}
				mapRef={mapRef}
				followedId={followed?.instanceId ?? null}
				onToggleFollow={handleToggleFollow}
			/>
		</LocalDataSourcesProvider>
	);
}
