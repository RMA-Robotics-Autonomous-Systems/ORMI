// ECharts-based real-time chart widget (initial stub)
// Will support multiple topics, per-series customization, and extensive chart options
import React, { useEffect, useRef } from 'react';
import { useLocalDataSource } from '@workspace/ormi-core/datasources';
import * as echarts from 'echarts';
import { ControlElement, VerticalLayout } from '@jsonforms/core';
import { SelectedTopic, DatasourceTopic, LocalDataSourcesProvider } from '@workspace/ormi-core/datasources';
import { TopicSelectElement } from '@workspace/ormi-core/widgets';
import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { ChartLineIcon } from 'lucide-react';
interface EchartsSeriesSettings {
    title: string;
    topic: SelectedTopic;
    color: string;
    fill: boolean;
    axis?: {
        yMin?: number;
        yMax?: number;
        yLabel?: string;
        position?: 'left' | 'right';
    };
    type?: string; // e.g. 'line', 'bar', etc.
    lineStyle?: {
        width?: number;
        type?: 'solid' | 'dashed' | 'dotted';
    };
    symbol?: string; // e.g. 'circle', 'rect', etc.
    showSymbol?: boolean;
    smooth?: boolean;
    areaStyle?: object;
    [key: string]: any;
}

interface ChartEchartsSettings {
    title: string;
    timeHistory: number;
    updateFrequency: number;
    axis: {
        yMin: number;
        yMax: number;
        yLabel: string;
    };
    series: EchartsSeriesSettings[];
}

