import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
  The MIT License

  Copyright (c) 2017-2021 EclipseSource Munich
  https://github.com/eclipsesource/jsonforms

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. INFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
import { Switch } from "../../../../../library/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "../../../../../library/components/ui/tooltip";
import { isBooleanControl, rankWith, optionIs, and, isDescriptionHidden, } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
export var ShadcnBooleanToggleControl = function (_a) {
    var data = _a.data, visible = _a.visible, label = _a.label, id = _a.id, enabled = _a.enabled, uischema = _a.uischema, handleChange = _a.handleChange, errors = _a.errors, path = _a.path, config = _a.config, description = _a.description;
    var isValid = errors.length === 0;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var showDescription = !isDescriptionHidden(visible, description, false, appliedUiSchemaOptions.showUnfocusedDescription);
    var showTooltip = !showDescription && !isDescriptionHidden(visible, description, true, true);
    if (!visible) {
        return null;
    }
    var control = (_jsxs("div", { className: style.cell, children: [_jsx(Switch, { id: id, checked: data || false, disabled: !enabled, onCheckedChange: function (checked) { return handleChange(path, checked); } }), _jsx("label", { htmlFor: id, className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: label })] }));
    return (_jsxs("div", { className: style.cell, children: [showTooltip ? (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: control }), _jsx(TooltipContent, { children: description })] }) })) : (control), showDescription && (_jsx("p", { className: "text-sm text-muted-foreground", children: description })), !isValid && (_jsx("p", { className: "text-sm text-destructive", children: errors }))] }));
};
export var shadcnBooleanToggleControlTester = rankWith(5, and(isBooleanControl, optionIs('toggle', true)));
export default withJsonFormsControlProps(ShadcnBooleanToggleControl);
