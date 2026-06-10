import React from "react";
import { WidgetDefinition } from "../../../../widgets/widget-interface";
import { WidgetHost } from "../../../../dashboard/layout/widget-host";

/** Props for WidgetRenderer. */
interface WidgetRendererProps {
	widgetId: string;
	definition: WidgetDefinition | null;
}

/**
 * Widget renderer for FlexLayout.
 * Uses the canonical WidgetHost. Contributed buttons are rendered directly in
 * the tab strip via <ButtonHolderHost> (see TabRenderer) reading the shared
 * registry — no portal target is needed here.
 * @param props - Component props.
 * @returns React element.
 */
const WidgetRendererComponent: React.FC<WidgetRendererProps> = ({
	widgetId,
	definition,
}) => {
	if (!definition) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Widget definition not found: {widgetId}
			</div>
		);
	}

	return <WidgetHost widgetId={widgetId} getDefinition={() => definition} />;
};

/** Memoized widget renderer for FlexLayout. */
export const WidgetRenderer = React.memo(WidgetRendererComponent);
WidgetRenderer.displayName = "WidgetRenderer";
