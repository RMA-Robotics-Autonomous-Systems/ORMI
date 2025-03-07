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
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from "../../../../library/components/ui/dialog";
import { Button } from "../../../../library/components/ui/button";
import { materialRenderers, materialCells, } from '@jsonforms/material-renderers';
import { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { CheckIcon } from "@radix-ui/react-icons";
import { toast } from "../../../../library/hooks/use-toast";
import { CloudCogIcon, XIcon } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, } from "../../../../library/components/ui/context-menu";
import shadcnRenderer, { shadcnCells } from "../../../../library/core/jsonforms/ShadcnRender";
var DatasourceCard = function (props) {
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
    var renderers = __spreadArray(__spreadArray([], materialRenderers, true), shadcnRenderer, true);
    var cellsRenderers = __spreadArray(__spreadArray([], materialCells, true), shadcnCells, true);
    return (_jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", children: _jsxs(ContextMenu, { children: [_jsx(ContextMenuTrigger, { children: _jsxs("div", { className: "flex gap-1 content-center ", children: [_jsx(CloudCogIcon, {}), _jsx("p", { children: props.data.title })] }) }), _jsx(ContextMenuContent, { children: _jsx(ContextMenuItem, { children: _jsxs(Button, { variant: "destructive", onClick: function () {
                                            props.onRemove(data.id);
                                        }, children: ["Remove", _jsx(XIcon, {})] }) }) })] }) }) }), _jsxs(DialogContent, { className: "", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: props.definition.name }), _jsx(DialogDescription, { children: "Datasource configuration" })] }), _jsxs("div", { children: [_jsx(JsonForms, { schema: props.definition.schema, uischema: props.definition.uischema, data: data, renderers: renderers, cells: cellsRenderers, onChange: function (_a) {
                                    var data = _a.data, errors = _a.errors;
                                    setData(data);
                                    setErrors(errors);
                                } }), _jsx("div", { className: "flex justify-end mt-1.5", style: { justifyContent: "flex-end" }, children: _jsx(DialogClose, { className: "float-end", asChild: true, children: _jsx(Button, { onClick: function () { handleAdd(); }, children: _jsx(CheckIcon, {}) }) }) })] })] })] }));
};
export default DatasourceCard;
