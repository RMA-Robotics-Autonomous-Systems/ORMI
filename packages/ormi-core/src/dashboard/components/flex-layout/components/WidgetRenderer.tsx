import React from "react";
import ReactDOM from "react-dom";
import {
	ButtonHolder,
	ButtonHolderProvider,
} from "@workspace/ui/combined/ButtonHolder";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { useFlexLayoutPortal } from "./FlexLayoutPortalContext";
import { useAtomValue } from "jotai";
import { widgetAtomFamily } from "../../../atoms";

/** Props for WidgetRenderer. */
interface WidgetRendererProps {
	widgetId: string;
	definition: WidgetDefinition | null;
}

/**
 * Portal ButtonHolder into a tab title.
 * @param props - Component props.
 * @returns React element or null.
 */
const ButtonHolderPortal: React.FC<{ widgetId: string }> = ({ widgetId }) => {
	const { getPortalContainer } = useFlexLayoutPortal();
	const portalContainer = getPortalContainer(widgetId);

	if (!portalContainer) {
		return null;
	}

	// Portal the ButtonHolder component into the tab title container
	// This preserves the React context and event handlers from the content area
	return ReactDOM.createPortal(<ButtonHolder />, portalContainer);
};

/**
 * Widget renderer with ButtonHolder integration.
 * @param props - Component props.
 * @returns React element.
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

				<WidgetHost
					component={definition.Component}
					settings={widget.settings}
				/>
			</div>
		</ButtonHolderProvider>
	);
};

/** Memoized widget renderer for FlexLayout. */
export const WidgetRenderer = React.memo(WidgetRendererComponent);
WidgetRenderer.displayName = "WidgetRenderer";

const WidgetHost = React.memo(
	({
		component,
		settings,
	}: {
		component: React.ElementType | React.ReactElement;
		settings: any;
	}) => {
		if (React.isValidElement(component)) {
			return component;
		}
		return React.createElement(component as React.ElementType, settings);
	},
	(prev, next) =>
		prev.component === next.component && prev.settings === next.settings,
);
