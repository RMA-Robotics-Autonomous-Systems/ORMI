import React, { useCallback } from "react";
import { TabNode } from "flexlayout-react";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { WidgetRenderer } from "../components/WidgetRenderer";

interface UseWidgetFactoryProps {
    widgets: Map<string, Widget>;
    getDefinition: (widget_id: string) => WidgetDefinition;
}

/**
 * Hook to create FlexLayout factory function
 * Simple factory that renders widgets by their box_id
 */
export const useWidgetFactory = ({ widgets, getDefinition }: UseWidgetFactoryProps) => {
    const factory = useCallback((node: TabNode) => {
        const widgetId = node.getId();
        const widget = widgets.get(widgetId);
        const definition = widget ? getDefinition(widget.widget_id) : null;

        // Set save event listener for FlexLayout
        node.setEventListener("save", () => {
            // Called before serialization - nothing needed here
        });

        return (
            <WidgetRenderer
                key={widgetId}
                widgetId={widgetId}
                widget={widget}
                definition={definition}
            />
        );
    }, [widgets, getDefinition]); // Include getDefinition - should be stable from provider

    return factory;
};