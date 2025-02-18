"use client"
import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition } from "@/core/widgets/widget-interface";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import ROSLIB from 'roslib';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { useButtonHolder } from '@/components/advanced/ButtonHolder/button-holder-provider';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';
import { PluginsHooks } from '@/core/plugins/plugins-types';
import { Datasource } from '@/core/datasources/datasource-interface';
import { useTheme } from "next-themes"

interface RQTGraphProps {
    title: string;
    datasource_id: string;
    ignoreRosout: boolean;
    ignoreParameterEvent: boolean;
}

function RQTGraph(props: RQTGraphProps): JSX.Element {

    const pluginsManager = usePluginsManager();
    const { setButtonItem, removeButtonItem } = useButtonHolder();

    const { resolvedTheme } = useTheme();

    const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);
    const [refresh, setRefresh] = useState<number>(0);
    const [rosNodes, setRosNodes] = useState<Map<string, { subscriptions: string[], publications: string[], services: string[] }>>(new Map());
    const divRef = useRef<HTMLDivElement>(null);

    // Establish ROSLIB connection
    useEffect(() => {
        const to = setTimeout(() => {
            setRoslib(pluginsManager.applyFilter(`${props.datasource_id}-ros-2-connection`, null));
        }, 500);


        setButtonItem("refresh",
            <Button variant={"ghost"} onClick={() => { setRefresh((prev: number) => (prev + 1) % 10) }} >
                <RefreshCwIcon />
            </Button>
        );


        return () => {
            clearTimeout(to);
            removeButtonItem("refresh");
        }
    }, [pluginsManager, props, refresh, removeButtonItem, setButtonItem]);

    // Retrieve ROS nodes details, subscribing: Array(0), publishing: Array(2), services: Array(1)
    useEffect(() => {
        if (!roslib) {
            return;
        }
        roslib.getNodes((nodes: string[]) => {
            nodes.forEach(node => {
                roslib.getNodeDetails(node, (result: { subscribing: string[], publishing: string[], services: string[] }) => {
                    setRosNodes(prev => {
                        const newMap = new Map(prev);
                        newMap.set(node, { subscriptions: result.subscribing, publications: result.publishing, services: result.services });
                        return newMap;
                    });
                });
            });
        });

    }, [roslib, refresh]);

    // Build and render graph from rosNodes using ForceGraph
    useEffect(() => {
        if (divRef.current && rosNodes.size > 0) {
            (async () => {
                const { default: ForceGraph } = await import('force-graph');

                const nodesMap: { [key: string]: boolean } = {};
                const nodes: { id: string }[] = [];
                const links: { source: string, target: string, value: any }[] = [];

                rosNodes.forEach((details, nodeName) => {
                    if (!nodesMap[nodeName]) {
                        nodes.push({ id: nodeName });
                        nodesMap[nodeName] = true;
                    }
                });

                rosNodes.forEach((pubDetails, pubName) => {
                    const publications: string[] = pubDetails.publications || [];
                    publications.forEach(topic => {
                        if (props.ignoreRosout && topic === '/rosout') return;
                        if (props.ignoreParameterEvent && topic === '/parameter_events') return;
                        rosNodes.forEach((subDetails, subName) => {
                            if (pubName !== subName && (subDetails.subscriptions || []).includes(topic)) {
                                links.push({ source: pubName, target: subName, value: topic });
                            }
                        });
                    });
                });

                const arrowColor = resolvedTheme === "light" ? "#333" : "#ccc";
                const lineColor = resolvedTheme === "light" ? "#333" : "#ccc";
                const fg = new ForceGraph(divRef.current!)
                    .graphData({ nodes, links })
                    .linkColor(() => arrowColor)
                    .linkDirectionalArrowLength(2)
                    .linkDirectionalArrowRelPos(1)
                    .linkDirectionalParticles(2)
                    .linkCanvasObjectMode(() => 'after')
                    .linkCanvasObject((link: any, ctx, globalScale) => {
                        const { source, target, value } = link;
                        const x = (source.x + target.x) / 2;
                        const y = (source.y + target.y) / 2;
                        ctx.font = `${10 / globalScale}px Sans-Serif`;
                        ctx.fillStyle = arrowColor;
                        ctx.strokeStyle = arrowColor;
                        ctx.textAlign = 'center';
                        ctx.fillText(value, x, y);
                    })
                    .nodeCanvasObject((node: any, ctx, globalScale) => {
                        const r = 5;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                        ctx.fillStyle = "#1f77b4";
                        ctx.fill();
                        ctx.font = `${12 / globalScale}px Sans-Serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillStyle = lineColor;
                        ctx.fillText(node.id, node.x, node.y - r - 2);
                    });

                setTimeout(() => {
                    fg.zoomToFit(400);
                }, 500);
            })();
        }
    }, [rosNodes, refresh, props.ignoreRosout, props.ignoreParameterEvent, resolvedTheme]);

    return (
        <div ref={divRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* ...existing code if any... */}
        </div>
    );
}

export function RQTGraphDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    return {
        id: 'rqt-graph',
        name: 'RQT Graph',
        description: 'Equivalent to the ROS2 RQT Graph tool',
        titleProp: 'title',
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="5" r="2" />
                <circle cx="19" cy="5" r="2" />
                <circle cx="12" cy="19" r="2" />
                <line x1="5" y1="5" x2="12" y2="19" />
                <line x1="19" y1="5" x2="12" y2="19" />
                <line x1="5" y1="5" x2="19" y2="5" />
            </svg>
        ),
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                datasource_id: { type: 'string', title: 'Datasources' },
                ignoreRosout: { type: 'boolean', title: 'Ignore rosout' },
                ignoreParameterEvent: { type: 'boolean', title: 'Ignore parameter event' }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
                {
                    type: "Control", scope: "#/properties/datasource_id", options: {
                        async: true,
                        asyncFunction: async () => {

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rosbridge-suite-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement,
                { type: "Control", scope: "#/properties/ignoreRosout" } as ControlElement,
                { type: "Control", scope: "#/properties/ignoreParameterEvent" } as ControlElement,
            ]
        } as VerticalLayout,
        data: { title: 'RQT Graph' },
        Component: (data: RQTGraphProps) => <RQTGraph {...data} />
    }
}