"use client";
import React, { JSX, useEffect, useRef, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import * as ROSLIB from "roslib";
import * as d3 from "d3";
import type ForceGraphInstance from "force-graph";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { useThemeColors } from "@workspace/ui/hooks/use-theme-colors";
import { createDatasourceSelectHook } from "@workspace/utils";

/**
 * Widget extensibility hook turning the `datasource_id` setting into a
 * pick-list of the configured rosbridge datasources. The widget needs a
 * concrete datasource to build its connection hook name, so no "automatic"
 * member is offered.
 */
const rosbridgeDatasourceSelectHook = createDatasourceSelectHook({
	field: "datasource_id",
	definitionId: "rosbridge-suite-source",
});

/**
 * Theme tokens for the graph. Nodes, edges and labels are UI here (a view of
 * the ROS graph, not a data encoding), so all of it follows the theme.
 */
const GRAPH_TOKENS = {
	edge: "--muted-foreground",
	label: "--foreground",
	node: "--primary",
} as const;

/** Resolved graph colours; `""` before the DOM can be read. */
type GraphColors = { [K in keyof typeof GRAPH_TOKENS]: string };

/** A ROS node as the simulation has placed it. */
interface GraphNode {
	id: string;
	/** Placed by the simulation before the first draw. */
	x?: number;
	y?: number;
}

/** A topic edge between two placed ROS nodes. */
interface GraphLink {
	source: GraphNode;
	target: GraphNode;
	value: string;
}

/**
 * Apply the theme colours to a force-graph instance. Every accessor it sets
 * notifies a redraw, so a theme change repaints a graph that has cooled down.
 */
function applyGraphColors(
	graph: ForceGraphInstance<GraphNode, GraphLink>,
	colors: GraphColors,
): void {
	const edge = colors.edge || "#999999";
	const label = colors.label || "#999999";
	const node = colors.node || "#1f77b4";
	graph
		.linkColor(() => edge)
		.linkCanvasObject(
			(
				link: GraphLink,
				ctx: CanvasRenderingContext2D,
				globalScale: number,
			) => {
				const { source, target, value } = link;
				const x = ((source.x ?? 0) + (target.x ?? 0)) / 2;
				const y = ((source.y ?? 0) + (target.y ?? 0)) / 2;
				ctx.font = `${10 / globalScale}px Sans-Serif`;
				ctx.fillStyle = edge;
				ctx.strokeStyle = edge;
				ctx.textAlign = "center";
				ctx.fillText(value, x, y);
			},
		)
		.nodeCanvasObject(
			(
				node_: GraphNode,
				ctx: CanvasRenderingContext2D,
				globalScale: number,
			) => {
				const r = 5;
				ctx.beginPath();
				const x = node_.x ?? 0;
				const y = node_.y ?? 0;
				ctx.arc(x, y, r, 0, 2 * Math.PI, false);
				ctx.fillStyle = node;
				ctx.fill();
				ctx.font = `${12 / globalScale}px Sans-Serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "bottom";
				ctx.fillStyle = label;
				ctx.fillText(node_.id, x, y - r - 2);
			},
		);
}

interface RQTGraphProps extends Record<string, unknown> {
	title: string;
	datasource_id: string;
	poolingRateHz: number;
	ignoreRosout: boolean;
	ignoreParameterEvent: boolean;
}

function RQTGraph(props: RQTGraphProps): JSX.Element {
	const pluginsManager = usePluginsManager();

	const colors = useThemeColors(GRAPH_TOKENS);
	// Read by the async graph construction, which outlives the render that
	// started it; synced in an effect, never during render.
	const colorsRef = useRef(colors);
	useEffect(() => {
		colorsRef.current = colors;
	}, [colors]);

	const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);
	const [rosNodes, setRosNodes] = useState<
		Map<
			string,
			{
				subscriptions: string[];
				publications: string[];
				services: string[];
			}
		>
	>(new Map());
	const divRef = useRef<HTMLDivElement>(null);
	const [timer, setTimer] = useState<ReturnType<typeof setInterval> | null>(
		null,
	);
	const graphRef = useRef<any>(null);
	const graphDataRef = useRef<{ nodes: any[]; links: any[] }>({
		nodes: [],
		links: [],
	});

	// Establish ROSLIB connection
	useEffect(() => {
		const to = setTimeout(() => {
			setRoslib(
				pluginsManager.applyFilter(
					`${props.datasource_id}-ros-2-connection`,
					null,
				),
			);
		}, 500);

		return () => {
			clearTimeout(to);
			if (timer) {
				clearInterval(timer);
			}
		};
	}, [pluginsManager, props, timer]);

	// Set up periodic updates based on poolingRateHz
	useEffect(() => {
		if (!roslib) {
			return;
		}

		// Initial data fetch
		fetchNodeData();

		// Set up interval for periodic updates
		const refreshTimer = setInterval(() => {
			fetchNodeData();
		}, 1000 / props.poolingRateHz);

		setTimer(refreshTimer);

		return () => {
			if (refreshTimer) {
				clearInterval(refreshTimer);
			}
		};

		function fetchNodeData() {
			roslib!.getNodes((nodes: string[]) => {
				// Create a fresh map for the new state
				const newNodeMap = new Map<
					string,
					{
						subscriptions: string[];
						publications: string[];
						services: string[];
					}
				>();

				// Keep track of processed nodes to update state only once after all nodes are processed
				let processedCount = 0;

				nodes.forEach((node) => {
					(roslib as any)!.getNodeDetails(
						node,
						(result: {
							subscribing: string[];
							publishing: string[];
							services: string[];
						}) => {
							newNodeMap.set(node, {
								subscriptions: result.subscribing,
								publications: result.publishing,
								services: result.services,
							});

							processedCount++;
							if (processedCount === nodes.length) {
								// Update state with the complete new map when all nodes are processed
								setRosNodes(newNodeMap);
							}
						},
					);
				});

				// If no nodes are present, we still need to update with an empty map
				if (nodes.length === 0) {
					setRosNodes(newNodeMap);
				}
			});
		}
	}, [roslib, props.poolingRateHz]);

	// Initialize the graph once
	useEffect(() => {
		let cancelled = false;
		if (divRef.current && !graphRef.current) {
			(async () => {
				const { default: ForceGraph } = await import("force-graph");
				if (cancelled || !divRef.current) return;

				graphRef.current = new ForceGraph(divRef.current)
					.linkDirectionalArrowLength(2)
					.linkDirectionalArrowRelPos(1)
					// .linkDirectionalParticles(2)
					.linkCanvasObjectMode(() => "after")
					// Add center-gravity force to keep disconnected nodes from drifting too far apart
					.d3Force("center", d3.forceCenter())
					// Adjust charge force (repulsion) to be less aggressive
					.d3Force("charge", d3.forceManyBody().strength(-30))
					// Add a boundary force to keep nodes within a reasonable area
					.d3Force("x", d3.forceX().strength(0.05))
					.d3Force("y", d3.forceY().strength(0.05));
				applyGraphColors(graphRef.current, colorsRef.current);

				// Initial zoom to fit
				setTimeout(() => {
					if (graphRef.current) {
						graphRef.current.zoomToFit(400);
					}
				}, 1000);
			})();
		}

		return () => {
			cancelled = true;
			if (graphRef.current) {
				graphRef.current._destructor();
				graphRef.current = null;
			}
		};
	}, []);

	// Update only graph data when nodes change
	useEffect(() => {
		if (!graphRef.current) {
			return;
		}

		// Get current data with positions
		const currentData = graphRef.current.graphData();
		const existingNodesMap = new Map<string, any>(
			currentData.nodes.map((node: any) => [node.id, node]),
		);

		// Prepare new data while preserving positions
		const nodes: any[] = [];
		const links: { source: string; target: string; value: any }[] = [];

		// First add nodes - only include nodes that exist in rosNodes
		rosNodes.forEach((details, nodeName) => {
			// If the node already exists, keep its position
			if (existingNodesMap.has(nodeName)) {
				const existingNode = existingNodesMap.get(nodeName);
				nodes.push({
					id: nodeName,
					x: existingNode.x,
					y: existingNode.y,
					vx: existingNode.vx * 0.9, // Dampen velocity for smoother transitions
					vy: existingNode.vy * 0.9,
				});
			} else {
				// For new nodes
				nodes.push({ id: nodeName });
			}
		});

		// Then add links - rebuild all links from current rosNodes data
		if (nodes.length > 0) {
			rosNodes.forEach((pubDetails, pubName) => {
				const publications: string[] = pubDetails.publications || [];
				publications.forEach((topic) => {
					if (props.ignoreRosout && topic === "/rosout") return;
					if (
						props.ignoreParameterEvent &&
						topic === "/parameter_events"
					)
						return;
					rosNodes.forEach((subDetails, subName) => {
						if (
							pubName !== subName &&
							(subDetails.subscriptions || []).includes(topic)
						) {
							links.push({
								source: pubName,
								target: subName,
								value: topic,
							});
						}
					});
				});
			});
		}

		// Store for comparison in next update
		graphDataRef.current = { nodes, links };

		// Always update the graph data to ensure removed nodes are cleared
		graphRef.current.graphData({ nodes, links });

		// Apply gentle reheat if not already cooling down
		const wasCoolingDown = graphRef.current.cooldownTicks() > 0;
		if (!wasCoolingDown) {
			graphRef.current.cooldownTicks(20).cooldownTime(1000);
		}
	}, [rosNodes, props.ignoreRosout, props.ignoreParameterEvent]);

	// Manual refresh behavior - do a more significant reheat
	useEffect(() => {
		if (!graphRef.current) return;

		// When manually refreshed, apply more significant reheat
		graphRef.current.cooldownTicks(50).cooldownTime(2000);
	}, []);

	// Update styling when the theme changes (light/dark or a preset)
	useEffect(() => {
		if (!graphRef.current) return;
		applyGraphColors(graphRef.current, colors);
	}, [colors]);

	return (
		<div
			ref={divRef}
			style={{ width: "100%", height: "100%", overflow: "hidden" }}
		>
			{/* ...existing code if any... */}
		</div>
	);
}

/** Settings for RQTGraph widget. */

export function RQTGraphDefinition(): WidgetDefinition<RQTGraphProps> {
	return {
		id: "rqt-graph",
		name: "RQT Graph",
		description: "ROS2 RQT graph tool",
		titleProp: "title",
		icon: (
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<circle cx="5" cy="5" r="2" />
				<circle cx="19" cy="5" r="2" />
				<circle cx="12" cy="19" r="2" />
				<line x1="5" y1="5" x2="12" y2="19" />
				<line x1="19" y1="5" x2="12" y2="19" />
				<line x1="5" y1="5" x2="19" y2="5" />
			</svg>
		),
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				datasource_id: { type: "string", title: "Datasources" },
				poolingRateHz: { type: "number", title: "Pooling rate (Hz)" },
				ignoreRosout: { type: "boolean", title: "Ignore rosout" },
				ignoreParameterEvent: {
					type: "boolean",
					title: "Ignore parameter event",
				},
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
				{
					type: "Control",
					scope: "#/properties/datasource_id",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/poolingRateHz",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/ignoreRosout",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/ignoreParameterEvent",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: { title: "RQT Graph", poolingRateHz: 5 },
		Component: RQTGraph,
		extensibilityHook: rosbridgeDatasourceSelectHook,
	};
}
