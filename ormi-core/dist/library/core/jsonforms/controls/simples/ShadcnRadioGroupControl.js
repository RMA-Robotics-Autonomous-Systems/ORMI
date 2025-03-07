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
import { and, isEnumControl, optionIs, rankWith, } from '@jsonforms/core';
import { withJsonFormsEnumProps } from '@jsonforms/react';
import { ShadcnRadioGroup } from './ShadcnRadioGroup';
export var ShadcnRadioGroupControl = function (props) {
    return _jsx(ShadcnRadioGroup, __assign({}, props));
};
export var shadcnRadioGroupControlTester = rankWith(21, and(isEnumControl, optionIs('format', 'radio')));
export default withJsonFormsEnumProps(ShadcnRadioGroupControl);
