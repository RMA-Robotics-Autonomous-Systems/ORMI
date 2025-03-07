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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { RadioGroup, RadioGroupItem } from "../../../../../library/components/ui/radio-group";
import { Label } from "../../../../../library/components/ui/label";
import { cn } from "../../../../../library/lib/utils";
import { and, isOneOfEnumControl, optionIs, rankWith, isDescriptionHidden, } from '@jsonforms/core';
import { withJsonFormsOneOfEnumProps } from '@jsonforms/react';
import merge from 'lodash/merge';
export var ShadcnRadioGroup = function (_a) {
    var data = _a.data, enabled = _a.enabled, id = _a.id, label = _a.label, options = _a.options, path = _a.path, handleChange = _a.handleChange, errors = _a.errors, description = _a.description, config = _a.config, uischema = _a.uischema;
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var showDescription = !isDescriptionHidden(true, description, false, appliedUiSchemaOptions.showUnfocusedDescription);
    return (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { className: cn("text-sm font-medium", !isValid && "text-destructive"), children: label }), _jsx(RadioGroup, { defaultValue: data, onValueChange: function (value) { return handleChange(path, value); }, disabled: !enabled, className: "space-y-1", children: options.map(function (option) { return (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(RadioGroupItem, { value: option.value, id: "".concat(id, "-").concat(option.value) }), _jsx(Label, { htmlFor: "".concat(id, "-").concat(option.value), children: option.label })] }, option.value)); }) }), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var ShadcnOneOfRadioGroupControl = function (props) {
    return _jsx(ShadcnRadioGroup, __assign({}, props));
};
export var shadcnOneOfRadioGroupControlTester = rankWith(21, and(isOneOfEnumControl, optionIs('format', 'radio')));
export default withJsonFormsOneOfEnumProps(ShadcnOneOfRadioGroupControl);
