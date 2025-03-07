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
import { rankWith, uiTypeIs, } from '@jsonforms/core';
import { ShadcnLayoutRenderer, } from '../utils/layouts';
import { withJsonFormsLayoutProps } from '@jsonforms/react';
/**
 * Default tester for a vertical layout.
 * @type {RankedTester}
 */
export var shadcnVerticalLayoutTester = rankWith(2, uiTypeIs('VerticalLayout'));
export var ShadcnVerticalLayoutRenderer = function (_a) {
    var uischema = _a.uischema, schema = _a.schema, path = _a.path, enabled = _a.enabled, visible = _a.visible, renderers = _a.renderers, cells = _a.cells;
    var verticalLayout = uischema;
    var childProps = {
        elements: verticalLayout.elements,
        schema: schema,
        path: path,
        enabled: enabled,
        direction: 'column',
        visible: visible,
    };
    return (_jsx(ShadcnLayoutRenderer, __assign({}, childProps, { renderers: renderers, cells: cells })));
};
export default withJsonFormsLayoutProps(ShadcnVerticalLayoutRenderer);
