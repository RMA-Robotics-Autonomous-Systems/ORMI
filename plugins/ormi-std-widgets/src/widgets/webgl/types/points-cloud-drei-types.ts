import { SelectedTopic } from "@workspace/ormi-core/datasources";
import { CoordinateConvention } from "@workspace/ormi-core/types";

// Theme options for point cloud visualization
export type PointCloudTheme =
	| "Default"
	| "Neon"
	| "Plasma"
	| "Thermal"
	| "Solid"
	| "Distance";

// Shader definitions for each theme
export interface ThemeShaders {
	vertexShader: string;
	fragmentShader: string;
}

export interface PointsCloudProps {
	title: string;
	topics?: Array<{ topic: SelectedTopic }>;
	pointSize?: number;
	decayTime?: number;
	rollingBuffer?: boolean;
	theme?: PointCloudTheme;
	useTransparency?: boolean;
	customColor?: string;
	colorMode?: "source" | "reflectivity";
	targetFrame?: string;
	/**
	 * Coordinate convention of the source data.
	 * The component will convert from this convention to Three.js for rendering.
	 * Defaults to 'ROS' for backwards compatibility.
	 */
	sourceConvention?: CoordinateConvention;
}
