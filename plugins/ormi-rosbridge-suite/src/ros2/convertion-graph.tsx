"use client";
import React, { JSX } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { UnifiedConverter } from "./unified-converter";

// Removed: import ForceGraph from 'force-graph';
import { useEffect, useRef } from "react";
import { BinaryIcon } from "lucide-react";
import * as d3 from "d3";
import type ForceGraphInstance from "force-graph";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { useThemeColors } from "@workspace/ui/hooks/use-theme-colors";

/**
 * A webapp type node. Fixed: it is the one category this view encodes, and
 * the orange holds contrast on both themes. Everything else is chrome.
 */
const WEBAPP_NODE_COLOR = "#f97315";

/** Theme tokens for the graph chrome: edges, labels, ROS2 type nodes. */
const GRAPH_TOKENS = {
	edge: "--muted-foreground",
	label: "--foreground",
	rosNode: "--muted-foreground",
} as const;

/** Resolved graph colours; `""` before the DOM can be read. */
type GraphColors = { [K in keyof typeof GRAPH_TOKENS]: string };

/** A type node as the simulation has placed it. */
interface GraphNode {
	id: string;
	/** Placed by the simulation before the first draw. */
	x?: number;
	y?: number;
}

/**
 * Apply the theme colours to a force-graph instance. Every accessor it sets
 * notifies a redraw, so a theme change repaints a graph that has cooled down.
 */
function applyGraphColors(
	graph: ForceGraphInstance<GraphNode>,
	colors: GraphColors,
	isWebapp: (id: string) => boolean,
): void {
	const edge = colors.edge || "#999999";
	const label = colors.label || "#999999";
	const rosNode = colors.rosNode || "#2f4f4f";
	graph
		.linkColor(() => edge)
		// Labels are always drawn by the custom canvas object, not nodeLabel.
		.nodeCanvasObject(
			(
				node: GraphNode,
				ctx: CanvasRenderingContext2D,
				globalScale: number,
			) => {
				const r = 5;
				ctx.beginPath();
				const x = node.x ?? 0;
				const y = node.y ?? 0;
				ctx.arc(x, y, r, 0, 2 * Math.PI, false);
				ctx.fillStyle = isWebapp(node.id) ? WEBAPP_NODE_COLOR : rosNode;
				ctx.fill();
				ctx.font = `${12 / globalScale}px Sans-Serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "bottom";
				ctx.fillStyle = label;
				ctx.fillText(node.id, x, y - r - 2);
			},
		);
}

/** Whether a graph node id is a webapp type (a converter key). */
function isWebappType(id: string): boolean {
	return UnifiedConverter.converters[id] !== undefined;
}

function Ros2ConvertionGraph(): JSX.Element {
	const divRef = useRef<HTMLDivElement>(null);
	const graphRef = useRef<ForceGraphInstance<GraphNode> | null>(null);

	const colors = useThemeColors(GRAPH_TOKENS);
	// Read by the async graph construction; synced in an effect, never during
	// render.
	const colorsRef = useRef(colors);
	useEffect(() => {
		colorsRef.current = colors;
	}, [colors]);

	useEffect(() => {
		if (!graphRef.current) return;
		applyGraphColors(graphRef.current, colors, isWebappType);
	}, [colors]);

	useEffect(() => {
		let cancelled = false;
		let fitTimer: ReturnType<typeof setTimeout> | undefined;
		(async () => {
			const { default: ForceGraph } = await import("force-graph");
			if (cancelled || !divRef.current) return;

			// Compute nodes and links from UnifiedConverter's converters mapping.
			const converters = UnifiedConverter.converters;
			const nodesMap: { [key: string]: boolean } = {};
			const nodes: { id: string }[] = [];
			const links: { source: string; target: string; value: "any" }[] =
				[];

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
					links.push({
						source: webType,
						target: ros2Type,
						value: "any",
					});
				});
			});

			const fg = new ForceGraph<GraphNode>(divRef.current)
				.graphData({ nodes, links })
				// Add center-gravity force to keep disconnected nodes from drifting too far apart
				.d3Force("center", d3.forceCenter())
				// Adjust charge force (repulsion) to be less aggressive
				.d3Force("charge", d3.forceManyBody().strength(-30))
				// Add a boundary force to keep nodes within a reasonable area
				.d3Force("x", d3.forceX().strength(0.05))
				.d3Force("y", d3.forceY().strength(0.05));
			graphRef.current = fg;
			applyGraphColors(fg, colorsRef.current, isWebappType);

			fitTimer = setTimeout(() => {
				fg.zoomToFit(400);
			}, 500);
		})();

		return () => {
			cancelled = true;
			clearTimeout(fitTimer);
			if (graphRef.current) {
				graphRef.current._destructor();
				graphRef.current = null;
			}
		};
	}, []);

	return <div ref={divRef} style={{ width: "100%", height: "100%" }}></div>;
}

/** Props for Ros2ConvertionGraph widget. */
interface Ros2ConvertionGraphProps extends Record<string, unknown> {
	title: string;
}

/** Settings for Ros2ConvertionGraph widget. */

export function Ros2ConvertionGraphDefinition(): WidgetDefinition<Ros2ConvertionGraphProps> {
	return {
		id: "ros2-conversion-graph",
		name: "ROS2 Conversion Graph",
		description: "ROS2 to Webapp type graph",
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
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: { title: "ROS2 Conversion Graph" },
		Component: Ros2ConvertionGraph,
	};
}
