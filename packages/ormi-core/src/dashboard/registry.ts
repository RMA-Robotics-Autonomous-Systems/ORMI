import { Dashboard as ReactGridLayoutDashboard } from "./components/react-grid-layout/dashboard";
import { PanelDashboard } from "./components/rc-dock/panel-dashboard";
import { FlexLayoutDashboard } from "./components/flex-layout/flex-layout-dashboard";
import { Layers, LayoutGrid, PanelTop } from "lucide-react";

export const dashboardRegistry = {
	GRID: ReactGridLayoutDashboard,
	PANEL: PanelDashboard,
	FLEX: FlexLayoutDashboard,
};

export const DASHBOARD_TYPES = [
	{
		id: "GRID",
		name: "Grid Layout",
		description: "Traditional grid-based dashboard with resizable widgets",
		icon: LayoutGrid,
		badge: "Classic",
		color: "default" as const,
	},
	//   {
	//     id: "PANEL",
	//     name: "Panel Layout",
	//     description: "Modern tabbed interface with dockable panels",
	//     icon: PanelTop,
	//     badge: "Popular",
	//     color: "secondary" as const,
	//   },
	{
		id: "FLEX",
		name: "Flex Layout",
		description: "Advanced flexible layout with popout windows support",
		icon: Layers,
		badge: "New",
		color: "destructive" as const,
	},
] as const;
