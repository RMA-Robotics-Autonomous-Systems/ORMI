import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Slider } from "../../../../../library/components/ui/slider";
import { Label } from "../../../../../library/components/ui/label";
import { cn } from "../../../../../library/lib/utils";
import { isDescriptionHidden, isRangeControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import { useFocus } from '../../utils';
export var ShadcnSliderControl = function (props) {
    var focused = useFocus()[0];
    var id = props.id, data = props.data, description = props.description, enabled = props.enabled, errors = props.errors, label = props.label, schema = props.schema, handleChange = props.handleChange, visible = props.visible, path = props.path, required = props.required, config = props.config;
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, props.uischema.options);
    var showDescription = !isDescriptionHidden(visible, description, focused, appliedUiSchemaOptions.showUnfocusedDescription);
    if (!visible) {
        return null;
    }
    return (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: id, className: cn("text-sm font-medium leading-none", required && "after:text-red-500 after:content-['*']"), children: label }), _jsxs("div", { className: "flex items-center space-x-4", children: [_jsx("span", { className: "text-sm", children: schema.minimum || 0 }), _jsx(Slider, { id: id, defaultValue: [data || schema.minimum || 0], min: schema.minimum || 0, max: schema.maximum || 100, step: schema.multipleOf || 1, disabled: !enabled, onValueChange: function (_a) {
                            var value = _a[0];
                            return handleChange(path, value);
                        }, className: cn("flex-1", !isValid && "border-red-500") }), _jsx("span", { className: "text-sm", children: schema.maximum || 100 })] }), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var shadcnSliderControlTester = rankWith(5, isRangeControl);
export default withJsonFormsControlProps(ShadcnSliderControl);
