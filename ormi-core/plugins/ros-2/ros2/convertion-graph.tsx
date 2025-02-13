"use client"
import React from 'react';
import { WidgetDefinition } from "@/core/widgets/widget-interface";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { UnifiedConverter } from "./unified-converter";
import { hierarchy } from "d3-hierarchy";
import { ForceGraph, ForceNode, ForceLink } from "@/components/force-graph";

function Ros2ConvertionGraph(): JSX.Element {
    // Build the graphData from the converters.
    const graphData = {
        __typename: "Root",
        uuid: "Webapp",
        children: Object.entries(UnifiedConverter.converters).map(([webappType, { conversions }]) => ({
            __typename: "Webapp",
            uuid: webappType,
            key: webappType,
            label: `${webappType}`,
            children: Object.keys(conversions).map(ros2Type => ({
                __typename: "ROS2",
                uuid: `${webappType}-${ros2Type}`,
                key: `${webappType}-${ros2Type}`,
                label: `ROS2: ${ros2Type}`,
                children: []
            }))
        }))
    };

    // Flatten hierarchy to get nodes and links.
    const root = hierarchy(graphData, d => d.children);
    const initialNodes: ForceNode[] = root.descendants();
    const initialLinks: ForceLink[] = root.links();

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            <ForceGraph initialNodes={initialNodes} links={initialLinks} width={800} height={600} />
        </div>
    );
}

export function Ros2ConvertionGraphDefinition(): WidgetDefinition {
    return {
        id: 'ros2-convertion-graph',
        name: 'Ros2 Convertion Graph',
        description: 'Shows the convertion graph between ROS2 and Webapp types',
        titleProp: 'title',
        icon: (
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
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
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
            ]
        } as VerticalLayout,
        data: { title: 'ROS2 Convertion Graph' },
        Component: () => <Ros2ConvertionGraph />
    }
}