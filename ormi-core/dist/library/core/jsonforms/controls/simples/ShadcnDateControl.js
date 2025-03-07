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
import { Calendar } from "../../../../../library/components/ui/calendar";
import { Button } from "../../../../../library/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../../library/components/ui/popover";
import { cn } from "../../../../../library/lib/utils";
import { CalendarIcon } from "@radix-ui/react-icons";
import { isDateControl, isDescriptionHidden, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
export var ShadcnDateControl = function (_a) {
    var _b;
    var description = _a.description, errors = _a.errors, uischema = _a.uischema, visible = _a.visible, enabled = _a.enabled, path = _a.path, handleChange = _a.handleChange, data = _a.data, config = _a.config;
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var format = (_b = appliedUiSchemaOptions.dateFormat) !== null && _b !== void 0 ? _b : 'yyyy-MM-dd';
    var showDescription = !isDescriptionHidden(visible, description, false, appliedUiSchemaOptions.showUnfocusedDescription);
    if (!visible) {
        return null;
    }
    return (_jsxs("div", { className: style.cell, children: [_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", className: cn("w-full justify-start text-left font-normal", !data && "text-muted-foreground", !isValid && "border-red-500"), disabled: !enabled, children: [_jsx(CalendarIcon, { className: "mr-2 h-4 w-4" }), data ? format(new Date(data), format) : _jsx("span", { children: "Pick a date" })] }) }), _jsx(PopoverContent, { className: "w-auto p-0", align: "start", children: _jsx(Calendar, { mode: "single", selected: data ? new Date(data) : undefined, onSelect: function (newDate) { return handleChange(path, newDate === null || newDate === void 0 ? void 0 : newDate.toISOString()); }, disabled: !enabled, initialFocus: true }) })] }), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var shadcnDateControlTester = rankWith(5, isDateControl);
export default withJsonFormsControlProps(ShadcnDateControl);
