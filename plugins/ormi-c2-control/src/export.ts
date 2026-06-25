"use client";

import {
	Datasource,
	DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

import { C2ControlSettings } from "./types/c2-types";
import { C2SourceProvider } from "./datasource/c2-source";
import { FleetStatusDefinition } from "./widgets/fleet-status";
import { MissionFeedbackDefinition } from "./widgets/mission-feedback";
import { SwarmLogDefinition } from "./widgets/swarm-log";
import { MissionBrowserDefinition } from "./widgets/mission-browser";
import { MissionControlPanelDefinition } from "./widgets/mission-control-panel";

/** The C2 datasource definition id — gated command widgets key on it. */
export const C2_DATASOURCE_ID = "c2-control-source";

/** Command-widget ids gated on a configured C2 datasource (§4.1). */
const C2_COMMAND_WIDGET_IDS = [
	"c2-mission-browser-widget",
	"c2-mission-control-panel-widget",
] as const;

/**
 * C2 Control datasource definition.
 *
 * Config holds the two C2 REST base URLs. Telemetry rides ORMI's own
 * rosbridge/foxglove datasource (D2); this datasource only exposes commands +
 * CRUD as remote calls.
 */
export const datasourceDefinition = {
	id: "c2-control-source",
	name: "C2 Control",
	description:
		"RMA Multi-Agent Framework C2: mission commands + CRUD as remote calls (REST). Telemetry uses your ROS datasource.",

	schema: {
		title: "C2 Control",
		type: "object",
		properties: {
			title: { type: "string", title: "Title" },
			enable: { type: "boolean", title: "Enable" },
			missionControlUrl: {
				type: "string",
				title: "Mission Control URL (:5001)",
			},
			dbUrl: {
				type: "string",
				title: "Mongo REST URL (:5000)",
			},
		},
	},

	data: {
		id: "",
		title: "",
		enable: true,
		missionControlUrl: "http://localhost:5001",
		dbUrl: "http://localhost:5000",
	},

	Provider: (props) => C2SourceProvider(props),
} as DatasourceDefinition<C2ControlSettings>;

/**
 * Register the C2 widgets.
 *
 * Phase 2 — **display** widgets on rosbridge/foxglove topics: fleet status (F7),
 * mission feedback (F10), swarm log (F11). These do NOT gate on the C2 datasource
 * (§4.1: the C2 datasource publishes no topics).
 *
 * Phase 3 — **command** widgets on the C2 remote calls: mission browser (F4) and
 * lifecycle control panel (F8). These DO require a C2 datasource, so they are
 * additionally gated in {@link widgetFilters} via `WIDGET_LIST_WITH_DATASOURCE`.
 * @param widgets - Widget list to extend.
 * @returns The extended widget list.
 */
export const widgetsExport = (
	widgets: WidgetDefinition<any>[],
): WidgetDefinition<any>[] => {
	widgets.push(FleetStatusDefinition());
	widgets.push(MissionFeedbackDefinition());
	widgets.push(SwarmLogDefinition());
	// Phase 3 — command widgets (gated by widgetFilters below).
	widgets.push(MissionBrowserDefinition());
	widgets.push(MissionControlPanelDefinition());
	return widgets;
};

/**
 * `WIDGET_LIST_WITH_DATASOURCE` filter: hide the C2 **command** widgets (F4/F8)
 * unless an enabled C2 datasource is configured (§4.1 — command widgets gate on
 * `DATASOURCE_READY`). The display widgets (F7/F10/F11) are never filtered here
 * — they ride the rosbridge/foxglove datasource and gate on its topic health.
 * @param widgets - The current widget list.
 * @param datasources - The configured datasources in the workspace.
 * @returns The (possibly filtered) widget list.
 */
export const widgetFilters = (
	widgets: WidgetDefinition[],
	datasources: Datasource[],
): WidgetDefinition[] => {
	const hasC2 = datasources.some(
		(datasource) =>
			datasource.datasource_id === C2_DATASOURCE_ID &&
			datasource.settings.enable,
	);

	if (hasC2) return widgets;

	const gated = new Set<string>(C2_COMMAND_WIDGET_IDS);
	return widgets.filter((widget) => !gated.has(widget.id));
};
