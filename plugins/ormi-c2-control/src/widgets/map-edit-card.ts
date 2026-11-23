/**
 * Where the edit card sits over the C2 map, so it does not cover the shape
 * open for editing.
 *
 * The card is a top corner overlay: the bottom edge belongs to the notices
 * stack, the map chrome and the basemap attribution. It opens top-left. At
 * site zoom an operator frames the shape to fill the panel, and a corner of
 * the shape then lands under the card, where its handle cannot be grabbed.
 * The rule is measured, not guessed: the card takes the top corner that
 * covers fewer of the shape's handles (vertices and edge midpoints, each
 * padded by its drawn radius). A tie stays where the card is, so it never
 * moves for nothing.
 *
 * Pure (no React, no map) so the rule is unit-testable on its own.
 */

/** A point on screen, in the map panel's own pixels. */
export interface ScreenPoint {
	x: number;
	y: number;
}

/** Which top corner of the map the edit card occupies. */
export type EditCardSide = "left" | "right";

/** Gap (px) between the card and the panel edge (Tailwind `top-2 left-2`). */
export const EDIT_CARD_MARGIN_PX = 8;

/**
 * Radius (px) around a handle that counts as covered: the largest handle
 * drawn (`COARSE_POINTER_HANDLES`, radius 13 plus a 3 px outline).
 */
export const EDIT_CARD_HANDLE_PAD_PX = 16;

/** The geometry types that have handles. */
interface HandleGeometry {
	type: string;
	coordinates: unknown;
}

function isPosition(value: unknown): value is [number, number] {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number"
	);
}

/**
 * The positions of a shape's handles: each vertex and the midpoint of each
 * edge (a midpoint inserts a vertex when clicked or dragged). A polygon's
 * closing position is not a second vertex.
 *
 * @param geometry - A Point, LineString or Polygon as the map holds it.
 * @returns `[lng, lat]` positions, empty for anything else.
 */
export function handlePositions(
	geometry: HandleGeometry | null | undefined,
): [number, number][] {
	if (!geometry) return [];
	if (geometry.type === "Point") {
		return isPosition(geometry.coordinates) ? [geometry.coordinates] : [];
	}
	let line: unknown[];
	let closed = false;
	if (geometry.type === "LineString") {
		line = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
	} else if (geometry.type === "Polygon") {
		const rings = Array.isArray(geometry.coordinates)
			? geometry.coordinates
			: [];
		line = Array.isArray(rings[0]) ? (rings[0] as unknown[]) : [];
		closed = true;
	} else {
		return [];
	}
	const vertices = line.filter(isPosition);
	if (closed && vertices.length > 1) vertices.pop();
	const out: [number, number][] = [...vertices];
	const edges = closed ? vertices.length : vertices.length - 1;
	for (let i = 0; i < edges; i++) {
		const a = vertices[i]!;
		const b = vertices[(i + 1) % vertices.length]!;
		out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
	}
	return out;
}

/**
 * How many handles a card in one top corner would cover.
 *
 * @param side - The corner.
 * @param handles - The handles on screen.
 * @param panelWidth - Width (px) of the map panel.
 * @param card - The card's size (px).
 * @returns The number of handles under the card, padded by their radius.
 */
export function coveredHandles(
	side: EditCardSide,
	handles: readonly ScreenPoint[],
	panelWidth: number,
	card: { width: number; height: number },
): number {
	const left =
		side === "left"
			? EDIT_CARD_MARGIN_PX
			: panelWidth - EDIT_CARD_MARGIN_PX - card.width;
	const right = left + card.width;
	const top = EDIT_CARD_MARGIN_PX;
	const bottom = top + card.height;
	const pad = EDIT_CARD_HANDLE_PAD_PX;
	let count = 0;
	for (const h of handles) {
		if (
			h.x >= left - pad &&
			h.x <= right + pad &&
			h.y >= top - pad &&
			h.y <= bottom + pad
		) {
			count++;
		}
	}
	return count;
}

/**
 * The top corner for the edit card: the one covering fewer handles, the
 * current one on a tie.
 *
 * @param current - Where the card is now.
 * @param handles - The open shape's handles on screen.
 * @param panelWidth - Width (px) of the map panel.
 * @param card - The card's size (px).
 * @returns The side to place it on.
 */
export function editCardSide(
	current: EditCardSide,
	handles: readonly ScreenPoint[],
	panelWidth: number,
	card: { width: number; height: number },
): EditCardSide {
	const other: EditCardSide = current === "left" ? "right" : "left";
	const here = coveredHandles(current, handles, panelWidth, card);
	const there = coveredHandles(other, handles, panelWidth, card);
	return there < here ? other : current;
}
