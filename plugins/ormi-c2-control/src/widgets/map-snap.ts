/**
 * Snapping on the C2 map: a new point, a dragged vertex, or a vertex dragged
 * out of a midpoint lands exactly on another feature when the pointer comes
 * close to it.
 *
 * Only the shape being drawn or edited lives in terra-draw; every other
 * stored feature is drawn by the map's own layers, which terra-draw's
 * built-in `toLine` / `toCoordinate` snapping cannot see. The map therefore
 * feeds terra-draw 1.31.2's `snapping.toCustom` hook (draw modes) and the
 * select mode's `coordinates.snappable.toCustom` flag (vertex drags) from
 * the search here. terra-draw's point mode has no snapping option, so the
 * map snaps a new point itself when it finishes.
 *
 * Pure: no React, no map. The caller hands in the pointer in screen space and
 * terra-draw's own `project` / `unproject`, so the rules are unit-testable.
 */

/** A GeoJSON position: `[lng, lat]`. */
export type SnapPosition = [number, number];

/** A screen position in CSS pixels, relative to the map container. */
export interface ScreenPoint {
	x: number;
	y: number;
}

/** Lng/lat bounds: `[minLng, minLat, maxLng, maxLat]`. */
export type SnapBounds = [number, number, number, number];

/**
 * How close (screen pixels) the pointer must come to a target to snap, on a
 * mouse or trackpad. About a vertex handle's width (22 px across), so the
 * pull starts where the operator is already aiming.
 */
export const SNAP_TOLERANCE_PX = 12;

/** The same with any coarse pointer: a fingertip covers more than a cursor. */
export const SNAP_TOLERANCE_COARSE_PX = 20;

/**
 * The snap tolerance for the pointers present.
 * @param coarsePointer - Whether any pointer is coarse.
 * @returns Tolerance in screen pixels.
 */
export function snapTolerancePx(coarsePointer: boolean): number {
	return coarsePointer ? SNAP_TOLERANCE_COARSE_PX : SNAP_TOLERANCE_PX;
}

/** Something the pointer can snap to. */
export interface SnapTarget {
	/** The feature's id, for exclusion and for tests. */
	id: string;
	/** Positions a pointer snaps onto exactly. */
	vertices: SnapPosition[];
	/** Polylines whose segments a pointer snaps onto (a ring is closed). */
	lines: SnapPosition[][];
	/** Bounds of every position above, for the pre-filter. */
	bounds: SnapBounds;
}

/** A snap the pointer is in reach of. */
export type SnapResult =
	| {
			kind: "vertex";
			/** The target's own stored position, unchanged. */
			position: SnapPosition;
			targetId: string;
	  }
	| {
			kind: "edge";
			/** The nearest point on the segment. */
			position: SnapPosition;
			/** The segment it lies on. */
			segment: [SnapPosition, SnapPosition];
			targetId: string;
	  };

/** A stored feature as the map holds it. */
export interface SnapSourceFeature {
	geometry?: { type?: string; coordinates?: unknown } | null;
	properties?: Record<string, unknown> | null;
}

function isPosition(value: unknown): value is SnapPosition {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number" &&
		Number.isFinite(value[0]) &&
		Number.isFinite(value[1])
	);
}

function toPath(value: unknown): SnapPosition[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isPosition).map((p) => [p[0], p[1]] as SnapPosition);
}

/**
 * The vertices and polylines of a geometry. Polygon rings keep their closing
 * position, so the closing edge is a segment too.
 */
function geometryParts(geometry: SnapSourceFeature["geometry"]): {
	vertices: SnapPosition[];
	lines: SnapPosition[][];
} {
	const vertices: SnapPosition[] = [];
	const lines: SnapPosition[][] = [];
	const coordinates = geometry?.coordinates;
	const addLine = (raw: unknown) => {
		const path = toPath(raw);
		if (path.length === 0) return;
		vertices.push(...path);
		if (path.length >= 2) lines.push(path);
	};
	switch (geometry?.type) {
		case "Point":
			if (isPosition(coordinates))
				vertices.push([coordinates[0], coordinates[1]]);
			break;
		case "MultiPoint":
			vertices.push(...toPath(coordinates));
			break;
		case "LineString":
			addLine(coordinates);
			break;
		case "MultiLineString":
		case "Polygon":
			if (Array.isArray(coordinates)) coordinates.forEach(addLine);
			break;
		case "MultiPolygon":
			if (Array.isArray(coordinates))
				for (const polygon of coordinates)
					if (Array.isArray(polygon)) polygon.forEach(addLine);
			break;
		default:
			break;
	}
	return { vertices, lines };
}

