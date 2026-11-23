import { describe, expect, it } from "bun:test";

import {
	EMPTY_MOVE,
	type LngLat,
	addOffsets,
	fromMercator,
	mercatorOffset,
	recordMoveStep,
	redoMove,
	toMercator,
	totalOffset,
	translateGeometry,
	translatePosition,
	undoMove,
} from "./map-group-move";

/** A field near Brussels, where the e2e site sits. */
const SITE: LngLat = [4.396, 50.844];

/** Metres to degrees at the site. */
function offset(dxMetres: number, dyMetres: number): LngLat {
	const mPerDegLat = 111_320;
	const mPerDegLng = mPerDegLat * Math.cos((SITE[1] * Math.PI) / 180);
	return [SITE[0] + dxMetres / mPerDegLng, SITE[1] + dyMetres / mPerDegLat];
}

/** Screen pixels of a position at a zoom (MapLibre's 512 px tiles). */
function pixels(p: LngLat, zoom: number): [number, number] {
	const [x, y] = toMercator(p);
	const scale = 512 * 2 ** zoom;
	return [x * scale, y * scale];
}

describe("Web Mercator conversion", () => {
	it("round-trips a position", () => {
		const [lng, lat] = fromMercator(toMercator(SITE));
		expect(lng).toBeCloseTo(SITE[0], 12);
		expect(lat).toBeCloseTo(SITE[1], 12);
	});

	it("puts the equator and the prime meridian at the centre of the world", () => {
		expect(toMercator([0, 0])).toEqual([0.5, 0.5]);
	});
});

describe("translateGeometry", () => {
	const ring: LngLat[] = [
		offset(-120, -80),
		offset(120, -90),
		offset(140, 40),
		offset(0, 100),
		offset(-130, 60),
	];
	const polygon = {
		type: "Polygon",
		coordinates: [[...ring, ring[0]!]],
	};
	const drag = mercatorOffset(SITE, offset(20, -15));

	it("moves every vertex by the same screen delta", () => {
		const moved = translateGeometry(polygon, drag);
		const zoom = 17.5;
		const [sx, sy] = pixels(SITE, zoom);
		const [tx, ty] = pixels(offset(20, -15), zoom);
		const expected = [tx - sx, ty - sy];
		const before = polygon.coordinates[0]!;
		const after = moved.coordinates[0] as LngLat[];
		for (const [i, p] of before.entries()) {
			const [x0, y0] = pixels(p, zoom);
			const [x1, y1] = pixels(after[i]!, zoom);
			expect(x1 - x0).toBeCloseTo(expected[0]!, 3);
			expect(y1 - y0).toBeCloseTo(expected[1]!, 3);
		}
	});

	it("gives every vertex the same longitude offset, and a latitude offset within Mercator's stretch", () => {
		const moved = translateGeometry(polygon, drag);
		const before = polygon.coordinates[0]!;
		const after = moved.coordinates[0] as LngLat[];
		const dLng = after.map((p, i) => p[0] - before[i]![0]);
		const dLat = after.map((p, i) => p[1] - before[i]![1]);
		for (const d of dLng) expect(d).toBeCloseTo(dLng[0]!, 8);
		const spread = Math.max(...dLat) - Math.min(...dLat);
		// Under a millimetre of latitude across the 190 m site at 51 N.
		expect(spread).toBeLessThan(1e-8);
		expect(spread).toBeGreaterThan(0);
	});

	it("keeps the ring closed and its length", () => {
		const moved = translateGeometry(polygon, drag);
		const after = moved.coordinates[0] as LngLat[];
		expect(after).toHaveLength(polygon.coordinates[0]!.length);
		expect(after[0]).toEqual(after[after.length - 1]!);
	});

	it("moves points, lines and multi-part geometries alike", () => {
		const point = translateGeometry(
			{ type: "Point", coordinates: SITE },
			drag,
		);
		const target = offset(20, -15);
		expect((point.coordinates as LngLat)[0]).toBeCloseTo(target[0], 8);
		expect((point.coordinates as LngLat)[1]).toBeCloseTo(target[1], 8);

		const multi = translateGeometry(
			{
				type: "MultiLineString",
				coordinates: [
					[SITE, offset(10, 0)],
					[offset(0, 10), offset(10, 10)],
				],
			},
			drag,
		);
		const lines = multi.coordinates as LngLat[][];
		expect(lines).toHaveLength(2);
		expect(lines[1]).toHaveLength(2);
		expect(lines[0]![0]![0]).toBeCloseTo(target[0], 8);
	});

	it("keeps an altitude and returns the same geometry for no move", () => {
		expect(translatePosition([4.4, 50.8, 12], drag)[2]).toBe(12);
		expect(translateGeometry(polygon, { dx: 0, dy: 0 })).toBe(polygon);
	});

	it("rounds to 9 decimals", () => {
		const [lng, lat] = translatePosition(SITE, drag);
		expect(Math.round(lng! * 1e9) / 1e9).toBe(lng!);
		expect(Math.round(lat! * 1e9) / 1e9).toBe(lat!);
	});
});

describe("move history", () => {
	const a = mercatorOffset(SITE, offset(10, 0));
	const b = mercatorOffset(SITE, offset(0, 10));

	it("adds the drags up", () => {
		const history = recordMoveStep(recordMoveStep(EMPTY_MOVE, a), b);
		expect(totalOffset(history)).toEqual(addOffsets(a, b));
	});

	it("ignores a drag that ends where it started", () => {
		expect(recordMoveStep(EMPTY_MOVE, { dx: 0, dy: 0 })).toBe(EMPTY_MOVE);
	});

	it("undoes and redoes one drag at a time", () => {
		const history = recordMoveStep(recordMoveStep(EMPTY_MOVE, a), b);
		const undone = undoMove(history)!;
		expect(totalOffset(undone)).toEqual(a);
		const redone = redoMove(undone)!;
		expect(totalOffset(redone)).toEqual(addOffsets(a, b));
		const back = undoMove(undoMove(history)!)!;
		expect(totalOffset(back)).toEqual({ dx: 0, dy: 0 });
		expect(undoMove(back)).toBeNull();
		expect(redoMove(history)).toBeNull();
	});

	it("drops what was undone on a new drag", () => {
		const undone = undoMove(recordMoveStep(EMPTY_MOVE, a))!;
		const next = recordMoveStep(undone, b);
		expect(next.undone).toEqual([]);
		expect(totalOffset(next)).toEqual(b);
	});
});
