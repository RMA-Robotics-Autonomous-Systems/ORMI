import { SelectedTopic } from "@workspace/ormi-core/datasources";

// Theme options for point cloud visualization
export type PointCloudTheme =
	"Default" | "Neon" | "Plasma" | "Thermal" | "Solid" | "Distance";

/**
 * Theme a point-cloud layer starts on.
 *
 * `Distance` rather than `Default`: `Default` renders a cloud in the colors the
 * message carries, and a cloud that carries none is filled white — invisible on
 * the light-theme canvas, which reads as "the topic is dead" rather than "this
 * cloud has no colors". Distance colors every point from its range to the target
 * frame's origin, so a newly placed layer always shows something. It is the one
 * named default for this choice: every schema default, seed, and `??` fallback
 * resolves through it.
 */
export const DEFAULT_POINT_CLOUD_THEME: PointCloudTheme = "Distance";

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
