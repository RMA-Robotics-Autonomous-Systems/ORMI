import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, optionIs } from '@jsonforms/core';
import { Input } from '../../../../../library/components/ui/input';
import { Label } from '../../../../../library/components/ui/label';
import styles from "../../../../../library/core/jsonforms/utils/renderer.module.css";
var ColorSelectControl = function (props) {
    var data = props.data, handleChange = props.handleChange, path = props.path, label = props.label, id = props.id;
    return (_jsxs("div", { className: styles.cell, children: [_jsx(Label, { htmlFor: id, children: label }), _jsx(Input, { id: id, type: "color", value: data || '#000000', onChange: function (event) { return handleChange(path, event.target.value); } })] }));
};
export default withJsonFormsControlProps(ColorSelectControl);
// Define a tester that checks for a specific option in uischema
var colorSelectTester = rankWith(200, optionIs('color', true) // Check if 'async' option is true
);
export { colorSelectTester };
