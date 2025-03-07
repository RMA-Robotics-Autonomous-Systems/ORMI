import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isDateControl, isDescriptionHidden, isTimeControl, or, rankWith, } from '@jsonforms/core';
import { Input } from "../../../../../library/components/ui/input";
import { Label } from "../../../../../library/components/ui/label";
import { cn } from "../../../../../library/lib/utils";
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import { useDebouncedChange, useFocus } from '../../utils';
export var ShadcnNativeControl = function (props) {
    var _a;
    var focused = useFocus()[0];
    var id = props.id, errors = props.errors, label = props.label, schema = props.schema, description = props.description, enabled = props.enabled, visible = props.visible, required = props.required, path = props.path, handleChange = props.handleChange, data = props.data, config = props.config;
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, props.uischema.options);
    var _b = useDebouncedChange(handleChange, '', data, path), inputValue = _b[0], onChange = _b[1];
    var fieldType = (_a = appliedUiSchemaOptions.format) !== null && _a !== void 0 ? _a : schema.format;
    var showDescription = !isDescriptionHidden(visible, description, focused, appliedUiSchemaOptions.showUnfocusedDescription);
    if (!visible) {
        return null;
    }
    return (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: id + '-input', className: cn("text-sm font-medium leading-none", required && "after:text-red-500 after:content-['*']"), children: label }), _jsx(Input, { id: id + '-input', type: fieldType, disabled: !enabled, className: cn("w-full", !isValid && "border-red-500", !appliedUiSchemaOptions.trim && "w-full"), value: inputValue, onChange: onChange }), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var shadcnNativeControlTester = rankWith(3, or(isDateControl, isTimeControl));
export default withJsonFormsControlProps(ShadcnNativeControl);
