export type * from "./dashboard-interface";

// Shell & Engine
export { DashboardShell } from "./shell/dashboard-shell";
export type {
	DashboardShellProps,
	DashboardShellContextValue,
	DashboardRegistryContextValue,
	WidgetGroup,
} from "./shell/dashboard-shell";
export {
	useDashboardShell,
	useDashboardRegistry,
} from "./shell/dashboard-shell";
export { DashboardEngine } from "./shell/dashboard-engine";
export { DashboardEmptyState } from "./components/dashboard-empty-state";
export type { DashboardEmptyStateProps } from "./components/dashboard-empty-state";

// Launcher — the floating Topics / Widgets / Templates dialog
export { DashboardLauncher } from "./components/launcher/dashboard-launcher";
export {
	LAUNCHER_TABS,
	DEFAULT_LAUNCHER_TAB,
	LAUNCHER_TAB_STORAGE_KEY,
	isLauncherTab,
	readStoredLauncherTab,
	storeLauncherTab,
} from "./components/launcher/launcher-tabs";
export type { LauncherTab } from "./components/launcher/launcher-tabs";
export {
	isTopicReachable,
	countTopicReachable,
} from "../widgets/topic-reachability";

// Topic-first routing surface
export { TopicRouteButton } from "./components/topic-route-button";
export type { TopicRouteButtonProps } from "./components/topic-route-button";

// State
export { useDashboardActions } from "./state/use-dashboard-actions";
export type { DashboardActions } from "./state/use-dashboard-actions";
export { useTopicRouter } from "./state/use-topic-router";
export type { TopicRouting } from "./state/use-topic-router";
export {
	useAvailableTopics,
	AVAILABLE_TOPICS_POLL_MS,
} from "./state/use-available-topics";

// Layout engine contract
export type { LayoutEngineDefinition } from "./layout/layout-engine";
export { WidgetHost } from "./layout/widget-host";
export type { WidgetHostProps } from "./layout/widget-host";

// Atoms (for advanced consumers)
export {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	hasChangedAtom,
	datasourcesAtom,
	widgetAtomFamily,
} from "./atoms";

// UI metadata for workspace creation (layout picker)
import { LayoutGrid, Layers } from "lucide-react";
import { DASHBOARD_TYPE_IDS, DEFAULT_DASHBOARD_TYPE } from "./types";

export {
	DASHBOARD_TYPE_IDS,
	DEFAULT_DASHBOARD_TYPE,
	resolveDashboardType,
} from "./types";
export type { DashboardTypeId } from "./types";

/**
 * Static list of available dashboard layout types for the workspace creation
 * UI, in picker order — the first entry is the default engine.
 */
export const DASHBOARD_TYPES = [
	{
		id: "FLEX",
		name: "Flex Layout",
		description: "Advanced flexible layout with popout windows support",
		icon: Layers,
		badge: "Default",
		color: "default" as const,
	},
	{
		id: "GRID",
		name: "Grid Layout",
		description: "Traditional grid-based dashboard with resizable widgets",
		icon: LayoutGrid,
		badge: "Classic",
		color: "secondary" as const,
	},
] as const satisfies readonly {
	id: (typeof DASHBOARD_TYPE_IDS)[number];
	name: string;
	description: string;
	icon: unknown;
	badge: string;
	color: string;
}[];

/** One entry of {@link DASHBOARD_TYPES}. */
export type DashboardTypeMeta = (typeof DASHBOARD_TYPES)[number];

/** Display metadata of the default engine. */
const DEFAULT_DASHBOARD_TYPE_META: DashboardTypeMeta =
	DASHBOARD_TYPES.find((type) => type.id === DEFAULT_DASHBOARD_TYPE) ??
	DASHBOARD_TYPES[0];

/**
 * Resolve display metadata for a persisted dashboard type.
 *
 * Falls back to the default engine's entry so an unknown or missing id still
 * renders a name and an icon instead of crashing the workspace list.
 *
 * @param id - Persisted dashboard type id.
 * @returns The matching metadata entry, or the default engine's entry.
 */
export function getDashboardTypeMeta(id?: string | null): DashboardTypeMeta {
	return (
		DASHBOARD_TYPES.find((type) => type.id === id) ??
		DEFAULT_DASHBOARD_TYPE_META
	);
}
