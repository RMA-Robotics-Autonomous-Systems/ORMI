/**
 * Selecting and deleting one vertex of the shape open in the map's Edit tool.
 *
 * terra-draw's select mode has no notion of a selected vertex: a click on a
 * vertex handle does nothing, and its default Delete binding removes the WHOLE
 * selected feature. On the C2 map that made the shape vanish from the editor
 * while the open save still held the old geometry, so Save re-wrote it
 * unchanged with nothing on screen saying so. The map therefore turns
 * terra-draw's Delete binding off ({@link MAP_SELECT_KEY_EVENTS}), finds the
 * vertex handle under a click itself ({@link vertexAtClick}) and removes that
 * one vertex through terra-draw's public API ({@link deleteVertex}).
 *
 * terra-draw marks each vertex handle ("selection point") with the id of the
 * feature it belongs to and the index of its coordinate in the UNCLOSED ring,
 * which is what this module reads. Pure apart from the terra-draw instance it
 * is handed, so the rules are unit-testable on their own.
 */

/** A GeoJSON position as the map stores it: `[lng, lat]`. */
export type VertexPosition = [number, number];

/**
 * Hit radius (screen pixels) of the select mode's handles. It is terra-draw's
 * own default, set explicitly on the select mode so a click selects a vertex
 * exactly where a drag would grab it.
 */
export const SELECT_POINTER_DISTANCE_PX = 40;

/**
 * Key bindings for the map's select mode. `delete: null` turns off
 * terra-draw's "delete the selected feature", and `deselect: null` its
 * Escape-to-deselect: the open edit owns the selection (see
 * {@link MAP_SELECT_OPTIONS}). Rotate and scale keep terra-draw's defaults.
 */
export const MAP_SELECT_KEY_EVENTS: {
	deselect: string | null;
	delete: string | null;
	rotate: string[] | null;
	scale: string[] | null;
} = {
	deselect: null,
	delete: null,
	rotate: ["Control", "r"],
	scale: ["Control", "s"],
};

/** Select-mode flags for a line, a polygon and a rectangle. */
const EDITABLE_SHAPE = {
	feature: {
		draggable: true,
		coordinates: {
			// A drag that starts on a midpoint inserts a vertex there and
			// moves it; a click still inserts it in place. Without
			// `draggable` terra-draw ignored the drag and the map panned.
			midpoints: { draggable: true },
			draggable: true,
			deletable: true,
		},
	},
};

/**
 * Select-mode flags of the map's Edit tool, keyed by each draw mode's `.mode`
 * string. A point is dragged whole; a line or an area also has draggable,
 * deletable vertices and midpoints.
 */
export const MAP_SELECT_FLAGS = {
	point: { feature: { draggable: true } },
	linestring: EDITABLE_SHAPE,
	polygon: EDITABLE_SHAPE,
	rectangle: EDITABLE_SHAPE,
};

/** Keys that delete the selected vertex. */
export const VERTEX_DELETE_KEYS: readonly string[] = ["Delete", "Backspace"];

/**
 * Whether a key press asks to delete the selected vertex.
 * @param event - The key and its modifiers.
 * @returns True for Delete or Backspace pressed without a modifier.
 */
export function isVertexDeleteKey(event: {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
}): boolean {
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	return VERTEX_DELETE_KEYS.includes(event.key);
}

/** The vertex selected in the shape open for editing. */
export interface SelectedVertex {
	/** terra-draw id of the feature the vertex belongs to. */
	featureId: string | number;
	/** Index of the coordinate in the line, or in the unclosed outer ring. */
	index: number;
	/** Where the vertex is, for drawing its selected state. */
	position: VertexPosition;
}

/** A feature terra-draw reports under the pointer. */
export interface VertexCandidate {
	geometry: { type: string; coordinates: unknown };
	properties: Record<string, unknown>;
}

function isPosition(value: unknown): value is VertexPosition {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number" &&
		Number.isFinite(value[0]) &&
		Number.isFinite(value[1])
	);
}

/**
 * The vertex handle nearest a click, among the features terra-draw reports
 * under the pointer. Anything that is not a vertex handle (the shape itself,
 * a midpoint) is ignored.
 *
 * @param candidates - Features under the pointer, select-mode guidance included.
 * @param distancePx - Screen distance from the click to a position.
 * @param maxDistancePx - Farthest a handle may be from the click.
 * @returns The nearest vertex, or null when no handle is in reach.
 */
export function vertexAtClick(
	candidates: readonly VertexCandidate[],
	distancePx: (position: VertexPosition) => number,
	maxDistancePx: number = SELECT_POINTER_DISTANCE_PX,
): SelectedVertex | null {
	let best: SelectedVertex | null = null;
	let bestDistance = Infinity;
	for (const candidate of candidates) {
		const props = candidate.properties;
		if (props?.selectionPoint !== true) continue;
		const featureId = props.selectionPointFeatureId;
		const index = props.index;
		if (typeof featureId !== "string" && typeof featureId !== "number")
			continue;
		if (typeof index !== "number" || !Number.isInteger(index) || index < 0)
			continue;
		if (candidate.geometry?.type !== "Point") continue;
		const position = candidate.geometry.coordinates;
		if (!isPosition(position)) continue;
		const distance = distancePx(position);
		if (!(distance <= maxDistancePx) || distance >= bestDistance) continue;
		bestDistance = distance;
		best = {
			featureId,
			index,
			position: [position[0], position[1]],
		};
	}
	return best;
}

