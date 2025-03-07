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
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import merge from 'lodash/merge';
import { Button, Step, StepButton, Stepper } from '@mui/material';
import { and, categorizationHasCategory, deriveLabelForUISchemaElement, isVisible, optionIs, rankWith, uiTypeIs, } from '@jsonforms/core';
import { withJsonFormsLayoutProps, withTranslateProps, } from '@jsonforms/react';
import { ShadcnLayoutRenderer, withAjvProps, } from '../utils/layouts';
export var shadcnCategorizationStepperTester = rankWith(3, and(uiTypeIs('Categorization'), categorizationHasCategory, optionIs('variant', 'stepper')));
export var ShadcnCategorizationStepperLayoutRenderer = function (props) {
    var _a = useState(0), activeCategory = _a[0], setActiveCategory = _a[1];
    var handleStep = function (step) {
        setActiveCategory(step);
    };
    var data = props.data, path = props.path, renderers = props.renderers, schema = props.schema, uischema = props.uischema, visible = props.visible, cells = props.cells, config = props.config, ajv = props.ajv, t = props.t;
    var categorization = uischema;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var buttonWrapperStyle = {
        textAlign: 'right',
        width: '100%',
        margin: '1em auto',
    };
    var buttonNextStyle = {
        float: 'right',
    };
    var buttonStyle = {
        marginRight: '1em',
    };
    var categories = useMemo(function () {
        return categorization.elements.filter(function (category) {
            return isVisible(category, data, '', ajv);
        });
    }, [categorization, data, ajv]);
    var childProps = {
        elements: categories[activeCategory].elements,
        schema: schema,
        path: path,
        direction: 'column',
        visible: visible,
        renderers: renderers,
        cells: cells,
    };
    var tabLabels = useMemo(function () {
        return categories.map(function (e) { return e.type === 'Category' ? deriveLabelForUISchemaElement(e, t) : undefined; });
    }, [categories, t]);
    if (!visible) {
        return null;
    }
    return (_jsxs(_Fragment, { children: [_jsx(Stepper, { activeStep: activeCategory, nonLinear: true, children: categories.map(function (_, idx) { return (_jsx(Step, { children: _jsx(StepButton, { onClick: function () { return handleStep(idx); }, children: tabLabels[idx] }) }, tabLabels[idx])); }) }), _jsx("div", { children: _jsx(ShadcnLayoutRenderer, __assign({}, childProps)) }), appliedUiSchemaOptions.showNavButtons ? (_jsxs("div", { style: buttonWrapperStyle, children: [_jsx(Button, { style: buttonNextStyle, variant: 'contained', color: 'primary', disabled: activeCategory >= categories.length - 1, onClick: function () { return handleStep(activeCategory + 1); }, children: "Next" }), _jsx(Button, { style: buttonStyle, color: 'secondary', variant: 'contained', disabled: activeCategory <= 0, onClick: function () { return handleStep(activeCategory - 1); }, children: "Previous" })] })) : (_jsx(_Fragment, {}))] }));
};
export default withAjvProps(withTranslateProps(withJsonFormsLayoutProps(ShadcnCategorizationStepperLayoutRenderer)));
