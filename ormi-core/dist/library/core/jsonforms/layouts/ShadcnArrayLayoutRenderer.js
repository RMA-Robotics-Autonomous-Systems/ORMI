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
import { useCallback } from 'react';
import { isObjectArrayWithNesting, rankWith, } from '@jsonforms/core';
import { ShadCNArrayLayout } from './ShadcnArrayLayout';
import { withArrayTranslationProps, withJsonFormsArrayLayoutProps, withTranslateProps, } from '@jsonforms/react';
export var shadcnArrayLayoutRenderer = function (_a) {
    var visible = _a.visible, addItem = _a.addItem, translations = _a.translations, props = __rest(_a, ["visible", "addItem", "translations"]);
    var addItemCb = useCallback(function (p, value) { return addItem(p, value); }, [addItem]);
    if (!visible) {
        return null;
    }
    return (_jsx("div", { children: _jsx(ShadCNArrayLayout, __assign({ translations: translations, visible: visible, addItem: addItemCb }, props)) }));
};
export var shadcnArrayLayoutTester = rankWith(10, isObjectArrayWithNesting);
export default withJsonFormsArrayLayoutProps(withTranslateProps(withArrayTranslationProps(shadcnArrayLayoutRenderer)));
