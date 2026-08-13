import {
	DatasourceTopicFilter,
	SelectedTopic,
	type DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { JSX } from "react";
import TeodorEmiMap from "./teodor-emi-map";
import {
	EmiReplayProvider,
	EMI_REPLAY_DATASOURCE_ID,
} from "./datasource/emi-replay-source";
import type { PageDefinition } from "@workspace/ormi-plugins";
import type { EmiReplaySettings } from "./datasource/emi-replay.worker";
import {
	EMI_MAP_TYPES,
	EmiDetectionsLayer,
	EmiGhostsLayer,
	EmiTargetsLayer,
	EmiTrackLayer,
} from "./map-markers/emi-map-layers";
import { EmiMissionPage } from "./page/emi-mission-page";

/**
 * Adds TeodorEMI map type to the available map types array.
 * @param array - Array of map type strings.
 * @returns Updated array.
 */
export const addMapTypeArray = (array: string[]) => {
	array.push("TeodorEMI");
	array.push(EMI_MAP_TYPES.detections);
	array.push(EMI_MAP_TYPES.targets);
	array.push(EMI_MAP_TYPES.ghosts);
	array.push(EMI_MAP_TYPES.track);
	return array;
};

/**
 * Adds EMI topic type filter for emi_msgs/msg/EMIGnss.
 * @param topicFilter - Datasource topic filter.
 * @returns Updated topic filter.
 */
export const addTopicTypeFilter = (topicFilter: DatasourceTopicFilter) => {
	// add the "emi_msgs/msg/EMI" as a possible type for the map topics
	// change the regex to include the "emi_msgs/msg/EMI" type
	// if the rawType is not defined, use the "emi_msgs/msg/EMI" type       // emi_msgs/msg/EMIGnss
	// if defined, use the rawType
	if (!topicFilter.rawType) {
		topicFilter.rawType = new RegExp("emi_msgs/msg/EMI");
	} else {
		topicFilter.rawType = new RegExp(
			`(${topicFilter.rawType.source}|emi_msgs/msg/EMIGnss)`,
		);
	}

	topicFilter.strict = false; // allow partial matches

	return topicFilter;
};

/**
 * Configuration for a map topic.
 */
interface MapTopic {
	name: string;
	topic: SelectedTopic;
	makerType: "simple" | "heatmap" | "path" | "multipoints" | any;
	numericalTopic?: SelectedTopic;
}

/**
 * Returns TeodorEMI map marker component when appropriate.
 * @param current_component - Current component.
 * @param t - Map topic configuration.
 * @returns Map marker component.
 */
export const mapMarkerComponent = (
	current_component: JSX.Element,
	t: MapTopic,
) => {
	switch (t.makerType) {
		case "TeodorEMI":
			return (
				<TeodorEmiMap
					key={t.name}
					topic={t.topic}
					name={t.name}
					scale={1}
					useRaw2={false}
				/>
			);
		case EMI_MAP_TYPES.detections:
			return (
				<EmiDetectionsLayer
					key={t.name}
					topic={t.topic}
					name={t.name}
				/>
			);
		case EMI_MAP_TYPES.targets:
			return (
				<EmiTargetsLayer key={t.name} topic={t.topic} name={t.name} />
			);
		case EMI_MAP_TYPES.ghosts:
			return (
				<EmiGhostsLayer key={t.name} topic={t.topic} name={t.name} />
			);
		case EMI_MAP_TYPES.track:
			return <EmiTrackLayer key={t.name} topic={t.topic} name={t.name} />;
		default:
			return current_component;
	}
};

// ---------------------------------------------------------------------------
// Widgets
//
// The list lives in `widgets/definitions.ts` and is registered by the cockpit
// **page**, not by the plugin class — these panels only mean anything with an
// EMI run behind them, so offering them in every workspace's widget picker was
// eleven entries of noise on dashboards that will never have one.
//
// Re-exported here so `export.tsx` stays the plugin's single public surface.
// ---------------------------------------------------------------------------

export {
	emiWidgetDefinitions,
	EMI_WIDGETS_FILTER_ID,
} from "./widgets/definitions";

/** The cockpit page, registered on `PAGES_LIST`. */
export const emiPageDefinition: PageDefinition = {
	slug: "teodor-emi",
	title: "Teodor EMI",
	component: EmiMissionPage,
	navItem: {
		position: "left" as const,
		priority: 6,
		group: "EMI",
		description:
			"Tune the EMI detector against a recording or a live robot, and see every decision it makes.",
	},
};

// ---------------------------------------------------------------------------
// Definitions
//
// Pattern 4: a plugin's registrable definitions live here, so a reader has one
// place to see everything it contributes. The components themselves stay in
// their feature folders.
// ---------------------------------------------------------------------------

/** The datasource definition, registered on `DATASOURCES_LIST`. */
export const EmiReplayDatasourceDefinition: DatasourceDefinition<EmiReplaySettings> =
	{
		id: EMI_REPLAY_DATASOURCE_ID,
		name: "Teodor EMI recording",
		description:
			"Replay a recorded ROS 2 bag as a live datasource. Every widget sees the same topics it would from the robot.",
		titleProp: "title",

		schema: {
			title: "Teodor EMI recording",
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				enable: { type: "boolean", title: "Enable" },
				bagName: {
					type: "string",
					title: "Recording",
					description:
						"A .db3 held in this page's memory. Recordings are not uploaded anywhere.",
				},
				drain: {
					type: "boolean",
					title: "Load the whole recording at once",
					description:
						"On by default. A bag is read, not watched — this hands every panel the complete survey in a second or two instead of filling it in over twenty minutes. Turn it off to watch the recording arrive in real time.",
					default: true,
				},
				autoplay: {
					type: "boolean",
					title: "Play on open",
					description:
						"Real-time playback only; ignored while loading at once.",
					default: true,
				},
				rate: {
					type: "number",
					title: "Playback rate",
					description: "Real-time playback only.",
					default: 1,
					minimum: 0.01,
				},
			},
			required: ["bagName"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{ type: "Control", scope: "#/properties/title" },
				{ type: "Control", scope: "#/properties/enable" },
				// Rendered by the file picker registered on JSON_FORMS_RENDERER.
				{
					type: "Control",
					scope: "#/properties/bagName",
					options: { format: "emi-bag-file" },
				},
				{ type: "Control", scope: "#/properties/drain" },
				{ type: "Control", scope: "#/properties/autoplay" },
				{ type: "Control", scope: "#/properties/rate" },
			],
		} as DatasourceDefinition<EmiReplaySettings>["uischema"],

		data: {
			id: "",
			title: "EMI recording",
			enable: true,
			bagName: "",
			drain: true,
			autoplay: true,
			rate: 1,
		},

		Provider: EmiReplayProvider,
	};

export { bagFileRendererDefinition } from "./datasource/bag-file-renderer";
export { EMI_REPLAY_DATASOURCE_ID };
