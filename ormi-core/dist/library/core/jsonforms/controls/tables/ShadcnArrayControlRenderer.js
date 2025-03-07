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
import { useCallback, useState } from 'react';
import { isObjectArrayControl, isPrimitiveArrayControl, or, rankWith, } from '@jsonforms/core';
import { withArrayTranslationProps, withJsonFormsArrayLayoutProps, withTranslateProps, } from '@jsonforms/react';
import { ShadcnTableControl } from './ShadcnTableControl';
import { DeleteDialog } from './DeleteDialog';
export var ShadcnArrayControlRenderer = function (props) {
    var _a = useState(false), open = _a[0], setOpen = _a[1];
    var _b = useState(undefined), path = _b[0], setPath = _b[1];
    var _c = useState(undefined), rowData = _c[0], setRowData = _c[1];
    var removeItems = props.removeItems, visible = props.visible, translations = props.translations;
    var openDeleteDialog = useCallback(function (p, rowIndex) {
        setOpen(true);
        setPath(p);
        setRowData(rowIndex);
    }, [setOpen, setPath, setRowData]);
    var deleteCancel = useCallback(function () { return setOpen(false); }, [setOpen]);
    var deleteConfirm = useCallback(function () {
        var p = path.substring(0, path.lastIndexOf('.'));
        removeItems(p, [rowData])();
        setOpen(false);
    }, [setOpen, path, rowData]);
    var deleteClose = useCallback(function () { return setOpen(false); }, [setOpen]);
    if (!visible) {
        return null;
    }
    return (_jsxs(_Fragment, { children: [_jsx(ShadcnTableControl, __assign({}, props, { openDeleteDialog: openDeleteDialog, translations: translations })), _jsx(DeleteDialog, { open: open, onCancel: deleteCancel, onConfirm: deleteConfirm, onClose: deleteClose, acceptText: translations.deleteDialogAccept, declineText: translations.deleteDialogDecline, title: translations.deleteDialogTitle, message: translations.deleteDialogMessage })] }));
};
export var shadcnArrayControlTester = rankWith(4, or(isObjectArrayControl, isPrimitiveArrayControl));
export default withJsonFormsArrayLayoutProps(withTranslateProps(withArrayTranslationProps(ShadcnArrayControlRenderer)));
