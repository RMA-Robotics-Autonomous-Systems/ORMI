import React from "react";
import ReactDOM from "react-dom";
import { ButtonHolder, ButtonHolderProvider } from "@workspace/ui/combined/ButtonHolder";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { useFlexLayoutPortal } from "./FlexLayoutPortalContext";
import { useAtomValue } from "jotai";
import { widgetAtomFamily } from "../../../atoms";


interface WidgetRendererProps {
    widgetId: string;
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
const WidgetRendererComponent: React.FC<WidgetRendererProps> = ({
    widgetId,
    definition,
}) => {
    const widget = useAtomValue(widgetAtomFamily(widgetId));

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

                <WidgetHost component={definition.Component} settings={widget.settings} />
            </div>
        </ButtonHolderProvider>
    );
};

export const WidgetRenderer = React.memo(WidgetRendererComponent);
WidgetRenderer.displayName = "WidgetRenderer";

const WidgetHost = React.memo(
    ({ component, settings }: { component: React.ElementType | React.ReactElement; settings: any }) => {
        if (React.isValidElement(component)) {
            return component;
        }
        return React.createElement(component as React.ElementType, settings);
    },
    (prev, next) => prev.component === next.component && prev.settings === next.settings
);