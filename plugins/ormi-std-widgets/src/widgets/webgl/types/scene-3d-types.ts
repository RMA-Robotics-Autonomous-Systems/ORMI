import { SelectedTopic } from "@workspace/ormi-core/datasources";
import { DigitalInput } from "@workspace/ui/combined/triggers";

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
	topic?: SelectedTopic;
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

/**
 * Unified pose publisher configuration.
 *
 * Drives both goal-pose mode (publishes `geometry_msgs/msg/PoseStamped`) and
 * initial-pose mode (publishes `geometry_msgs/msg/PoseWithCovarianceStamped`).
 * The two modes share a frame ID, a common marker appearance, and each have
 * their own topic and keyboard shortcut.
 */
export interface PosePublisherConfig {
	/** Enable pose publishing interactions. @default false */
	enabled?: boolean;
	/** Topic to publish the goal pose (PoseStamped). */
	goalTopic?: SelectedTopic;
	/** Topic to publish the initial pose estimate (PoseWithCovarianceStamped). */
	initialTopic?: SelectedTopic;
	/** TF frame used in all published headers. @default "map" */
	frameId?: string;
	/** Keyboard / gamepad input that toggles goal-pose mode. */
	goalShortcut?: DigitalInput;
	/** Keyboard / gamepad input that toggles initial-pose mode. */
	initialShortcut?: DigitalInput;
	/** Colour of the visual marker. @default "#ff4400" */
	markerColor?: string;
	/** Scale of the visual marker in scene units. @default 0.5 */
	markerSize?: number;
}

// Main props for the 3D Scene widget
export interface Scene3DProps extends Record<string, unknown> {
	title: string;
	pointCloudLayers?: PointCloudLayerConfig[];
	pathLayers?: PathLayerConfig[];
	mapGridLayers?: MapGridLayerConfig[];
	transformTree?: TransformTreeConfig;
	/** Unified pose publisher configuration (goal pose + initial pose estimate). */
	posePublisherConfig?: PosePublisherConfig;
	targetFrame?: string;
	showGrid?: boolean;
	showAxes?: boolean;
	backgroundColor?: string;
}
