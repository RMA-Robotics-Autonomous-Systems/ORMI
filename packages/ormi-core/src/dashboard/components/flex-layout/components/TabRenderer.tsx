import React, { useEffect, useRef } from "react";
import { TabNode, ITabRenderValues } from "flexlayout-react";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { useFlexLayoutPortal } from "./FlexLayoutPortalContext";
import { Button } from "@workspace/ui/components/button";
import { SettingsIcon } from "lucide-react";

interface TabRendererProps {
	node: TabNode;
	renderValues: ITabRenderValues;
	widgets: Map<string, Widget>;
	getDefinition: (widget_id: string) => WidgetDefinition;
	locked: boolean;
	onUpdateWidget: (box_id: string, settings: any) => void;
}

/**
 * Portal container component that registers itself with the FlexLayoutPortalContext
 */
const PortalContainer: React.FC<{ widgetId: string }> = ({ widgetId }) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const { registerPortal, unregisterPortal } = useFlexLayoutPortal();

	useEffect(() => {
		if (containerRef.current) {
			registerPortal(widgetId, containerRef.current);
		}

		return () => {
			unregisterPortal(widgetId);
		};
	}, [widgetId, registerPortal, unregisterPortal]);

	return <div ref={containerRef} className="flex flex-row space-x-2" />;
};

/**
 * Custom tab renderer for FlexLayout
 * Handles tab title, icon, and settings button
 */
export const renderTab = ({
	node,
	renderValues,
	widgets,
	getDefinition,
	locked,
	onUpdateWidget,
}: TabRendererProps) => {
	const widgetId = node.getId();
	const widget = widgets.get(widgetId);
	const definition = widget ? getDefinition(widget.widget_id) : null;
	const { openDialog } = useFlexLayoutPortal();

	if (!widget || !definition) {
		return;
	}

	// Set tab title
	const currentTitle = widget.title || definition.name;
	renderValues.content = currentTitle;

	// Add widget icon if available
	if (definition.icon) {
		renderValues.leading = (
			<div className="flex items-center">{definition.icon}</div>
		);
	}

	// Add portal container for ButtonHolder
	renderValues.buttons.push(
		<PortalContainer key={`portal-${widgetId}`} widgetId={widgetId} />,
	);

	// Add settings button when not locked
	if (!locked) {
		renderValues.buttons.push(
			<Button
				key={`settings-${widgetId}`}
				variant="ghost"
				size="sm"
				onClick={() => {
					openDialog(widgetId, widget, definition, onUpdateWidget);
				}}
			>
				<SettingsIcon />
			</Button>,
		);
	}
};
