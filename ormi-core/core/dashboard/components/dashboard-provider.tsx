"use client"

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import DashboardInterface from '../dashboard-interface';
import { Widget, WidgetDefinition } from '../../widgets/widget-interface';
import { PluginsHooks } from '../../plugins/plugins-types';
import { usePluginsManager } from '../../plugins/components/plugins-provider';
import PluginsManager from '../../plugins/plugins-manager';
import { Layout, Layouts } from 'react-grid-layout';
import { toast } from '@/hooks/use-toast';
import { Datasource, DatasourceDefinition, DatasourceProviderSettings, DatasourceTopic, DatasourceTopicFilter } from '@/core/datasources/datasource-interface';

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

    compactType: null,
    moveToVertical: () => { },
    moveToHorizontal: () => { },
    exploseLayout: () => { },

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
    removeDatasource: () => { }
});

interface LayoutMatrix {
    cols: number,
    rows: number
}

interface DashboardProviderProps {
    children: ReactNode;
    dashboardDefinition: DashboardInterface;

    OnLoad: (
        setLayouts: React.Dispatch<React.SetStateAction<Layouts>>,
        setWidgets: React.Dispatch<React.SetStateAction<Map<string, Widget>>>,
        setLocked: React.Dispatch<React.SetStateAction<boolean>>,
        setDatasources: React.Dispatch<React.SetStateAction<Map<string, Datasource>>>
    ) => void;
    OnSave: (newDashboard: any) => void;
}


