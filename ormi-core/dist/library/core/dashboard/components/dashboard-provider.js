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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import React, { createContext, useContext, useEffect } from 'react';
import { PluginsHooks } from '../../plugins/plugins-types';
import { usePluginsManager } from '../../plugins/components/plugins-provider';
import { toast } from '../../../../library/hooks/use-toast';
// Create the context with a default value
var DashboardContext = createContext({
    layouts: {
        lg: [],
        md: [],
        sm: [],
        xs: [],
        xxs: []
    },
    widgets: new Map(),
    compactType: null,
    moveToVertical: function () { },
    moveToHorizontal: function () { },
    exploseLayout: function () { },
    getComponents: function () { return _jsx(_Fragment, {}); },
    getBox: function () { throw new Error("Method not implemented."); },
    getDefinition: function () { throw new Error("Method not implemented."); },
    addWidget: function () { },
    removeWidget: function () { },
    updateWidget: function () { },
    lockUnLockDashboard: function () { },
    locked: false,
    layoutsChanged: function () { },
    savesDashboard: function () { },
    hasChanged: false,
    forceReload: false,
    datasources: new Map(),
    updateDatasource: function () { },
    addDatasource: function () { },
    removeDatasource: function () { }
});
// Create a provider component
var DashboardProvider = function (props) {
    var children = props.children, dashboardDefinition = props.dashboardDefinition, OnLoad = props.OnLoad, OnSave = props.OnSave;
    // const dashboardManager = new DashboardManager(dashboardDefinition);
    var pluginsManager = usePluginsManager();
    var availableWidgets = pluginsManager.applyFilter(PluginsHooks.WIDGETS_LIST, []);
    var _a = React.useState(null), compactType = _a[0], setCompactType = _a[1];
    var _b = React.useState(dashboardDefinition.layouts), layouts = _b[0], setLayouts = _b[1];
    var _c = React.useState(dashboardDefinition.widgets), widgets = _c[0], setWidgets = _c[1];
    var _d = React.useState(false), locked = _d[0], setLocked = _d[1];
    var _e = React.useState(false), hasChanged = _e[0], setHasChanged = _e[1];
    var _f = React.useState(false), forceReload = _f[0], setForceReload = _f[1];
    var _g = React.useState(dashboardDefinition.datasources), datasources = _g[0], setDatasources = _g[1];
    var getComponents = function (boxId) {
        var widget = widgets.get(boxId);
        if (widget) {
            var widgetDefinition = availableWidgets.find(function (widget_def) { return widget_def.id === widget.widget_id; });
            if (widgetDefinition) {
                return widgetDefinition.Component(widget.settings);
            }
        }
        throw new Error("Widget ".concat(boxId, " not found"));
    };
    var getBox = function (breakpoint, boxId) {
        if (!layouts[breakpoint]) {
            throw new Error("Breakpoint ".concat(breakpoint, " not found"));
        }
        return layouts[breakpoint].find(function (box) { return box.i === boxId; });
    };
    var getDefinition = function (widget_id) {
        var widget = availableWidgets.find(function (widget_def) { return widget_def.id === widget_id; });
        if (widget) {
            return widget;
        }
        throw new Error("Widget ".concat(widget_id, " not found"));
    };
    var addWidget = function (widget, settings) {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to add widgets",
                variant: "destructive"
            });
            return;
        }
        var box_id = "component_".concat(widgets.size, "_").concat(new Date().getTime());
        var widget_title = widget.name;
        if (widget.titleProp) {
            widget_title = settings[widget.titleProp];
        }
        var new_widgets = {
            box_id: box_id,
            widget_id: widget.id,
            title: widget_title,
            settings: settings
        };
        setWidgets(function (prev) { return new Map(prev.set(box_id, new_widgets)); });
        var box = {
            i: box_id,
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            static: false,
            isBounded: true,
        };
        setHasChanged(true);
        setLayouts({
            lg: __spreadArray(__spreadArray([], layouts.lg, true), [box], false),
            md: __spreadArray(__spreadArray([], layouts.md, true), [box], false),
            sm: __spreadArray(__spreadArray([], layouts.sm, true), [box], false),
            xs: __spreadArray(__spreadArray([], layouts.xs, true), [box], false),
            xxs: __spreadArray(__spreadArray([], layouts.xxs, true), [box], false)
        });
    };
    var removeWidget = function (box_id) {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to remove widgets",
                variant: "destructive"
            });
            return;
        }
        var new_widgets = new Map(widgets);
        new_widgets.delete(box_id);
        // remove the widget from the layout
        var new_layouts = layouts;
        for (var key in new_layouts) {
            new_layouts[key] = new_layouts[key].filter(function (box) { return box.i !== box_id; });
        }
        setHasChanged(true);
        setWidgets(new_widgets);
        setLayouts(new_layouts);
    };
    var updateWidget = function (box_id, settings) {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to update widgets",
                variant: "destructive"
            });
            return;
        }
        var widget = widgets.get(box_id);
        if (widget) {
            widget.settings = settings;
            var widgetdef = getDefinition(widget.widget_id);
            if (widgetdef.titleProp) {
                widget.title = settings[widgetdef.titleProp];
            }
            setHasChanged(true);
            setWidgets(new Map(widgets.set(box_id, widget)));
        }
    };
    var lockUnLockDashboard = function () {
        setLocked(!locked);
        setHasChanged(true);
    };
    var layoutsChanged = function (newLayouts) {
        // check if all breakpoints are present
        for (var key in layouts) {
            if (!newLayouts[key]) {
                newLayouts[key] = layouts[key];
            }
        }
        setLayouts({
            lg: __spreadArray([], newLayouts.lg, true),
            md: __spreadArray([], newLayouts.md, true),
            sm: __spreadArray([], newLayouts.sm, true),
            xs: __spreadArray([], newLayouts.xs, true),
            xxs: __spreadArray([], newLayouts.xxs, true)
        });
        setHasChanged(true);
    };
    var savesDashboard = function () {
        if (!hasChanged) {
            toast({
                title: "Dashboard not saved",
                description: "No changes have been made to the dashboard",
                // variant: "warning"
            });
            return;
        }
        // create a new dashboard definition as a plain object
        var newDashboard = {
            layouts: Object.fromEntries(Object.entries(layouts)),
            widgets: Object.fromEntries(widgets),
            datasources: Object.fromEntries(datasources),
            locked: locked
        };
        setHasChanged(false);
        OnSave(newDashboard);
        toast({
            title: "Dashboard saved",
            description: "The dashboard has been saved",
        });
    };
    var moveToVertical = function () {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to move widgets",
                variant: "destructive"
            });
            return;
        }
        setCompactType("vertical");
        setTimeout(function () {
            setCompactType(null);
        }, 500);
    };
    var moveToHorizontal = function () {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to move widgets",
                variant: "destructive"
            });
            return;
        }
        setCompactType("horizontal");
        setTimeout(function () {
            setCompactType(null);
        }, 500);
    };
    var exploseLayout = function () {
        if (locked) {
            toast({
                title: "Dashboard is locked",
                description: "Unlock the dashboard to explode the layout",
                variant: "destructive"
            });
            return;
        }
        var breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
        var colsperBreakpoints = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
        var availables_matrixes = new Map([
            ["lg", { cols: 3, rows: 3 }],
            ["md", { cols: 2, rows: 3 }],
            ["sm", { cols: 2, rows: 2 }],
            ["xs", { cols: 1, rows: 2 }],
            ["xxs", { cols: 1, rows: 1 }],
        ]);
        function getOptimalMatrix(breakpoint, number_of_elements) {
            /*
                Each matrix has a ideal number of elements being cols * rows,
                The matrix is valid if the number of elements is equal or more than the ideal number of elements

                We try to find the smallest matrix that is valid
                We start with the biggest matrix available by the breakpoint
            */
            var breakpoints_array = ["lg", "md", "sm", "xs", "xxs"];
            var index_of_breakpoint = breakpoints_array.indexOf(breakpoint);
            var starting_index = breakpoints_array.indexOf("xxs");
            var distance_matrixes_map = new Map();
            for (var i = starting_index; i >= index_of_breakpoint; i--) {
                var matrix = availables_matrixes.get(breakpoints_array[i]);
                var matrix_size = matrix.cols * matrix.rows;
                distance_matrixes_map.set(breakpoints_array[i], Math.abs(matrix_size - number_of_elements));
            }
            // find the matrix with the smallest difference, if two matrixes have the same difference, we choose the one with the biggest number of elements
            // sort the map by the difference and the number of elements
            var sorted_distance_matrixes = Array.from(distance_matrixes_map).sort(function (a, b) {
                if (a[1] === b[1]) {
                    return availables_matrixes.get(a[0]).cols * availables_matrixes.get(a[0]).rows - availables_matrixes.get(b[0]).cols * availables_matrixes.get(b[0]).rows;
                }
                return b[1] - a[1];
            });
            //reverse the array to get the matrix with the smallest difference
            return availables_matrixes.get(sorted_distance_matrixes.reverse()[0][0]);
        }
        // compute the current breakpoint
        var width = window.innerWidth;
        var breakpoint = 'lg';
        if (width < breakpoints.lg) {
            breakpoint = 'md';
        }
        if (width < breakpoints.md) {
            breakpoint = 'sm';
        }
        if (width < breakpoints.sm) {
            breakpoint = 'xs';
        }
        if (width < breakpoints.xs) {
            breakpoint = 'xxs';
        }
        var new_layouts = layouts;
        var row_size_px = 30;
        var max_number_of_rows = ((window.innerHeight * 0.9) / row_size_px);
        var optimalMatrix = getOptimalMatrix(breakpoint, widgets.size);
        // sort by distance from (0,0) (top left)
        var sorted_boxes = new_layouts[breakpoint].sort(function (a, b) { return (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y); });
        // place the boxes in the optimal position
        new_layouts[breakpoint] = sorted_boxes.map(function (box, index) {
            var cols = optimalMatrix.cols;
            var total_cols = colsperBreakpoints[breakpoint];
            // Calculate position based on grid index
            var row = Math.floor(index / cols);
            var col = index % cols;
            // Calculate width and height
            var col_width = Math.floor(total_cols / cols);
            var row_height = Math.floor(max_number_of_rows / optimalMatrix.rows);
            // Last element special handling
            if (index === widgets.size - 1) {
                var remaining_width = total_cols - (col * col_width);
                return __assign(__assign({}, box), { x: col * col_width, y: row * row_height, w: remaining_width, h: row_height });
            }
            return __assign(__assign({}, box), { x: col * col_width, y: row * row_height, w: col_width, h: row_height });
        });
        layoutsChanged(new_layouts);
        setForceReload(!forceReload);
        toast({
            title: "Layout exploded",
            description: "The layout has been exploded",
        });
    };
    var updateDatasource = function (datasource_id, settings) {
        var newDatasources = new Map(datasources);
        var datasource = newDatasources.get(settings.id);
        console.log(settings.id, datasource, settings);
        if (datasource) {
            datasource.settings = settings;
            datasource.title = settings.title;
            newDatasources.set(settings.id, datasource);
            setDatasources(newDatasources);
            setHasChanged(true);
        }
    };
    var addDatasource = function (datasource_id) {
        var newDatasources = new Map(datasources);
        var availableDatasources = pluginsManager.applyFilter(PluginsHooks.DATASOURCES_LIST, []);
        var datasourceDef = availableDatasources.find(function (datasource) { return datasource.id === datasource_id; });
        if (!datasourceDef) {
            throw new Error("Datasource ".concat(datasource_id, " not found"));
        }
        var id = "datasource_".concat(newDatasources.size, "_").concat(new Date().getTime());
        var datasource = {
            datasource_id: datasource_id,
            title: "New Datasource",
            settings: __assign({}, datasourceDef.data)
        };
        datasource.settings.id = id;
        datasource.settings.title = "New Datasource";
        newDatasources.set(id, datasource);
        setDatasources(newDatasources);
        setHasChanged(true);
    };
    var removeDatasource = function (source_id) {
        var newDatasources = new Map(datasources);
        console.log(source_id);
        newDatasources.delete(source_id);
        setDatasources(newDatasources);
        setHasChanged(true);
    };
    useEffect(function () {
        OnLoad(setLayouts, setWidgets, setLocked, setDatasources);
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: "dashboard-available-topics",
            priority: Infinity,
            filter: function (topics, filter) { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    // if the filter object is not defined, we return all the topics
                    if (!filter) {
                        return [2 /*return*/, topics];
                    }
                    console.log(filter);
                    // filter the topics based on the filter object
                    return [2 /*return*/, topics.filter(function (topic) { return filter.filter(topic); })];
                });
            }); }
        });
        return function () {
            pluginsManager.removeFilter("dashboard-available-topics");
        };
    }, []);
    return (_jsx(DashboardContext.Provider, { value: {
            compactType: compactType,
            moveToVertical: moveToVertical,
            moveToHorizontal: moveToHorizontal,
            exploseLayout: exploseLayout,
            layouts: layouts,
            widgets: widgets,
            getComponents: getComponents,
            getBox: getBox,
            getDefinition: getDefinition,
            addWidget: addWidget,
            removeWidget: removeWidget,
            updateWidget: updateWidget,
            lockUnLockDashboard: lockUnLockDashboard,
            locked: locked,
            layoutsChanged: layoutsChanged,
            savesDashboard: savesDashboard,
            hasChanged: hasChanged,
            forceReload: forceReload,
            datasources: datasources,
            updateDatasource: updateDatasource,
            addDatasource: addDatasource,
            removeDatasource: removeDatasource
        }, children: children }));
};
// Create a custom hook to use the context
var useDashboardManager = function () {
    var context = useContext(DashboardContext);
    if (context === undefined) {
        throw new Error('useDashboardManager must be used within a DashboardProvider');
    }
    return context;
};
export { DashboardProvider, useDashboardManager };
