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
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { rankWith, uiTypeIs, } from '@jsonforms/core';
import { withJsonFormsLayoutProps } from '@jsonforms/react';
import { ShadcnLayoutRenderer, } from '../utils/layouts';
/**
 * Default tester for a horizontal layout.
 * @type {RankedTester}
 */
export var shadcnHorizontalLayoutTester = rankWith(5, uiTypeIs('HorizontalLayout'));
export var ShadcnHorizontalLayoutRenderer = function (_a) {
    var uischema = _a.uischema, renderers = _a.renderers, cells = _a.cells, schema = _a.schema, path = _a.path, enabled = _a.enabled, visible = _a.visible;
    var layout = uischema;
    var childProps = {
        elements: layout.elements,
        schema: schema,
        path: path,
        enabled: enabled,
        direction: 'row',
        visible: visible,
    };
    return (_jsxs(_Fragment, { children: [_jsx("p", { children: "dsqd" }), _jsx(ShadcnLayoutRenderer, __assign({}, childProps, { renderers: renderers, cells: cells }))] }));
};
export default withJsonFormsLayoutProps(ShadcnHorizontalLayoutRenderer);
