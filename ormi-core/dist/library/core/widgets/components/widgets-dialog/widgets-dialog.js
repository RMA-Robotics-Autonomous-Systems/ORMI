"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
    Dialog that display available widgets as cards

    when click on a widget card, it will open a dialog to configure the widget;
    The confirator returns the widget configuration to be saved.

*/
import { useState } from "react";
import { Button } from "../../../../../library/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from "../../../../../library/components/ui/dialog";
import { Plus } from "lucide-react"; // Import the plus icon
import { usePluginsManager } from "../../../plugins/components/plugins-provider";
import { PluginsHooks } from "../../../plugins/plugins-types";
import { WidgetCard } from "../widget-card/widget-card";
import style from "./widgets-dialog.module.css";
import { useDashboardManager } from "../../../../../library/core/dashboard/components/dashboard-provider";
export function WidgetsDialog() {
    var _a = useState(false), isOpen = _a[0], setIsOpen = _a[1];
    var pluginsManager = usePluginsManager();
    var _b = useDashboardManager(), addWidget = _b.addWidget, locked = _b.locked;
    var widgets = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);
    var handleValidate = function (widget, settings) {
        addWidget(widget, settings);
        setIsOpen(false); // close the dialog
    };
    return (!locked && (_jsxs(Dialog, { open: isOpen, onOpenChange: setIsOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { className: style.floatingButton, onClick: function () { return setIsOpen(true); }, children: [_jsx(Plus, { size: 32 }), " "] }) }), _jsxs(DialogContent, { className: "", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Widgets" }), _jsx(DialogDescription, { children: "Select a widget to add to the dashboard" })] }), _jsx("div", { className: style.widget_container, children: widgets.map(function (widget, index) {
                            return _jsx(WidgetCard, { definition: widget, onValidate: handleValidate }, index);
                        }) })] })] })));
}
