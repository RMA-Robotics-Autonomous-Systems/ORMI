import { jsx as _jsx } from "react/jsx-runtime";
import { TreeView } from "@/components/tree-view";
import { usePluginsManager } from "ormi-core/plugins";
import { FolderTreeIcon } from "lucide-react";
import { useEffect, useState } from "react";
function PluginViewer() {
    var _a = useState([]), data = _a[0], setData = _a[1];
    var pluginsManager = usePluginsManager();
    useEffect(function () {
        var generateTreeView = function () {
            var treeViewItems = [];
            var plugins = pluginsManager.getPlugins();
            var actions = new Map();
            var filters = new Map();
            plugins.forEach(function (plugin) {
                plugin.actions.forEach(function (actionsMap, key) {
                    var _a;
                    if (!actions.has(key)) {
                        actions.set(key, []);
                    }
                    (_a = actions.get(key)) === null || _a === void 0 ? void 0 : _a.push.apply(_a, Array.from(actionsMap.values()));
                });
                plugin.filters.forEach(function (filtersMap, key) {
                    var _a;
                    if (!filters.has(key)) {
                        filters.set(key, []);
                    }
                    (_a = filters.get(key)) === null || _a === void 0 ? void 0 : _a.push.apply(_a, Array.from(filtersMap.values()));
                });
            });
            treeViewItems.push({
                id: 'actions',
                name: 'Actions',
                children: Array.from(actions.keys()).map(function (key) {
                    var _a;
                    return {
                        id: key.toString(),
                        name: key.toString(),
                        children: (_a = actions.get(key)) === null || _a === void 0 ? void 0 : _a.map(function (action) {
                            return {
                                id: key.toString() + action.id,
                                name: action.id,
                                parentId: key
                            };
                        })
                    };
                })
            });
            treeViewItems.push({
                id: 'filters',
                name: 'Filters',
                children: Array.from(filters.keys()).map(function (key) {
                    var _a;
                    return {
                        id: key.toString(),
                        name: key.toString(),
                        children: (_a = filters.get(key)) === null || _a === void 0 ? void 0 : _a.map(function (filter) {
                            return {
                                id: key.toString() + filter.id,
                                name: filter.id,
                                parentId: key
                            };
                        })
                    };
                })
            });
            return treeViewItems;
        };
        setData(generateTreeView());
    }, [pluginsManager.getPlugins()]);
    return (_jsx("div", { style: { height: "100%", overflow: "auto" }, children: (data) && (data.length > 0) && (_jsx(TreeView, { data: data })) }));
}
export function PluginsViewerDefinition() {
    return {
        id: 'plugins-viewer-widget',
        name: 'Plugins viewer',
        description: 'Display the differents filters and actions',
        titleProp: 'title',
        icon: _jsx(FolderTreeIcon, {}),
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
                },
            ]
        },
        data: {
            title: 'Plugins viewer'
        },
        Component: function () { return (_jsx(PluginViewer, {})); }
    };
}
