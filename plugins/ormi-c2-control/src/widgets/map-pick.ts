/**
 * Which map feature a click picks.
 *
 * The map used to query one pixel and take the first hit. Every area shares
 * one fill layer and the geofence is drawn last, so a click anywhere inside a
 * site picked the geofence, and a road was picked only on its exact pixel
 * (usability test 2026-11-12: 7 of 10 clicks picked the geofence).
 *
 * Now a click looks a few pixels around the pointer and prefers the most
 * specific thing under it: a point over a line over an area, and among areas
 * the smallest. Features of a locked layer are never picked.
 *
 * Pure (no React, no map) so the rule is unit-testable on its own.
 */

/** Pixels of slack around a click, so a 1 to 2 px line can be hit. */
export const PICK_TOLERANCE_PX = 6;

/** A feature under the pointer, as the map reports it. */
export interface PickCandidate {
	id: string;
	/** The feature's `feature_type` (layer), e.g. `road`, `geofence`. */
	featureType?: string;
	geometry: { type: string; coordinates: unknown } | null | undefined;
}

/** Rank of a geometry type: lower is picked first. */
function geometryRank(type: string | undefined): number {
	switch (type) {
		case "Point":
		case "MultiPoint":
			return 0;
		case "LineString":
		case "MultiLineString":
			return 1;
		case "Polygon":
		case "MultiPolygon":
			return 2;
		default:
			return 3;
	}
}

/** Planar area of one ring (shoelace), in squared coordinate units. */
function ringArea(ring: unknown): number {
	if (!Array.isArray(ring) || ring.length < 3) return 0;
	let sum = 0;
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % ring.length];
		if (!Array.isArray(a) || !Array.isArray(b)) continue;
		const [ax, ay] = a as number[];
		const [bx, by] = b as number[];
		if (
			typeof ax !== "number" ||
			typeof ay !== "number" ||
			typeof bx !== "number" ||
			typeof by !== "number"
		) {
			continue;
		}
		sum += ax * by - bx * ay;
	}
	return Math.abs(sum) / 2;
}

/**
 * The area used to rank polygons against each other: the outer ring of a
 * Polygon, the sum of the outer rings of a MultiPolygon. Only the ORDER
 * matters, so degrees are fine at site scale.
 */
export function rankingArea(geometry: PickCandidate["geometry"]): number {
	if (!geometry) return Number.POSITIVE_INFINITY;
	if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
		return ringArea(geometry.coordinates[0]);
	}
	if (
		geometry.type === "MultiPolygon" &&
		Array.isArray(geometry.coordinates)
	) {
		return geometry.coordinates.reduce(
			(total: number, polygon: unknown) =>
				total + (Array.isArray(polygon) ? ringArea(polygon[0]) : 0),
			0,
		);
	}
	return Number.POSITIVE_INFINITY;
}

/**
 * The candidate a click picks, or null.
 *
 * @param candidates - Features under the pointer (duplicates allowed: a
 *   polygon is hit on its fill and its outline).
 * @param locked - Feature types that are never picked.
 * @returns The id of the most specific candidate.
 */
export function choosePick(
	candidates: readonly PickCandidate[],
	locked: ReadonlySet<string> = new Set(),
): string | null {
	let best: PickCandidate | null = null;
	let bestRank = Number.POSITIVE_INFINITY;
	let bestArea = Number.POSITIVE_INFINITY;
	for (const candidate of candidates) {
		if (!candidate.id) continue;
		if (candidate.featureType && locked.has(candidate.featureType))
			continue;
		const rank = geometryRank(candidate.geometry?.type);
		const area = rank === 2 ? rankingArea(candidate.geometry) : 0;
		if (rank < bestRank || (rank === bestRank && area < bestArea)) {
			best = candidate;
			bestRank = rank;
			bestArea = area;
		}
	}
	return best?.id ?? null;
}
