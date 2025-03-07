import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isControl, and, isStringControl } from '@jsonforms/core';
import { Label } from '../../../../../library/components/ui/label';
import { Input } from '../../../../../library/components/ui/input';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
var TextControl = function (props) {
    var data = props.data, handleChange = props.handleChange, path = props.path, label = props.label, id = props.id, schema = props.schema;
    return (_jsxs("div", { className: style.cell, children: [(!schema.const) && _jsx(Label, { htmlFor: id, children: label }), _jsx(Input, { id: id, type: "text", value: data || schema.default || schema.const || '', onChange: function (event) { return handleChange(path, event.target.value); }, hidden: schema.const !== undefined })] }));
};
export default withJsonFormsControlProps(TextControl);
// Define a tester that checks for a specific option in uischema; the type of the field is 'boolean'
var TextTester = rankWith(5, // Increase rank to ensure this tester is selected when applicable
and(isControl, isStringControl));
export { TextTester };
