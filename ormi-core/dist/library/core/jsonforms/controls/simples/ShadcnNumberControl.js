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
import { jsx as _jsx } from "react/jsx-runtime";
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
import { Input } from "../../../../../library/components/ui/input";
import { isNumberControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { ShadcnInputControl } from './ShadcnInputControl';
var ShadcnInputNumber = function (props) {
    var id = props.id, enabled = props.enabled, schema = props.schema, path = props.path, handleChange = props.handleChange, data = props.data;
    return (_jsx(Input, { type: "number", value: data || '', placeholder: schema.default || '', onChange: function (ev) {
            var value = ev.target.value;
            handleChange(path, value === '' ? undefined : Number(value));
        }, disabled: !enabled, id: id, step: "any" }));
};
export var ShadcnNumberControl = function (props) { return (_jsx(ShadcnInputControl, __assign({}, props, { input: ShadcnInputNumber }))); };
export var shadcnNumberControlTester = rankWith(3, isNumberControl);
export default withJsonFormsControlProps(ShadcnNumberControl);
