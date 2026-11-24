/**
 * How the C2 map draws a robot's lines, so that what it WILL drive, what it
 * HAS driven and what it is steering for right now read apart at a glance.
 *
 * Three sources draw a line per robot: the mission feedback's tasks (the
 * planned route, split at the robot's progress into the part still to drive
 * and the part done), the session breadcrumb (where the robot has been), and
 * the Nav2 global plan (where it is steering this second). They used to be
 * told apart by little more than colour, and colour already means "which
 * robot". So each kind has its own PATTERN and WIDTH, and colour stays the
 * robot's:
 *
 * - planned: wide, on a white casing; solid once approved, long dashes while
 *   it is a plan nobody approved yet;
 * - driven: thin and solid on a faint casing, a trace rather than a road;
 * - live path: dots on a white casing, narrower than the planned route.
 *
 * These lines are meaning against a basemap, not chrome, so their styles are
 * fixed (AGENTS.md "Colours come from theme tokens", rule 3): the white
 * casings are what keep a line readable on dark imagery; on a light vector
 * style the robot's colour carries it. MapLibre dash lengths are in multiples of the line width.
 *
 * Pure: the map's `<Layer>` paints and the legend's swatches are both read
 * from {@link ROUTE_STYLES}, so the legend cannot describe a line the map
 * does not draw.
 */

/** The kinds of robot line the map draws. */
export type RouteKind = "planned" | "preview" | "driven" | "intent";

/** One kind's look: a casing under a core in the robot's colour. */
export interface RouteStyle {
	/** What the legend calls it. */
	label: string;
	casing: { color: string; width: number; opacity: number };
	core: {
		width: number;
		opacity: number;
		/** MapLibre `line-dasharray`, in line widths; none for a solid line. */
		dash?: [number, number];
		/** `round` turns a zero-length dash into a dot. */
		cap: "round" | "butt";
	};
}

/** White, for a casing that must clear a dark basemap. */
const LIGHT_CASING = "#ffffff";

/** Each kind's look, in the order the legend lists them. */
export const ROUTE_STYLES: Readonly<Record<RouteKind, RouteStyle>> = {
	planned: {
		label: "Planned route",
		casing: { color: LIGHT_CASING, width: 8, opacity: 0.9 },
		core: { width: 5, opacity: 1, cap: "round" },
	},
	preview: {
		label: "Plan, not approved",
		casing: { color: LIGHT_CASING, width: 8, opacity: 0.9 },
		core: { width: 5, opacity: 1, dash: [2, 1.25], cap: "butt" },
	},
	intent: {
		label: "Live path",
		casing: { color: LIGHT_CASING, width: 5, opacity: 0.85 },
		core: { width: 3, opacity: 1, dash: [0, 2], cap: "round" },
	},
	driven: {
		label: "Driven",
		casing: { color: LIGHT_CASING, width: 4, opacity: 0.55 },
		core: { width: 2, opacity: 0.85, cap: "round" },
	},
};

/** The kinds, in legend order. */
export const ROUTE_KINDS: readonly RouteKind[] = [
	"planned",
	"preview",
	"intent",
	"driven",
];

/**
 * The kind of one stretch of a feedback route.
 *
 * @param part - `done` for the stretch the robot has passed, `remaining` for
 *   the stretch still ahead.
 * @param committed - Whether the mission is committed (approved, started or
 *   paused), so its plan is no longer a preview.
 * @returns `driven` for what is done; `planned` or `preview` for the rest.
 */
export function feedbackRouteKind(
	part: "done" | "remaining",
	committed: boolean,
): RouteKind {
	if (part === "done") return "driven";
	return committed ? "planned" : "preview";
}

/** A MapLibre line layer's `layout` and `paint`, for one half of a kind. */
export interface RouteLayerSpec {
	layout: { "line-cap": "round" | "butt"; "line-join": "round" };
	paint: Record<string, unknown>;
}

/**
 * The casing layer of a kind: a solid band under the core.
 * @param kind - The kind.
 * @returns Its layout and paint.
 */
export function routeCasingLayer(kind: RouteKind): RouteLayerSpec {
	const { casing, core } = ROUTE_STYLES[kind];
	return {
		layout: { "line-cap": core.cap, "line-join": "round" },
		paint: {
			"line-color": casing.color,
			"line-width": casing.width,
			"line-opacity": casing.opacity,
		},
	};
}

/**
 * The core layer of a kind, in each feature's `color` (the robot's).
 * @param kind - The kind.
 * @returns Its layout and paint.
 */
export function routeCoreLayer(kind: RouteKind): RouteLayerSpec {
	const { core } = ROUTE_STYLES[kind];
	return {
		layout: { "line-cap": core.cap, "line-join": "round" },
		paint: {
			"line-color": ["get", "color"],
			"line-width": core.width,
			"line-opacity": core.opacity,
			...(core.dash ? { "line-dasharray": core.dash } : {}),
		},
	};
}
