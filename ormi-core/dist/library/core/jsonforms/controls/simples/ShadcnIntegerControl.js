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
import { Input } from "../../../../../library/components/ui/input";
import { isIntegerControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { ShadcnInputControl } from './ShadcnInputControl';
var ShadcnInputInteger = function (props) {
    var id = props.id, enabled = props.enabled, path = props.path, handleChange = props.handleChange, data = props.data;
    return (_jsx(Input, { type: "number", value: data === undefined || data === null ? '' : data, onChange: function (ev) {
            var value = ev.target.value;
            handleChange(path, value === '' ? undefined : parseInt(value, 10));
        }, step: 1, disabled: !enabled, id: id }));
};
export var ShadcnIntegerControl = function (props) { return (_jsx(ShadcnInputControl, __assign({}, props, { input: ShadcnInputInteger }))); };
export var shadcnIntegerControlTester = rankWith(3, isIntegerControl);
export default withJsonFormsControlProps(ShadcnIntegerControl);
