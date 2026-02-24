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

// Main props for the 3D Scene widget
export interface Scene3DProps extends Record<string, unknown> {
	title: string;
	pointCloudLayers?: PointCloudLayerConfig[];
	pathLayers?: PathLayerConfig[];
	targetFrame?: string;
	showGrid?: boolean;
	showAxes?: boolean;
	backgroundColor?: string;
}
