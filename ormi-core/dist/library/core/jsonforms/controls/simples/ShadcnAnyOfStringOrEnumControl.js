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

  Copyright (c) 2018-2019 EclipseSource Munich
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
import { and, rankWith, schemaMatches, uiTypeIs, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { Input } from "../../../../../library/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../library/components/ui/select";
import { useState } from 'react';
var ShadcnAutocompleteInputText = function (props) {
    var _a, _b;
    var id = props.id, label = props.label, enabled = props.enabled, path = props.path, handleChange = props.handleChange, schema = props.schema, data = props.data;
    var _c = useState(data || ''), inputText = _c[0], setInputText = _c[1];
    var enumItems = ((_b = (_a = schema.anyOf) === null || _a === void 0 ? void 0 : _a.find(function (s) { return s.enum; })) === null || _b === void 0 ? void 0 : _b.enum) || [];
    var onChange = function (event) {
        var newValue = event.target.value;
        setInputText(newValue);
        handleChange(path, newValue);
    };
    var onSelect = function (value) {
        setInputText(value);
        handleChange(path, value);
    };
    return enumItems.length > 0 ? (_jsxs(Select, { value: inputText, onValueChange: onSelect, disabled: !enabled, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, { placeholder: label }) }), _jsx(SelectContent, { children: enumItems.map(function (item) { return (_jsx(SelectItem, { value: item, children: item }, item)); }) })] })) : (_jsx(Input, { type: "text", value: inputText, onChange: onChange, id: id, placeholder: label, disabled: !enabled }));
};
var ShadcnAnyOfStringOrEnumControl = function (props) {
    return _jsx(ShadcnAutocompleteInputText, __assign({}, props));
};
var hasEnumAndText = function (schemas) {
    var enumSchema = schemas.find(function (s) { return s.enum !== undefined && (s.type === 'string' || s.type === undefined); });
    var stringSchema = schemas.find(function (s) { return s.type === 'string' && s.enum === undefined; });
    var remainingSchemas = schemas.filter(function (s) { return s !== enumSchema || s !== stringSchema; });
    var wrongType = remainingSchemas.find(function (s) { return s.type && s.type !== 'string'; });
    return enumSchema && stringSchema && !wrongType;
};
var simpleAnyOf = and(uiTypeIs('Control'), schemaMatches(function (schema) {
    return Object.prototype.hasOwnProperty.call(schema, 'anyOf') &&
        hasEnumAndText(schema.anyOf);
}));
export var shadcnAnyOfStringOrEnumControlTester = rankWith(6, simpleAnyOf);
export default withJsonFormsControlProps(ShadcnAnyOfStringOrEnumControl);
