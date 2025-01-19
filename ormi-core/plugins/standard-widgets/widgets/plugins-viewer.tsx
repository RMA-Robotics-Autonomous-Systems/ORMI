import { TreeView, TreeDataItem } from "@/components/tree-view";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import PluginsManager from "@/core/plugins/plugins-manager";
import { PluginAction, PluginFilter, PluginsHooks } from "@/core/plugins/plugins-types";

import { useEffect, useState } from "react";

export function PluginViewer(props: any) {

    const [data, setData] = useState<TreeDataItem[]>([]);

    const pluginsManager = usePluginsManager() as PluginsManager;

    useEffect(() => {

        const generateTreeView = (obj: PluginsManager) => {
            const treeViewItems: TreeDataItem[] = [];

            const plugins = obj.getPlugins();

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

        setData(generateTreeView(pluginsManager));
    }, [pluginsManager.getPlugins()]);

    return (
        <div style={{ height: "100%", overflow: "auto" }}>
            {(data) && (data.length > 0) && (<TreeView data={data} />)}
        </div>
    );
}