/** A line or polygon geometry as terra-draw stores it. */
export interface EditableGeometry {
	type: string;
	coordinates: unknown;
}

/** The outcome of removing a vertex. */
export type VertexRemoval =
	{ ok: true; geometry: EditableGeometry } | { ok: false; message: string };

/**
 * A geometry with one vertex removed, keeping it valid: a line keeps at least
 * 2 positions, a polygon ring at least 4 (3 corners and the closing one). The
 * index counts the unclosed ring, as terra-draw's handles do, so removing the
 * first corner of a polygon re-closes the ring on the new first corner.
 *
 * @param geometry - The current geometry.
 * @param index - Vertex index (line position, or unclosed-ring position).
 * @returns The new geometry, or why the vertex cannot be removed.
 */
export function removeVertex(
	geometry: EditableGeometry,
	index: number,
): VertexRemoval {
	if (geometry.type === "LineString") {
		const line = geometry.coordinates;
		if (!Array.isArray(line) || index < 0 || index >= line.length)
			return {
				ok: false,
				message: "That point is no longer on the line.",
			};
		if (line.length <= 2)
			return { ok: false, message: "A line needs at least 2 points." };
		const next = line.filter((_, i) => i !== index);
		return {
			ok: true,
			geometry: { type: "LineString", coordinates: next },
		};
	}
	if (geometry.type === "Polygon") {
		const rings = geometry.coordinates;
		const outer = Array.isArray(rings) ? rings[0] : undefined;
		if (!Array.isArray(outer) || outer.length < 2)
			return {
				ok: false,
				message: "That point is no longer on the area.",
			};
		const corners = outer.slice(0, -1);
		if (index < 0 || index >= corners.length)
			return {
				ok: false,
				message: "That point is no longer on the area.",
			};
		if (corners.length <= 3)
			return { ok: false, message: "An area needs at least 3 corners." };
		const kept = corners.filter((_, i) => i !== index);
		const first = kept[0] as unknown[];
		const ring = [...kept, [...first]];
		return {
			ok: true,
			geometry: {
				type: "Polygon",
				coordinates: [ring, ...(rings as unknown[]).slice(1)],
			},
		};
	}
	return {
		ok: false,
		message: "Only a line or an area has points to remove.",
	};
}

/** The outcome of deleting the selected vertex. */
export type VertexDeletion<F> =
	{ ok: true; feature: F } | { ok: false; message: string };

/**
 * Remove a vertex from a shape in the draw layer. terra-draw redraws the
 * shape's handles itself; the returned feature is the shape as it now is,
 * for the open save.
 *
 * @param draw - The terra-draw instance holding the shape.
 * @param vertex - The selected vertex.
 * @returns The updated feature, or why nothing changed.
 */
export function deleteVertex<F extends { geometry: EditableGeometry }>(
	draw: {
		getSnapshotFeature(id: string | number): F | undefined;
		updateFeatureGeometry(
			id: string | number,
			geometry: F["geometry"],
		): void;
	},
	vertex: Pick<SelectedVertex, "featureId" | "index">,
): VertexDeletion<F> {
	const before = draw.getSnapshotFeature(vertex.featureId);
	if (!before)
		return {
			ok: false,
			message: "That shape is no longer open for editing.",
		};
	const removal = removeVertex(before.geometry, vertex.index);
	if (!removal.ok) return removal;
	try {
		draw.updateFeatureGeometry(
			vertex.featureId,
			removal.geometry as F["geometry"],
		);
	} catch (error) {
		console.error("[c2 map] terra-draw refused the vertex removal", error);
		return { ok: false, message: "That point cannot be removed." };
	}
	const after = draw.getSnapshotFeature(vertex.featureId);
	if (!after)
		return {
			ok: false,
			message: "That shape is no longer open for editing.",
		};
	return { ok: true, feature: after };
}

/**
 * Options of the map's select mode (the Edit tool).
 *
 * `allowManualDeselection: false`: a click that terra-draw does not count as
 * on the shape never deselects it. terra-draw counted a click exactly on a
 * vertex handle as off the shape whenever no midpoint was within reach
 * (corners farther apart than twice the hit radius, i.e. any site-zoom
 * shape), so selecting a vertex dropped the whole selection, and a stray
 * click left the edit card offering Save on a shape with no handles. The
 * edit lifecycle deselects instead: Save and Cancel clear the draw layer, a
 * tool change stops the select mode, and opening another feature replaces it.
 */
export const MAP_SELECT_OPTIONS = {
	pointerDistance: SELECT_POINTER_DISTANCE_PX,
	keyEvents: MAP_SELECT_KEY_EVENTS,
	flags: MAP_SELECT_FLAGS,
	allowManualDeselection: false,
};
