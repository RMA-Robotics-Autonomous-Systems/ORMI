"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import DashboardInterface from './dashboard-interface';
import { Widget, WidgetDefinition } from '../widgets/widget-interface';
import { PluginsHooks } from '../plugins/plugins-types';
import { usePluginsManager } from '../plugins/components/plugins-provider';
import PluginsManager from '../plugins/plugins-manager';
import { Layouts } from 'react-grid-layout';

interface DashboardContextInterface {

    layouts: Layouts;
    widgets: Map<string, Widget>;

    getComponents: (boxId: string) => JSX.Element;
    getDefinition: (widget_id: string) => WidgetDefinition;

    addWidget: (widget: WidgetDefinition, settings: any) => void;
    removeWidget: (box_id: string) => void;
    updateWidget: (box_id: string, settings: any) => void;

    setLayouts: (layouts: Layouts) => void;
    setWidgets: (widgets: Map<string, Widget>) => void;
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
    getComponents: (boxId: string) => <></>,
    getDefinition: (widget_id: string) => { throw new Error("Method not implemented."); },
    addWidget: (widget: WidgetDefinition, settings: any) => { },
    removeWidget: (box_id: string) => { },
    updateWidget: (box_id: string, settings: any) => { },
    setLayouts: (layouts: Layouts) => { },
    setWidgets: (widgets: Map<string, Widget>) => { }
});



// Create a provider component
const DashboardProvider: React.FC<{ children: ReactNode, dashboardDefinition: DashboardInterface }> = ({ children, dashboardDefinition }) => {

    // const dashboardManager = new DashboardManager(dashboardDefinition);

    const pluginsManager = usePluginsManager() as PluginsManager;

    const availableWidgets: WidgetDefinition[] = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);

    const [layouts, setLayouts] = React.useState<Layouts>(dashboardDefinition.layouts);
    const [widgets, setWidgets] = React.useState<Map<string, Widget>>(new Map<string, Widget>());

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

    const getDefinition = (widget_id: string) => {

        const widget = availableWidgets.find((widget_def) => widget_def.id === widget_id);
        if (widget) {
            return widget;
        }

        throw new Error(`Widget ${widget_id} not found`);
    }

    const addWidget = (widget: WidgetDefinition, settings: any) => {
        const component_id = `component_${widgets.values.length}_${new Date().getTime()}`;

        let widget_title = widget.name;
        if (widget.titleProp) {
            widget_title = settings[widget.titleProp];
        }

        const new_widgets: Widget = {
            box_id: component_id,
            widget_id: widget.id,
            title: widget_title,
            settings: settings
        }

        setWidgets(new Map(widgets.set(component_id, new_widgets)));

        const box = {
            i: component_id,
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            static: false,
            isDraggable: true,
            isResizable: true
        };

        setLayouts({
            lg: [...layouts.lg, box],
            md: [...layouts.md, box],
            sm: [...layouts.sm, box],
            xs: [...layouts.xs, box],
            xxs: [...layouts.xxs, box]
        });
    }

    const removeWidget = (box_id: string) => {
        const new_widgets = new Map(widgets);
        new_widgets.delete(box_id);

        // remove the widget from the layout
        const new_layouts = layouts;
        for (const key in new_layouts) {
            new_layouts[key] = new_layouts[key].filter((box) => box.i !== box_id);
        }
        setLayouts(new_layouts);
        setWidgets(new_widgets);
    }

    const updateWidget = (box_id: string, settings: any) => {
        const widget = widgets.get(box_id);
        if (widget) {
            widget.settings = settings;

            const widgetdef = getDefinition(widget.widget_id);
            if (widgetdef.titleProp) {
                widget.title = settings[widgetdef.titleProp];
            }

            setWidgets(new Map(widgets.set(box_id, widget)));
        }
    }

    return (
        <DashboardContext.Provider value={
            {
                layouts,
                widgets,
                getComponents,
                getDefinition,
                addWidget,
                removeWidget,
                updateWidget,
                setLayouts,
                setWidgets
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