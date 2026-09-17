import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { TopicsPanel } from "@workspace/ormi-core/dashboard/topic-list";
import { ListIcon } from "lucide-react";

/**
 * Topics list widget body.
 *
 * The same panel the dashboard's topics dialog renders, put on the dashboard
 * so an operator who works topic-first can keep the list in front of them
 * instead of reopening it. No `onRouted`: this panel *is* on the dashboard, so
 * there is nothing to get out of the way after a topic is placed.
 *
 * @returns React element.
 */
function TopicsList() {
	return (
		<div className="h-full w-full overflow-hidden p-2">
			<TopicsPanel />
		</div>
	);
}

/** Props for TopicsList widget. */
interface TopicsListProps extends Record<string, unknown> {
	title: string;
}

/**
 * Widget definition for TopicsList.
 * @returns Widget definition.
 */
export function TopicsListDefinition(): WidgetDefinition<TopicsListProps> {
	return {
		id: "topics-List-widget",
		name: "Topics List",
		description: "Display a Topics List",
		titleProp: "title",
		icon: <ListIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
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
			],
		} as VerticalLayout,

		data: {
			title: "Topics List",
		},
		Component: TopicsList,
	};
}
