import { Spinner } from "@/components/spinner";
import { TreeView, TreeDataItem } from "@/components/tree-view";
import { LocalDataSourcesProvider, useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import { DatasourceTopic, SelectedTopic } from "@/core/datasources/datasource-interface";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { WidgetDefinition } from "@/core/widgets/widget-interface";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
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
                    options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, []);
                        },
                        buffer: 1,
                    }
                } as AsyncTopicControlType

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