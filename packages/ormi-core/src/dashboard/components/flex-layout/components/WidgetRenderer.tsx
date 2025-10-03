import React from "react";
import ReactDOM from "react-dom";
import { ButtonHolder, ButtonHolderProvider } from "@workspace/ui/combined/ButtonHolder";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { useFlexLayoutPortal } from "./FlexLayoutPortalContext";

interface WidgetRendererProps {
    widgetId: string;
    widget: Widget | undefined;
    definition: WidgetDefinition | null;
}

/**
 * ButtonHolderPortal component that renders ButtonHolder into tab title
 * Uses the FlexLayoutPortalContext to find the portal container
 */
const ButtonHolderPortal: React.FC<{ widgetId: string }> = ({ widgetId }) => {
    const { getPortalContainer } = useFlexLayoutPortal();
    const portalContainer = getPortalContainer(widgetId);

    if (!portalContainer) {
        return null;
    }

    // Portal the ButtonHolder component into the tab title container
    // This preserves the React context and event handlers from the content area
    return ReactDOM.createPortal(
        <ButtonHolder />,
        portalContainer
    );
};

/**
 * Simple widget renderer with ButtonHolder integration
 * Replaces the complex OptimizedWidget system
 */
export const WidgetRenderer: React.FC<WidgetRendererProps> = ({
    widgetId,
    widget,
    definition,
}) => {
    if (!widget || !definition) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Widget not found: {widgetId}
            </div>
        );
    }

    return (
        <ButtonHolderProvider>
            <div className="w-full h-full overflow-hidden">
                {/* Portal ButtonHolder to tab title */}
                <ButtonHolderPortal widgetId={widgetId} />

                {definition.Component(widget.settings)}
            </div>
        </ButtonHolderProvider>
    );
};