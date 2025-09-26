import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { useLocalDataSource, SelectedTopic, DatasourceTopic, LocalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { Spinner } from "@workspace/ui/components/spinner";
import { TreeDataItem, TreeView } from "@workspace/ui/components/tree-view";
import { ListTreeIcon } from "lucide-react";

export function TreeViewer() {
    const { sources } = useLocalDataSource();
    // const animationFrameId = useRef<number>();

    function generateTreeView(obj: any, parentId: string = ''): TreeDataItem[] {
        if (!obj) return [];

        const treeViewItems: TreeDataItem[] = [];
        for (const key in obj) {
            const prop = obj[key];
            const uniqueId = parentId ? `${parentId}-${key}` : key;

            const item: TreeDataItem = {
                id: uniqueId,
                name: isPrimitive(prop) ? `${key}: ${prop}` : key,
                children: []
            }

            if (typeof prop === 'object') {
                item.children = generateTreeView(prop, uniqueId);
            }

            treeViewItems.push(item);
        }

        return treeViewItems;
    }

    function isPrimitive(val: any) {
        if (val === null) return true;
        const primitiveTypes = ['string', 'number', 'boolean'];
        return primitiveTypes.includes(typeof val);
    }

    // Get data directly from sources
    const treeData = generateTreeView(Array.from(sources.values())[0]?.data[0]);

    return (
        <div style={{ height: "100%", overflow: "auto" }}>
            {treeData && treeData.length > 0 ? (
                <TreeView data={treeData} />
            ) : (
                <Spinner />
            )}
        </div>
    );
}



export function TreeViewerDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    interface TreeViewerProps {
        title: string;
        topic: SelectedTopic;
    }

    return {
        id: 'tree-viewer-widget',
        name: 'Tree viewer',
        description: 'Display a tree view of data',
        titleProp: 'title',
        icon: <ListTreeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },

        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title"
                } as ControlElement,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                } as TopicSelectElement

            ],
        } as VerticalLayout,
        data: {
            title: 'Tree viewer'
        },
        Component: (data: TreeViewerProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1} >
                <TreeViewer />
            </LocalDataSourcesProvider >
        )

    } as WidgetDefinition;
}