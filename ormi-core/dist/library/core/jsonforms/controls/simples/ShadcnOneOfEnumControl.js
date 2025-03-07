var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
  The MIT License

  Copyright (c) 2018-2020 EclipseSource Munich
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "../../../../../library/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, } from "../../../../../library/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger, } from "../../../../../library/components/ui/popover";
import { Button } from "../../../../../library/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../../../../../library/lib/utils";
import { isOneOfEnumControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsOneOfEnumProps, withTranslateProps, } from '@jsonforms/react';
import { ShadcnInputControl } from './ShadcnInputControl';
import merge from 'lodash/merge';
var ShadcnSelect = function (_a) {
    var data = _a.data, options = _a.options, path = _a.path, handleChange = _a.handleChange, errors = _a.errors, label = _a.label, enabled = _a.enabled;
    return (_jsxs(Select, { value: data || '', onValueChange: function (value) { return handleChange(path, value); }, disabled: !enabled, children: [_jsx(SelectTrigger, { className: cn("w-full", errors.length > 0 && "border-red-500"), children: _jsx(SelectValue, { placeholder: label }) }), _jsx(SelectContent, { children: options.map(function (option) { return (_jsx(SelectItem, { value: option.value, children: option.label }, option.value)); }) })] }));
};
var ShadcnCombobox = function (_a) {
    var _b;
    var data = _a.data, options = _a.options, path = _a.path, handleChange = _a.handleChange, errors = _a.errors, label = _a.label, enabled = _a.enabled;
    var _c = React.useState(false), open = _c[0], setOpen = _c[1];
    console.log(options);
    return (_jsxs(Popover, { open: open, onOpenChange: setOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: cn("w-full justify-between", errors.length > 0 && "border-red-500"), disabled: !enabled, children: [data
                            ? (_b = (options || []).find(function (option) { return option.value === data; })) === null || _b === void 0 ? void 0 : _b.label
                            : label, _jsx(ChevronsUpDown, { className: "ml-2 h-4 w-4 shrink-0 opacity-50" })] }) }), _jsx(PopoverContent, { className: "w-full p-0", children: _jsxs(Command, { children: [_jsx(CommandInput, { placeholder: "Search ".concat(label, "...") }), _jsxs(CommandList, { children: [_jsx(CommandEmpty, { children: "No option found." }), _jsx(CommandGroup, { children: (options || []).map(function (option) { return (_jsxs(CommandItem, { onSelect: function () {
                                            handleChange(path, option.value);
                                            setOpen(false);
                                        }, children: [_jsx(Check, { className: cn("mr-2 h-4 w-4", data === option.value ? "opacity-100" : "opacity-0") }), option.label] }, option.value)); }) })] })] }) })] }));
};
export var ShadcnOneOfEnumControl = function (props) {
    var config = props.config, uischema = props.uischema;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    return appliedUiSchemaOptions.autocomplete === false ? (_jsx(ShadcnInputControl, __assign({}, props, { input: ShadcnSelect }))) : (_jsx(ShadcnCombobox, __assign({}, props)));
};
export var shadcnOneOfEnumControlTester = rankWith(6, isOneOfEnumControl);
export default withJsonFormsOneOfEnumProps(withTranslateProps(React.memo(ShadcnOneOfEnumControl)), false);
