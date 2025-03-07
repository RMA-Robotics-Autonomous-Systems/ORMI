"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from "../../../../library/components/ui/dialog";
import { Button } from "../../../../library/components/ui/button";
import { useState } from 'react';
import { PlusIcon } from "lucide-react";
import { PluginsHooks } from "../../../../library/core/plugins/plugins-types";
import { usePluginsManager } from "../../../../library/core/plugins/components/plugins-provider";
var DatasourceAdder = function (props) {
    var pluginsManager = usePluginsManager();
    var datasources_definitions = pluginsManager.applyFilter(PluginsHooks.DATASOURCES_LIST, []);
    var _a = useState(false), open = _a[0], setOpen = _a[1];
    return (_jsxs(Dialog, { open: open, onOpenChange: setOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsx(Button, { children: _jsx(PlusIcon, {}) }) }), _jsxs(DialogContent, { className: "", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Add new datasource" }), _jsx(DialogDescription, { children: "Datasource configuration" })] }), _jsx("div", { children: _jsx("div", { className: "flex gap-3", children: datasources_definitions.map(function (datasource_def) { return (_jsxs(Button, { variant: "ghost", onClick: function () {
                                    props.handleAdd(datasource_def.id);
                                    setOpen(false);
                                }, children: [_jsx(PlusIcon, {}), _jsx("p", { children: datasource_def.name })] }, datasource_def.id)); }) }) })] })] }));
};
export default DatasourceAdder;
