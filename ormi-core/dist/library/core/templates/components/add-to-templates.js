"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "../../../../library/components/ui/button";
import { BookTemplateIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from "../../../../library/components/ui/dialog";
import { useState } from "react";
import { useTemplates } from "../templates-provider";
export function AddToTemplatesBtn(props) {
    var _a = useState(false), open = _a[0], setOpen = _a[1];
    var addTemplate = useTemplates().addTemplate;
    var handleSaveTemplate = function () {
        // Implementation for saving to templates
        props.widget.data = props.data;
        var widget = {
            widget_id: props.widget.id,
            box_id: "",
            title: props.widget.name,
            settings: props.widget.data,
        };
        addTemplate(widget);
        setOpen(false);
    };
    return (_jsxs(Dialog, { open: open, onOpenChange: setOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { variant: "ghost", children: ["Save to templates ", _jsx(BookTemplateIcon, { className: "ml-2 h-4 w-4" })] }) }), _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Save to Templates" }), _jsx(DialogDescription, { children: "Are you sure you want to save this to your templates?" })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", onClick: function () { return setOpen(false); }, children: "Cancel" }), _jsx(Button, { onClick: handleSaveTemplate, children: "Save" })] })] })] }));
}
