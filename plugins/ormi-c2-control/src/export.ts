"use client";

import {
	Datasource,
	DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import type { PageDefinition } from "@workspace/ormi-plugins";

import { C2ControlSettings } from "./types/c2-types";
import { C2_DATASOURCE_ID } from "./datasource/datasource-select";
import { C2SourceProvider } from "./datasource/c2-source";
import { FleetStatusDefinition } from "./widgets/fleet-status";
import { MissionFeedbackDefinition } from "./widgets/mission-feedback";
import { SwarmLogDefinition } from "./widgets/swarm-log";
import { MissionBrowserDefinition } from "./widgets/mission-browser";
import { MissionControlPanelDefinition } from "./widgets/mission-control-panel";
import { MissionEditorDefinition } from "./widgets/mission-editor";
import { MissionMapDefinition } from "./widgets/mission-map";
import { MissionControlPage } from "./page/mission-control-page";

export { C2_DATASOURCE_ID } from "./datasource/datasource-select";

/**
 * The mission-control surface, registered on `PAGES_LIST`.
 *
 * A page rather than a registered layout engine plus a new dashboard type: it
 * needs no core re-export, no create-picker change and no widening of the
 * workspace route's `dashboardType` validation, and the arrangement is handed to
 * the shell as loaded state instead of seeded after load. See
 * `page/mission-control-page.tsx` for the full argument.
 */
export const c2PageDefinition: PageDefinition = {
	slug: "c2-mission-control",
	title: "Mission Control",
	component: MissionControlPage,
	navItem: {
		position: "left" as const,
		priority: 8,
		group: "C2",
		description:
			"Plan, submit and drive C2 missions, with the fleet and the live mission feedback beside the map.",
	},
};

/**
 * Command-widget ids gated on a configured C2 datasource.
 *
 * The mission map is included here because its draw/feature CRUD core needs
 * the C2 datasource (`c2.features.*`); its live telemetry overlay degrades
 * independently via the topic health, so gating the whole widget on the C2
 * datasource does not over-restrict the overlay.
 */
const C2_COMMAND_WIDGET_IDS = [
	"c2-mission-browser-widget",
	"c2-mission-control-panel-widget",
	"c2-mission-editor-widget",
	"c2-mission-map-widget",
] as const;

/**
 * C2 Control datasource definition.
 *
 * Config holds the two C2 REST base URLs. Telemetry rides ORMI's own
 * rosbridge/foxglove datasource; this datasource only exposes commands +
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
			// Optional against the old (unauthenticated) backend, required by
			// the new one. Blank sends nothing, so the old backend is
			// unaffected. Sent on every :5001 request and every :5000 mutation
			// (never on a :5000 GET) — see `datasource/remote-calls.ts` →
			// `requiresC2Auth`.
			missionControlToken: {
				type: "string",
				title: "Mission Control auth token (optional)",
				description:
					"Bearer token (the backend's C2_API_TOKEN). Sent on every Mission Control (:5001) request and on every Mongo REST (:5000) write; never on a :5000 read. Leave blank against an unauthenticated C2.",
			},
		},
	},

	data: {
		id: "",
		title: "",
		enable: true,
		missionControlUrl: "http://localhost:5001",
		dbUrl: "http://localhost:5000",
		missionControlToken: "",
	},

	Provider: (props) => C2SourceProvider(props),
} as DatasourceDefinition<C2ControlSettings>;

/**
 * Register the C2 widgets.
 *
 * **Display** widgets on rosbridge/foxglove topics: fleet status, mission
 * feedback, swarm log. These do NOT gate on the C2 datasource, because the C2
 * datasource publishes no topics.
 *
 * **Command** widgets on the C2 remote calls: mission browser and lifecycle
 * control panel. These DO require a C2 datasource, so they are
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
	// Command widgets (gated by widgetFilters below).
	widgets.push(MissionBrowserDefinition());
	widgets.push(MissionControlPanelDefinition());
	// Authoring widgets (also gated): mission editor and mission map.
	widgets.push(MissionEditorDefinition());
	widgets.push(MissionMapDefinition());
	return widgets;
};

/**
 * `WIDGET_LIST_WITH_DATASOURCE` filter: hide the C2 **command** widgets (mission
 * browser, control panel, editor, map) unless an enabled C2 datasource is
 * configured, since they need its remote calls. The display widgets (fleet
 * status, mission feedback, swarm log) are never filtered here
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