function boundsOf(positions: readonly SnapPosition[]): SnapBounds {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;
	for (const [lng, lat] of positions) {
		if (lng < minLng) minLng = lng;
		if (lat < minLat) minLat = lat;
		if (lng > maxLng) maxLng = lng;
		if (lat > maxLat) maxLat = lat;
	}
	return [minLng, minLat, maxLng, maxLat];
}

/** Which layers the assets panel hides and locks, by `feature_type`. */
export interface SnapLayerState {
	hidden: ReadonlySet<string>;
	/**
	 * Locked layers. Read only to state the rule: locked means not editable,
	 * not invisible, so a locked feature is still a target.
	 */
	locked?: ReadonlySet<string>;
}

/**
 * The snap targets among the stored features the map draws.
 *
 * Excluded: features of a hidden layer (nothing on screen to snap to), the
 * feature open for editing (its stored copy sits under the live shape, and
 * snapping a vertex to its own old position would pin it in place), and
 * features with no usable coordinates. Locked layers stay targets.
 *
 * @param features - Stored features (the map's, and in a mission its assets).
 * @param layers - Hidden and locked layers.
 * @param excludeFeatureId - `feature_id` of the feature open for editing.
 * @returns One target per remaining feature.
 */
export function buildSnapTargets(
	features: readonly SnapSourceFeature[],
	layers: SnapLayerState,
	excludeFeatureId?: string | null,
): SnapTarget[] {
	const targets: SnapTarget[] = [];
	for (const [index, feature] of features.entries()) {
		const type = String(feature.properties?.feature_type ?? "");
		if (layers.hidden.has(type)) continue;
		const rawId = feature.properties?.feature_id;
		const id =
			typeof rawId === "string" && rawId.length > 0 ? rawId : `#${index}`;
		if (excludeFeatureId != null && id === excludeFeatureId) continue;
		const { vertices, lines } = geometryParts(feature.geometry);
		if (vertices.length === 0) continue;
		targets.push({ id, vertices, lines, bounds: boundsOf(vertices) });
	}
	return targets;
}

/** What terra-draw is doing to the open shape when it asks for a snap. */
export type OwnShapeGesture =
	| {
			/** A draw mode is placing points. */
			kind: "drawing";
			/** Points placed so far (terra-draw's `currentCoordinate`). */
			placed: number;
	  }
	| {
			/** The select mode is dragging one vertex. */
			kind: "dragging";
			/** Index of the dragged coordinate. */
			index: number;
	  };

function geometryPath(geometry: SnapSourceFeature["geometry"]): {
	type: "LineString" | "Polygon" | null;
	path: SnapPosition[];
} {
	if (geometry?.type === "LineString")
		return { type: "LineString", path: toPath(geometry.coordinates) };
	if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates))
		return { type: "Polygon", path: toPath(geometry.coordinates[0]) };
	return { type: null, path: [] };
}

/**
 * The open shape's own vertices it may snap to.
 *
 * A line may: while drawn, to any point placed before except the last (a
 * click there finishes the line, and a second point on the same spot is
 * refused anyway); while a vertex is dragged, to any vertex but itself and
 * its two neighbours (snapping onto a neighbour would stack two vertices).
 *
 * A polygon never does. While drawn, a click near the first corner closes
 * the ring (terra-draw's finish distance), and a corner snapped onto the
 * first one just outside that distance would leave a ring that touches
 * itself instead of a closed one. While reshaped, any vertex snapped onto
 * another pinches the ring into an invalid polygon.
 *
 * @param geometry - The open shape's live geometry (terra-draw's snapshot).
 * @param gesture - What is being done to it.
 * @returns A vertex-only target, or null.
 */
