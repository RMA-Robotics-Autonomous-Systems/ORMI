import { SelectedTopic } from "@workspace/ormi-core/datasources";

// Theme options for point cloud visualization
export type PointCloudTheme =
	| "Default"
	| "Neon"
	| "Plasma"
	| "Thermal"
	| "Solid"
	| "Distance";

// Point Cloud layer configuration
export interface PointCloudLayerConfig {
	id?: string;
	enabled?: boolean;
	label?: string;
	topics?: Array<{ topic: SelectedTopic }>;
	pointSize?: number;
	decayTime?: number;
	rollingBuffer?: boolean;
	theme?: PointCloudTheme;
	useTransparency?: boolean;
	customColor?: string;
	colorMode?: "source" | "reflectivity";
}

// Path layer configuration
export interface PathLayerConfig {
	id?: string;
	enabled?: boolean;
	topic?: SelectedTopic;
	lineWidth?: number;
	lineColor?: string;
}

/**
 * Colour mode for map / occupancy grid rendering.
 *
 * - `costmap`   – green (free) → yellow → red (lethal), unknown in grey
 * - `grayscale` – bright (free) → dark (occupied), unknown in mid-grey
 * - `heatmap`   – plasma-inspired perceptual gradient
 */
export type MapGridColorMode = "costmap" | "grayscale" | "heatmap";

/** Map / occupancy grid layer configuration for the 3D Scene widget. */
export interface MapGridLayerConfig {
	id?: string;
	enabled?: boolean;
	label?: string;
	topic?: SelectedTopic;
	/** How to colour-map occupancy values. @default "costmap" */
	colorMode?: MapGridColorMode;
	/** Overall layer opacity (0–1). @default 0.85 */
	opacity?: number;
	/** Render cells with value 255 (unknown) as semi-transparent grey. @default true */
	showUnknown?: boolean;
}

/** Transform tree visualization configuration */
export interface TransformTreeConfig {
	/** Show the transform tree visualization. @default true */
	enabled?: boolean;
	/** Radius of the sphere at each frame. @default 0.05 */
	sphereRadius?: number;
	/** Radius of the cylinder connecting frames. @default 0.02 */
	cylinderRadius?: number;
	/** Color scheme for frames. @default "depth" */
	colorScheme?: "depth" | "uniform" | "rainbow";
	/** Base color when using uniform scheme. @default "#00ff88" */
	uniformColor?: string; /** Show frame labels. @default true */
	showLabels?: boolean;
}

// Main props for the 3D Scene widget
export interface Scene3DProps extends Record<string, unknown> {
	title: string;
	pointCloudLayers?: PointCloudLayerConfig[];
	pathLayers?: PathLayerConfig[];
	mapGridLayers?: MapGridLayerConfig[];
	transformTree?: TransformTreeConfig;
	targetFrame?: string;
	showGrid?: boolean;
	showAxes?: boolean;
	backgroundColor?: string;
}
