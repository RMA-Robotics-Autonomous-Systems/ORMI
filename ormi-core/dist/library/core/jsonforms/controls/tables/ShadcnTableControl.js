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
import isEmpty from 'lodash/isEmpty';
import union from 'lodash/union';
import { DispatchCell, useJsonForms, } from '@jsonforms/react';
import startCase from 'lodash/startCase';
import range from 'lodash/range';
import React, { useMemo } from 'react';
import { errorAt, formatErrorMessage, Paths, Resolve, encode, } from '@jsonforms/core';
import NoBorderTableCell from './NoBorderTableCell';
import TableToolbar from './TableToolbar';
import merge from 'lodash/merge';
import { Table, TableBody, TableCell, TableRow, } from "../../../../../library/components/ui/table";
import { TrashIcon } from '@radix-ui/react-icons';
import { Button } from '../../../../../library/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../../../../library/components/ui/tooltip';
import { MoveDownIcon, MoveUpIcon } from 'lucide-react';
// we want a cell that doesn't automatically span
var styles = {
    fixedCell: {
        width: '150px',
        height: '50px',
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
    },
    fixedCellSmall: {
        width: '50px',
        height: '50px',
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
    },
};
var CustomTableCell = function (_a) {
    var propName = _a.propName, schema = _a.schema, title = _a.title, rowPath = _a.rowPath, enabled = _a.enabled, cells = _a.cells;
    return (_jsx(TableCell, { children: _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'auto auto', alignItems: "center", gap: '0.5rem' }, children: [title || propName, _jsx(NonEmptyCell, { rowPath: rowPath, propName: propName, schema: schema, enabled: enabled, cells: cells })] }) }));
};
var generateCells = function (schema, rowPath, enabled, cells) {
    if (schema.type === 'object') {
        return getValidColumnProps(schema).map(function (prop) {
            var _a, _b, _c;
            var cellPath = Paths.compose(rowPath, prop);
            return (_jsx(CustomTableCell, { propName: prop, schema: schema, title: (_c = (_b = (_a = schema.properties) === null || _a === void 0 ? void 0 : _a[prop]) === null || _b === void 0 ? void 0 : _b.title) !== null && _c !== void 0 ? _c : startCase(prop), rowPath: rowPath, cellPath: cellPath, enabled: enabled, cells: cells }, cellPath));
        });
    }
    // For primitives
    return (_jsx(CustomTableCell, { schema: schema, rowPath: rowPath, cellPath: rowPath, enabled: enabled }, rowPath));
};
var getValidColumnProps = function (scopedSchema) {
    if (scopedSchema.type === 'object' &&
        typeof scopedSchema.properties === 'object') {
        return Object.keys(scopedSchema.properties).filter(function (prop) { var _a, _b; return ((_b = (_a = scopedSchema.properties) === null || _a === void 0 ? void 0 : _a[prop]) === null || _b === void 0 ? void 0 : _b.type) !== 'array'; });
    }
    // primitives
    return [''];
};
var EmptyTable = function (_a) {
    var numColumns = _a.numColumns, translations = _a.translations;
    return (_jsx(TableRow, { children: _jsx(NoBorderTableCell, { colSpan: numColumns, children: _jsx("p", { children: translations.noDataMessage }) }) }));
};
var ctxToNonEmptyCellProps = function (ctx, ownProps) {
    var _a, _b, _c, _d;
    var path = ownProps.rowPath +
        (ownProps.schema.type === 'object' ? '.' + ownProps.propName : '');
    var errors = formatErrorMessage(union((_b = (_a = errorAt(path, ownProps.schema)(ctx.core)) === null || _a === void 0 ? void 0 : _a.map(function (error) { var _a; return (_a = error.message) !== null && _a !== void 0 ? _a : ''; })) !== null && _b !== void 0 ? _b : []));
    return {
        rowPath: ownProps.rowPath,
        propName: ownProps.propName,
        schema: ownProps.schema,
        rootSchema: (_d = (_c = ctx.core) === null || _c === void 0 ? void 0 : _c.schema) !== null && _d !== void 0 ? _d : {},
        errors: errors,
        path: path,
        enabled: ownProps.enabled,
        cells: ownProps.cells || ctx.cells,
        renderers: ownProps.renderers || ctx.renderers,
    };
};
var controlWithoutLabel = function (scope) { return ({
    type: 'Control',
    scope: scope,
    label: false,
}); };
var NonEmptyCellComponent = React.memo(function NonEmptyCellComponent(_a) {
    var path = _a.path, propName = _a.propName, schema = _a.schema, rootSchema = _a.rootSchema, errors = _a.errors, enabled = _a.enabled, renderers = _a.renderers, cells = _a.cells, isValid = _a.isValid;
    return (_jsxs("div", { children: [schema.properties ? (_jsx(DispatchCell, { schema: Resolve.schema(schema, "#/properties/".concat(encode(propName || '')), rootSchema), uischema: controlWithoutLabel("#/properties/".concat(encode(propName || ''))), path: path, enabled: enabled, renderers: renderers, cells: cells })) : (_jsx(DispatchCell, { schema: schema, uischema: controlWithoutLabel('#'), path: path, enabled: enabled, renderers: renderers, cells: cells })), !isValid && _jsx("p", { className: "text-sm text-destructive mt-1", children: errors })] }));
});
var NonEmptyCell = React.memo(function NonEmptyCell(ownProps) {
    var ctx = useJsonForms();
    var emptyCellProps = ctxToNonEmptyCellProps(ctx, ownProps);
    var isValid = isEmpty(emptyCellProps.errors);
    return _jsx(NonEmptyCellComponent, __assign({}, emptyCellProps, { isValid: isValid }));
});
var NonEmptyRowComponent = function (_a) {
    var childPath = _a.childPath, schema = _a.schema, rowIndex = _a.rowIndex, openDeleteDialog = _a.openDeleteDialog, moveUpCreator = _a.moveUpCreator, moveDownCreator = _a.moveDownCreator, showSortButtons = _a.showSortButtons, enabled = _a.enabled, cells = _a.cells, path = _a.path, translations = _a.translations, disableRemove = _a.disableRemove;
    var moveUp = useMemo(function () { return moveUpCreator(path, rowIndex); }, [moveUpCreator, path, rowIndex]);
    var moveDown = useMemo(function () { return moveDownCreator(path, rowIndex); }, [moveDownCreator, path, rowIndex]);
    return (_jsxs(TableRow, { children: [generateCells(schema, childPath, enabled, cells), enabled ? (_jsxs(NoBorderTableCell, { style: showSortButtons ? styles.fixedCell : styles.fixedCellSmall, children: [_jsx("div", { className: "flex justify-end items-center" }), showSortButtons ? (_jsxs(_Fragment, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { onClick: function () { return moveUp(); }, variant: 'ghost', children: _jsx(MoveUpIcon, {}) }) }), _jsx(TooltipContent, { children: translations.up })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { onClick: function () { return moveDown(); }, variant: 'ghost', children: _jsx(MoveDownIcon, {}) }) }), _jsx(TooltipContent, { children: translations.down })] })] })) : null, !disableRemove ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { onClick: function () { return openDeleteDialog(childPath, rowIndex); }, variant: 'ghost', children: _jsx(TrashIcon, {}) }) }), _jsx(TooltipContent, { children: translations.removeTooltip })] })) : null] })) : null] }, childPath));
};
export var NonEmptyRow = React.memo(NonEmptyRowComponent);
var TableRows = function (_a) {
    var data = _a.data, path = _a.path, schema = _a.schema, openDeleteDialog = _a.openDeleteDialog, moveUp = _a.moveUp, moveDown = _a.moveDown, uischema = _a.uischema, config = _a.config, enabled = _a.enabled, cells = _a.cells, translations = _a.translations, disableRemove = _a.disableRemove;
    var isEmptyTable = data === 0;
    if (isEmptyTable) {
        return (_jsx(EmptyTable, { numColumns: getValidColumnProps(schema).length + 1, translations: translations }));
    }
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    return (_jsx(React.Fragment, { children: range(data).map(function (index) {
            var childPath = Paths.compose(path, "".concat(index));
            return (_jsx(NonEmptyRow, { childPath: childPath, rowIndex: index, schema: schema, openDeleteDialog: openDeleteDialog, moveUpCreator: moveUp, moveDownCreator: moveDown, enableUp: index !== 0, enableDown: index !== data - 1, showSortButtons: appliedUiSchemaOptions.showSortButtons ||
                    appliedUiSchemaOptions.showArrayTableSortButtons, enabled: enabled, cells: cells, path: path, translations: translations, disableRemove: disableRemove }, childPath));
        }) }));
};
// Update the table structure in ShadcnTableControl
export var ShadcnTableControl = function (props) {
    var label = props.label, description = props.description, path = props.path, schema = props.schema, rootSchema = props.rootSchema, uischema = props.uischema, errors = props.errors, visible = props.visible, enabled = props.enabled, cells = props.cells, translations = props.translations, disableAdd = props.disableAdd, disableRemove = props.disableRemove, config = props.config;
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var doDisableAdd = disableAdd || appliedUiSchemaOptions.disableAdd;
    var doDisableRemove = disableRemove || appliedUiSchemaOptions.disableRemove;
    var controlElement = uischema;
    var isObjectSchema = schema.type === 'object';
    var headerCells = isObjectSchema
        ? generateCells(schema, path, enabled, cells)
        : undefined;
    if (!visible) {
        return null;
    }
    return (_jsx(TooltipProvider, { children: _jsx(Table, { children: _jsxs(TableBody, { children: [_jsx(TableToolbar, { errors: errors, label: label, description: description, addItem: props.addItem, numColumns: isObjectSchema ? headerCells.length : 1, path: path, uischema: controlElement, schema: schema, rootSchema: rootSchema, enabled: enabled, translations: translations, disableAdd: doDisableAdd }), _jsx(TableRows, __assign({}, props, { enabled: enabled, disableRemove: doDisableRemove }))] }) }) }));
};
