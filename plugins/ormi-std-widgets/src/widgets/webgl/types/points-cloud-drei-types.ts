import { SelectedTopic } from "@workspace/ormi-core/datasources";

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

export interface PointsCloudProps extends Record<string, unknown> {
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
	maxPoints?: number;
}
