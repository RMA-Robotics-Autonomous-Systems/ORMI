"use client";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import styles from "./widget-card.module.css";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from "../../../../../library/components/ui/dialog";
import { Button } from "../../../../../library/components/ui/button";
import { materialRenderers, materialCells, } from '@jsonforms/material-renderers';
import { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { toast } from "../../../../../library/hooks/use-toast";
import shadcnRenderer, { shadcnCells } from "../../../../../library/core/jsonforms/ShadcnRender";
import { CheckIcon, SettingsIcon } from "lucide-react";
import { AddToTemplatesBtn } from "../../../../../library/core/templates/components/add-to-templates";
export function WidgetCard(props) {
    var _a = useState(props.definition.data), data = _a[0], setData = _a[1];
    var _b = useState(null), errors = _b[0], setErrors = _b[1];
    var handleAdd = function () {
        if (errors && errors.length > 0) {
            for (var _i = 0, errors_1 = errors; _i < errors_1.length; _i++) {
                var error = errors_1[_i];
                toast({
                    title: "Error",
                    description: error.message,
                    variant: "destructive"
                });
            }
            return;
        }
        props.onValidate(props.definition, data);
    };
    useEffect(function () {
        if (props.data) {
            setData(props.data);
        }
        else {
            setData(props.definition.data);
        }
    }, []);
    var getButton = function () {
        if (props.displayType === "gear") {
            return (_jsx(Button, { variant: "ghost", children: _jsx(SettingsIcon, {}) }));
        }
        if (props.displayType === "list") {
            return (_jsxs(Button, { variant: "ghost", children: [props.definition.icon || _jsx(SettingsIcon, {}), _jsx("p", { children: props.definition.name })] }));
        }
        return (_jsxs("button", { className: styles.card, children: [_jsx("div", { className: styles.overlay, children: _jsx("p", { className: styles.description, children: props.definition.description }) }), _jsxs("div", { className: styles.content, children: [_jsx("div", { style: { scale: 3 }, children: props.definition.icon || _jsx(SettingsIcon, {}) }), _jsx("h2", { className: styles.title, children: props.definition.name })] })] }));
    };
    var renderers = __spreadArray(__spreadArray([], materialRenderers, true), shadcnRenderer, true);
    var cellsRenderers = __spreadArray(__spreadArray([], materialCells, true), shadcnCells, true);
    return (_jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: getButton() }), _jsxs(DialogContent, { className: "", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: props.definition.name }), _jsx(DialogDescription, { children: "Widget configuration" })] }), _jsxs("div", { children: [_jsx(JsonForms, { schema: props.definition.schema, uischema: props.definition.uischema, data: data, renderers: renderers, cells: cellsRenderers, onChange: function (_a) {
                                    var data = _a.data, errors = _a.errors;
                                    setData(data);
                                    setErrors(errors);
                                } }), _jsxs("div", { className: "flex justify-end mt-1.5 gap-3", style: { justifyContent: "flex-end" }, children: [props.fromLoaded && props.fromLoaded === true && _jsx(AddToTemplatesBtn, { widget: props.definition, data: data }), _jsx(DialogClose, { className: "float-end", asChild: true, children: _jsx(Button, { onClick: function () { handleAdd(); }, children: _jsx(CheckIcon, {}) }) })] })] })] })] }));
}
;
