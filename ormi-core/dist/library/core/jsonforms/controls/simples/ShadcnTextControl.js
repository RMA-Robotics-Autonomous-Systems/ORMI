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
import { isStringControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { ShadcnInputControl } from './ShadcnInputControl';
var ShadcnInputText = function (props) {
    var id = props.id, enabled = props.enabled, schema = props.schema, path = props.path, handleChange = props.handleChange, data = props.data;
    return (_jsx(Input, { type: "text", value: data || schema.default || schema.const || '', onChange: function (ev) { return handleChange(path, ev.target.value); }, disabled: !enabled, id: id }));
};
export var ShadcnTextControl = function (props) { return (_jsx(ShadcnInputControl, __assign({}, props, { input: ShadcnInputText }))); };
export var shadcnTextControlTester = rankWith(2, isStringControl);
export default withJsonFormsControlProps(ShadcnTextControl);
