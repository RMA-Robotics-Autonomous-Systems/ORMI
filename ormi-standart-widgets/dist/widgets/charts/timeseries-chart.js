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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LocalDataSourcesProvider, useLocalDataSource } from 'ormi-core/datasources';
import { usePluginsManager, PluginsHooks } from 'ormi-core/plugins';
import { getColorsFromString, getTransparentColorString } from 'ormi-core/utils';
import { toast } from '@/hooks/use-toast';
import { ChartLineIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';
export function TimeChartComponent(props) {
    var sources = useLocalDataSource().sources;
    var divRef = useRef(null);
    var frameRef = useRef();
    var lastUpdateRef = useRef(0);
    var dataBufferRef = useRef(new Map());
    var _a = useState(0), chartKey = _a[0], setChartKey = _a[1];
    var resolvedTheme = useTheme().resolvedTheme;
    var strokeColor = resolvedTheme === "light" ? "#333" : "#ccc";
    var gridStroke = resolvedTheme === "light" ? "#eee" : "#333";
    var optionsRef = useRef({
        width: 500,
        height: 500,
        scales: {
            x: {
                time: true,
                range: [Date.now() / 1000 - 60, Date.now() / 1000],
            },
        },
        axes: [
            {
                stroke: strokeColor,
                grid: { stroke: gridStroke },
            },
            {
                stroke: strokeColor,
                grid: { stroke: gridStroke },
            },
        ],
        series: [{ label: 'Time' }]
    });
    var dataRef = useRef([]);
    var timeSpan = props.timeHistory || 5;
    var updateFrequency = props.updateFrequency || 32;
    var updateInterval = 1000 / updateFrequency;
    // Initialize chart series only when topics change
    useEffect(function () {
        optionsRef.current.series = initializeSeries(props.topics, sources);
    }, [props.topics, sources]);
    // Change the colors when the theme changes
    useEffect(function () {
        optionsRef.current.axes = [
            {
                stroke: strokeColor,
                grid: { stroke: gridStroke },
            },
            {
                stroke: strokeColor,
                grid: { stroke: gridStroke },
            },
        ];
    }, [gridStroke, resolvedTheme, strokeColor]);
    // Handle real-time data updates
    useEffect(function () {
        var processData = function (timestamp) {
            var _a;
            if (timestamp - lastUpdateRef.current < updateInterval) {
                frameRef.current = requestAnimationFrame(processData);
                return;
            }
            lastUpdateRef.current = timestamp;
            var now = Date.now() / 1000;
            var _loop_1 = function (topic_props) {
                var topic = topic_props.topic;
                var sourceId = (topic.property !== '') ?
                    topic.topic + "+" + topic.property : topic.topic;
                var source = sources.get(sourceId);
                if (!source)
                    return "continue";
                var newData_1 = source.data.map(function (value, index) { return ({
                    value: value,
                    time: source.times[index] / 1000
                }); }).filter(function (d) { return d.time > now - timeSpan; });
                dataBufferRef.current.set(sourceId, newData_1);
            };
            // Process incoming data
            for (var _i = 0, _b = props.topics; _i < _b.length; _i++) {
                var topic_props = _b[_i];
                _loop_1(topic_props);
            }
            // Update chart data
            var timeSet = new Set();
            dataBufferRef.current.forEach(function (data) {
                data.forEach(function (point) { return timeSet.add(point.time); });
            });
            var timeArray = Array.from(timeSet).sort();
            var newData = [timeArray];
            var timeIndexMap = new Map(timeArray.map(function (time, i) { return [time, i]; }));
            props.topics.forEach(function (topic_props) {
                var topic = topic_props.topic;
                var sourceId = (topic.property !== '') ?
                    topic.topic + "+" + topic.property : topic.topic;
                var topicData = dataBufferRef.current.get(sourceId);
                var values = new Array(timeArray.length).fill(null);
                topicData === null || topicData === void 0 ? void 0 : topicData.forEach(function (d) {
                    var index = timeIndexMap.get(d.time);
                    if (index !== undefined)
                        values[index] = d.value;
                });
                newData.push(values);
            });
            dataRef.current = newData;
            // get element with this class : 'u-legend u-inline u-live' in the divRef
            var legend = (_a = divRef.current) === null || _a === void 0 ? void 0 : _a.querySelector('.u-legend.u-inline.u-live');
            var legend_height = legend ? legend.clientHeight : 0;
            // Update chart dimensions and time range
            if (divRef.current) {
                optionsRef.current = __assign(__assign({}, optionsRef.current), { width: divRef.current.clientWidth, height: divRef.current.clientHeight - (legend_height), scales: {
                        x: {
                            time: true,
                            range: [now - timeSpan, now],
                        },
                    } });
            }
            // Force chart update even without new data
            setChartKey(function (prev) { return ((prev + 1) % 2); }); // Add this line to force re-render
            // Schedule next update
            frameRef.current = requestAnimationFrame(processData);
        };
        frameRef.current = requestAnimationFrame(processData);
        return function () {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [props.topics, sources, timeSpan, updateInterval]);
    return (_jsx("div", { ref: divRef, style: { width: "100%", height: "100%" }, children: _jsx(UplotReact, { options: optionsRef.current, data: dataRef.current }, chartKey) }));
}
// Helper functions
function initializeSeries(topics, sources) {
    var series = [{ label: 'Time' }];
    var notFoundTopics = [];
    topics.forEach(function (topic_props) {
        var topic = topic_props.topic;
        var sourceId = (topic.property !== '') ?
            topic.topic + "+" + topic.property : topic.topic;
        if (!sources.get(sourceId)) {
            notFoundTopics.push(topic.topic);
            return;
        }
        var fill = (topic_props.fill || false) ?
            getTransparentColorString(topic_props.color || getColorsFromString(topic.topic, 0.4), 0.4) : undefined;
        var props_label = topic.property !== '' ?
            topic.topic + "." + topic.property.replaceAll("-", ".") : topic.topic;
        series.push({
            label: props_label,
            stroke: topic_props.color || getColorsFromString(sourceId),
            width: 1,
            sorted: 0,
            spanGaps: true,
            fill: fill,
        });
    });
    if (notFoundTopics.length > 0) {
        showErrorToast(notFoundTopics);
    }
    return series;
}
function showErrorToast(notFoundTopics) {
    toast({
        title: 'Error',
        description: (_jsxs("div", { children: [_jsx("p", { children: "Some topics were not found:" }), _jsx("ul", { children: notFoundTopics.map(function (topic) { return _jsx("li", { children: topic }, topic); }) })] })),
        variant: 'destructive'
    });
}
export function TimeSeriesChartDefinition() {
    var _this = this;
    var pluginsManager = usePluginsManager();
    var title = {
        type: "Control",
        scope: "#/properties/title",
    };
    var timeHistory = {
        type: "Control",
        scope: "#/properties/timeHistory",
    };
    var updateFrequency = {
        type: "Control",
        scope: "#/properties/updateFrequency",
    };
    var axis = {
        type: "Control",
        scope: "#/properties/axis",
        options: {
            detail: {
                elements: [
                    {
                        type: "Control",
                        scope: "#/properties/axis/properties/yMin",
                    },
                    {
                        type: "Control",
                        scope: "#/properties/axis/properties/yMax",
                    },
                    {
                        type: "Control",
                        scope: "#/properties/axis/properties/yLabel",
                    },
                ]
            }
        }
    };
    var topic = {
        "type": "TopicSelect",
        "scope": "#/properties/topic",
        "options": {
            "asyncFunction": function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync(PluginsHooks.AVAILABLE_TOPICS, [])];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            }); },
            "propertyType": "number"
        }
    };
    var color = {
        "type": "Control",
        "scope": "#/properties/color",
        "options": {
            "color": true,
        }
    };
    var fill = {
        "type": "Control",
        "scope": "#/properties/fill",
    };
    // array of topics
    var topics = {
        type: "Control",
        scope: "#/properties/topics",
        options: {
            detail: {
                type: "Group",
                elements: [topic, color, fill]
            }
        }
    };
    var layout = {
        type: "VerticalLayout",
        elements: [title, timeHistory, updateFrequency, topics],
    };
    return {
        id: 'chart-widget-time-series',
        name: 'Time series chart',
        description: 'Display a line chart',
        titleProp: 'title',
        icon: _jsx(ChartLineIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                timeHistory: {
                    type: 'number',
                    title: 'Time history in seconds',
                    default: 5
                },
                updateFrequency: {
                    type: 'number',
                    title: 'Update frequency in Hz',
                    default: 32
                },
                axis: {
                    type: 'object',
                    title: 'Axis',
                    properties: {
                        yMin: {
                            type: 'number',
                            title: 'Y min',
                        },
                        yMax: {
                            type: 'number',
                            title: 'Y max',
                        },
                        yLabel: {
                            type: 'string',
                            title: 'Y label',
                        }
                    }
                },
                topics: {
                    type: 'array',
                    title: 'Topics',
                    items: {
                        type: "object",
                        properties: {
                            topic: {
                                "type": "object",
                                "title": "Topic",
                            },
                            color: {
                                "type": "string",
                                "title": "Color",
                            },
                            fill: {
                                "type": "boolean",
                                "title": "Fill",
                                default: false,
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
            required: ['title', 'topics']
        },
        uischema: layout,
        data: {
            title: 'Chart'
        },
        Component: function (data) { return (_jsx(LocalDataSourcesProvider, { SelectedTopics: data.topics.map(function (t) { return t.topic; }), buffersSize: 2000, children: _jsx(TimeChartComponent, __assign({}, data)) })); }
    };
}
;