export function ChartEchartsWidget(props: ChartEchartsSettings) {
    const chartRef = useRef<HTMLDivElement>(null);
    const echartsInstanceRef = useRef<echarts.EChartsType | null>(null);
    const { getSource, getSourceId } = useLocalDataSource(); // ← Don't destructure sources or version
    const timeSpan = props.timeHistory || 5;
    const updateFrequency = props.updateFrequency || 32;
    const updateInterval = 1000 / updateFrequency;
    const frameRef = useRef<number>(0);
    const lastUpdateRef = useRef<number>(0);
    // Buffer for processed data per topic
    const dataBufferRef = useRef<Map<string, { value: number, time: number }[]>>(new Map());

    // Helper: Build ECharts option from props and dataBufferRef
    function buildOption(): echarts.EChartsOption {
        const now = Date.now();
        const entryOffsetMs = 250; // Offset for data entering view
        const exitOffsetMs = -250;   // Offset for data leaving view
        const xAxis = {
            type: "time" as const,
            name: 'Time',
            min: now - timeSpan * 1000 + entryOffsetMs,
            max: now + exitOffsetMs,
            splitLine: { show: true },
        };
        // Group series by axis position ('left' or 'right')
        const axisConfigs: { [pos: string]: any } = {};
        const axisOrder: string[] = [];
        props.series.forEach(s => {
            const pos = s.axis?.position || 'left';
            const key = `${pos}:${s.axis?.yMin ?? ''}:${s.axis?.yMax ?? ''}:${s.axis?.yLabel ?? ''}`;
            // Fallback to topic string if title is not set
            const fallbackName = s.title?.trim() ? s.title : (s.topic.property ? `${s.topic.topic} (${s.topic.property})` : s.topic.topic);
            if (!axisConfigs[key]) {
                axisConfigs[key] = {
                    type: 'value',
                    name: s.axis?.yLabel || fallbackName,
                    nameLocation: 'middle',
                    nameGap: 40,
                    min: s.axis?.yMin,
                    max: s.axis?.yMax,
                    position: pos,
                    axisLine: {
                        show: false,

                    },
                    splitLine: { show: true },
                };
                axisOrder.push(key);
            }
        });
        const yAxis = axisOrder.map(key => axisConfigs[key]);
        const series: any[] = [];
        props.series.forEach(s => {
            const pos = s.axis?.position || 'left';
            const key = `${pos}:${s.axis?.yMin ?? ''}:${s.axis?.yMax ?? ''}:${s.axis?.yLabel ?? ''}`;
            const axisIdx = axisOrder.indexOf(key);
            // Fallback to topic string if title is not set
            const fallbackName = s.title?.trim() ? s.title : (s.topic.property ? `${s.topic.topic} (${s.topic.property})` : s.topic.topic);
            // Get topic data from buffer
            const topic = s.topic;
            const sourceId = getSourceId(topic);
            const topicData = dataBufferRef.current.get(sourceId) || [];
            // Format for ECharts: [{ value: [time, value] }, ...]
            let data = topicData.map(d => ({ value: [d.time * 1000, d.value] }));
            // Always add a null point at current time to keep time axis advancing
            if (data.length === 0 || (data[data.length - 1]?.value?.[0] ?? 0) < now) {
                data = [...data, { value: [now, null] } as any];
            }
            series.push({
                name: fallbackName,
                type: s.type || 'line',
                yAxisIndex: axisIdx,
                data,
                lineStyle: s.lineStyle,
                itemStyle: { color: s.color },
                showSymbol: s.showSymbol,
                smooth: s.smooth,
                areaStyle: s.fill ? (s.areaStyle || {}) : undefined,
                symbol: s.symbol,
            });
        });

        return {
            tooltip: { trigger: 'axis' },
            legend: { show: true },
            xAxis,
            yAxis,
            series,
            grid: {
                containLabel: true,
                left: 40,
                right: 50,
                top: 10,
            },
            animation: false,
        };
    }

    // Real-time data update loop - runs independently of React renders
    useEffect(() => {
        function processData(timestamp: number) {
            if (timestamp - lastUpdateRef.current < updateInterval) {
                frameRef.current = requestAnimationFrame(processData);
                return;
            }
            lastUpdateRef.current = timestamp;
            const now = Date.now() / 1000;
            // Process incoming data for each series
            props.series.forEach(s => {
                const topic = s.topic;
                const sourceId = getSourceId(topic);
                const source = getSource(topic);
                if (!source) return;
                const newData = source.data.map((value: unknown, index: number) => ({
                    value: value as number,
                    time: source.times[index]! / 1000
                })).filter(d => d.time > now - timeSpan);
                dataBufferRef.current.set(sourceId, newData);
            });
            // Always update chart xAxis and series to keep time flowing
            if (echartsInstanceRef.current) {
                const option = buildOption();
                echartsInstanceRef.current.setOption({
                    xAxis: option.xAxis,
                    series: option.series
                }, false); // notMerge: false
            }
            frameRef.current = requestAnimationFrame(processData);
        }
        frameRef.current = requestAnimationFrame(processData);
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [props.series, timeSpan, updateInterval, getSource, getSourceId]); // ← Removed sources

    // Initialize chart and handle resize
    useEffect(() => {
        if (!chartRef.current) return;
        if (!echartsInstanceRef.current) {
            echartsInstanceRef.current = echarts.init(chartRef.current);
        }
        const option = buildOption();
        echartsInstanceRef.current.setOption(option, true);
        // Resize chart on container resize
        const resizeObserver = new window.ResizeObserver(() => {
            echartsInstanceRef.current?.resize();
        });
        resizeObserver.observe(chartRef.current);
        return () => {
            resizeObserver.disconnect();
            echartsInstanceRef.current?.dispose();
            echartsInstanceRef.current = null;
        };
    }, [props.title, props.axis]);

    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    );
}

