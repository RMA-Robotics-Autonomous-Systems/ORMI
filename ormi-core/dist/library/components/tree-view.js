/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
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
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../library/lib/utils';
var treeVariants = cva('group hover:before:opacity-100 before:absolute before:rounded-lg before:left-0 px-2 before:w-full before:opacity-0 before:bg-accent/70 before:h-[2rem] before:-z-10');
var selectedTreeVariants = cva('before:opacity-100 before:bg-accent/70 text-accent-foreground');
var TreeView = React.forwardRef(function (_a, ref) {
    var data = _a.data, initialSelectedItemId = _a.initialSelectedItemId, onSelectChange = _a.onSelectChange, expandAll = _a.expandAll, defaultLeafIcon = _a.defaultLeafIcon, defaultNodeIcon = _a.defaultNodeIcon, className = _a.className, props = __rest(_a, ["data", "initialSelectedItemId", "onSelectChange", "expandAll", "defaultLeafIcon", "defaultNodeIcon", "className"]);
    var _b = React.useState(initialSelectedItemId), selectedItemId = _b[0], setSelectedItemId = _b[1];
    var handleSelectChange = React.useCallback(function (item) {
        setSelectedItemId(item === null || item === void 0 ? void 0 : item.id);
        if (onSelectChange) {
            onSelectChange(item);
        }
    }, [onSelectChange]);
    var expandedItemIds = React.useMemo(function () {
        if (!initialSelectedItemId) {
            return [];
        }
        var ids = [];
        function walkTreeItems(items, targetId) {
            if (items instanceof Array) {
                for (var i = 0; i < items.length; i++) {
                    ids.push(items[i].id);
                    if (walkTreeItems(items[i], targetId) && !expandAll) {
                        return true;
                    }
                    if (!expandAll)
                        ids.pop();
                }
            }
            else if (!expandAll && items.id === targetId) {
                return true;
            }
            else if (items.children) {
                return walkTreeItems(items.children, targetId);
            }
        }
        walkTreeItems(data, initialSelectedItemId);
        return ids;
    }, [data, expandAll, initialSelectedItemId]);
    return (_jsx("div", { className: cn('overflow-hidden relative p-2', className), children: _jsx(TreeItem, __assign({ data: data, ref: ref, selectedItemId: selectedItemId, handleSelectChange: handleSelectChange, expandedItemIds: expandedItemIds, defaultLeafIcon: defaultLeafIcon, defaultNodeIcon: defaultNodeIcon }, props)) }));
});
TreeView.displayName = 'TreeView';
var TreeItem = React.forwardRef(function (_a, ref) {
    var className = _a.className, data = _a.data, selectedItemId = _a.selectedItemId, handleSelectChange = _a.handleSelectChange, expandedItemIds = _a.expandedItemIds, defaultNodeIcon = _a.defaultNodeIcon, defaultLeafIcon = _a.defaultLeafIcon, props = __rest(_a, ["className", "data", "selectedItemId", "handleSelectChange", "expandedItemIds", "defaultNodeIcon", "defaultLeafIcon"]);
    if (!(data instanceof Array)) {
        data = [data];
    }
    return (_jsx("div", __assign({ ref: ref, role: "tree", className: className }, props, { children: _jsx("ul", { children: data.map(function (item) { return (_jsx("li", { children: item.children ? (_jsx(TreeNode, { item: item, selectedItemId: selectedItemId, expandedItemIds: expandedItemIds, handleSelectChange: handleSelectChange, defaultNodeIcon: defaultNodeIcon, defaultLeafIcon: defaultLeafIcon })) : (_jsx(TreeLeaf, { item: item, selectedItemId: selectedItemId, handleSelectChange: handleSelectChange, defaultLeafIcon: defaultLeafIcon })) }, item.id)); }) }) })));
});
TreeItem.displayName = 'TreeItem';
var TreeNode = function (_a) {
    var item = _a.item, handleSelectChange = _a.handleSelectChange, expandedItemIds = _a.expandedItemIds, selectedItemId = _a.selectedItemId, defaultNodeIcon = _a.defaultNodeIcon, defaultLeafIcon = _a.defaultLeafIcon;
    var hasChildren = item.children && item.children.length > 0;
    var _b = React.useState(expandedItemIds.includes(item.id) ? [item.id] : []), value = _b[0], setValue = _b[1];
    return (_jsx(_Fragment, { children: hasChildren ? (_jsx(AccordionPrimitive.Root, { type: "multiple", value: value, onValueChange: function (s) { return setValue(s); }, children: _jsxs(AccordionPrimitive.Item, { value: item.id, children: [_jsxs(AccordionTrigger, { className: cn(treeVariants(), selectedItemId === item.id && selectedTreeVariants()), onClick: function () {
                            var _a;
                            handleSelectChange(item);
                            (_a = item.onClick) === null || _a === void 0 ? void 0 : _a.call(item);
                        }, children: [_jsx(TreeIcon, { item: item, isSelected: selectedItemId === item.id, isOpen: value.includes(item.id), default: defaultNodeIcon }), _jsx("span", { className: "text-sm truncate", children: item.name }), _jsx(TreeActions, { isSelected: selectedItemId === item.id, children: item.actions })] }), _jsx(AccordionContent, { className: "ml-4 pl-1 border-l", children: _jsx(TreeItem, { data: item.children ? item.children : item, selectedItemId: selectedItemId, handleSelectChange: handleSelectChange, expandedItemIds: expandedItemIds, defaultLeafIcon: defaultLeafIcon, defaultNodeIcon: defaultNodeIcon }) })] }) })) : (_jsx(TreeLeaf, { item: item, selectedItemId: selectedItemId, handleSelectChange: handleSelectChange, defaultLeafIcon: defaultLeafIcon })) }));
};
var TreeLeaf = React.forwardRef(function (_a, ref) {
    var className = _a.className, item = _a.item, selectedItemId = _a.selectedItemId, handleSelectChange = _a.handleSelectChange, defaultLeafIcon = _a.defaultLeafIcon, props = __rest(_a, ["className", "item", "selectedItemId", "handleSelectChange", "defaultLeafIcon"]);
    return (_jsxs("div", __assign({ ref: ref, className: cn('ml-5 flex text-left items-center py-2 cursor-pointer before:right-1', treeVariants(), className, selectedItemId === item.id && selectedTreeVariants()), onClick: function () {
            var _a;
            handleSelectChange(item);
            (_a = item.onClick) === null || _a === void 0 ? void 0 : _a.call(item);
        } }, props, { children: [_jsx(TreeIcon, { item: item, isSelected: selectedItemId === item.id, default: defaultLeafIcon }), _jsx("span", { className: "flex-grow text-sm truncate", children: item.name }), _jsx(TreeActions, { isSelected: selectedItemId === item.id, children: item.actions })] })));
});
TreeLeaf.displayName = 'TreeLeaf';
var AccordionTrigger = React.forwardRef(function (_a, ref) {
    var className = _a.className, children = _a.children, props = __rest(_a, ["className", "children"]);
    return (_jsx(AccordionPrimitive.Header, { children: _jsxs(AccordionPrimitive.Trigger, __assign({ ref: ref, className: cn('flex flex-1 w-full items-center py-2 transition-all first:[&[data-state=open]>svg]:rotate-90', className) }, props, { children: [_jsx(ChevronRight, { className: "h-4 w-4 shrink-0 transition-transform duration-200 text-accent-foreground/50 mr-1" }), children] })) }));
});
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;
var AccordionContent = React.forwardRef(function (_a, ref) {
    var className = _a.className, children = _a.children, props = __rest(_a, ["className", "children"]);
    return (_jsx(AccordionPrimitive.Content, __assign({ ref: ref, className: cn('overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down', className) }, props, { children: _jsx("div", { className: "pb-1 pt-0", children: children }) })));
});
AccordionContent.displayName = AccordionPrimitive.Content.displayName;
var TreeIcon = function (_a) {
    var item = _a.item, isOpen = _a.isOpen, isSelected = _a.isSelected, defaultIcon = _a.default;
    var Icon = defaultIcon;
    if (isSelected && item.selectedIcon) {
        Icon = item.selectedIcon;
    }
    else if (isOpen && item.openIcon) {
        Icon = item.openIcon;
    }
    else if (item.icon) {
        Icon = item.icon;
    }
    return Icon ? (_jsx(Icon, { className: "h-4 w-4 shrink-0 mr-2" })) : (_jsx(_Fragment, {}));
};
var TreeActions = function (_a) {
    var children = _a.children, isSelected = _a.isSelected;
    return (_jsx("div", { className: cn(isSelected ? 'block' : 'hidden', 'absolute right-3 group-hover:block'), children: children }));
};
export { TreeView };
