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
import { jsx as _jsx } from "react/jsx-runtime";
import 'chartjs-adapter-date-fns';
import { getColorsFromString, getTransparentColorString } from 'ormi-core/utils';
import { toast } from '@/hooks/use-toast';
import Chart from 'chart.js/auto';
import { useEffect, useRef } from 'react';
import { LocalDataSourcesProvider } from 'ormi-core/datasources';
import { PluginsHooks } from 'ormi-core/plugins';
import { usePluginsManager } from 'ormi-core/plugins';
/*
    Component that implements Chart.js to render a line chart.
*/
function LineChart(props) {
    var canvasRef = useRef(null);
    var chartRef = useRef();
    var sources = new Map();
    // mount and unmount the chart
    useEffect(function () {
        if (!canvasRef.current) {
            return;
        }
        if (!props.topics) {
            return;
        }
        var config = {
            type: 'line',
            data: {
                datasets: []
            },
            options: {
                animation: false,
                responsive: true,
                spanGaps: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'millisecond',
                        },
                        min: Date.now() - props.timeHistory * 1000,
                        max: Date.now(),
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            source: 'auto',
                            autoSkip: true,
                            maxTicksLimit: 10,
                        }
                    }
                },
                plugins: {
                    title: {
                        display: false,
                    },
                    legend: {
                        display: true,
                    }
                }
            },
        };
        // load datasets from props.topics
        for (var _i = 0, _a = props.topics; _i < _a.length; _i++) {
            var topicInfo = _a[_i];
            var data = [];
            var source = sources.get(topicInfo.topic.topic);
            var title = topicInfo.topic.topic;
            if (!source) {
                toast({
                    title: 'Error',
                    description: "Data source ".concat(topicInfo.topic.topic, " not found"),
                    variant: 'destructive',
                });
                continue;
            }
            data.push.apply(data, source.data);
            config.data.datasets.push({
                label: title,
                data: data,
                fill: topicInfo.fill || false,
                backgroundColor: getTransparentColorString(topicInfo.color || getColorsFromString(title), 0.4),
                borderColor: topicInfo.color || getColorsFromString(title),
                normalized: true,
                tension: 0
            });
        }
        var ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new Chart(ctx, config);
        }
        var interval = setInterval(function () {
            updateChart();
        }, 32);
        return function () {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
            clearInterval(interval);
        };
    }, []);
    var updateChart = function () {
        if (!chartRef.current) {
            return;
        }
        var spanOfTime = props.timeHistory || 10; // keep n seconds of data, default 10
        // currentTime is the biggest timestamp in the data sources
        var currentTime = Date.now();
        var _loop_1 = function (dataset) {
            if (dataset.label) {
                var source_1 = sources.get(dataset.label);
                if (source_1) {
                    var filteredData = source_1.data.filter(function (value, index) {
                        return (source_1.times[index]) > currentTime - spanOfTime * 1000;
                    });
                    var filteredTimes_1 = source_1.times.filter(function (value, index) {
                        return (value) > currentTime - spanOfTime * 1000;
                    });
                    var newData = filteredData.map(function (value, index) {
                        return {
                            x: filteredTimes_1[index],
                            y: value
                        };
                    });
                    dataset.data = newData;
                }
            }
        };
        // update datasets without creating new ones
        for (var _i = 0, _a = chartRef.current.data.datasets; _i < _a.length; _i++) {
            var dataset = _a[_i];
            _loop_1(dataset);
        }
        // Set the min and max for the x-axis to create a fixed time scale
        if (chartRef.current.options.scales && chartRef.current.options.scales.x) {
            chartRef.current.options.scales.x.min = currentTime - spanOfTime * 1000;
            chartRef.current.options.scales.x.max = currentTime;
        }
        chartRef.current.update();
        // chartRef.current.resize();
    };
    return (_jsx("canvas", { ref: canvasRef }));
}
export function LineChartDefinition() {
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
        id: 'chart-js-line-chart',
        name: 'Line chart',
        description: 'Display a line chart using Chart.js',
        titleProp: 'title',
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
        },
        uischema: layout,
        data: {
            title: 'Line chart'
        },
        Component: function (data) { return (_jsx(LocalDataSourcesProvider, { SelectedTopics: data.topics.map(function (t) { return t.topic; }), buffersSize: 2000, children: _jsx(LineChart, __assign({}, data)) })); }
    };
}
