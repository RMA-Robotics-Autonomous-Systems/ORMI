"use client"

import React, { createContext, useContext, ReactNode, useEffect, useReducer, JSX } from 'react';
import { DashboardInterface } from '../dashboard-interface';
import { Widget, WidgetDefinition } from '../../widgets/widget-interface';
import { PluginsManager, usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { Layout, Layouts } from 'react-grid-layout';
import { widgetNotFound } from '../../widgets/components/widget-not-found';
import { Datasource, DatasourceDefinition, DatasourceProviderSettings, DatasourceTopic, DatasourceTopicFilter } from '../../datasources/datasource-interface';
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from 'sonner';

// Simple hash function for dashboard state
const hashDashboardState = (layouts: Layouts, widgets: Map<string, Widget>, datasources: Map<string, Datasource>, locked: boolean): string => {
    const state = {
        layouts: Object.fromEntries(Object.entries(layouts)),
        widgets: Object.fromEntries(widgets),
        datasources: Object.fromEntries(datasources),
        locked
    };

    const stateString = JSON.stringify(state, (key, value) => {
        // Ensure consistent ordering for objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const ordered: any = {};
            Object.keys(value).sort().forEach(k => {
                ordered[k] = value[k];
            });
            return ordered;
        }
        return value;
    });

    // Simple string hash function
    let hash = 0;
    for (let i = 0; i < stateString.length; i++) {
        const char = stateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString();
};

interface DashboardContextInterface {
    layouts: Layouts;
    widgets: Map<string, Widget>;

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
    addDatasource: (datasource_id: string, settings?: DatasourceProviderSettings) => void;
    removeDatasource: (datasource_id: string) => void;

    dispatch: React.Dispatch<any>;
}

// Create the context with a default value
const DashboardContext = createContext<DashboardContextInterface>({
    layouts: {
        lg: [],
        md: [],
        sm: [],
        xs: [],
        xxs: []
    },
    widgets: new Map<string, Widget>(),

    getComponents: () => <></>,
    getBox: () => { throw new Error("Method not implemented."); },
    getDefinition: () => { throw new Error("Method not implemented."); },
    addWidget: () => { },
    removeWidget: () => { },
    updateWidget: () => { },

    lockUnLockDashboard: () => { },
    locked: false,

    layoutsChanged: () => { },
    savesDashboard: () => { },
    hasChanged: false,
    forceReload: false,

    datasources: new Map<string, Datasource>(),
    updateDatasource: () => { },
    addDatasource: () => { },
    removeDatasource: () => { },
    dispatch: () => { throw new Error("Dispatch not implemented."); }
});

interface LayoutMatrix {
    cols: number,
    rows: number
}

interface DashboardProviderProps {
    children: ReactNode;
    dashboardType: string;
    dashboardDefinition: DashboardInterface;
    OnLoad: (
        setState: React.Dispatch<any>
    ) => Promise<boolean>;
    OnSave: (newDashboard: any) => Promise<boolean>;
}


// Create a provider component
const initialStateFromDefinition = (dashboardDefinition: DashboardInterface) => ({
    compactType: null,
    layouts: dashboardDefinition.layouts,
    widgets: dashboardDefinition.widgets,
    locked: dashboardDefinition.locked,
    datasources: dashboardDefinition.datasources,
    forceReload: false,
});

function dashboardReducer(state: any, action: any) {
    switch (action.type) {
        case "SET_LAYOUTS":
            return { ...state, layouts: action.payload };
        case "SET_WIDGETS":
            return { ...state, widgets: action.payload };
        case "SET_LOCKED":
            return { ...state, locked: action.payload };
        case "SET_DATASOURCES":
            return { ...state, datasources: action.payload };
        case "SET_FORCERELOAD":
            return { ...state, forceReload: action.payload };
        // Add more actions for widget/layout/datasource manipulation as needed
        default:
            return state;
    }
}

const DashboardProvider = (props: DashboardProviderProps) => {
    const { children, dashboardType, dashboardDefinition, OnLoad, OnSave } = props;
    const pluginsManager = usePluginsManager() as PluginsManager;
    const availableWidgets: WidgetDefinition[] = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);

    const [state, dispatch] = useReducer(dashboardReducer, initialStateFromDefinition(dashboardDefinition));
    const [hasChanged, setHasChanged] = React.useState<boolean>(false);
    const [initialized, setInitialized] = React.useState(false);
    const [initialHash, setInitialHash] = React.useState<string>("");

    // Load initial state from persistence
    useEffect(() => {
        OnLoad((loadedState: any) => {
            dispatch({ type: "SET_LAYOUTS", payload: loadedState.layouts });
            dispatch({ type: "SET_WIDGETS", payload: loadedState.widgets });
            dispatch({ type: "SET_LOCKED", payload: loadedState.locked });
            dispatch({ type: "SET_DATASOURCES", payload: loadedState.datasources });
        }).then(() => setInitialized(true));
    }, [OnLoad]);

    // Hash and change detection
    useEffect(() => {
        if (initialized) {
            const currentHash = hashDashboardState(state.layouts, state.widgets, state.datasources, state.locked);
            if (!initialHash) setInitialHash(currentHash);
            setHasChanged(currentHash !== initialHash);
            console.log("Dashboard state hash:", currentHash, "Initial hash:", initialHash, "Has changed:", currentHash !== initialHash);
        }
    }, [state, initialized, initialHash]);


    // Helper: getComponents
    const getComponents = (boxId: string) => {
        const widget = state.widgets.get(boxId);
        if (widget) {
            const widgetDefinition = availableWidgets.find((widget_def) => widget_def.id === widget.widget_id);
            if (widgetDefinition) {
                return widgetDefinition.Component(widget.settings);
            }
        }
        return widgetNotFound.Component(["Widget not found", boxId]);
    };

    // Helper: getDefinition
    const getDefinition = (widget_id: string) => {
        const widget = availableWidgets.find((widget_def) => widget_def.id === widget_id);
        if (widget) {
            return widget;
        }
        return widgetNotFound;
    };


    // Generic widget CRUD helpers
    const addWidget = (widget: WidgetDefinition, settings: any) => {
        const box_id = `component_${state.widgets.size}_${Date.now()}`;
        let widget_title = widget.name;
        if (widget.titleProp) {
            widget_title = settings[widget.titleProp];
        }
        const newWidget: Widget = {
            box_id,
            widget_id: widget.id,
            title: widget_title,
            settings,
        };
        const newWidgets = new Map(state.widgets);
        newWidgets.set(box_id, newWidget);
        dispatch({ type: "SET_WIDGETS", payload: newWidgets });
        // Layout manipulation is type-specific, handled in dashboard type component
    };

    const removeWidget = (box_id: string) => {
        const newWidgets = new Map(state.widgets);
        newWidgets.delete(box_id);
        dispatch({ type: "SET_WIDGETS", payload: newWidgets });
        // Layout manipulation is type-specific, handled in dashboard type component
    };

    const updateWidget = (box_id: string, settings: any) => {
        const newWidgets = new Map(state.widgets);
        const widget = newWidgets.get(box_id) as Widget | undefined;
        if (widget) {
            widget.settings = settings;
            const widgetDef = getDefinition(widget.widget_id);
            if (widgetDef.titleProp) {
                widget.title = settings[widgetDef.titleProp];
            }
            newWidgets.set(box_id, widget);
            dispatch({ type: "SET_WIDGETS", payload: newWidgets });
        }
    };

    // Generic datasource CRUD helpers
    const addDatasource = (datasource_id: string, settings?: DatasourceProviderSettings) => {
        const newDatasources = new Map(state.datasources);
        const id = `datasource_${newDatasources.size}_${Date.now()}`;
        const datasource = {
            datasource_id,
            title: settings?.title || "New Datasource",
            settings: settings ? { ...settings, id } : { id, title: "New Datasource" },
        } as Datasource;
        newDatasources.set(id, datasource);
        dispatch({ type: "SET_DATASOURCES", payload: newDatasources });
    };

    const removeDatasource = (source_id: string) => {
        const newDatasources = new Map(state.datasources);
        newDatasources.delete(source_id);
        dispatch({ type: "SET_DATASOURCES", payload: newDatasources });
    };

    const updateDatasource = (datasource_id: string, settings: DatasourceProviderSettings) => {
        const newDatasources = new Map(state.datasources);
        const datasource = newDatasources.get(settings.id) as Datasource | undefined;
        if (datasource) {
            datasource.settings = settings;
            datasource.title = settings.title;
            newDatasources.set(settings.id, datasource);
            dispatch({ type: "SET_DATASOURCES", payload: newDatasources });
        }
    };

    // Save dashboard state
    const savesDashboard = () => {
        if (!hasChanged) {
            toast("No changes to save");
            return;
        }
        const newDashboard = {
            layouts: state.layouts,
            widgets: state.widgets,
            datasources: state.datasources,
            locked: state.locked,
        };
        OnSave(newDashboard);
        toast("Dashboard saved successfully");

        const currentHash = hashDashboardState(state.layouts, state.widgets, state.datasources, state.locked);
        setInitialHash(currentHash);
        setHasChanged(false);
    };

    // Lock/unlock dashboard
    const lockUnLockDashboard = () => {
        dispatch({ type: "SET_LOCKED", payload: !state.locked });
    };

    const contextValue = {
        ...state,
        dispatch,
        dashboardType,
        hasChanged,
        getComponents,
        getDefinition,
        lockUnLockDashboard,
        addWidget,
        removeWidget,
        updateWidget,
        addDatasource,
        removeDatasource,
        updateDatasource,
        savesDashboard,
        // Layout manipulation is type-specific, handled in dashboard type component
    };

    return (
        <DashboardContext.Provider value={contextValue}>
            {initialized ? children : <Spinner />}
        </DashboardContext.Provider>
    );
};

// Create a custom hook to use the context
const useDashboardManager = () => {
    const context = useContext(DashboardContext);
    if (context === undefined) {
        throw new Error('useDashboardManager must be used within a DashboardProvider');
    }
    return context;
};

export { DashboardProvider, useDashboardManager };