import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	SelectedTopic,
	DatasourceTopic,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
	Table,
} from "@workspace/ui/components/table";
import { ListIcon } from "lucide-react";
import { useState, useEffect } from "react";

interface TopicsListProps {
	title: string;
	topic: SelectedTopic;
}

function TopicsList() {
	const pluginsManager = usePluginsManager();

	const [topics, setTopics] = useState<DatasourceTopic[]>([]);

	useEffect(() => {
		const interval = setInterval(async () => {
			const current_topics = await pluginsManager.applyFilterAsync<
				DatasourceTopic[]
			>(PluginsHooks.AVAILABLE_TOPICS, []);

			setTopics(current_topics);
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	}, [pluginsManager]);

	return (
		<div style={{ width: "100%", height: "100%", overflow: "auto" }}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Datasource</TableHead>
						<TableHead>Topic</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>RawType</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{topics.map((topic, i) => (
						<TableRow key={i}>
							<TableCell className="font-medium">
								{topic.source.title}
							</TableCell>
							<TableCell className="font-medium">
								{topic.topic}
							</TableCell>
							<TableCell>{topic.type}</TableCell>
							<TableCell>{topic.rawType}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export function TopicsListDefinition(): WidgetDefinition {
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
		Component: (data: TopicsListProps) => <TopicsList />,
	} as WidgetDefinition;
}
