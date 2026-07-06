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

// State
export { useDashboardActions } from "./state/use-dashboard-actions";
export type { DashboardActions } from "./state/use-dashboard-actions";

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

/** Static list of available dashboard layout types for the workspace creation UI. */
export const DASHBOARD_TYPES = [
	{
		id: "GRID",
		name: "Grid Layout",
		description: "Traditional grid-based dashboard with resizable widgets",
		icon: LayoutGrid,
		badge: "Classic",
		color: "default" as const,
	},
	{
		id: "FLEX",
		name: "Flex Layout",
		description: "Advanced flexible layout with popout windows support",
		icon: Layers,
		badge: "New",
		color: "destructive" as const,
	},
] as const;
