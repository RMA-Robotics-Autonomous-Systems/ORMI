import React, { useCallback, useRef } from "react";
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
    const contentCacheRef = useRef<Map<string, React.ReactNode>>(new Map());

    const factory = useCallback((node: TabNode) => {
        const widgetId = node.getId();
        const widget = widgets.get(widgetId);
        const definition = widget ? getDefinition(widget.widget_id) : null;

        // Set save event listener for FlexLayout
        node.setEventListener("save", () => {
            // Called before serialization - nothing needed here
        });

        const cached = contentCacheRef.current.get(widgetId);
        if (cached) {
            return cached;
        }

        const content = (
            <WidgetRenderer
                key={widgetId}
                widgetId={widgetId}
                definition={definition}
            />
        );

        contentCacheRef.current.set(widgetId, content);
        return content;
    }, [widgets, getDefinition]); // Include getDefinition - should be stable from provider

    return factory;
};