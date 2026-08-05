import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { GlobeIcon } from "lucide-react";

/** Props for IFrame widget. */
interface IFrameProps extends Record<string, unknown> {
	title: string;
	url: string;
}

/** Renders the iframe widget. */
function IframeWidget(props: IFrameProps) {
	return (
		<div style={{ width: "100%", height: "100%" }}>
			<iframe
				style={{ width: "100%", height: "100%" }}
				src={props.url}
			></iframe>
		</div>
	);
}

/**
 * Widget definition for iframe viewer.
 * @returns Widget definition.
 */
export function IframeDefinition(): WidgetDefinition<IFrameProps> {
	return {
		id: "iframe-widget",
		name: "IFrame viewer",
		description: "Embed a web page",
		titleProp: "title",
		icon: <GlobeIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				url: {
					type: "string",
					title: "Url",
				},
			},
			required: ["title"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/url",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Plugins viewer",
		},
		Component: IframeWidget,
	} as WidgetDefinition<IFrameProps>;
}
