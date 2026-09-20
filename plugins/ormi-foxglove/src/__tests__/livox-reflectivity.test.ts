import { describe, expect, it } from "bun:test";

import { UnifiedConverter } from "../unified-converter";

const customMsg =
	UnifiedConverter.converters.PointsCloud!.conversions[
		"livox_ros_driver2/msg/CustomMsg"
	]!;

/** The dimmest grey the reflectivity ramp produces. */
const FLOOR = 0.2;

interface CustomPoint {
	x: number;
	y: number;
	z: number;
	reflectivity?: number;
}

const decode = (points: CustomPoint[]) =>
	customMsg.fromRos2({ points } as never);

describe("Livox CustomMsg -> PointsCloud reflectivity", () => {
	it("withholds colors when no point carries reflectivity", () => {
		const decoded = decode([
			{ x: 1, y: 0, z: 0 },
			{ x: 2, y: 0, z: 0 },
		]);

		// Nothing was written, so the pre-allocated buffer must not ship: it
		// would arrive as a black cloud indistinguishable from real data.
		expect(decoded.colors).toBeUndefined();
		expect(decoded.intensities).toBeUndefined();
		expect(decoded.points.length).toBe(6);
	});

	it("keeps reflectivity that arrives after a point without it", () => {
		// The guard used to read `points[0].reflectivity`, so one leading point
		// without the field discarded every reading behind it.
		const decoded = decode([
			{ x: 1, y: 0, z: 0 },
			{ x: 2, y: 0, z: 0, reflectivity: 255 },
		]);

		expect(decoded.intensities).toBeDefined();
		expect(decoded.intensities![1]).toBeCloseTo(1, 6);
	});

	it("floors a point with no reflectivity instead of leaving it black", () => {
		const decoded = decode([
			{ x: 1, y: 0, z: 0 },
			{ x: 2, y: 0, z: 0, reflectivity: 255 },
		]);

		const colors = decoded.colors!;
		expect(colors.length).toBe(6);
		// Every channel of the unlit point sits at the ramp's own floor, which
		// is where a reflectivity of 0 would land it — not at zero.
		for (let channel = 0; channel < 3; channel++) {
			expect(colors[channel]).toBeCloseTo(FLOOR, 6);
		}
		expect(decoded.intensities![0]).toBeCloseTo(FLOOR, 6);
	});

	it("holds a real low reading at the floor as well", () => {
		const decoded = decode([{ x: 1, y: 0, z: 0, reflectivity: 0 }]);

		expect(decoded.intensities![0]).toBeCloseTo(FLOOR, 6);
	});

	it("drops a NaN point without shifting the colors of the rest", () => {
		const decoded = decode([
			{ x: Number.NaN, y: 0, z: 0, reflectivity: 255 },
			{ x: 2, y: 0, z: 0, reflectivity: 255 },
		]);

		expect(decoded.points.length).toBe(3);
		expect(decoded.colors!.length).toBe(3);
		expect(decoded.colors![0]).toBeCloseTo(1, 6);
	});
});
