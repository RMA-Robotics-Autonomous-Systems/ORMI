"use client"
import React, { useEffect, useState } from 'react';
import { WidgetDefinition } from "@/core/widgets/widget-interface";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { ForceGraph, ForceNode, ForceLink } from "@/components/force-graph";
import { DatasourceProviderSettings } from '@/core/datasources/datasource-interface';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { useDashboardManager } from '@/core/dashboard/components/dashboard-provider';
import ROSLIB from 'roslib';

interface RQTGraphProps {
    title: string;
    datasource_id: DatasourceProviderSettings;
}

function RQTGraph(props: RQTGraphProps): JSX.Element {

    const pluginsManager = usePluginsManager();
    const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);
    const [rosNodes, setRosNodes] = useState<Map<string, { subscriptions: string[], publications: string[], services: string[] }>>(new Map());
    const [graphNodes, setGraphNodes] = useState<ForceNode[]>([]);
    const [graphLinks, setGraphLinks] = useState<ForceLink[]>([]);

    useEffect(() => {
        const to = setTimeout(() => {
            setRoslib(pluginsManager.applyFilter(`${props.datasource_id}-ros-2-connection`, null));
        }, 500);
        return () => clearTimeout(to);
    }, []);

    useEffect(() => {
        if (roslib) {
            roslib.getNodes((nodes: string[]) => {
                for (const node of nodes) {
                    roslib.getNodeDetails(node, (details: any) => {
                        // Assume details include: details.name, details.publications, details.subscriptions
                        setRosNodes((prev) => {
                            const newMap = new Map(prev);
                            newMap.set(node, details);
                            return newMap;
                        });

                        console.log(`Node: ${node}`);

                    });
                }


            });


        }
    }, [roslib]);

    // Updated useEffect: build graph from rosNodes with default x/y positions
    useEffect(() => {
        if (rosNodes.size > 0) {
            console.log('Building graph...');
            const nodeMap = new Map<string, ForceNode>();
            // Create a node for each ROS node with data.key, data.label and default x,y positions.
            rosNodes.forEach((details, name) => {
                nodeMap.set(name, { data: { key: name, label: name }, x: 400, y: 300 });
            });
            const links: ForceLink[] = [];
            // For each node, check its publications and match with other nodes' subscriptions.
            rosNodes.forEach((pubDetails, pubName) => {
                const publications: string[] = pubDetails.publications || [];
                publications.forEach(topic => {
                    rosNodes.forEach((subDetails, subName) => {
                        if (pubName !== subName) {
                            const subscriptions: string[] = subDetails.subscriptions || [];
                            if (subscriptions.includes(topic)) {
                                links.push({
                                    source: { data: { key: pubName, label: pubName }, x: 400, y: 300 },
                                    target: { data: { key: subName, label: subName }, x: 400, y: 300 }
                                });
                            }
                        }
                    });
                });
            });
            setGraphNodes(Array.from(nodeMap.values()));
            setGraphLinks(links);
        } else {
            console.log('No nodes found');
        }
    }, [rosNodes]);

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            {graphNodes.length ? ( // now shows graph if nodes exist, even if links is empty
                <ForceGraph
                    initialNodes={graphNodes}
                    links={graphLinks}
                    width={800}
                    height={600}
                />
            ) : (
                <div>Loading graph...</div>
            )}
        </div>
    );
}

export function RQTGraphDefinition(): WidgetDefinition {
    const { datasources } = useDashboardManager();
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
                datasource_id: { type: 'string', title: 'Datasources' }
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
                            const values = Array.from(datasources.values()).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));
                            return values;
                        }
                    }
                } as ControlElement
            ]
        } as VerticalLayout,
        data: { title: 'RQT Graph' },
        Component: (data: RQTGraphProps) => (
            <RQTGraph {...data} />
        )
    }
}