"use client";
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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo } from "react";
import { useDashboardManager } from '../../../../library/core/dashboard/components/dashboard-provider';
import { Responsive, WidthProvider } from "react-grid-layout";
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import style from "./dashboard.module.css";
import { Button } from "../../../../library/components/ui/button";
import { WidgetCard } from "../../../../library/core/widgets/components/widget-card/widget-card";
import { useNavbar } from "../../../../library/components/advanced/navbar/navbar-provider";
import { WidgetsCombo } from "../../../../library/core/widgets/components/widget-combo/widget-combo";
import { ArrowLeftFromLine, ArrowUpFromLine, BombIcon, Check, LockIcon, LockOpenIcon, Save, XIcon } from "lucide-react";
import { ButtonHolderProvider } from "../../../../library/components/advanced/ButtonHolder/button-holder-provider";
import ButtonHolder from "../../../../library/components/advanced/ButtonHolder/button-holder";
import { WidgetTemplateDrawer } from "../../../../library/core/templates/components/templates-drawer";
import { useTemplates } from "../../../../library/core/templates/templates-provider";
var Dashboard = function () {
    var _a = useDashboardManager(), widgets = _a.widgets, updateWidget = _a.updateWidget, removeWidget = _a.removeWidget, addWidget = _a.addWidget, layouts = _a.layouts, layoutsChanged = _a.layoutsChanged, getComponents = _a.getComponents, getDefinition = _a.getDefinition, locked = _a.locked, lockUnLockDashboard = _a.lockUnLockDashboard, savesDashboard = _a.savesDashboard, hasChanged = _a.hasChanged, compactType = _a.compactType, moveToHorizontal = _a.moveToHorizontal, moveToVertical = _a.moveToVertical, exploseLayout = _a.exploseLayout, forceReload = _a.forceReload, datasources = _a.datasources;
    var _b = useTemplates(), templates = _b.templates, removeTemplate = _b.removeTemplate;
    var _c = useNavbar(), setNavbarItem = _c.setNavbarItem, removeNavbarItem = _c.removeNavbarItem;
    var ResponsiveGridLayout = useMemo(function () { return WidthProvider(Responsive); }, [forceReload]); // (improve performance from 'doc', also, juste make it works)
    var handleLayoutChange = function (currentLayout, allLayouts) {
        if (JSON.stringify(layouts) !== JSON.stringify(allLayouts)) {
            layoutsChanged(__assign({}, allLayouts));
        }
    };
    var handleRemoveBoxClick = function (boxId) {
        removeWidget(boxId);
    };
    var handleSaveWidget = function (box_id, widget, settings) {
        updateWidget(box_id, settings);
    };
    var handleValidate = function (widget, settings) {
        addWidget(widget, settings);
    };
    useEffect(function () {
        setNavbarItem("right", "template_drawer", _jsx(WidgetTemplateDrawer, { templates: templates, addWidget: addWidget, removeTemplate: removeTemplate }));
        return function () {
            removeNavbarItem("right", "template_drawer");
        };
    }, [templates]);
    useEffect(function () {
        setNavbarItem("center", "widgets_combo", _jsx(WidgetsCombo, { onValidate: handleValidate }));
        setNavbarItem("center", "lock_unlock", _jsx(Button, { variant: "ghost", onClick: function () { lockUnLockDashboard(); }, children: !locked ? _jsx(LockIcon, {}) : _jsx(LockOpenIcon, {}) }));
        setNavbarItem("center", "moveToHorizontal", _jsx(Button, { variant: "ghost", onClick: function () { moveToHorizontal(); }, children: _jsx(ArrowLeftFromLine, {}) }));
        setNavbarItem("center", "moveToVertical", _jsx(Button, { variant: "ghost", onClick: function () { moveToVertical(); }, children: _jsx(ArrowUpFromLine, {}) }));
        setNavbarItem("center", "exploseLayout", _jsx(Button, { variant: "ghost", onClick: function () { exploseLayout(); }, children: _jsx(BombIcon, {}) }));
        setNavbarItem("center", "save", _jsx(Button, { variant: "ghost", onClick: function () { savesDashboard(); }, children: hasChanged ? _jsx(Save, {}) : _jsx(Check, {}) }));
        return function () {
            removeNavbarItem("center", "widgets_combo");
            removeNavbarItem("center", "lock_unlock");
            removeNavbarItem("center", "moveToHorizontal");
            removeNavbarItem("center", "moveToVertical");
            removeNavbarItem("center", "exploseLayout");
            removeNavbarItem("center", "save");
        };
    }, [locked, hasChanged, layouts, widgets]);
    var widgets_elements = useMemo(function () {
        return ((Array.from(widgets).map(function (_a) {
            var key = _a[0], widget = _a[1];
            return (_jsx("div", { className: style.widget + " shadow-md", children: _jsxs(ButtonHolderProvider, { children: [_jsxs("div", { className: 'flex flex-row content-between gap-1', style: { padding: "0.25rem" }, children: [_jsx("div", { className: style.dragHandle, children: widget.title }), _jsx(ButtonHolder, {}), !locked && (_jsx(WidgetCard, { fromLoaded: true, data: widget.settings, definition: getDefinition(widget.widget_id), displayType: "gear", onValidate: function (widget_def, settings) { handleSaveWidget(widget.box_id, widget_def, settings); } })), !locked && (_jsx(Button, { variant: "destructive", onClick: function () { return handleRemoveBoxClick(widget.box_id); }, children: _jsx(XIcon, {}) }))] }), _jsx("div", { className: style.content, children: getComponents(widget.box_id) })] }) }, key));
        })));
    }, [widgets, datasources, locked]);
    return (_jsx(ResponsiveGridLayout, { className: "layout", useCSSTransforms: true, margin: [2, 2], layouts: layouts, breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }, cols: { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }, draggableHandle: ".".concat(style.dragHandle), onLayoutChange: handleLayoutChange, preventCollision: true, rowHeight: 30, compactType: compactType, isDraggable: !locked, isResizable: !locked, children: widgets_elements }));
};
export { Dashboard };
