import { TabNode, ITabRenderValues } from "flexlayout-react";
import { Widget, WidgetDefinition } from "../../../../widgets/widget-interface";
import { useFlexLayoutPortal } from "./FlexLayoutPortalContext";
import { Button } from "@workspace/ui/components/button";
import { ButtonHolderHost } from "@workspace/ui/combined/ButtonHolder";
import { SettingsIcon } from "lucide-react";

/** Props for renderTab. */
interface TabRendererProps {
	node: TabNode;
	renderValues: ITabRenderValues;
	widgets: Map<string, Widget>;
	getDefinition: (widget_id: string) => WidgetDefinition;
	locked: boolean;
	onUpdateWidget: (box_id: string, settings: any) => void;
}

/**
 * Render a FlexLayout tab with widget actions.
 * @param props - Renderer props.
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

	// Render the widget's contributed buttons directly in the tab strip.
	// Reads the reactive registry by widgetId — survives FlexLayout tab
	// remounts (maximize/restore) without portals or DOM-identity coupling.
	renderValues.buttons.push(
		<ButtonHolderHost key={`bh-${widgetId}`} widgetId={widgetId} />,
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
