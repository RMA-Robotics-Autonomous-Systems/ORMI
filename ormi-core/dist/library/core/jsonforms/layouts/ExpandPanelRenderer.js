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
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/rules-of-hooks */
import merge from 'lodash/merge';
import React, { useMemo, useState, useEffect, useCallback, } from 'react';
import { JsonFormsDispatch, withJsonFormsContext, } from '@jsonforms/react';
import { composePaths, findUISchema, moveDown, moveUp, update, createId, removeId, computeChildLabel, } from '@jsonforms/core';
import { AccordionContent, AccordionItem, AccordionTrigger } from '../../../../library/components/ui/accordion';
import { MoveDownIcon, MoveUpIcon, TrashIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../library/components/ui/tooltip';
import { Button } from '../../../../library/components/ui/button';
var ExpandPanelRendererComponent = function (props) {
    var labelHtmlId = useState(createId('expand-panel'))[0];
    useEffect(function () {
        return function () {
            removeId(labelHtmlId);
        };
    }, [labelHtmlId]);
    var enabled = props.enabled, childLabel = props.childLabel, childPath = props.childPath, index = props.index, moveDown = props.moveDown, moveUp = props.moveUp, removeItems = props.removeItems, path = props.path, rootSchema = props.rootSchema, schema = props.schema, uischema = props.uischema, uischemas = props.uischemas, renderers = props.renderers, cells = props.cells, config = props.config, translations = props.translations, disableRemove = props.disableRemove;
    var foundUISchema = useMemo(function () {
        return findUISchema(uischemas, schema, uischema.scope, path, undefined, uischema, rootSchema);
    }, [uischemas, schema, uischema.scope, path, uischema, rootSchema]);
    var appliedUiSchemaOptions = merge({}, config, uischema.options);
    var showSortButtons = appliedUiSchemaOptions.showSortButtons ||
        appliedUiSchemaOptions.showArrayLayoutSortButtons;
    return (_jsx(AccordionItem, { value: childPath, children: _jsxs(TooltipProvider, { children: [_jsxs("div", { className: 'flex flex-row items-center', children: [_jsxs("div", { className: 'flex flex-row gap-3 items-center', children: [enabled && !disableRemove && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { onClick: function (e) {
                                                    e.stopPropagation();
                                                    removeItems(path, [index])(e);
                                                }, variant: 'ghost', children: _jsx(TrashIcon, {}) }) }), _jsx(TooltipContent, { children: translations.removeTooltip })] })), showSortButtons && enabled && (_jsxs(_Fragment, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { onClick: function (e) {
                                                            e.stopPropagation();
                                                            moveUp(path, index)(e);
                                                        }, variant: 'ghost', children: _jsx(MoveUpIcon, {}) }) }), _jsx(TooltipContent, { children: translations.up })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { onClick: function (e) {
                                                            e.stopPropagation();
                                                            moveDown(path, index)(e);
                                                        }, variant: 'ghost', children: _jsx(MoveDownIcon, {}) }) }), _jsx(TooltipContent, { children: translations.down })] })] }))] }), _jsx("div", { className: 'w-full', children: _jsx(AccordionTrigger, { children: childLabel ? (_jsx("span", { id: labelHtmlId, children: childLabel })) : (_jsx("span", { id: labelHtmlId, children: "No title found" })) }) })] }), _jsx(AccordionContent, { children: _jsx(JsonFormsDispatch, { enabled: enabled, schema: schema, uischema: foundUISchema, path: childPath, renderers: renderers, cells: cells }, childPath) })] }) }));
};
export var ExpandPanelRenderer = React.memo(ExpandPanelRendererComponent);
/**
 * Maps state to dispatch properties of an expand pandel control.
 *
 * @param dispatch the store's dispatch method
 * @returns {DispatchPropsOfArrayControl} dispatch props of an expand panel control
 */
export var ctxDispatchToExpandPanelProps = function (dispatch) { return ({
    removeItems: useCallback(function (path, toDelete) {
        return function (event) {
            event.stopPropagation();
            dispatch(update(path, function (array) {
                toDelete
                    .sort()
                    .reverse()
                    .forEach(function (s) { return array.splice(s, 1); });
                return array;
            }, { type: 'REMOVE', indices: toDelete }));
        };
    }, [dispatch]),
    moveUp: useCallback(function (path, toMove) {
        return function (event) {
            event.stopPropagation();
            dispatch(update(path, function (array) {
                moveUp(array, toMove);
                return array;
            }, {
                type: 'MOVE',
                moves: [{ from: toMove, to: toMove - 1 }],
            }));
        };
    }, [dispatch]),
    moveDown: useCallback(function (path, toMove) {
        return function (event) {
            event.stopPropagation();
            dispatch(update(path, function (array) {
                moveDown(array, toMove);
                return array;
            }, {
                type: 'MOVE',
                moves: [{ from: toMove, to: toMove + 1 }],
            }));
        };
    }, [dispatch]),
}); };
/**
 * Map state to control props.
 * @param state the JSON Forms state
 * @param ownProps any own props
 * @returns {StatePropsOfControl} state props for a control
 */
export var withContextToExpandPanelProps = function (Component) {
    return function WithContextToExpandPanelProps(_a) {
        var ctx = _a.ctx, props = _a.props;
        if (!ctx.dispatch) {
            throw new Error('dispatch is undefined');
        }
        var dispatchProps = ctxDispatchToExpandPanelProps(ctx.dispatch);
        var 
        // eslint is unable to detect that these props are "checked" via Typescript already
        // eslint-disable-next-line react/prop-types
        childLabelProp = props.childLabelProp, 
        // eslint-disable-next-line react/prop-types
        schema = props.schema, 
        // eslint-disable-next-line react/prop-types
        uischema = props.uischema, 
        // eslint-disable-next-line react/prop-types
        rootSchema = props.rootSchema, 
        // eslint-disable-next-line react/prop-types
        path = props.path, 
        // eslint-disable-next-line react/prop-types
        index = props.index, 
        // eslint-disable-next-line react/prop-types
        uischemas = props.uischemas;
        var childPath = composePaths(path, "".concat(index));
        var childLabel = useMemo(function () {
            return computeChildLabel(ctx.core.data, childPath, childLabelProp, schema, rootSchema, ctx.i18n.translate, uischema);
        }, [
            ctx.core.data,
            childPath,
            childLabelProp,
            schema,
            rootSchema,
            ctx.i18n.translate,
            uischema,
        ]);
        return (_jsx(Component, __assign({}, props, dispatchProps, { childLabel: childLabel, childPath: childPath, uischemas: uischemas })));
    };
};
export var withJsonFormsExpandPanelProps = function (Component) {
    return withJsonFormsContext(withContextToExpandPanelProps(Component));
};
export default withJsonFormsExpandPanelProps(ExpandPanelRenderer);