// Create a provider component
const DashboardProvider: React.FC<DashboardProviderProps> = ({ children, dashboardDefinition, OnLoad, OnSave }) => {

    // const dashboardManager = new DashboardManager(dashboardDefinition);

    const pluginsManager = usePluginsManager() as PluginsManager;

    const availableWidgets: WidgetDefinition[] = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);

    const [compactType, setCompactType] = React.useState<"vertical" | "horizontal" | null>(null);
    const [layouts, setLayouts] = React.useState<Layouts>(dashboardDefinition.layouts);
    const [widgets, setWidgets] = React.useState<Map<string, Widget>>(dashboardDefinition.widgets);
    const [locked, setLocked] = React.useState<boolean>(false);
    const [hasChanged, setHasChanged] = React.useState<boolean>(false);
    const [forceReload, setForceReload] = React.useState<boolean>(false);

    const [datasources, setDatasources] = React.useState<Map<string, Datasource>>(dashboardDefinition.datasources);

    const getComponents = (boxId: string) => {

        const widget = widgets.get(boxId);
        if (widget) {
            const widgetDefinition = availableWidgets.find((widget_def) => widget_def.id === widget.widget_id);
            if (widgetDefinition) {
                return widgetDefinition.Component(widget.settings);
            }
        }

        throw new Error(`Widget ${boxId} not found`);
    }

    const getBox = (breakpoint: string, boxId: string) => {
        if (!layouts[breakpoint]) {
            throw new Error(`Breakpoint ${breakpoint} not found`);
        }

        return layouts[breakpoint].find((box) => box.i === boxId);
    }

    const getDefinition = (widget_id: string) => {

        const widget = availableWidgets.find((widget_def) => widget_def.id === widget_id);
        if (widget) {
            return widget;
        }

        throw new Error(`Widget ${widget_id} not found`);
    }

    const addWidget = (widget: WidgetDefinition, settings: any) => {

        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to add widgets",
                variant: "destructive"
            });
            return;
        }

        const box_id = `component_${widgets.size}_${new Date().getTime()}`;

        let widget_title = widget.name;
        if (widget.titleProp) {
            widget_title = settings[widget.titleProp];
        }

        const new_widgets: Widget = {
            box_id: box_id,
            widget_id: widget.id,
            title: widget_title,
            settings: settings
        }

        setWidgets(prev => new Map(prev.set(box_id, new_widgets)));

        const box: Layout = {
            i: box_id,
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            static: false,
            isBounded: true,
        };

        setHasChanged(true);
        setLayouts({
            lg: [...layouts.lg, box],
            md: [...layouts.md, box],
            sm: [...layouts.sm, box],
            xs: [...layouts.xs, box],
            xxs: [...layouts.xxs, box]
        });
    }

    const removeWidget = (box_id: string) => {

        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to remove widgets",
                variant: "destructive"
            });
            return;
        }

        const new_widgets = new Map(widgets);
        new_widgets.delete(box_id);

        // remove the widget from the layout
        const new_layouts = layouts;
        for (const key in new_layouts) {
            new_layouts[key] = new_layouts[key].filter((box) => box.i !== box_id);
        }

        setHasChanged(true);

        setWidgets(new_widgets);
        setLayouts(new_layouts);
    }

    const updateWidget = (box_id: string, settings: any) => {

        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to update widgets",
                variant: "destructive"
            });
            return;
        }

        const widget = widgets.get(box_id);
        if (widget) {
            widget.settings = settings;

            const widgetdef = getDefinition(widget.widget_id);
            if (widgetdef.titleProp) {
                widget.title = settings[widgetdef.titleProp];
            }

            setHasChanged(true);
            setWidgets(new Map(widgets.set(box_id, widget)));
        }
    }

    const lockUnLockDashboard = () => {
        setLocked(!locked);
        setHasChanged(true);
    }

    const layoutsChanged = (newLayouts: Layouts) => {

        // check if all breakpoints are present
        for (const key in layouts) {
            if (!newLayouts[key]) {
                newLayouts[key] = layouts[key];
            }
        }

        setLayouts({
            lg: [...newLayouts.lg],
            md: [...newLayouts.md],
            sm: [...newLayouts.sm],
            xs: [...newLayouts.xs],
            xxs: [...newLayouts.xxs]
        });
        setHasChanged(true);
    }

    const savesDashboard = () => {

        if (!hasChanged) {
            toast({
                title: "Dashboard not saved",
                description: "No changes have been made to the dashboard",
                // variant: "warning"
            })
            return;
        }

        // create a new dashboard definition as a plain object
        const newDashboard = {
            layouts: Object.fromEntries(Object.entries(layouts)),
            widgets: Object.fromEntries(widgets),
            datasources: Object.fromEntries(datasources),
            locked: locked
        }

        setHasChanged(false);

        OnSave(newDashboard);

        toast({
            title: "Dashboard saved",
            description: "The dashboard has been saved",
        })
    }

    const moveToVertical = () => {

        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to move widgets",
                variant: "destructive"
            });
            return;
        }

        setCompactType("vertical");

        setTimeout(() => {
            setCompactType(null);
        }, 500);
    }

    const moveToHorizontal = () => {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to move widgets",
                variant: "destructive"
            });
            return;
        }

        setCompactType("horizontal");

        setTimeout(() => {
            setCompactType(null);
        }, 500);
    }

    const exploseLayout = () => {

        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to explode the layout",
                variant: "destructive"
            });
            return;
        }

        const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
        const colsperBreakpoints = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

        const availables_matrixes: Map<string, LayoutMatrix> = new Map([
            ["lg", { cols: 3, rows: 3 }],
            ["md", { cols: 2, rows: 3 }],
            ["sm", { cols: 2, rows: 2 }],
            ["xs", { cols: 1, rows: 2 }],
            ["xxs", { cols: 1, rows: 1 }],
        ]);

        function getOptimalMatrix(breakpoint: string, number_of_elements: number) {
            /*
                Each matrix has a ideal number of elements being cols * rows,
                The matrix is valid if the number of elements is equal or more than the ideal number of elements

                We try to find the smallest matrix that is valid
                We start with the biggest matrix available by the breakpoint
            */
            const breakpoints_array = ["lg", "md", "sm", "xs", "xxs"];
            const index_of_breakpoint = breakpoints_array.indexOf(breakpoint);
            const starting_index = breakpoints_array.indexOf("xxs");

            const distance_matrixes_map = new Map<string, number>();

            for (let i = starting_index; i >= index_of_breakpoint; i--) {
                const matrix = availables_matrixes.get(breakpoints_array[i]) as LayoutMatrix;
                const matrix_size = matrix.cols * matrix.rows;

                distance_matrixes_map.set(breakpoints_array[i], Math.abs(matrix_size - number_of_elements));
            }

            // find the matrix with the smallest difference, if two matrixes have the same difference, we choose the one with the biggest number of elements
            // sort the map by the difference and the number of elements
            const sorted_distance_matrixes = Array.from(distance_matrixes_map).sort((a, b) => {
                if (a[1] === b[1]) {
                    return availables_matrixes.get(a[0])!.cols * availables_matrixes.get(a[0])!.rows - availables_matrixes.get(b[0])!.cols * availables_matrixes.get(b[0])!.rows;
                }
                return b[1] - a[1];
            });

            //reverse the array to get the matrix with the smallest difference
            return availables_matrixes.get(sorted_distance_matrixes.reverse()[0][0]);
        }

        // compute the current breakpoint
        const width = window.innerWidth;
        let breakpoint: 'lg' | 'md' | 'sm' | 'xs' | 'xxs' = 'lg';
        if (width < breakpoints.lg) {
            breakpoint = 'md';
        }
        if (width < breakpoints.md) {
            breakpoint = 'sm';
        }
        if (width < breakpoints.sm) {
            breakpoint = 'xs';
        }
        if (width < breakpoints.xs) {
            breakpoint = 'xxs';
        }

        const new_layouts = layouts;

        const row_size_px = 30;
        const max_number_of_rows = ((window.innerHeight * 0.9) / row_size_px)
        const optimalMatrix = getOptimalMatrix(breakpoint, widgets.size);

        // sort by distance from (0,0) (top left)
        const sorted_boxes = new_layouts[breakpoint].sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));

        // place the boxes in the optimal position
        new_layouts[breakpoint] = sorted_boxes.map((box, index) => {
            const cols = optimalMatrix!.cols;
            const total_cols = colsperBreakpoints[breakpoint];

            // Calculate position based on grid index
            const row = Math.floor(index / cols);
            const col = index % cols;

            // Calculate width and height
            const col_width = Math.floor(total_cols / cols);
            const row_height = Math.floor(max_number_of_rows / optimalMatrix!.rows);

            // Last element special handling
            if (index === widgets.size - 1) {
                const remaining_width = total_cols - (col * col_width);
                return {
                    ...box,
                    x: col * col_width,
                    y: row * row_height,
                    w: remaining_width,
                    h: row_height
                };
            }

            return {
                ...box,
                x: col * col_width,
                y: row * row_height,
                w: col_width,
                h: row_height
            };
        });

        layoutsChanged(new_layouts);
        setForceReload(!forceReload);

        toast({
            title: "Layout exploded",
            description: "The layout has been exploded",
        })
    };

    const updateDatasource = (datasource_id: string, settings: DatasourceProviderSettings) => {

        const newDatasources = new Map(datasources);
        const datasource = newDatasources.get(settings.id);
        console.log(settings.id, datasource, settings);
        if (datasource) {
            datasource.settings = settings;
            datasource.title = settings.title;
            newDatasources.set(settings.id, datasource);
            setDatasources(newDatasources);
            setHasChanged(true);
        }

    }

    const addDatasource = (datasource_id: string) => {
        const newDatasources = new Map(datasources);

        const availableDatasources = pluginsManager.applyFilter<DatasourceDefinition[]>(PluginsHooks.DATASOURCES_LIST, []);

        const datasourceDef = availableDatasources.find((datasource) => datasource.id === datasource_id);
        if (!datasourceDef) {
            throw new Error(`Datasource ${datasource_id} not found`);
        }

        const id = `datasource_${newDatasources.size}_${new Date().getTime()}`;

        const datasource = {
            datasource_id: datasource_id,
            title: "New Datasource",
            settings: {
                ...datasourceDef.data
            }
        } as Datasource;

        datasource.settings.id = id;
        datasource.settings.title = "New Datasource";

        newDatasources.set(id, datasource);

        setDatasources(newDatasources);
        setHasChanged(true);
    }

    const removeDatasource = (source_id: string) => {
        const newDatasources = new Map(datasources);
        console.log(source_id);
        newDatasources.delete(source_id);
        setDatasources(newDatasources);
        setHasChanged(true);
    }


    useEffect(() => {
        OnLoad(setLayouts, setWidgets, setLocked, setDatasources);

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: "dashboard-available-topics",
            priority: Infinity,
            filter: async (topics: DatasourceTopic[], filter?: DatasourceTopicFilter) => {
                // if the filter object is not defined, we return all the topics
                if (!filter) {
                    return topics;
                }

                console.log(filter);

                // filter the topics based on the filter object
                return topics.filter((topic) => filter.filter(topic));
            }

        })

        return () => {
            pluginsManager.removeFilter("dashboard-available-topics");
        }

    }, []);

    return (
        <DashboardContext.Provider value={
            {
                compactType,
                moveToVertical,
                moveToHorizontal,
                exploseLayout,
                layouts,
                widgets,
                getComponents,
                getBox,
                getDefinition,
                addWidget,
                removeWidget,
                updateWidget,
                lockUnLockDashboard,
                locked,
                layoutsChanged,
                savesDashboard,
                hasChanged,
                forceReload,
                datasources,
                updateDatasource,
                addDatasource,
                removeDatasource
            }
        }>
            {children}
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