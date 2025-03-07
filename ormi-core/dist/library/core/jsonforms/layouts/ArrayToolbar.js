import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { Button } from '../../../../library/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "../../../../library/components/ui/tooltip";
import { PlusIcon } from '@radix-ui/react-icons';
export var ArrayLayoutToolbar = React.memo(function ArrayLayoutToolbar(_a) {
    var label = _a.label, description = _a.description, errors = _a.errors, addItem = _a.addItem, path = _a.path, enabled = _a.enabled, createDefault = _a.createDefault, translations = _a.translations, disableAdd = _a.disableAdd;
    return (_jsx("div", { children: _jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("h2", { className: "text-xl font-semibold", children: label }), errors.length > 0 && (_jsx("span", { className: "text-destructive", children: errors }))] }), enabled && !disableAdd && (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", onClick: addItem(path, createDefault()), "aria-label": translations.addTooltip, children: _jsx(PlusIcon, {}) }) }), _jsx(TooltipContent, { children: translations.addTooltip })] }) }))] }), description && (_jsx("p", { className: "text-sm text-muted-foreground", children: description }))] }) }));
});
