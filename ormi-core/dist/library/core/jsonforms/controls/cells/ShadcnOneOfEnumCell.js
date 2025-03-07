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
import { isOneOfEnumControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsOneOfEnumCellProps, withTranslateProps, } from '@jsonforms/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "../../../../../library/components/ui/select";
export var ShadcnOneOfEnumCell = function (props) {
    var data = props.data, className = props.className, enabled = props.enabled, handleChange = props.handleChange, options = props.options, path = props.path;
    return (_jsxs(Select, { value: data || '', onValueChange: function (value) { return handleChange(path, value); }, disabled: !enabled, children: [_jsx(SelectTrigger, { className: className, children: _jsx(SelectValue, { placeholder: "Select option" }) }), _jsx(SelectContent, { children: options.map(function (option) { return (_jsx(SelectItem, { value: option.value, children: option.label }, option.value)); }) })] }));
};
export var shadcnOneOfEnumCellTester = rankWith(3, isOneOfEnumControl);
export default withJsonFormsOneOfEnumCellProps(withTranslateProps(React.memo(ShadcnOneOfEnumCell)), false);
