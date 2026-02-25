import React from "react";
import { WidgetDefinition } from "../../../../widgets/widget-interface";
import { WidgetHost } from "../../../../dashboard/layout/widget-host";
import { useFlexLayoutPortal } from "./FlexLayoutPortalContext";

/** Props for WidgetRenderer. */
interface WidgetRendererProps {
	widgetId: string;
	definition: WidgetDefinition | null;
}

/**
 * Widget renderer for FlexLayout.
 * Uses canonical WidgetHost and integrates with FlexLayoutPortalContext
 * to pass the portal target for tab title button rendering.
 * @param props - Component props.
 * @returns React element.
 */
const WidgetRendererComponent: React.FC<WidgetRendererProps> = ({
	widgetId,
	definition,
}) => {
	const { getPortalContainer } = useFlexLayoutPortal();
	const portalTarget = getPortalContainer(widgetId);

	if (!definition) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Widget definition not found: {widgetId}
			</div>
		);
	}

	// Use canonical WidgetHost with portal target from FlexLayoutPortalContext
	return (
		<WidgetHost
			widgetId={widgetId}
			getDefinition={() => definition}
			portalTarget={portalTarget || undefined}
		/>
	);
};

/** Memoized widget renderer for FlexLayout. */
export const WidgetRenderer = React.memo(WidgetRendererComponent);
WidgetRenderer.displayName = "WidgetRenderer";
