"use client";
import React, { JSX, useEffect, useMemo, useRef, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	select,
	zoom,
	zoomIdentity,
	type D3ZoomEvent,
	type HierarchyPointNode,
	type ZoomBehavior,
} from "d3";
import { useAtomValue } from "jotai";
import {
	useTransformEdges,
	frameRawName,
	frameSource,
} from "@workspace/ormi-core/transforms";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { datasourcesAtom } from "@workspace/ormi-core/dashboard";
import {
	SUPER_ROOT,
	type StratifyNode,
	type TfNodeInput,
	buildStratifyNodes,
	computeTreeLayout,
	filterByTree,
	topologySignature,
	translationMagnitude,
} from "./transform-tree-layout";

/** Props for TransformTreeViewer. */
interface TransformTreeViewerProps extends Record<string, unknown> {
	title: string;
	/** Show translation magnitude on edges. (Legacy name retained for config back-compat.) */
	showCoordinates: boolean;
	treeId?: string;
}

const STALE_MS = 1000;
const AGING_MS = 500;
const NODE_RADIUS = 5;

type Staleness = "fresh" | "aging" | "stale";

/** Monotonic clock matching `TransformEdge.receivedAt`. */
function monotonicNow(): number {
	return typeof performance !== "undefined" && performance.now
		? performance.now()
		: Date.now();
}

function stalenessOf(data: TfNodeInput, now: number): Staleness {
	if (data.isStatic) return "fresh";
	const age = now - data.receivedAt;
	if (age > STALE_MS) return "stale";
	if (age > AGING_MS) return "aging";
	return "fresh";
}

/** CSS-variable color tokens (no hardcoded hex). */
function nodeColor(node: StratifyNode, now: number): string {
	if (node.isVirtual || !node.data) return "var(--muted-foreground)";
	switch (stalenessOf(node.data, now)) {
		case "stale":
			return "var(--destructive)";
		case "aging":
			return "var(--chart-4)";
		default:
			return "var(--primary)";
	}
}

/** Hover/title text for a node. `nameOf` maps a datasource id to its display title. */
function nodeTitle(
	node: StratifyNode,
	now: number,
	nameOf: (id: string) => string,
): string {
	if (node.isVirtual || !node.data) {
		const src = frameSource(node.id);
		return `${frameRawName(node.id)}${src ? `\nsource: ${nameOf(src)}` : ""}\n(inferred parent — never observed)`;
	}
	const d = node.data;
	const age = Math.max(0, Math.round(now - d.receivedAt));
	const lines = [
		d.rawFrameId,
		`source: ${nameOf(d.source)}`,
		`translation: ${d.magnitude.toFixed(3)} m`,
		d.isStatic ? "static (/tf_static)" : `age: ${age} ms`,
	];
	return lines.join("\n");
}

/** Left-to-right link path between two laid-out nodes (node.y = depth axis, node.x = cross). */
function linkPath(
	source: HierarchyPointNode<StratifyNode>,
	target: HierarchyPointNode<StratifyNode>,
): string {
	const sx = source.y;
	const sy = source.x;
	const tx = target.y;
	const ty = target.x;
	const mx = (sx + tx) / 2;
	return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
}

/**
 * Transform tree viewer — a deterministic `rqt_tf_tree`-style hierarchy.
 *
 * Reads the flat transform edges, lays them out once per *topology* change with d3-hierarchy,
 * and renders them as React SVG. Pose updates only recolor/relabel; they never reflow. Pan/zoom
 * is a single d3-zoom binding with proper cleanup. No physics, no per-message teardown.
 */
