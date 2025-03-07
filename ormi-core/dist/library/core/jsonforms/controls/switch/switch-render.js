import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isControl, and, isBooleanControl } from '@jsonforms/core';
import { Switch } from '../../../../../library/components/ui/switch';
import { Label } from '../../../../../library/components/ui/label';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
var SwitchControl = function (props) {
    var data = props.data, handleChange = props.handleChange, path = props.path, label = props.label, id = props.id;
    return (_jsxs("div", { className: style.cell, children: [_jsx(Label, { htmlFor: id, children: label }), _jsx(Switch, { id: id, onCheckedChange: function (value) { return handleChange(path, value); }, checked: data })] }));
};
export default withJsonFormsControlProps(SwitchControl);
// Define a tester that checks for a specific option in uischema; the type of the field is 'boolean'
var switchTester = rankWith(100, // Increase rank to ensure this tester is selected when applicable
and(isControl, isBooleanControl));
export { switchTester };