export function ownVertexTarget(
	geometry: SnapSourceFeature["geometry"],
	gesture: OwnShapeGesture,
): SnapTarget | null {
	const { type, path } = geometryPath(geometry);
	if (type !== "LineString") return null;
	let vertices: SnapPosition[];
	if (gesture.kind === "drawing") {
		// The last position is the provisional one under the pointer.
		vertices = path.slice(0, Math.max(0, gesture.placed - 1));
	} else {
		vertices = path.filter((_, i) => Math.abs(i - gesture.index) > 1);
	}
	if (vertices.length === 0) return null;
	return { id: "own", vertices, lines: [], bounds: boundsOf(vertices) };
}

/**
 * Whether the pointer is where terra-draw finishes the shape being drawn:
 * within its finish distance of a polygon's first corner or of the last
 * point placed (a polygon or a line). terra-draw tests the raw pointer for
 * that, so a snap there changes nothing it does; skipping it keeps the snap
 * indicator off a click that closes or finishes.
 *
 * @param geometry - The shape being drawn.
 * @param placed - Points placed so far.
 * @param pointer - The pointer in screen space.
 * @param project - Lng/lat to screen space.
 * @param finishDistancePx - The draw modes' finish distance.
 * @returns True when a click here finishes the shape.
 */
export function isFinishingPointer(
	geometry: SnapSourceFeature["geometry"],
	placed: number,
	pointer: ScreenPoint,
	project: (position: SnapPosition) => ScreenPoint,
	finishDistancePx: number,
): boolean {
	const { type, path } = geometryPath(geometry);
	if (type === null || placed < 1) return false;
	const near = (position: SnapPosition | undefined) => {
		if (!position) return false;
		const p = project(position);
		return Math.hypot(p.x - pointer.x, p.y - pointer.y) <= finishDistancePx;
	};
	if (type === "Polygon") {
		// terra-draw closes from the third corner on.
		if (placed < 3) return false;
		return near(path[0]) || near(path[placed - 1]);
	}
	// A line finishes on its last point from the second on.
	return placed >= 2 && near(path[placed - 1]);
}

/**
 * The lng/lat bounds a pointer's snap search covers: the four corners of a
 * square of `tolerancePx` around it, unprojected (so a rotated map is
 * covered too).
 *
 * @param pointer - The pointer in screen space.
 * @param tolerancePx - Snap tolerance.
 * @param unproject - Screen space to lng/lat.
 * @returns The bounds.
 */
export function pointerSearchBounds(
	pointer: ScreenPoint,
	tolerancePx: number,
	unproject: (x: number, y: number) => SnapPosition,
): SnapBounds {
	const corners = [
		unproject(pointer.x - tolerancePx, pointer.y - tolerancePx),
		unproject(pointer.x + tolerancePx, pointer.y - tolerancePx),
		unproject(pointer.x + tolerancePx, pointer.y + tolerancePx),
		unproject(pointer.x - tolerancePx, pointer.y + tolerancePx),
	];
	return boundsOf(corners);
}