function TransformTreeViewer(props: TransformTreeViewerProps): JSX.Element {
	const edges = useTransformEdges();
	// Map datasource ids → display titles so node labels/tooltips show the configured
	// datasource name, not the opaque instance id.
	const datasources = useAtomValue(datasourcesAtom);
	const nameOf = useMemo(() => {
		const titles = new Map<string, string>();
		for (const [key, ds] of datasources) {
			titles.set(key, ds.title);
			if (ds.settings?.id) titles.set(ds.settings.id, ds.title);
		}
		return (id: string) => titles.get(id) ?? id;
	}, [datasources]);
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const gRef = useRef<SVGGElement>(null);
	const didFitRef = useRef(false);

	const [now, setNow] = useState(0);
	const [size, setSize] = useState({ width: 0, height: 0 });

	// Map edges → layout inputs (carries magnitude; topology comes from frameId/parentId).
	const inputs = useMemo<TfNodeInput[]>(
		() =>
			edges.map((e) => ({
				frameId: e.frameId,
				parentId: e.parentId,
				rawFrameId: e.rawFrameId,
				source: e.source,
				isStatic: e.isStatic,
				parentObserved: e.parentObserved,
				receivedAt: e.receivedAt,
				magnitude: translationMagnitude(e.transform.position),
			})),
		[edges],
	);

	const treeId = props.treeId;

	// Relayout only when topology changes (sorted child→parent pairs), not on pose updates.
	const topoSig = useMemo(
		() => topologySignature(inputs, treeId),
		[inputs, treeId],
	);

	const layout = useMemo(() => {
		const scoped = filterByTree(inputs, treeId);
		if (scoped.length === 0) return { root: null, ok: true } as const;
		return computeTreeLayout(buildStratifyNodes(scoped));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [topoSig]);

	// A magnitude lookup keyed by frame id, refreshed on every pose update (cheap, no relayout).
	const magnitudeByFrame = useMemo(() => {
		const map = new Map<string, number>();
		for (const input of inputs) map.set(input.frameId, input.magnitude);
		return map;
	}, [inputs]);

	// Tick the clock so staleness advances even when no transforms arrive.
	useEffect(() => {
		const hasDynamic = inputs.some((n) => !n.isStatic);
		setNow(monotonicNow());
		if (!hasDynamic) return;
		const id = setInterval(() => setNow(monotonicNow()), 500);
		return () => clearInterval(id);
	}, [inputs]);

	// Track container size for centering.
	useEffect(() => {
		const el = containerRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) setSize({ width: rect.width, height: rect.height });
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Reset the auto-fit when data drains (so a reconnect re-centers).
	useEffect(() => {
		if (inputs.length === 0) didFitRef.current = false;
	}, [inputs.length]);

	const nodes = layout.ok && layout.root ? layout.root.descendants() : [];
	const links = layout.ok && layout.root ? layout.root.links() : [];
	const visibleNodes = nodes.filter((d) => d.data.id !== SUPER_ROOT);
	const visibleLinks = links.filter((l) => l.source.data.id !== SUPER_ROOT);
	const isEmpty = visibleNodes.length === 0;

	// Attach pan/zoom whenever the SVG exists. The SVG is unmounted while the widget is empty,
	// so this must re-run on the empty↔data transition — an attach-once (empty deps) effect runs
	// before the first data arrives, finds no SVG, and never attaches: pan/zoom dead.
	const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	useEffect(() => {
		const svgEl = svgRef.current;
		const gEl = gRef.current;
		if (isEmpty || !svgEl || !gEl) return;
		const svgSel = select(svgEl);
		const zoomBehavior = zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
				select(gEl).attr("transform", event.transform.toString());
			});
		svgSel.call(zoomBehavior);
		zoomRef.current = zoomBehavior;
		return () => {
			svgSel.on(".zoom", null);
			zoomRef.current = null;
		};
	}, [isEmpty]);

	// One-time fit: center the laid-out tree once data + size are available. Applied THROUGH the
	// zoom behavior (never a raw `transform` attr write) so d3-zoom's internal state matches the
	// screen — a raw write leaves d3 at identity and the first drag snaps the view back.
	useEffect(() => {
		const svgEl = svgRef.current;
		const zoomBehavior = zoomRef.current;
		if (!svgEl || !zoomBehavior || didFitRef.current) return;
		if (!layout.ok || !layout.root || size.height === 0) return;

		const treeNodes = layout.root.descendants();
		const xs = treeNodes.map((d) => d.x);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const treeCenterY = (minX + maxX) / 2;
		const transform = zoomIdentity.translate(
			48,
			size.height / 2 - treeCenterY,
		);
		select(svgEl).call(zoomBehavior.transform, transform);
		didFitRef.current = true;
	}, [layout, size.height, isEmpty]);

	return (
		<div
			ref={containerRef}
			style={{
				width: "100%",
				height: "100%",
				position: "relative",
				overflow: "hidden",
			}}
		>
			{isEmpty ? (
				<div
					style={{
						width: "100%",
						height: "100%",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--muted-foreground)",
						fontSize: 13,
					}}
				>
					{layout.ok
						? "No transforms received"
						: "Unable to render transform tree"}
				</div>
			) : (
				<svg
					ref={svgRef}
					width="100%"
					height="100%"
					role="img"
					aria-label={`Transform tree with ${visibleNodes.length} frames`}
					style={{ display: "block", cursor: "grab" }}
				>
					<g ref={gRef}>
						{visibleLinks.map((link) => (
							<path
								key={`${link.source.data.id}->${link.target.data.id}`}
								d={linkPath(link.source, link.target)}
								fill="none"
								stroke="var(--border)"
								strokeWidth={1.5}
							/>
						))}
						{visibleNodes.map((node) => {
							const data = node.data;
							const color = nodeColor(data, now);
							const isInferred = data.isVirtual || !data.data;
							const magnitude = data.data
								? magnitudeByFrame.get(data.id)
								: undefined;
							return (
								<g
									key={data.id}
									transform={`translate(${node.y},${node.x})`}
								>
									<title>
										{nodeTitle(data, now, nameOf)}
									</title>
									<circle
										r={NODE_RADIUS}
										fill={isInferred ? "none" : color}
										stroke={color}
										strokeWidth={isInferred ? 1.5 : 1}
										strokeDasharray={
											isInferred ? "3 2" : undefined
										}
									/>
									<text
										x={NODE_RADIUS + 4}
										y={3}
										fontSize={11}
										fill="var(--foreground)"
									>
										{data.data
											? data.data.rawFrameId
											: frameRawName(data.id)}
									</text>
									{isInferred && frameSource(data.id) && (
										<text
											x={NODE_RADIUS + 4}
											y={14}
											fontSize={9}
											fill="var(--muted-foreground)"
										>
											{nameOf(frameSource(data.id)!)}
										</text>
									)}
									{!isInferred &&
										props.showCoordinates &&
										magnitude !== undefined && (
											<text
												x={NODE_RADIUS + 4}
												y={14}
												fontSize={9}
												fill="var(--muted-foreground)"
											>
												{magnitude.toFixed(2)} m
											</text>
										)}
								</g>
							);
						})}
					</g>
				</svg>
			)}
		</div>
	);
}

/**
 * Widget definition for TransformTreeViewer.
 * @returns Widget definition.
 */
export function TransformTreeWidgetDefinition(): WidgetDefinition<TransformTreeViewerProps> {
	return {
		id: "transform-tree",
		name: "Transform Tree Viewer",
		description: "Transform tree hierarchy graph",
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
				showCoordinates: {
					type: "boolean",
					title: "Show translation magnitude",
				},
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
		Component: TransformTreeViewer,
	};
}