export function ChartEchartsWidgetDefinition() {
    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    };
    const timeHistory: ControlElement = {
        type: "Control",
        scope: "#/properties/timeHistory",
    };
    const updateFrequency: ControlElement = {
        type: "Control",
        scope: "#/properties/updateFrequency",
    };
    const pluginsManager = usePluginsManager();

    // Main axis control for the chart (not per-series)
    const axis: ControlElement = {
        type: "Control",
        scope: "#/properties/axis",
        options: {
            detail: {
                elements: [
                    { type: "Control", scope: "#/properties/axis/properties/yMin" },
                    { type: "Control", scope: "#/properties/axis/properties/yMax" },
                    { type: "Control", scope: "#/properties/axis/properties/yLabel" }
                ]
            }
        }
    };

    // Per-series controls (unique names)
    const seriesTitle: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    };
    const seriesTopic: TopicSelectElement = {
        type: "TopicSelect",
        scope: "#/properties/topic",
        options: {
            dataRequirements: {
                accepts: ['number']
            }
        }
    };
    const seriesColor: ControlElement = {
        type: "Control",
        scope: "#/properties/color",
        options: { color: true }
    };
    const seriesFill: ControlElement = {
        type: "Control",
        scope: "#/properties/fill",
    };
    const seriesAxis: ControlElement = {
        type: "Control",
        scope: "#/properties/axis",
        options: {
            detail: {
                elements: [
                    { type: "Control", scope: "#/properties/axis/properties/yMin" },
                    { type: "Control", scope: "#/properties/axis/properties/yMax" },
                    { type: "Control", scope: "#/properties/axis/properties/yLabel" },
                    { type: "Control", scope: "#/properties/axis/properties/position" }
                ]
            }
        }
    };
    const seriesType: ControlElement = {
        type: "Control",
        scope: "#/properties/type",
        options: { enum: ['line', 'bar', 'scatter'] }
    };
    const seriesLineStyle: ControlElement = {
        type: "Control",
        scope: "#/properties/lineStyle",
        options: {
            detail: {
                elements: [
                    { type: "Control", scope: "#/properties/lineStyle/properties/width" },
                    { type: "Control", scope: "#/properties/lineStyle/properties/type" }
                ]
            }
        }
    };
    const seriesSymbol: ControlElement = {
        type: "Control",
        scope: "#/properties/symbol",
        options: { enum: ['circle', 'rect', 'roundRect', 'triangle', 'diamond', 'pin', 'arrow', 'none'] }
    };
    const seriesShowSymbol: ControlElement = {
        type: "Control",
        scope: "#/properties/showSymbol",
    };
    const seriesSmooth: ControlElement = {
        type: "Control",
        scope: "#/properties/smooth",
    };
    const seriesAreaStyle: ControlElement = {
        type: "Control",
        scope: "#/properties/areaStyle",
    };

    // array of series
    const series: ControlElement = {
        type: "Control",
        scope: "#/properties/series",
        options: {
            detail: {
                type: "Group",
                elements: [
                    seriesTitle,
                    seriesTopic,
                    seriesColor,
                    seriesFill,
                    seriesAxis,
                    seriesType,
                    seriesLineStyle,
                    seriesSymbol,
                    seriesShowSymbol,
                    seriesSmooth,
                    seriesAreaStyle
                ]
            }
        }
    };

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, timeHistory, updateFrequency, axis, series],
    };
    // array of series (already declared above)
    // layout (already declared above)

    return {
        id: 'chart-widget-echarts',
        name: 'ECharts Chart',
        description: 'Display a customizable real-time chart using ECharts',
        titleProp: 'title',
        icon: <ChartLineIcon />,
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                timeHistory: { type: 'number', title: 'Time history in seconds', default: 5 },
                updateFrequency: { type: 'number', title: 'Update frequency in Hz', default: 32 },
                axis: {
                    type: 'object',
                    title: 'Axis',
                    properties: {
                        yMin: { type: 'number', title: 'Y min' },
                        yMax: { type: 'number', title: 'Y max' },
                        yLabel: { type: 'string', title: 'Y label' },
                    }
                },
                series: {
                    type: 'array',
                    title: 'Series',
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string", title: "Series Title" },
                            topic: { type: "object", title: "Topic" },
                            color: { type: "string", title: "Color" },
                            fill: { type: "boolean", title: "Fill", default: false },
                            axis: {
                                type: "object",
                                title: "Axis",
                                properties: {
                                    yMin: { type: "number", title: "Y min" },
                                    yMax: { type: "number", title: "Y max" },
                                    yLabel: { type: "string", title: "Y label" },
                                    position: { type: "string", title: "Position", enum: ['left', 'right'] },
                                }
                            },
                            type: { type: "string", title: "Type", enum: ['line', 'bar', 'scatter'] },
                            lineStyle: {
                                type: "object",
                                title: "Line Style",
                                properties: {
                                    width: { type: "number", title: "Width" },
                                    type: { type: "string", title: "Type", enum: ['solid', 'dashed', 'dotted'] },
                                }
                            },
                            symbol: { type: "string", title: "Symbol", enum: ['circle', 'rect', 'roundRect', 'triangle', 'diamond', 'pin', 'arrow', 'none'] },
                            showSymbol: { type: "boolean", title: "Show Symbol" },
                            smooth: { type: "boolean", title: "Smooth" },
                            areaStyle: { type: "object", title: "Area Style" },
                        },
                        required: ["title", "topic"]
                    }
                }
            },
            required: ['title', 'series']
        },
        uischema: layout,
        data: { title: 'ECharts Chart' },
        Component: (data: ChartEchartsSettings) => (
            <LocalDataSourcesProvider SelectedTopics={data.series.map(s => s.topic)} buffersSize={2000}>
                <ChartEchartsWidget {...data} />
            </LocalDataSourcesProvider>
        )
    };
}
