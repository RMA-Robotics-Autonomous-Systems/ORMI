import { Dashboard as ReactGridLayoutDashboard } from "./components/react-grid-layout/dashboard";
import { PanelDashboard } from "./components/rc-dock/panel-dashboard";

export const dashboardRegistry = {
  GRID: ReactGridLayoutDashboard,
  PANEL: PanelDashboard,
};
