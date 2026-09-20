import { describe, expect, it } from "bun:test";

import {
	BREADCRUMB_MAX_JUMP_M,
	appendBreadcrumb,
	parseAutonomyTrajectory,
} from "./robot-track";

describe("parseAutonomyTrajectory", () => {
	const v2 = {
		version: 2,
		crs: "EPSG:4326",
		order: "lonlat",
		points: [
			[4.39, 50.84],
			[4.391, 50.841],
		],
	};

	it("reads a v2 payload from the ROS message", () => {
		expect(
			parseAutonomyTrajectory({ trajectory: JSON.stringify(v2) }),
		).toEqual([
			[4.39, 50.84],
			[4.391, 50.841],
		]);
	});

	it("reads the bare JSON string and the parsed object", () => {
		expect(parseAutonomyTrajectory(JSON.stringify(v2))).toHaveLength(2);
		expect(parseAutonomyTrajectory(v2)).toHaveLength(2);
	});

	it("ignores the legacy metric format", () => {
		expect(
			parseAutonomyTrajectory({
				trajectory: JSON.stringify({
					frame_id: "map",
					points: [
						[12.5, -3.2],
						[13.1, -2.9],
					],
				}),
			}),
		).toBeNull();
	});

	it("rejects another CRS, an unknown order, and junk", () => {
		expect(parseAutonomyTrajectory({ ...v2, crs: "EPSG:3857" })).toBeNull();
		expect(parseAutonomyTrajectory({ ...v2, order: "xy" })).toBeNull();
		expect(parseAutonomyTrajectory({ trajectory: "{nope" })).toBeNull();
		expect(parseAutonomyTrajectory(null)).toBeNull();
		expect(parseAutonomyTrajectory({ trajectory: "" })).toBeNull();
	});

	it("swaps an explicit latlon order", () => {
		expect(
			parseAutonomyTrajectory({
				...v2,
				order: "latlon",
				points: [
					[50.84, 4.39],
					[50.841, 4.391],
				],
			}),
		).toEqual([
			[4.39, 50.84],
			[4.391, 50.841],
		]);
	});

	it("drops invalid points and needs two valid ones", () => {
		expect(
			parseAutonomyTrajectory({
				...v2,
				points: [[4.39, 50.84], [200, 50], ["a", 1], [4.391]],
			}),
		).toBeNull();
		expect(
			parseAutonomyTrajectory({
				...v2,
				points: [
					[4.39, 50.84],
					[200, 50],
					[4.391, 50.841],
				],
			}),
		).toHaveLength(2);
	});
});

describe("appendBreadcrumb", () => {
	/** ~0.111 m of latitude per 1e-6 degree. */
	const at = (dLatMicro: number): [number, number] => [
		4.39,
		50.84 + dLatMicro * 1e-6,
	];

	it("starts a trail with the first fix", () => {
		expect(appendBreadcrumb([], at(0))).toEqual([at(0)]);
	});

	it("drops fixes closer than 0.5 m and returns the same array", () => {
		const trail = [at(0)];
		// 3e-6 deg ≈ 0.33 m.
		expect(appendBreadcrumb(trail, at(3))).toBe(trail);
	});

	it("keeps a fix 0.5 m or more away (measured from the last KEPT point)", () => {
		let trail: [number, number][] = [at(0)];
		trail = appendBreadcrumb(trail, at(3)); // 0.33 m → dropped
		trail = appendBreadcrumb(trail, at(6)); // 0.67 m from the kept one → kept
		expect(trail).toEqual([at(0), at(6)]);
	});

	it("never mutates the input", () => {
		const trail: [number, number][] = [at(0)];
		const next = appendBreadcrumb(trail, at(10));
		expect(trail).toHaveLength(1);
		expect(next).not.toBe(trail);
	});

	it("caps the length, dropping the oldest points", () => {
		let trail: [number, number][] = [];
		for (let i = 0; i < 10; i++) {
			trail = appendBreadcrumb(trail, at(i * 10), { maxPoints: 4 });
		}
		expect(trail).toEqual([at(60), at(70), at(80), at(90)]);
	});

	it("restarts after a jump instead of drawing across the map", () => {
		const far: [number, number] = [
			4.39,
			50.84 + (BREADCRUMB_MAX_JUMP_M + 50) / 111_195,
		];
		expect(appendBreadcrumb([at(0), at(10)], far)).toEqual([far]);
	});

	it("ignores a non-geographic fix", () => {
		const trail = [at(0)];
		expect(appendBreadcrumb(trail, [Number.NaN, 50])).toBe(trail);
		expect(appendBreadcrumb(trail, [500, 50])).toBe(trail);
	});
});
