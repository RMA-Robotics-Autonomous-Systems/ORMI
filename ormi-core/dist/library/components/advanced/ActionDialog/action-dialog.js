import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from "../../ui/dialog";
import { useState } from "react";
export function ActionDialog(props) {
    var _a = useState(false), open = _a[0], setOpen = _a[1];
    return (_jsxs(Dialog, { open: open, onOpenChange: setOpen, children: [_jsx(DialogTrigger, { asChild: true, children: props.trigger }), _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: props.title }), _jsx(DialogDescription, { children: props.message })] }), _jsx(DialogFooter, { children: props.actions.map(function (action, index) { return (_jsx(Button, { onClick: function () {
                                action.action();
                                setOpen(false);
                            }, children: action.title }, index)); }) })] })] }));
}
