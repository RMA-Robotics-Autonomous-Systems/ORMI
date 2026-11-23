/**
 * Moving a group of selected features on the C2 map by one drag.
 *
 * ## The approach: one offset in Web Mercator
 *
 * The operator drags anywhere on the map and every selected feature follows
 * the pointer by the same screen delta. The map is Web Mercator, and at a
 * given zoom a screen pixel is the same distance in Mercator units anywhere
 * on screen. So the drag is measured once, as the Mercator offset between
 * where the pointer went down and where it is now, and that one offset is
 * added to every vertex of every selected feature in Mercator space before
 * converting back to longitude and latitude.
 *
 * What that gives:
 * - every feature moves by exactly the distance the pointer moved on screen,
 *   wherever it sits in the viewport (a plain degree offset would not: a
 *   degree of latitude is longer on screen the further north it is);
 * - each shape arrives with the same on-screen form, because a translation
 *   in Mercator space keeps every vertex's position relative to the others;
 * - the longitude offset is identical for every vertex, and the latitude
 *   offset differs between vertices only by Mercator's own stretch (about
 *   half a millimetre across a 200 m site moved 15 m, at 51 degrees north);
 * - offsets compose by addition, so several drags are one sum and Undo is
 *   dropping the last term.
 *
 * Results are rounded to 9 decimals (about 0.1 mm), terra-draw's own
 * precision; the C2 stores 7.
 *
 * Snapping is not applied to a group move: a group has many vertices and no
 * single one the operator is aiming with.
 *
 * Pure (no React, no map) so the rules are unit-testable on their own.
 */

/** A `[lng, lat]` position. */
export type LngLat = [number, number];

/** A translation in Web Mercator units (the world is 1 by 1). */
export interface MercatorOffset {
	dx: number;
	dy: number;
}

/** No translation. */
export const ZERO_OFFSET: MercatorOffset = { dx: 0, dy: 0 };

/** Latitude (degrees) beyond which Web Mercator is undefined. */
const MAX_LATITUDE = 85.051129;

/** Decimals kept on a moved coordinate (terra-draw's precision). */
const DECIMALS = 1e9;

function clampLatitude(lat: number): number {
	return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
}

/**
 * A position in Web Mercator units.
 * @param position - `[lng, lat]` in degrees.
 * @returns `[x, y]`, x east from -180, y south from the top of the world.
 */
export function toMercator(position: LngLat): [number, number] {
	const [lng, lat] = position;
	const phi = (clampLatitude(lat) * Math.PI) / 180;
	const x = (lng + 180) / 360;
	const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
	return [x, y];
}

/**
 * A Web Mercator position in degrees.
 * @param point - `[x, y]` in Mercator units.
 * @returns `[lng, lat]`.
 */
export function fromMercator(point: [number, number]): LngLat {
	const [x, y] = point;
	const lng = x * 360 - 180;
	const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
	return [lng, lat];
}

/**
 * The offset a drag from `from` to `to` describes.
 * @param from - Where the pointer went down.
 * @param to - Where it is now.
 * @returns The Mercator offset between them.
 */
export function mercatorOffset(from: LngLat, to: LngLat): MercatorOffset {
	const [x0, y0] = toMercator(from);
	const [x1, y1] = toMercator(to);
	return { dx: x1 - x0, dy: y1 - y0 };
}

/**
 * Two offsets one after the other.
 * @param a - The first.
 * @param b - The second.
 * @returns Their sum.
 */
export function addOffsets(
	a: MercatorOffset,
	b: MercatorOffset,
): MercatorOffset {
	return { dx: a.dx + b.dx, dy: a.dy + b.dy };
}

/**
 * Whether an offset moves nothing.
 * @param offset - The offset.
 * @returns True for a zero offset.
 */
export function isZeroOffset(offset: MercatorOffset): boolean {
	return offset.dx === 0 && offset.dy === 0;
}

function round(value: number): number {
	return Math.round(value * DECIMALS) / DECIMALS;
}

/**
 * One position moved by an offset.
 * @param position - `[lng, lat]`, possibly with an altitude after them.
 * @param offset - The offset.
 * @returns The moved position; an altitude is kept as it was.
 */
export function translatePosition(
	position: readonly number[],
	offset: MercatorOffset,
): number[] {
	const [x, y] = toMercator([position[0]!, position[1]!]);
	const [lng, lat] = fromMercator([x + offset.dx, y + offset.dy]);
	return [round(lng), round(lat), ...position.slice(2)];
}

function isPosition(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number"
	);
}

function translateCoordinates(value: unknown, offset: MercatorOffset): unknown {
	if (isPosition(value)) return translatePosition(value, offset);
	if (Array.isArray(value))
		return value.map((item) => translateCoordinates(item, offset));
	return value;
}

/**
 * A geometry moved by an offset: every position of a Point, LineString,
 * Polygon or any Multi* geometry. A zero offset returns the geometry itself.
 *
 * @param geometry - The geometry.
 * @param offset - The offset.
 * @returns A new geometry, or the same one for a zero offset.
 */
export function translateGeometry<
	G extends { type: string; coordinates: unknown },
>(geometry: G, offset: MercatorOffset): G {
	if (isZeroOffset(offset)) return geometry;
	return {
		...geometry,
		coordinates: translateCoordinates(geometry.coordinates, offset),
	};
}

/** The drags of one group move, for Undo and Redo. */
export interface MoveHistory {
	/** The drags made, oldest first. Their sum is the move. */
	steps: readonly MercatorOffset[];
	/** Drags undone, nearest first. Redo puts back the first one. */
	undone: readonly MercatorOffset[];
}

/** A move with no drag yet. */
export const EMPTY_MOVE: MoveHistory = { steps: [], undone: [] };

/**
 * The move after one more drag. A drag that ends where it started is not a
 * step. A new step drops what was undone.
 *
 * @param history - The move so far.
 * @param offset - The drag.
 * @returns The new move (the same object for a zero drag).
 */
export function recordMoveStep(
	history: MoveHistory,
	offset: MercatorOffset,
): MoveHistory {
	if (isZeroOffset(offset)) return history;
	return { steps: [...history.steps, offset], undone: [] };
}

/**
 * The move with its last drag taken back.
 * @param history - The move.
 * @returns The new move, or null with nothing to undo.
 */
export function undoMove(history: MoveHistory): MoveHistory | null {
	if (history.steps.length === 0) return null;
	const last = history.steps[history.steps.length - 1]!;
	return {
		steps: history.steps.slice(0, -1),
		undone: [last, ...history.undone],
	};
}

/**
 * The move with the drag last undone put back.
 * @param history - The move.
 * @returns The new move, or null with nothing to redo.
 */
export function redoMove(history: MoveHistory): MoveHistory | null {
	const [next, ...undone] = history.undone;
	if (!next) return null;
	return { steps: [...history.steps, next], undone };
}

/**
 * The whole move: every drag added up.
 * @param history - The move.
 * @returns The total offset.
 */
export function totalOffset(history: MoveHistory): MercatorOffset {
	return history.steps.reduce(addOffsets, ZERO_OFFSET);
}
