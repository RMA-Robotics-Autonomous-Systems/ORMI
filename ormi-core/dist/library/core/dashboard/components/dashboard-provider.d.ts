import React, { ReactNode, JSX } from 'react';
import { DashboardInterface } from '../dashboard-interface';
import { Widget, WidgetDefinition } from '../../widgets/widget-interface';
import { Layout, Layouts } from 'react-grid-layout';
import { Datasource, DatasourceProviderSettings } from '../../../../library/core/datasources/datasource-interface';
interface DashboardContextInterface {
    layouts: Layouts;
    widgets: Map<string, Widget>;
    compactType: "vertical" | "horizontal" | null;
    moveToVertical: () => void;
    moveToHorizontal: () => void;
    exploseLayout: () => void;
    getComponents: (boxId: string) => JSX.Element;
    getDefinition: (widget_id: string) => WidgetDefinition;
    getBox: (breakpoint: string, boxId: string) => Layout | undefined;
    addWidget: (widget: WidgetDefinition, settings: any) => void;
    removeWidget: (box_id: string) => void;
    updateWidget: (box_id: string, settings: any) => void;
    lockUnLockDashboard(): void;
    locked: boolean;
    layoutsChanged: (newLayouts: Layouts) => void;
    savesDashboard: () => void;
    hasChanged: boolean;
    forceReload: boolean;
    datasources: Map<string, Datasource>;
    updateDatasource: (datasource_id: string, settings: DatasourceProviderSettings) => void;
    addDatasource: (datasource_id: string) => void;
    removeDatasource: (datasource_id: string) => void;
}
interface DashboardProviderProps {
    children: ReactNode;
    dashboardDefinition: DashboardInterface;
    OnLoad: (setLayouts: React.Dispatch<React.SetStateAction<Layouts>>, setWidgets: React.Dispatch<React.SetStateAction<Map<string, Widget>>>, setLocked: React.Dispatch<React.SetStateAction<boolean>>, setDatasources: React.Dispatch<React.SetStateAction<Map<string, Datasource>>>) => void;
    OnSave: (newDashboard: any) => void;
}
declare const DashboardProvider: (props: DashboardProviderProps) => import("react/jsx-runtime").JSX.Element;
declare const useDashboardManager: () => DashboardContextInterface;
export { DashboardProvider, useDashboardManager };
