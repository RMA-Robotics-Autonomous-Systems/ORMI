"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "../../../../../library/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, } from "../../../../../library/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger, } from "../../../../../library/components/ui/popover";
import { usePluginsManager } from "../../../../../library/core/plugins/components/plugins-provider";
import { PluginsHooks } from "../../../../../library/core/plugins/plugins-types";
import { WidgetCard } from "../widget-card/widget-card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../../../../library/components/ui/hover-card";
export function WidgetsCombo(props) {
    var _a = React.useState(false), open = _a[0], setOpen = _a[1];
    var pluginsManager = usePluginsManager();
    var widgets = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);
    var handleValidate = function (widget, settings) {
        props.onValidate(widget, settings);
        setOpen(false); // close the popover
    };
    return (_jsxs(Popover, { open: open, onOpenChange: setOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: "w-[200px] justify-between", children: ["Select a widget", " ", _jsx(Search, { className: "opacity-50" })] }) }), _jsx(PopoverContent, { className: "w-[200px] p-0", children: _jsxs(Command, { children: [_jsx(CommandInput, { placeholder: "Search widgets..." }), _jsxs(CommandList, { children: [_jsx(CommandEmpty, { children: "No widgets found." }), _jsx(CommandGroup, { children: widgets.map(function (widget) { return (_jsx(CommandItem, { value: widget.id, children: _jsxs(HoverCard, { children: [_jsx(HoverCardTrigger, { children: _jsx(WidgetCard, { definition: widget, onValidate: handleValidate, displayType: "list" }) }), _jsx(HoverCardContent, { children: widget.description })] }) }, widget.id)); }) })] })] }) })] }));
}
