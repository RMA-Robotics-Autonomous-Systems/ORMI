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
import { useState } from 'react';
import merge from 'lodash/merge';
import { isDateTimeControl, isDescriptionHidden, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { Calendar } from "../../../../../library/components/ui/calendar";
import { Button } from "../../../../../library/components/ui/button";
import { Input } from "../../../../../library/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../../library/components/ui/popover";
import { cn } from "../../../../../library/lib/utils";
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
var ShadcnDateTimeControl = function (_a) {
    var description = _a.description, errors = _a.errors, uischema = _a.uischema, visible = _a.visible, enabled = _a.enabled, path = _a.path, handleChange = _a.handleChange, data = _a.data, config = _a.config;
    var _b = useState(data ? new Date(data) : undefined), date = _b[0], setDate = _b[1];
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var showDescription = !isDescriptionHidden(visible, description, false, appliedUiSchemaOptions.showUnfocusedDescription);
    var handleDateChange = function (newDate) {
        if (!newDate)
            return;
        if (date) {
            // Preserve time from existing date
            newDate.setHours(date.getHours());
            newDate.setMinutes(date.getMinutes());
        }
        setDate(newDate);
        handleChange(path, newDate.toISOString());
    };
    var handleTimeChange = function (event) {
        if (!date)
            return;
        var _a = event.target.value.split(':'), hours = _a[0], minutes = _a[1];
        var newDate = new Date(date);
        newDate.setHours(parseInt(hours), parseInt(minutes));
        setDate(newDate);
        handleChange(path, newDate.toISOString());
    };
    if (!visible) {
        return null;
    }
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex space-x-2", children: [_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", className: cn("w-[260px] justify-start text-left font-normal", !date && "text-muted-foreground", !isValid && "border-red-500"), disabled: !enabled, children: [_jsx(CalendarIcon, { className: "mr-2 h-4 w-4" }), date ? format(date, "PPP") : _jsx("span", { children: "Pick a date" })] }) }), _jsx(PopoverContent, { className: "w-auto p-0", children: _jsx(Calendar, { mode: "single", selected: date, onSelect: handleDateChange, disabled: !enabled, initialFocus: true }) })] }), _jsx(Input, { type: "time", className: cn("w-[140px]", !isValid && "border-red-500"), value: date ? format(date, "HH:mm") : "", onChange: handleTimeChange, disabled: !enabled || !date })] }), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var shadcnDateTimeControlTester = rankWith(5, isDateTimeControl);
export default withJsonFormsControlProps(ShadcnDateTimeControl);
