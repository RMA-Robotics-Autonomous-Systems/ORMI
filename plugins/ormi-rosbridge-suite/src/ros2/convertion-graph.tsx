"use client";
import React, { JSX } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { UnifiedConverter } from "./unified-converter";

// Removed: import ForceGraph from 'force-graph';
import { useEffect, useRef } from "react";
import { BinaryIcon } from "lucide-react";
import * as d3 from "d3";
import { useTheme } from "next-themes";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

function Ros2ConvertionGraph(): JSX.Element {
  const divRef = useRef<HTMLDivElement>(null);

  const { resolvedTheme } = useTheme();

  useEffect(() => {
    (async () => {
      const { default: ForceGraph } = await import("force-graph");

      // Compute nodes and links from UnifiedConverter's converters mapping.
      const converters = UnifiedConverter.converters;
      const nodesMap: { [key: string]: boolean } = {};
      const nodes: { id: string }[] = [];
      const links: { source: string; target: string; value: "any" }[] = [];

      Object.keys(converters).forEach((webType) => {
        if (!nodesMap[webType]) {
          nodes.push({ id: webType });
          nodesMap[webType] = true;
        }
        const conversionMapping = converters[webType]!.conversions;
        Object.keys(conversionMapping).forEach((ros2Type) => {
          if (!nodesMap[ros2Type]) {
            nodes.push({ id: ros2Type });
            nodesMap[ros2Type] = true;
          }
          links.push({ source: webType, target: ros2Type, value: "any" });
        });
      });

      const arrowColor = resolvedTheme === "light" ? "#333" : "#ccc";
      const lineColor = resolvedTheme === "light" ? "#333" : "#ccc";
      const fg = new ForceGraph(divRef.current as HTMLElement)
        .graphData({ nodes, links })
        .linkColor(() => arrowColor)
        // Add center-gravity force to keep disconnected nodes from drifting too far apart
        .d3Force("center", d3.forceCenter())
        // Adjust charge force (repulsion) to be less aggressive
        .d3Force("charge", d3.forceManyBody().strength(-30))
        // Add a boundary force to keep nodes within a reasonable area
        .d3Force("x", d3.forceX().strength(0.05))
        .d3Force("y", d3.forceY().strength(0.05))
        // Remove nodeLabel so labels are always drawn using custom canvas drawing
        .nodeCanvasObject((node: any, ctx, globalScale) => {
          const isWebapp = converters[node.id] !== undefined;
          const color = isWebapp ? "#f97315" : "#2f4f4f";
          const r = 5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.font = `${12 / globalScale}px Sans-Serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = lineColor;
          ctx.fillText(node.id, node.x, node.y - r - 2);
        });

      setTimeout(() => {
        fg.zoomToFit(400);
      }, 500);
    })();
  }, []);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }}></div>;
}

export function Ros2ConvertionGraphDefinition(): WidgetDefinition {
  return {
    id: "ros2-conversion-graph",
    name: "ROS2 Conversion Graph",
    description: "Shows the conversion graph between ROS2 and Webapp types",
    titleProp: "title",
    icon: <BinaryIcon />,
    schema: {
      type: "object",
      properties: {
        title: { type: "string", title: "Title" },
      },
      required: ["title"],
    },
    uischema: {
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/title" } as ControlElement,
      ],
    } as VerticalLayout,
    data: { title: "ROS2 Conversion Graph" },
    Component: () => <Ros2ConvertionGraph />,
  };
}
