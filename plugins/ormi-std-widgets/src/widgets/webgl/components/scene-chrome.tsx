import React, { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useThemeColors } from "@workspace/ui/hooks/use-theme-colors";
import { sceneClearColor } from "./scene-background";

/** Grid colours before the theme has been read (server / hydration render). */
const GRID_CELL_FALLBACK = "#d4d4d4";
const GRID_SECTION_FALLBACK = "#737373";

/**
 * Theme token per ground-grid role. The grid is chrome (a spatial reference,
 * not data), so it follows light/dark and theme presets through its own contract
 * tokens (globals.css). It sits below text: `--foreground` for the section
 * lines drew near-white lines across the whole dark scene, louder than the
 * data on top of it.
 */
const GRID_TOKENS = {
	cell: "--scene-grid-line",
	section: "--scene-grid-section",
} as const;

/** Props of {@link ThemedGrid}: the drei `Grid` props minus its colours. */
export type ThemedGridProps = Omit<
	React.ComponentProps<typeof Grid>,
	"cellColor" | "sectionColor"
>;

/**
 * The infinite ground grid shared by the 3D viewers, coloured from the theme.
 *
 * Must be rendered inside an R3F `<Canvas>`. A theme change updates the grid
 * material's uniforms through props, which R3F turns into a repaint under
 * `frameloop="demand"`.
 */
export const ThemedGrid: React.FC<ThemedGridProps> = (props) => {
	const colors = useThemeColors(GRID_TOKENS);
	return (
		<Grid
			infiniteGrid={true}
			{...props}
			cellColor={colors.cell || GRID_CELL_FALLBACK}
			sectionColor={colors.section || GRID_SECTION_FALLBACK}
		/>
	);
};

/** Tokens the scene clear colour is resolved from. */
const BACKGROUND_TOKENS = {
	background: "--scene-background",
	base: "--panel-background",
} as const;

/**
 * The 3D viewers' clear colour, from `--scene-background` (globals.css).
 *
 * The default is transparent, which leaves `scene.background` null and the
 * panel showing through the canvas, as before the token existed. Must be
 * rendered inside an R3F `<Canvas>`; a theme change repaints under
 * `frameloop="demand"`.
 */
export const SceneBackground: React.FC = () => {
	const colors = useThemeColors(BACKGROUND_TOKENS);
	const clear = sceneClearColor(colors.background, colors.base);
	const scene = useThree((state) => state.scene);
	const invalidate = useThree((state) => state.invalidate);
	useEffect(() => {
		scene.background = clear ? new THREE.Color(clear) : null;
		invalidate();
		return () => {
			scene.background = null;
		};
	}, [scene, invalidate, clear]);
	return null;
};

/**
 * The bottom-right orientation gizmo shared by the 3D viewers.
 *
 * Its colours are deliberately fixed in every theme: the axes use the X/Y/Z =
 * red/green/blue convention (data, not chrome), and the label is drawn on the
 * coloured axis head, so black is chosen for contrast with that head rather
 * than with the theme background.
 */
export const SceneGizmo: React.FC = () => (
	<GizmoHelper alignment="bottom-right" margin={[80, 80]}>
		<GizmoViewport
			axisColors={["red", "green", "blue"]}
			labelColor="black"
		/>
	</GizmoHelper>
);
