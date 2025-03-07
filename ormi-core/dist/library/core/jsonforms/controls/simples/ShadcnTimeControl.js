import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Input } from "../../../../../library/components/ui/input";
import { Label } from "../../../../../library/components/ui/label";
import { cn } from "../../../../../library/lib/utils";
import { isTimeControl, isDescriptionHidden, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import { useFocus } from '../../utils';
export var ShadcnTimeControl = function (props) {
    var _a = useFocus(), focused = _a[0], onFocus = _a[1], onBlur = _a[2];
    var id = props.id, description = props.description, errors = props.errors, label = props.label, uischema = props.uischema, visible = props.visible, enabled = props.enabled, required = props.required, path = props.path, handleChange = props.handleChange, data = props.data, config = props.config;
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var showDescription = !isDescriptionHidden(visible, description, focused, appliedUiSchemaOptions.showUnfocusedDescription);
    if (!visible) {
        return null;
    }
    return (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: id, className: cn("text-sm font-medium leading-none", required && "after:text-red-500 after:content-['*']"), children: label }), _jsx(Input, { type: "time", id: id, value: data || '', onChange: function (e) { return handleChange(path, e.target.value); }, onFocus: onFocus, onBlur: onBlur, disabled: !enabled, className: cn("w-full", !isValid && "border-red-500") }), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var shadcnTimeControlTester = rankWith(5, isTimeControl);
export default withJsonFormsControlProps(ShadcnTimeControl);
