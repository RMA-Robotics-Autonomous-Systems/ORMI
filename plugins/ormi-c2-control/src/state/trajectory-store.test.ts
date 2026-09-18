import { afterEach, describe, expect, it } from "bun:test";

import {
	TRAJECTORY_MAX_AGE_MS,
	__resetTrajectoryStore,
	freshTrajectories,
	getTrajectories,
	recordTrajectory,
} from "./trajectory-store";

afterEach(() => __resetTrajectoryStore());

const LINE: [number, number][] = [
	[4.39, 50.84],
	[4.391, 50.841],
];

describe("trajectory freshness (plan must disappear)", () => {
	it("drops a plan older than 5 s", () => {
		recordTrajectory("r1", LINE, 1_000);
		const all = getTrajectories();
		expect(
			freshTrajectories(all, ["r1"], 1_000 + TRAJECTORY_MAX_AGE_MS),
		).toHaveLength(1);
		expect(
			freshTrajectories(all, ["r1"], 1_001 + TRAJECTORY_MAX_AGE_MS),
		).toEqual([]);
	});

	it("draws only the requested robots", () => {
		recordTrajectory("r1", LINE, 0);
		recordTrajectory("r2", LINE, 0);
		expect(
			freshTrajectories(getTrajectories(), ["r2"], 10).map(([id]) => id),
		).toEqual(["r2"]);
	});
});
