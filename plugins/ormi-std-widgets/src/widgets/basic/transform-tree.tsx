"use client";
import React, { JSX, useEffect, useRef } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import * as d3 from "d3";
import { useTheme } from "next-themes";
import { TransformTree } from "@workspace/ormi-core/types";
import { useTransformSource } from "@workspace/ormi-core/transforms";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

interface TransformTreeViewerProps {
	title: string;
	showCoordinates: boolean;
	treeId?: string;
}

function TransformTreeViewer(props: TransformTreeViewerProps): JSX.Element {
	const { resolvedTheme } = useTheme();
	const { transformsTrees } = useTransformSource();
	const divRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Early exit if no data or container
		if (!transformsTrees || transformsTrees.size === 0 || !divRef.current)
			return;

		(async () => {
			const { default: ForceGraph } = await import("force-graph");

			// Prepare nodes and links
			const nodes: { id: string }[] = [];
			const links: { source: string; target: string; value: string }[] =
				[];
			const nodesMap: { [key: string]: boolean } = {};

			// Check if we should display all trees or just a specific one
			if (props.treeId && transformsTrees.has(props.treeId)) {
				// If a specific valid treeId is provided, display only that tree
				const selectedTree = transformsTrees.get(props.treeId);

				// Function to recursively process nodes
				const processNode = (nodeId: string, node: TransformTree) => {
					// Add the current node if not already added
					if (!nodesMap[nodeId]) {
						nodes.push({ id: nodeId });
						nodesMap[nodeId] = true;
					}

					// Process all children and create links
					if (node.children && node.children.size > 0) {
						node.children.forEach((childNode, childId) => {
							// Add child node if not already added
							if (!nodesMap[childId]) {
								nodes.push({ id: childId });
								nodesMap[childId] = true;
							}

							// Add link from current node to child
							const linkValue = props.showCoordinates
								? `${childNode.transform.position.x.toFixed(2)},${childNode.transform.position.y.toFixed(2)},${childNode.transform.position.z.toFixed(2)}`
								: "";

							links.push({
								source: nodeId,
								target: childId,
								value: linkValue,
							});

							// Recursively process the child
							processNode(childId, childNode);
						});
					}
				};

				// Process just the selected tree
				processNode(props.treeId, selectedTree!);
			} else {
				// If no valid treeId is specified or it doesn't exist, display ALL trees

				// Add all trees to the graph
				transformsTrees.forEach((tree, treeId) => {
					// Add root node if not already added
					if (!nodesMap[treeId]) {
						nodes.push({ id: treeId });
						nodesMap[treeId] = true;
					}

					// Process each tree's children
					const processNode = (
						nodeId: string,
						node: TransformTree,
					) => {
						// Process all children and create links
						if (node.children && node.children.size > 0) {
							node.children.forEach((childNode, childId) => {
								// Add child node if not already added
								if (!nodesMap[childId]) {
									nodes.push({ id: childId });
									nodesMap[childId] = true;
								}

								// Add link from current node to child
								const linkValue = props.showCoordinates
									? `${childNode.transform.position.x.toFixed(2)},${childNode.transform.position.y.toFixed(2)},${childNode.transform.position.z.toFixed(2)}`
									: "";

								links.push({
									source: nodeId,
									target: childId,
									value: linkValue,
								});

								// Recursively process the child
								processNode(childId, childNode);
							});
						}
					};

					// Process this tree
					processNode(treeId, tree);
				});
			}

			const arrowColor = resolvedTheme === "light" ? "#333" : "#ccc";
			const lineColor = resolvedTheme === "light" ? "#333" : "#ccc";

			// Clear previous graph instance if any
			divRef.current!.innerHTML = "";

			const fg = new ForceGraph(divRef.current!)
				.graphData({ nodes, links })
				.linkColor(() => arrowColor)
				.linkDirectionalArrowLength(2)
				.linkDirectionalArrowRelPos(1)
				.linkCanvasObjectMode(() => "after")
				// Add center-gravity force to keep disconnected nodes from drifting too far apart
				.d3Force("center", d3.forceCenter())
				// Adjust charge force (repulsion) to be less aggressive
				.d3Force("charge", d3.forceManyBody().strength(-30))
				// Add a boundary force to keep nodes within a reasonable area
				.d3Force("x", d3.forceX().strength(0.05))
				.d3Force("y", d3.forceY().strength(0.05))
				.linkCanvasObject((link: any, ctx, globalScale) => {
					const { source, target, value } = link;
					if (!value) return; // Only draw if we have a value

					const x = (source.x + target.x) / 2;
					const y = (source.y + target.y) / 2;
					ctx.font = `${10 / globalScale}px Sans-Serif`;
					ctx.fillStyle = arrowColor;
					ctx.strokeStyle = arrowColor;
					ctx.textAlign = "center";
					ctx.fillText(value, x, y);
				})
				.nodeCanvasObject((node: any, ctx, globalScale) => {
					// Use different colors for root nodes vs child nodes
					const isRoot = transformsTrees.has(node.id);
					const color = isRoot ? "#f97315" : "#1f77b4";

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

			// Auto-zoom to fit the graph
			setTimeout(() => {
				fg.zoomToFit(400);
			}, 500);
		})();
	}, [
		transformsTrees,
		props.treeId,
		props.showCoordinates,
		resolvedTheme,
		divRef.current,
	]);

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				ref={divRef}
				style={{
					width: "100%",
					height: "100%",
					overflow: "hidden",
					position: "relative",
				}}
			/>
		</div>
	);
}

export function TransformTreeWidgetDefinition(): WidgetDefinition {
	return {
		id: "transform-tree",
		name: "Transform Tree Viewer",
		description: "Displays the transform tree hierarchy as a graph",
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
				<circle cx="12" cy="5" r="3" />
				<line x1="12" y1="8" x2="12" y2="10" />
				<circle cx="6" cy="16" r="3" />
				<line x1="6" y1="13" x2="9" y2="10" />
				<circle cx="18" cy="16" r="3" />
				<line x1="18" y1="13" x2="15" y2="10" />
			</svg>
		),
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				showCoordinates: { type: "boolean", title: "Show Coordinates" },
				treeId: { type: "string", title: "Tree ID (optional)" },
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
					scope: "#/properties/showCoordinates",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/treeId",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Transform Tree Viewer",
			showCoordinates: true,
		},
		Component: (data: TransformTreeViewerProps) => (
			<TransformTreeViewer {...data} />
		),
	};
}
