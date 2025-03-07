import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isControl, and, isNumberControl } from '@jsonforms/core';
import { Label } from '../../../../../library/components/ui/label';
import { Input } from '../../../../../library/components/ui/input';
import { useEffect } from 'react';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
var NumberControl = function (props) {
    var data = props.data, handleChange = props.handleChange, path = props.path, label = props.label, id = props.id, schema = props.schema;
    var parseValue = function (value) {
        if (!value)
            return 0;
        return Number(value);
    };
    useEffect(function () {
        if (data === undefined) {
            handleChange(path, schema.default || 0);
        }
    }, []);
    return (_jsxs("div", { className: style.cell, children: [_jsx(Label, { htmlFor: id, children: label }), _jsx(Input, { id: id, type: "number", value: data || schema.default || '', onChange: function (event) { return handleChange(path, parseValue(event.target.value)); } })] }));
};
export default withJsonFormsControlProps(NumberControl);
// Define a tester that checks for a specific option in uischema; the type of the field is 'boolean'
var NumberTester = rankWith(5, // Increase rank to ensure this tester is selected when applicable
and(isControl, isNumberControl));
export { NumberTester };
