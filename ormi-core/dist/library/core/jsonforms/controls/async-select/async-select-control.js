import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isControl, and, optionIs } from '@jsonforms/core';
import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "../../../../../library/components/ui/select";
import { Label } from '../../../../../library/components/ui/label';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
var AsyncSelectControl = function (props) {
    var data = props.data, handleChange = props.handleChange, path = props.path, uischema = props.uischema, label = props.label;
    var _a = useState([]), options = _a[0], setOptions = _a[1];
    useEffect(function () {
        var _a;
        var asyncFunction = (_a = uischema.options) === null || _a === void 0 ? void 0 : _a.asyncFunction;
        if (asyncFunction) {
            asyncFunction().then(function (result) {
                setOptions(result);
            });
        }
    }, [uischema]);
    return (_jsxs("div", { className: style.cell, children: [_jsx(Label, { children: label }), _jsxs(Select, { value: data, onValueChange: function (value) { return handleChange(path, value); }, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, { placeholder: "Select an option" }) }), _jsx(SelectContent, { children: options.map(function (option) { return (_jsx(SelectItem, { value: option.value, children: option.label }, option.value)); }) })] })] }));
};
export default withJsonFormsControlProps(AsyncSelectControl);
// Define a tester that checks for a specific option in uischema
var asyncSelectTester = rankWith(5, // Increase rank to ensure this tester is selected when applicable
and(isControl, optionIs('async', true) // Check if 'async' option is true
));
export { asyncSelectTester };
