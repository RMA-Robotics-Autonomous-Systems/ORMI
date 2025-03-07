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
import range from 'lodash/range';
import React, { useState, useCallback } from 'react';
import { composePaths, computeLabel, createDefaultValue, } from '@jsonforms/core';
import map from 'lodash/map';
import { ArrayLayoutToolbar } from './ArrayToolbar';
import ExpandPanelRenderer from './ExpandPanelRenderer';
import merge from 'lodash/merge';
import { Accordion } from '../../../../library/components/ui/accordion';
var ShadCNArrayLayoutComponent = function (props) {
    var _a = useState(false), expanded = _a[0], setExpanded = _a[1];
    var innerCreateDefaultValue = useCallback(function () { return createDefaultValue(props.schema, props.rootSchema); }, [props.schema]);
    var handleChange = useCallback(function (panel) { return function (_event, expandedPanel) {
        setExpanded(expandedPanel ? panel : false);
    }; }, []);
    var isExpanded = function (index) {
        return expanded === composePaths(props.path, "".concat(index));
    };
    var enabled = props.enabled, data = props.data, path = props.path, schema = props.schema, uischema = props.uischema, errors = props.errors, addItem = props.addItem, renderers = props.renderers, cells = props.cells, label = props.label, required = props.required, rootSchema = props.rootSchema, config = props.config, uischemas = props.uischemas, description = props.description, disableAdd = props.disableAdd, disableRemove = props.disableRemove, translations = props.translations;
    var appliedUiSchemaOptions = merge({}, config, props.uischema.options);
    var doDisableAdd = disableAdd || appliedUiSchemaOptions.disableAdd;
    var doDisableRemove = disableRemove || appliedUiSchemaOptions.disableRemove;
    return (_jsxs("div", { children: [_jsx(ArrayLayoutToolbar, { translations: translations, label: computeLabel(label, required, appliedUiSchemaOptions.hideRequiredAsterisk), description: description, errors: errors, path: path, enabled: enabled, addItem: addItem, createDefault: innerCreateDefaultValue, disableAdd: doDisableAdd }), _jsx(Accordion, { type: "multiple", children: data > 0 ? (map(range(data), function (index) {
                    return (_jsx(ExpandPanelRenderer, { enabled: enabled, index: index, expanded: isExpanded(index), schema: schema, path: path, handleExpansion: handleChange, uischema: uischema, renderers: renderers, cells: cells, rootSchema: rootSchema, enableMoveUp: index != 0, enableMoveDown: index < data - 1, config: config, childLabelProp: appliedUiSchemaOptions.elementLabelProp, uischemas: uischemas, translations: translations, disableRemove: doDisableRemove }, index));
                })) : (_jsx("p", { children: translations.noDataMessage })) })] }));
};
export var ShadCNArrayLayout = React.memo(ShadCNArrayLayoutComponent);
