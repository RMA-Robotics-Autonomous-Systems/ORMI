"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	useLocalDataSource,
	SelectedTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { MapGrid } from "@workspace/ormi-core/types";
import { MapIcon } from "lucide-react";
import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Colour-mapping helpers (must stay in sync with the GLSL shaders)
// ---------------------------------------------------------------------------

type ColorMode = "costmap" | "grayscale" | "heatmap";

/** Linear interpolation between two RGB triplets. */
const lerpRgb = (
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] => [
	Math.round(a[0] + (b[0] - a[0]) * t),
	Math.round(a[1] + (b[1] - a[1]) * t),
	Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Approximate plasma colormap (matches the GPU shader). */
const plasmaRgb = (t: number): [number, number, number] => {
	const stops: [number, number, number][] = [
		[13, 8, 135],
		[126, 3, 168],
		[204, 72, 120],
		[248, 149, 64],
		[240, 249, 33],
	];
	const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
	const lo = Math.floor(scaled);
	const hi = Math.min(lo + 1, stops.length - 1);
	return lerpRgb(stops[lo]!, stops[hi]!, scaled - lo);
};

/** Green → yellow → red gradient (costmap). */
const costmapRgb = (t: number): [number, number, number] => {
	t = Math.max(0, Math.min(1, t));
	if (t < 0.5) return lerpRgb([13, 184, 38], [255, 224, 0], t * 2);
	return lerpRgb([255, 224, 0], [230, 13, 13], (t - 0.5) * 2);
};

/**
 * Map a canonical occupancy byte (0-255) to an RGBA tuple.
 * Encoding:
 *   0   = free
 *   1–253 = cost gradient
 *   254 = lethal / occupied
 *   255 = unknown
 */
const toRgba = (
	value: number,
	mode: ColorMode,
	alpha: number,
	showUnknown: boolean,
): [number, number, number, number] => {
	if (value > 254) {
		// unknown
		if (!showUnknown) return [0, 0, 0, 0];
		return [115, 115, 115, Math.round(alpha * 0.45 * 255)];
	}
	if (value === 0) {
		// free – faint tint so the background shows through
		if (mode === "grayscale")
			return [242, 242, 242, Math.round(alpha * 0.25 * 255)];
		return [13, 184, 38, Math.round(alpha * 0.12 * 255)];
	}

	const t = (value - 1) / 253;
	let rgb: [number, number, number];
	if (mode === "grayscale") {
		const g = Math.round(255 - t * 235);
		rgb = [g, g, g];
	} else if (mode === "heatmap") {
		rgb = plasmaRgb(t);
	} else {
		rgb = costmapRgb(t);
	}
	return [...rgb, Math.round(alpha * 255)] as [
		number,
		number,
		number,
		number,
	];
};

// ---------------------------------------------------------------------------
// Widget body
// ---------------------------------------------------------------------------

interface MapGridViewerBodyProps {
	colorMode: ColorMode;
	opacity: number;
	showUnknown: boolean;
}

function MapGridViewerBody({
	colorMode,
	opacity,
	showUnknown,
}: MapGridViewerBodyProps) {
	const { sources } = useLocalDataSource();
	const firstKey = Array.from(sources.keys())[0];
	const grid: MapGrid | undefined = firstKey
		? (sources.get(firstKey)?.data[0] as MapGrid)
		: undefined;
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (!grid || !canvasRef.current) return;

		const { width, height, data } = grid;
		if (width === 0 || height === 0) return;

		const canvas = canvasRef.current;
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const imageData = ctx.createImageData(width, height);
		const pixels = imageData.data;

		// Data is already in display convention (row 0 = top) – draw directly
		for (let row = 0; row < height; row++) {
			for (let col = 0; col < width; col++) {
				const srcIdx = row * width + col;
				const dstIdx = (row * width + col) * 4;
				const cell = data[srcIdx] ?? 255;
				const [r, g, b, a] = toRgba(
					cell,
					colorMode,
					opacity,
					showUnknown,
				);
				pixels[dstIdx] = r;
				pixels[dstIdx + 1] = g;
				pixels[dstIdx + 2] = b;
				pixels[dstIdx + 3] = a;
			}
		}

		ctx.putImageData(imageData, 0, 0);
	}, [grid, colorMode, opacity, showUnknown]);

	if (!grid) {
		return (
			<div
				style={{
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "#666",
					flexDirection: "column",
					gap: 8,
				}}
			>
				<MapIcon size={48} />
				<span>No map data</span>
			</div>
		);
	}

	return (
		<div
			style={{
				height: "100%",
				width: "100%",
				overflow: "auto",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 8,
				background: "#1a1a2e",
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					width: "100%",
					height: "100%",
					objectFit: "contain",
					imageRendering: "pixelated",
					border: "1px solid #333",
				}}
				title={
					grid
						? `${grid.width}×${grid.height} | res ${grid.resolution}m/cell | frame: ${grid.frameId}`
						: undefined
				}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/** Props for the 2-D MapGrid viewer widget. */
interface MapGridViewerProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	/** How to colour-map occupancy values. @default "costmap" */
	colorMode?: ColorMode;
	/** Overall opacity (0–1). @default 0.95 */
	opacity?: number;
	/** Show cells with unknown cost (value 255) in grey. @default true */
	showUnknown?: boolean;
}

/**
 * Widget definition for the 2-D Map Grid / Occupancy Grid viewer.
 * Accepts topics of web-type `MapGrid` (mapped from `nav_msgs/OccupancyGrid`
 * or `nav2_msgs/Costmap`).
 */
function MapGridViewerWidget(data: MapGridViewerProps) {
	return (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<MapGridViewerBody
				colorMode={data.colorMode ?? "costmap"}
				opacity={data.opacity ?? 0.95}
				showUnknown={data.showUnknown ?? true}
			/>
		</LocalDataSourcesProvider>
	);
}

export function MapGridViewerDefinition(): WidgetDefinition<MapGridViewerProps> {
	return {
		id: "map-grid-viewer",
		name: "Map Grid Viewer",
		description: "2D visualisation of ROS2 OccupancyGrid / Costmap topics",
		titleProp: "title",
		icon: <MapIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				topic: { type: "object", title: "Topic" },
				colorMode: {
					type: "string",
					title: "Color Mode",
					enum: ["costmap", "grayscale", "heatmap"],
					default: "costmap",
				},
				opacity: {
					type: "number",
					title: "Opacity",
					minimum: 0,
					maximum: 1,
					default: 0.95,
				},
				showUnknown: {
					type: "boolean",
					title: "Show Unknown Cells",
					default: true,
				},
			},
			required: ["title", "topic"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: ["MapGrid"],
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/colorMode",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/opacity",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/showUnknown",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Map Grid",
			colorMode: "costmap",
			opacity: 0.95,
			showUnknown: true,
		},
		Component: MapGridViewerWidget,
	};
}
