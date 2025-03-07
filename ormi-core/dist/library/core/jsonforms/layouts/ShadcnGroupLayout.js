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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
  The MIT License

  Copyright (c) 2017-2019 EclipseSource Munich
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
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
import isEmpty from 'lodash/isEmpty';
import React from 'react';
import { rankWith, uiTypeIs, withIncreasedRank, } from '@jsonforms/core';
import { ShadcnLayoutRenderer, } from '../utils/layouts';
import { withJsonFormsLayoutProps } from '@jsonforms/react';
export var groupTester = rankWith(1, uiTypeIs('Group'));
var GroupComponent = React.memo(function GroupComponent(_a) {
    var visible = _a.visible, enabled = _a.enabled, uischema = _a.uischema, label = _a.label, props = __rest(_a, ["visible", "enabled", "uischema", "label"]);
    var groupLayout = uischema;
    return (_jsxs("div", { children: [!isEmpty(label) && _jsx("h2", { children: label }), _jsx(ShadcnLayoutRenderer, __assign({}, props, { visible: visible, enabled: enabled, elements: groupLayout.elements }))] }));
});
export var ShadcnGroupLayoutRenderer = function (_a) {
    var uischema = _a.uischema, schema = _a.schema, path = _a.path, visible = _a.visible, enabled = _a.enabled, renderers = _a.renderers, cells = _a.cells, direction = _a.direction, label = _a.label;
    var groupLayout = uischema;
    return (_jsx(GroupComponent, { elements: groupLayout.elements, schema: schema, path: path, direction: "column", visible: visible, enabled: enabled, uischema: uischema, renderers: renderers, cells: cells, label: label }));
};
export default withJsonFormsLayoutProps(ShadcnGroupLayoutRenderer);
export var shadcnGroupTester = withIncreasedRank(2, groupTester);
