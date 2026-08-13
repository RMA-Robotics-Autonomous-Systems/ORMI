/**
 * The driven track.
 *
 * Both rules under test are invisible on screen: a track that bridges a GNSS
 * dropout looks exactly like one that does not, and on a coverage map that is
 * the difference between "surveyed and clear" and "never surveyed".
 */

import { describe, expect, test } from "bun:test";
import { createEmiRun, type EmiRun } from "../../detector/run-types";
import { drivenTrack, TRACK_BREAK_M, TRACK_STEP_M } from "../driven-track";

/** A run whose fix track is the given local-metre points. */
function runWith(points: Array<[number, number]>): EmiRun {
	const run = createEmiRun(
		{
			id: "track",
			source: "bag",
			label: "test",
			coilIds: new Uint8Array([1, 2, 3, 4, 5]),
			offsets: new Float32Array(15),
			originLat: 50.8,
			originLon: 4.39,
		},
		Math.max(1, points.length),
	);
	points.forEach(([x, y], i) => {
		run.sx[i] = x;
		run.sy[i] = y;
	});
	run.n = points.length;
	return run;
}

/** A straight eastward line at `step` metres per sample. */
const straight = (count: number, step: number): Array<[number, number]> =>
	Array.from({ length: count }, (_, i) => [i * step, 0] as [number, number]);

describe("drivenTrack", () => {
	test("thins to roughly one vertex per step without moving the ends", () => {
		// 400 samples at 2 cm — a survey's actual cadence — over 8 m.
		const run = runWith(straight(400, 0.02));
		const [line] = drivenTrack(run, run.n);
		expect(line).toBeDefined();
		// 8 m at 0.15 m spacing is ~54 vertices, not 400.
		expect(line!.length).toBeLessThan(70);
		expect(line!.length).toBeGreaterThan(40);
		// The first vertex is the first fix, to the metre.
		const [lon0, lat0] = line![0]!;
		expect(lat0).toBeCloseTo(50.8, 6);
		expect(lon0).toBeCloseTo(4.39, 6);
	});

	test("a lost fix breaks the line rather than being bridged", () => {
		const run = runWith([
			...straight(40, 0.5),
			[NaN, NaN],
			...straight(40, 0.5).map(
				([x, y]) => [x + 100, y] as [number, number],
			),
		]);
		const lines = drivenTrack(run, run.n);
		expect(lines).toHaveLength(2);
		// No vertex of the first stretch is anywhere near the second's.
		const endOfFirst = lines[0]![lines[0]!.length - 1]!;
		const startOfSecond = lines[1]![0]!;
		expect(startOfSecond[0] - endOfFirst[0]).toBeGreaterThan(0);
	});

	test("a jump larger than the break threshold also breaks it", () => {
		// The fix never went away; it came back somewhere else. Joining these
		// would draw a straight line over ground that was never covered.
		const run = runWith([
			...straight(20, 0.5),
			[10 + TRACK_BREAK_M + 1, 0],
			[10 + TRACK_BREAK_M + 1.5, 0],
			[10 + TRACK_BREAK_M + 2, 0],
		]);
		expect(drivenTrack(run, run.n)).toHaveLength(2);
	});

	test("a jump just under the threshold stays one stretch", () => {
		const run = runWith([
			...straight(20, 0.5),
			[9.5 + TRACK_BREAK_M - 0.1, 0],
			[9.5 + TRACK_BREAK_M + 0.3, 0],
		]);
		expect(drivenTrack(run, run.n)).toHaveLength(1);
	});

	test("a stretch of one vertex is dropped — a point is not a path", () => {
		const run = runWith([
			[0, 0],
			[NaN, NaN],
			[50, 50],
			[NaN, NaN],
			[100, 100],
		]);
		expect(drivenTrack(run, run.n)).toHaveLength(0);
	});

	test("only the resolved samples are drawn", () => {
		// The columns are over-allocated while a mission grows; reading past `n`
		// would draw a track running back to the projection origin.
		const run = runWith(straight(100, 0.5));
		const lines = drivenTrack(run, 10);
		expect(lines).toHaveLength(1);
		// 10 samples at 0.5 m is 4.5 m, which at the thinning step is ~10 vertices.
		expect(lines[0]!.length).toBeLessThanOrEqual(10);
		expect(TRACK_STEP_M).toBeLessThan(0.5);
	});

	test("an empty run draws nothing", () => {
		expect(drivenTrack(runWith([]), 0)).toHaveLength(0);
	});
});
