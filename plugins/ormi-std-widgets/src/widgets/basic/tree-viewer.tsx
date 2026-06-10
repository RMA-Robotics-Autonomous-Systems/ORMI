import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	DatasourceTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { Spinner } from "@workspace/ui/components/spinner";
import { TreeDataItem, TreeView } from "@workspace/ui/components/tree-view";
import { ListTreeIcon } from "lucide-react";

/**
 * Tree viewer widget body.
 * @param props - Component props.
 * @returns React element.
 */
export function TreeViewer(props: { sourceTitle: string }) {
	const { sources, health } = useLocalDataSource();
	// const animationFrameId = useRef<number>();

	function generateTreeView(obj: any, parentId: string = ""): TreeDataItem[] {
		if (!obj) return [];

		const treeViewItems: TreeDataItem[] = [];
		for (const key in obj) {
			const prop = obj[key];
			const uniqueId = parentId ? `${parentId}-${key}` : key;

			const item: TreeDataItem = {
				id: uniqueId,
				name: isPrimitive(prop) ? `${key}: ${prop}` : key,
				children: [],
			};

			if (typeof prop === "object") {
				item.children = generateTreeView(prop, uniqueId);
			}

			treeViewItems.push(item);
		}

		return treeViewItems;
	}

	function isPrimitive(val: any) {
		if (val === null) return true;
		const primitiveTypes = ["string", "number", "boolean"];
		return primitiveTypes.includes(typeof val);
	}

	// Get data directly from sources
	const treeData = generateTreeView(Array.from(sources.values())[0]?.data[0]);

	return (
		<DatasourceGate health={health} title={props.sourceTitle}>
			<div style={{ height: "100%", overflow: "auto" }}>
				{treeData && treeData.length > 0 ? (
					<TreeView data={treeData} />
				) : (
					<Spinner />
				)}
			</div>
		</DatasourceGate>
	);
}

/** Props for TreeViewer widget. */
interface TreeViewerProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
}

/**
 * Widget definition for TreeViewer.
 * @returns Widget definition.
 */
function TreeViewerWidget(data: TreeViewerProps) {
	return (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<TreeViewer sourceTitle={data.topic.source.title} />
		</LocalDataSourcesProvider>
	);
}

export function TreeViewerDefinition(): WidgetDefinition<TreeViewerProps> {
	const pluginsManager = usePluginsManager();

	return {
		id: "tree-viewer-widget",
		name: "Tree viewer",
		description: "Display a tree view of data",
		titleProp: "title",
		icon: <ListTreeIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				topic: {
					type: "object",
					title: "Topic",
				},
			},
			required: ["title", "topic"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
				} as TopicSelectElement,
			],
		} as VerticalLayout,
		data: {
			title: "Tree viewer",
		},
		Component: TreeViewerWidget,
	} as WidgetDefinition<TreeViewerProps>;
}
