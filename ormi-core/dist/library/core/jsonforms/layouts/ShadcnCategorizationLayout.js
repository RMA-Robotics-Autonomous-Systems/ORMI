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
import { createElement as _createElement } from "react";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useState, useMemo } from 'react';
import { AppBar, Tab, Tabs } from '@mui/material';
import { and, deriveLabelForUISchemaElement, isVisible, rankWith, uiTypeIs, } from '@jsonforms/core';
import { withJsonFormsLayoutProps, withTranslateProps, } from '@jsonforms/react';
import { ShadcnLayoutRenderer, withAjvProps, } from '../utils/layouts';
export var isSingleLevelCategorization = and(uiTypeIs('Categorization'), function (uischema) {
    var categorization = uischema;
    return (categorization.elements &&
        categorization.elements.reduce(function (acc, e) { return acc && e.type === 'Category'; }, true));
});
export var shadcnCategorizationTester = rankWith(2, isSingleLevelCategorization);
export var ShadcnCategorizationLayoutRenderer = function (props) {
    var data = props.data, path = props.path, renderers = props.renderers, cells = props.cells, schema = props.schema, uischema = props.uischema, visible = props.visible, enabled = props.enabled, selected = props.selected, onChange = props.onChange, ajv = props.ajv, t = props.t;
    var categorization = uischema;
    var _a = useState(uischema), previousCategorization = _a[0], setPreviousCategorization = _a[1];
    var _b = useState(selected !== null && selected !== void 0 ? selected : 0), activeCategory = _b[0], setActiveCategory = _b[1];
    var categories = useMemo(function () {
        return categorization.elements.filter(function (category) {
            return isVisible(category, data, '', ajv);
        });
    }, [categorization, data, ajv]);
    if (categorization !== previousCategorization) {
        setActiveCategory(0);
        setPreviousCategorization(categorization);
    }
    var safeCategory = activeCategory >= categorization.elements.length ? 0 : activeCategory;
    var childProps = {
        elements: categories[safeCategory] ? categories[safeCategory].elements : [],
        schema: schema,
        path: path,
        direction: 'column',
        enabled: enabled,
        visible: visible,
        renderers: renderers,
        cells: cells,
    };
    var onTabChange = function (_event, value) {
        if (onChange) {
            onChange(value, safeCategory);
        }
        setActiveCategory(value);
    };
    var tabLabels = useMemo(function () {
        return categories.map(function (e) { return e.type === 'Category' ? deriveLabelForUISchemaElement(e, t) : undefined; });
    }, [categories, t]);
    if (!visible) {
        return null;
    }
    return (_jsxs(_Fragment, { children: [_jsx(AppBar, { position: 'static', children: _jsx(Tabs, { value: safeCategory, onChange: onTabChange, textColor: 'inherit', indicatorColor: 'secondary', variant: 'scrollable', children: categories.map(function (_, idx) { return (_jsx(Tab, { label: tabLabels[idx] }, idx)); }) }) }), _jsx("div", { style: { marginTop: '0.5em' }, children: _createElement(ShadcnLayoutRenderer, __assign({}, childProps, { key: safeCategory })) })] }));
};
export default withAjvProps(withTranslateProps(withJsonFormsLayoutProps(ShadcnCategorizationLayoutRenderer)));