function overlaps(a: SnapBounds, b: SnapBounds): boolean {
	return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/** What {@link findSnap} searches. */
export interface SnapQuery {
	/** The pointer, in screen space. */
	pointer: ScreenPoint;
	/** Candidates. */
	targets: readonly SnapTarget[];
	/** Snap tolerance, in screen pixels. */
	tolerancePx: number;
	/** Lng/lat to screen space (terra-draw's `project`). */
	project: (position: SnapPosition) => ScreenPoint;
	/** Screen space to lng/lat (terra-draw's `unproject`). */
	unproject: (x: number, y: number) => SnapPosition;
	/**
	 * Skip targets whose bounds miss these (from
	 * {@link pointerSearchBounds}). Omitted: every target is projected.
	 */
	searchBounds?: SnapBounds;
}

/**
 * The snap under the pointer: the nearest vertex within the tolerance, or,
 * with none, the nearest point on a segment within it. A vertex is preferred
 * over any edge, even a nearer one, because a shared corner is what an
 * operator lining two shapes up wants. A vertex snaps to its stored
 * position exactly; an edge snap is the nearest point on the segment as
 * drawn on screen.
 *
 * @param query - Pointer, candidates, tolerance and projection.
 * @returns The snap, or null when nothing is in reach.
 */
export function findSnap(query: SnapQuery): SnapResult | null {
	const { pointer, tolerancePx, project, unproject, searchBounds } = query;
	const reach = tolerancePx;
	let vertex: { position: SnapPosition; id: string; d: number } | null = null;
	let edge: {
		screen: ScreenPoint;
		segment: [SnapPosition, SnapPosition];
		id: string;
		d: number;
	} | null = null;
	for (const target of query.targets) {
		if (searchBounds && !overlaps(target.bounds, searchBounds)) continue;
		for (const position of target.vertices) {
			const p = project(position);
			const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
			if (d <= reach && (vertex === null || d < vertex.d))
				vertex = { position, id: target.id, d };
		}
		if (vertex !== null) continue;
		for (const line of target.lines) {
			let previous = project(line[0]!);
			for (let i = 1; i < line.length; i++) {
				const next = project(line[i]!);
				const dx = next.x - previous.x;
				const dy = next.y - previous.y;
				const lengthSq = dx * dx + dy * dy;
				const t =
					lengthSq === 0
						? 0
						: Math.max(
								0,
								Math.min(
									1,
									((pointer.x - previous.x) * dx +
										(pointer.y - previous.y) * dy) /
										lengthSq,
								),
							);
				const screen = {
					x: previous.x + t * dx,
					y: previous.y + t * dy,
				};
				const d = Math.hypot(
					screen.x - pointer.x,
					screen.y - pointer.y,
				);
				if (d <= reach && (edge === null || d < edge.d))
					edge = {
						screen,
						segment: [line[i - 1]!, line[i]!],
						id: target.id,
						d,
					};
				previous = next;
			}
		}
	}
	if (vertex !== null)
		return {
			kind: "vertex",
			position: [vertex.position[0], vertex.position[1]],
			targetId: vertex.id,
		};
	if (edge !== null)
		return {
			kind: "edge",
			position: unproject(edge.screen.x, edge.screen.y),
			segment: edge.segment,
			targetId: edge.id,
		};
	return null;
}

/** The pointer event terra-draw hands a snapping hook (the part read here). */
export interface SnapHookEvent {
	containerX: number;
	containerY: number;
}

/** The context terra-draw hands a snapping hook (`Snapping.toCustom`). */
export interface SnapHookContext {
	currentId?: string | number;
	currentCoordinate?: number;
	getCurrentGeometrySnapshot: () => {
		type: string;
		coordinates: unknown;
	} | null;
	project: (lng: number, lat: number) => ScreenPoint;
	unproject: (x: number, y: number) => { lng: number; lat: number };
}

/** terra-draw 1.31.2's `Snapping.toCustom`. */
export type SnapHook = (
	event: SnapHookEvent,
	context: SnapHookContext,
) => SnapPosition | undefined;

/** What a {@link createSnapHook} reads on every call. */
export interface SnapHookDeps {
	/** Snap now: the toggle is on and Alt is not held. */
	enabled: () => boolean;
	/** The other features' targets, current. */
	targets: () => readonly SnapTarget[];
	/** Snap tolerance in screen pixels. */
	tolerancePx: number;
	/** The draw modes' finish distance (never snapped over). */
	finishDistancePx: number;
	/** Where the hook is installed: a draw mode, or the select mode's drag. */
	gesture: OwnShapeGesture["kind"];
	/** Receives the indicator for every answer, null when not snapped. */
	onIndicator: (indicator: SnapIndicator | null) => void;
}

/**
 * The `toCustom` hook terra-draw calls while a shape is drawn (`drawing`) or
 * a vertex is dragged (`dragging`). Returns the snapped position, or
 * undefined to leave the pointer where it is, and reports the indicator.
 *
 * @param deps - Live state and settings.
 * @returns The hook.
 */
export function createSnapHook(deps: SnapHookDeps): SnapHook {
	return (event, context) => {
		if (!deps.enabled()) {
			deps.onIndicator(null);
			return undefined;
		}
		const pointer = { x: event.containerX, y: event.containerY };
		const project = (p: SnapPosition) => context.project(p[0], p[1]);
		const unproject = (x: number, y: number): SnapPosition => {
			const { lng, lat } = context.unproject(x, y);
			return [lng, lat];
		};
		const geometry =
			context.currentId != null
				? context.getCurrentGeometrySnapshot()
				: null;
		const index = context.currentCoordinate ?? 0;
		if (
			deps.gesture === "drawing" &&
			geometry &&
			isFinishingPointer(
				geometry,
				index,
				pointer,
				project,
				deps.finishDistancePx,
			)
		) {
			deps.onIndicator(null);
			return undefined;
		}
		const own = geometry
			? ownVertexTarget(
					geometry,
					deps.gesture === "drawing"
						? { kind: "drawing", placed: index }
						: { kind: "dragging", index },
				)
			: null;
		const others = deps.targets();
		const result = findSnap({
			pointer,
			targets: own ? [...others, own] : others,
			tolerancePx: deps.tolerancePx,
			project,
			unproject,
			searchBounds: pointerSearchBounds(
				pointer,
				deps.tolerancePx,
				unproject,
			),
		});
		deps.onIndicator(snapIndicatorOf(result));
		return result ? [result.position[0], result.position[1]] : undefined;
	};
}

/**
 * This browser's local storage, or null where it cannot be reached.
 * @returns The storage, or null.
 */
export function browserStorage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

/** Local-storage key of the Snap toggle. */
export const SNAP_STORAGE_KEY = "ormi-c2-map-snap";

/**
 * Whether snapping is on in this browser. On unless the operator turned it
 * off; on whenever storage cannot be read.
 *
 * @param storage - Where the choice is kept (`window.localStorage`).
 * @returns True when snapping is on.
 */
export function readSnapEnabled(
	storage: Pick<Storage, "getItem"> | null | undefined,
): boolean {
	try {
		return storage?.getItem(SNAP_STORAGE_KEY) !== "off";
	} catch {
		return true;
	}
}

/**
 * Keep the Snap toggle's state in this browser. A storage that refuses the
 * write leaves the choice for this page only.
 *
 * @param storage - Where the choice is kept (`window.localStorage`).
 * @param enabled - The new state.
 */
export function writeSnapEnabled(
	storage: Pick<Storage, "setItem"> | null | undefined,
	enabled: boolean,
): void {
	try {
		storage?.setItem(SNAP_STORAGE_KEY, enabled ? "on" : "off");
	} catch {
		/* private window, blocked storage: this page only */
	}
}

/** What the snap indicator shows; null when nothing is snapped. */
export type SnapIndicator = Pick<SnapResult, "kind" | "position"> & {
	segment?: [SnapPosition, SnapPosition];
};

function sameIndicator(a: SnapIndicator | null, b: SnapIndicator | null) {
	if (a === b) return true;
	if (a === null || b === null) return false;
	const samePosition = (p: SnapPosition, q: SnapPosition) =>
		p[0] === q[0] && p[1] === q[1];
	if (a.kind !== b.kind || !samePosition(a.position, b.position))
		return false;
	if (!a.segment || !b.segment) return a.segment === b.segment;
	return (
		samePosition(a.segment[0], b.segment[0]) &&
		samePosition(a.segment[1], b.segment[1])
	);
}

/**
 * The snap indicator's state, outside React: terra-draw asks for a snap on
 * every pointer move, and the map widget is too large to re-render that
 * often. The indicator layer subscribes with `useSyncExternalStore`; a set
 * to an equal value notifies nobody.
 */
export interface SnapIndicatorStore {
	get(): SnapIndicator | null;
	set(next: SnapIndicator | null): void;
	subscribe(listener: () => void): () => void;
}

/**
 * Create a {@link SnapIndicatorStore}.
 * @returns An empty store.
 */
export function createSnapIndicatorStore(): SnapIndicatorStore {
	let current: SnapIndicator | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => current,
		set(next) {
			if (sameIndicator(current, next)) return;
			current = next;
			for (const listener of listeners) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/**
 * The indicator for a snap result.
 * @param result - The snap, or null.
 * @returns What the indicator draws, or null.
 */
export function snapIndicatorOf(
	result: SnapResult | null,
): SnapIndicator | null {
	if (result === null) return null;
	return result.kind === "edge"
		? { kind: "edge", position: result.position, segment: result.segment }
		: { kind: "vertex", position: result.position };
}
