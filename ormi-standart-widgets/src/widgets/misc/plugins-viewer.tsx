import { TreeView, TreeDataItem } from "ormi-components";
import { usePluginsManager } from "ormi-core/plugins";
import { PluginAction, PluginFilter, PluginsHooks } from "ormi-core/plugins";
import { WidgetDefinition } from "ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { FolderTreeIcon } from "lucide-react";

import { useEffect, useState } from "react";



function PluginViewer() {

    const [data, setData] = useState<TreeDataItem[]>([]);

    const pluginsManager = usePluginsManager();

    useEffect(() => {

        const generateTreeView = () => {
            const treeViewItems: TreeDataItem[] = [];

            const plugins = pluginsManager.getPlugins();

            const actions: Map<PluginsHooks | string, PluginAction[]> = new Map();
            const filters: Map<PluginsHooks | string, PluginFilter[]> = new Map();

            plugins.forEach((plugin) => {
                plugin.actions.forEach((actionsMap, key) => {
                    if (!actions.has(key)) {
                        actions.set(key, []);
                    }

                    actions.get(key)?.push(...Array.from(actionsMap.values()));
                });

                plugin.filters.forEach((filtersMap, key) => {
                    if (!filters.has(key)) {
                        filters.set(key, []);
                    }

                    filters.get(key)?.push(...Array.from(filtersMap.values()));
                });
            });

            treeViewItems.push({
                id: 'actions',
                name: 'Actions',
                children: Array.from(actions.keys()).map((key) => {
                    return {
                        id: key.toString(),
                        name: key.toString(),
                        children: actions.get(key)?.map((action) => {
                            return {
                                id: key.toString() + action.id,
                                name: action.id,
                                parentId: key as string
                            };
                        })
                    };
                })
            });

            treeViewItems.push({
                id: 'filters',
                name: 'Filters',
                children: Array.from(filters.keys()).map((key) => {
                    return {
                        id: key.toString(),
                        name: key.toString(),
                        children: filters.get(key)?.map((filter) => {
                            return {
                                id: key.toString() + filter.id,
                                name: filter.id,
                                parentId: key as string
                            };
                        })
                    };
                })
            });

            return treeViewItems;
        }

        setData(generateTreeView());
    }, [pluginsManager.getPlugins()]);

    return (
        <div style={{ height: "100%", overflow: "auto" }}>
            {(data) && (data.length > 0) && (<TreeView data={data} />)}
        </div>
    );
}

export function PluginsViewerDefinition(): WidgetDefinition {

    return {
        id: 'plugins-viewer-widget',
        name: 'Plugins viewer',
        description: 'Display the differents filters and actions',
        titleProp: 'title',
        icon: <FolderTreeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
            },
            required: ['title']
        },

        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title"
                } as ControlElement,
            ]

        } as VerticalLayout,

        data: {
            title: 'Plugins viewer'
        },
        Component: () => (
            <PluginViewer />
        )

    }

}