"use client";

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import DashboardInterface from '../dashboard-interface';
import { Widget, WidgetDefinition } from '../../widgets/widget-interface';
import { PluginsHooks } from '../../plugins/plugins-types';
import { usePluginsManager } from '../../plugins/components/plugins-provider';
import PluginsManager from '../../plugins/plugins-manager';
import { Layout, Layouts } from 'react-grid-layout';
import { toast } from '@/hooks/use-toast';

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
    forceReload: false
});



// Create a provider component
const DashboardProvider: React.FC<{ children: ReactNode, dashboardDefinition: DashboardInterface }> = ({ children, dashboardDefinition }) => {

    // const dashboardManager = new DashboardManager(dashboardDefinition);

    const pluginsManager = usePluginsManager() as PluginsManager;

    const availableWidgets: WidgetDefinition[] = pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, []);

    const [compactType, setCompactType] = React.useState<"vertical" | "horizontal" | null>(null);
    const [layouts, setLayouts] = React.useState<Layouts>(dashboardDefinition.layouts);
    const [widgets, setWidgets] = React.useState<Map<string, Widget>>(dashboardDefinition.widgets);
    const [locked, setLocked] = React.useState<boolean>(false);
    const [hasChanged, setHasChanged] = React.useState<boolean>(false);
    const [forceReload, setForceReload] = React.useState<boolean>(false);

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
            locked: locked
        }

        setHasChanged(false);
        // save the dashboard to local storage
        localStorage.setItem("dashboard", JSON.stringify(newDashboard));

        toast({
            title: "Dashboard saved",
            description: "The dashboard has been saved",
        })
    }

    const loadFromLocalStorage = () => {
        // load the dashboard from the local storage
        const dashboardDefinition = JSON.parse(localStorage.getItem("dashboard") || JSON.stringify({
            layouts: {
                lg: [],
                md: [],
                sm: [],
                xs: [],
                xxs: []
            },
            widgets: new Map<string, Widget>()
        }) as string) as DashboardInterface;

        // check that the types are correct
        // if widgets is not a map, convert it to a map
        if (!(dashboardDefinition.widgets instanceof Map)) {
            dashboardDefinition.widgets = new Map(Object.entries(dashboardDefinition.widgets));
        }


        setLocked(dashboardDefinition.locked);
        setLayouts(dashboardDefinition.layouts);
        setWidgets(dashboardDefinition.widgets);
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
        const optimalCols = { lg: 3, md: 2, sm: 2, xs: 1, xxs: 1 };
        const optimalRows = { lg: 30, md: 30, sm: 30, xs: 30, xxs: 30 };

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

        console.log(breakpoint);

        const new_layouts = layouts;

        // place the boxes in the optimal position
        new_layouts[breakpoint] = new_layouts[breakpoint].map((box, index) => {

            const cols_size = colsperBreakpoints[breakpoint] / optimalCols[breakpoint];

            return {
                ...box,
                x: (index * cols_size) % colsperBreakpoints[breakpoint],
                y: Math.floor(index / optimalCols[breakpoint]),
                w: cols_size,
                h: optimalRows[breakpoint]
            }
        });

        layoutsChanged(new_layouts);
        setForceReload(!forceReload);

        toast({
            title: "Layout exploded",
            description: "The layout has been exploded",
        })
    };

    useEffect(() => {
        loadFromLocalStorage();
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
                forceReload
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