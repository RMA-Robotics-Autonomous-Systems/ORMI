"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "../../../../library/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, } from "../../../../library/components/ui/sheet";
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { ActionDialog } from "../../../../library/components/advanced/ActionDialog/action-dialog";
import { PluginsHooks } from "../../../../library/core/plugins/plugins-types";
import { usePluginsManager } from "../../../../library/core/plugins/components/plugins-provider";
export function WidgetTemplateDrawer(props) {
    var templates = props.templates, removeTemplate = props.removeTemplate, addWidget = props.addWidget;
    var pluginsManager = usePluginsManager();
    // Pre-fetch available widgets once at component level
    var availableWidgets = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);
    return (_jsxs(Sheet, { children: [_jsx(Button, { asChild: true, variant: "ghost", children: _jsx(SheetTrigger, { children: "Templates" }) }), _jsxs(SheetContent, { children: [_jsxs(SheetHeader, { children: [_jsx(SheetTitle, { children: "Saved widgets" }), _jsx(SheetDescription, { children: "List of available widgets templates" })] }), _jsx("div", { children: Array.from(templates.entries()).map(function (_a) {
                            var key = _a[0], widget = _a[1];
                            return (_jsxs("div", { className: "flex items-center justify-between p-2 border-b border-gray-200", children: [_jsx("div", { children: widget.settings.title }), _jsxs("div", { className: "flex gap-2", children: [_jsx(ActionDialog, { title: "Remove template", message: "Are you certain?", actions: [
                                                    {
                                                        title: _jsx(XIcon, {}),
                                                        action: function () { }
                                                    },
                                                    {
                                                        title: _jsx(CheckIcon, {}),
                                                        action: function () { return removeTemplate(key); }
                                                    }
                                                ], trigger: _jsx(Button, { variant: "destructive", children: _jsx(TrashIcon, {}) }) }), _jsx(Button, { variant: "outline", onClick: function () {
                                                    // Use the pre-fetched widgets list instead of calling hooks inside event handlers
                                                    var definition = availableWidgets.find(function (w) { return w.id === widget.widget_id; });
                                                    if (!definition) {
                                                        throw new Error("Widget definition not found");
                                                    }
                                                    addWidget(definition, widget.settings);
                                                }, children: _jsx(PlusIcon, {}) })] })] }, key));
                        }) })] })] }));
}
