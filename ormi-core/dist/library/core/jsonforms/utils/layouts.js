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
import { getAjv, } from '@jsonforms/core';
import { JsonFormsDispatch, useJsonForms } from '@jsonforms/react';
export var renderLayoutElements = function (elements, schema, path, enabled, renderers, cells) {
    return elements.map(function (child, index) { return (_jsx("div", { children: _jsx(JsonFormsDispatch, { uischema: child, schema: schema, path: path, enabled: enabled, renderers: renderers, cells: cells }) }, "".concat(path, "-").concat(index))); });
};
var shadcnLayoutRendererComponent = function (_a) {
    var elements = _a.elements, schema = _a.schema, path = _a.path, enabled = _a.enabled, direction = _a.direction, renderers = _a.renderers, cells = _a.cells;
    if (isEmpty(elements)) {
        return null;
    }
    else {
        return (_jsx("div", { className: "flex flex-".concat((direction == "column") ? 'col' : 'row', " flex-wrap gap-3"), children: renderLayoutElements(elements, schema, path, enabled, renderers, cells) }));
    }
};
export var ShadcnLayoutRenderer = React.memo(shadcnLayoutRendererComponent);
export var withAjvProps = function (Component) {
    return function WithAjvProps(props) {
        var ctx = useJsonForms();
        var ajv = getAjv({ jsonforms: __assign({}, ctx) });
        return _jsx(Component, __assign({}, props, { ajv: ajv }));
    };
};
