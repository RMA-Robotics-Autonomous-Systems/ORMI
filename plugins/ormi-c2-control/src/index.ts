import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { datasourceDefinition, widgetsExport, widgetFilters } from "./export";

// Public surface for widgets / external use (Phase 2+).
export { C2SourceProvider } from "./datasource/c2-source";
export {
	buildC2RemoteCalls,
	findC2CallSpec,
	C2Call,
	C2_CALL_SPECS,
} from "./datasource/remote-calls";
export { executeC2Call } from "./datasource/rest";
export { parseMissionFeedback } from "./types/mission-feedback";
export type {
	MissionFeedback,
	FeedbackTask,
	FeedbackWaypoint,
} from "./types/mission-feedback";
export { missionStatusLabel } from "./types/status-labels";
export * from "./types/c2-types";

// S3 — C2 selection store (D8).
export {
	setSelectedMission,
	getSelectedMission,
	useSelectedMission,
} from "./state/selection-store";

// Read-only widget definitions + helpers (Phase 2).
export { FleetStatusDefinition } from "./widgets/fleet-status";
export { MissionFeedbackDefinition } from "./widgets/mission-feedback";
export { SwarmLogDefinition } from "./widgets/swarm-log";

// Command widget definitions + helpers (Phase 3).
export { MissionBrowserDefinition } from "./widgets/mission-browser";
export { MissionControlPanelDefinition } from "./widgets/mission-control-panel";
export {
	normalizeMissions,
	newMissionStub,
	duplicateMission,
	generateMissionId,
} from "./widgets/mission-list";
export type { MissionRow } from "./widgets/mission-list";
export { allowedActions } from "./widgets/control-actions";
export type { ControlAction, AllowedActions } from "./widgets/control-actions";
export {
	extractAgentTelemetry,
	extractAgentPosition,
	mergeFleet,
} from "./widgets/fleet-helpers";
export type {
	AgentTelemetry,
	AgentPosition,
	FleetRow,
} from "./widgets/fleet-helpers";
export { collectSwarmLog } from "./widgets/swarm-log";
export type { SwarmLogEntry } from "./widgets/swarm-log";

/**
 * ORMI C2 Control plugin — integrates the RMA Multi-Agent Framework.
 *
 * Phase 1: a C2 datasource that exposes mission commands and CRUD as remote
 * calls over REST. Widgets and the "Mission Control" dashboard type come next.
 */
class C2ControlPlugin extends Plugin {
	constructor() {
		super();

		this.name = "ORMI C2 Control";
		this.description =
			"RMA Multi-Agent Framework (C2) integration: mission commands + CRUD as remote calls";
		this.version = "1.0.0";
		this.author = "Florian Lebecque";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "c2-control-datasource",
			priority: 12,
			filter: (datasources: unknown[]) => {
				datasources.push(datasourceDefinition);
				return datasources;
			},
		});

		// Display widgets (F7/F10/F11) + command widgets (F4/F8) are all
		// registered on WIDGETS_LIST. The display widgets read rosbridge/foxglove
		// topics (not the C2 datasource, which has no topics) so they are never
		// gated; the command widgets call :5000/:5001 and are gated below.
		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "c2-control-widgets",
			priority: 12,
			filter: widgetsExport,
		});

		// Phase 3 — command-widget gating (§4.1): hide the mission browser (F4)
		// and lifecycle control panel (F8) unless an enabled C2 datasource exists,
		// since they require the C2 remote-call transport. Display widgets are NOT
		// gated here.
		this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
			id: "c2-control-widget-gating",
			priority: 12,
			filter: widgetFilters,
		});
	}
}

export default C2ControlPlugin;
