import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
  The MIT License

  Copyright (c) 2017-2019 EclipseSource Munich
  https://github.com/eclipsesource/jsonforms

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
import React from 'react';
import { createDefaultValue, } from '@jsonforms/core';
import { TableRow, TableCell } from "../../../../../library/components/ui/table";
import { Button } from "../../../../../library/components/ui/button";
import { PlusIcon } from "@radix-ui/react-icons";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "../../../../../library/components/ui/tooltip";
export var TableToolbar = React.memo(function TableToolbar(_a) {
    var numColumns = _a.numColumns, errors = _a.errors, label = _a.label, path = _a.path, addItem = _a.addItem, schema = _a.schema, enabled = _a.enabled, translations = _a.translations, rootSchema = _a.rootSchema, disableAdd = _a.disableAdd;
    var handleAddClick = React.useCallback(function () {
        var newValue = createDefaultValue(schema, rootSchema);
        addItem(path, newValue)();
    }, [addItem, path, schema]);
    return (_jsx(TableRow, { children: _jsx(TableCell, { colSpan: numColumns + 1, children: _jsxs("div", { className: "flex items-center justify-between py-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h3", { className: "text-lg font-semibold", children: label }), errors && (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { children: _jsx(AlertCircle, { className: "h-4 w-4 text-destructive" }) }), _jsx(TooltipContent, { children: _jsx("p", { children: errors }) })] }) }))] }), enabled && !disableAdd && (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs(Button, { onClick: handleAddClick, size: "sm", variant: "outline", children: [_jsx(PlusIcon, { className: "h-4 w-4 mr-2" }), translations.addTooltip] }) }), _jsx(TooltipContent, { children: translations.addTooltip })] }) }))] }) }) }));
});
export default TableToolbar;
