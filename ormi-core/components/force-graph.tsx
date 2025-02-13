"use client"
import React, { useRef, useEffect, useState } from 'react';
import { select, zoom, D3ZoomEvent } from "d3";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from "d3-force";

export interface ForceNode {
    x?: number;
    y?: number;
    data: any;
}

export interface ForceLink {
    source: ForceNode;
    target: ForceNode;
}

interface ForceGraphProps {
    initialNodes: ForceNode[];
    links: ForceLink[];
    width?: number;
    height?: number;
    circleColor?: string;
    circleRadius?: number;
    edgeColor?: string;
    edgeWidth?: number;
    textFill?: string;
    textFontSize?: number;
}

export const ForceGraph: React.FC<ForceGraphProps> = ({
    initialNodes,
    links,
    width = 800,
    height = 600,
    circleColor = "#f97315",
    circleRadius = 20,
    edgeColor = "#2f4f4f",
    edgeWidth = 2,
    textFill = "#404040",
    textFontSize = 10
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [nodes, setNodes] = useState<ForceNode[]>(initialNodes);
    // New state for refreshing link positions.
    const [simLinks, setSimLinks] = useState<ForceLink[]>(links);

    useEffect(() => {
        const simulation = forceSimulation(nodes)
            .force("charge", forceManyBody().strength(-500))
            .force("link", forceLink(links).id((d: any) => d.data.key).distance(100))
            .force("center", forceCenter(width / 2, height / 2))
            .force("collision", forceCollide().radius(50).strength(0.8))
            .force("x", forceX(width / 2).strength(0.1))
            .force("y", forceY(height / 2).strength(0.1))
            .on("tick", () => {
                setNodes([...simulation.nodes()] as ForceNode[]);
                setSimLinks([...links]);
            });
        return () => { simulation.stop(); };
    }, [initialNodes, links, width, height]);

    useEffect(() => {
        if (svgRef.current) {
            const svg = select(svgRef.current);
            svg.call(
                zoom<SVGSVGElement, unknown>().on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
                    svg.select("g").attr("transform", event.transform.toString());
                })
            );
        }
    }, []);

    return (
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
            <g>
                {simLinks.map((link, i) => {
                    const source = link.source as ForceNode;
                    const target = link.target as ForceNode;
                    const x1 = source.x || 0;
                    const y1 = source.y || 0;
                    const x2 = target.x || 0;
                    const y2 = target.y || 0;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const offset = 5; // adjust offset as needed
                    const offsetX = -dy / distance * offset;
                    const offsetY = dx / distance * offset;
                    const cx = (x1 + x2) / 2 + offsetX;
                    const cy = (y1 + y2) / 2 + offsetY;
                    const pathData = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
                    return (
                        <path
                            key={`link-${i}`}
                            d={pathData}
                            stroke={edgeColor}
                            strokeWidth={edgeWidth}
                            fill="none"
                        />
                    );
                })}
                {nodes.map((node, i) => (
                    <g key={`node-${i}`} transform={`translate(${node.x},${node.y})`}>
                        <circle r={circleRadius} fill={circleColor} />
                        <text
                            dy={4}
                            textAnchor="middle"
                            style={{ fontSize: textFontSize, fill: textFill }}
                        >
                            {node.data.label || node.data.uuid}
                        </text>
                    </g>
                ))}
            </g>
        </svg>
    );
};
