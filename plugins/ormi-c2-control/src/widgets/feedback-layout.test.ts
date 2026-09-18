import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import {
	FeedbackTask,
	TaskState,
	parseMissionFeedback,
} from "../types/mission-feedback";
import {
	DISTANCE_WEIGHT,
	MIN_AXIS_SPAN_MS,
	clusterMarkers,
	currentRunStart,
	hasEarlierRuns,
	needsCompactRoute,
	routeTrack,
	sortLanes,
	stationWindow,
	fitTimeAxis,
	ganttLane,
	layoutStations,
	missionEtaEnd,
	overallProgress,
	robotGlyphX,
	selectStations,
	statusTone,
	taskFraction,
	timeTicks,
	timeToX,
} from "./feedback-layout";

const T0 = Date.parse("2026-09-18T15:20:00Z");
const iso = (offsetS: number) => new Date(T0 + offsetS * 1000).toISOString();

/** `n` waypoints due east, `stepM` metres apart (≈ 1e-5 deg lng ≈ 0.7 m at 50°N). */
function task(
	n: number,
	extra: Record<string, unknown> = {},
	stepDeg = 0.0001,
): FeedbackTask {
	const fb = parseMissionFeedback({
		mission_id: "m",
		status: 5,
		tasks: [
			{
				vehicle_id: "v",
				waypoints: Array.from({ length: n }, (_, i) => ({
					coordinates: [50, 4 + i * stepDeg],
					...((extra.wp as (i: number) => object) ?? (() => ({})))(i),
				})),
				...extra,
			},
		],
	})!;
	return fb.tasks[0]!;
}

function mission(raw: Record<string, unknown>) {
	return parseMissionFeedback({ mission_id: "m", tasks: [], ...raw })!;
}

describe("overallProgress", () => {
	it("weights each robot by its path length", () => {
		const long = task(11, { progress: 0.5 }); // 10 legs
		const short = task(2, { progress: 1 }); // 1 leg
		const p = overallProgress([long, short])!;
		// (0.5 * 10 + 1 * 1) / 11
		expect(p).toBeCloseTo(6 / 11, 3);
	});

	it("ignores tasks without progress and is null when none has any", () => {
		expect(overallProgress([task(3)])).toBeNull();
		expect(overallProgress([task(3), task(3, { progress: 0.25 })])).toBe(
			0.25,
		);
	});

	it("derives a task fraction from remaining_m, then from the index", () => {
		const t = task(3); // 2 legs
		const len = 2 * 0.0001 * 111_195 * Math.cos((50 * Math.PI) / 180);
		expect(taskFraction(task(3, { remaining_m: len / 4 }))).toBeCloseTo(
			0.75,
			2,
		);
		expect(taskFraction(task(4, { current_waypoint_index: 2 }))).toBe(0.5);
		expect(taskFraction(task(3, { state: TaskState.COMPLETED }))).toBe(1);
		expect(taskFraction(t)).toBeNull();
	});

	it("averages when no path has length", () => {
		expect(
			overallProgress([
				task(1, { progress: 0.2 }),
				task(1, { progress: 0.6 }),
			]),
		).toBeCloseTo(0.4, 5);
	});
});

describe("missionEtaEnd", () => {
	it("is the latest eta_end of unfinished tasks", () => {
		const fb = mission({
			tasks: [
				{ vehicle_id: "a", eta_end: iso(100), waypoints: [] },
				{ vehicle_id: "b", eta_end: iso(300), waypoints: [] },
				{
					vehicle_id: "c",
					eta_end: iso(900),
					ended_at: iso(50),
					waypoints: [],
				},
			],
		});
		expect(missionEtaEnd(fb)).toBe(iso(300));
	});
});

describe("fitTimeAxis", () => {
	it("is null without any time (v1)", () => {
		expect(fitTimeAxis([mission({ status: 5 })], T0)).toBeNull();
	});

	it("spans earliest start to max(eta_end, now) while active, padded 3 %", () => {
		const fb = mission({
			status: MissionStatus.STARTED,
			tasks: [
				{
					vehicle_id: "a",
					dispatched_at: iso(0),
					started_at: iso(10),
					eta_end: iso(600),
					waypoints: [],
				},
			],
		});
		const r = fitTimeAxis([fb], T0 + 1000 * 1000)!;
		const span = 1000 * 1000;
		expect(r.start).toBeCloseTo(T0 - span * 0.03, 0);
		expect(r.end).toBeCloseTo(T0 + span + span * 0.03, 0);
		// Before now: eta_end wins.
		const r2 = fitTimeAxis([fb], T0 + 100_000)!;
		expect(r2.end).toBeCloseTo(T0 + 600_000 + 600_000 * 0.03, 0);
	});

	it("does not stretch a finished mission to now", () => {
		const fb = mission({
			status: MissionStatus.COMPLETED,
			started_at: iso(0),
			ended_at: iso(300),
		});
		const r = fitTimeAxis([fb], T0 + 86_400_000)!;
		expect(r.end).toBeLessThan(T0 + 400_000);
	});

	it("is at least a minute wide", () => {
		const r = fitTimeAxis(
			[mission({ status: 10, started_at: iso(0) })],
			T0,
		)!;
		expect(r.end - r.start).toBeGreaterThanOrEqual(MIN_AXIS_SPAN_MS);
	});
});

describe("timeTicks / timeToX", () => {
	it("picks the smallest round step that fits", () => {
		const range = { start: T0, end: T0 + 10 * 60_000 };
		const ticks = timeTicks(range, 6);
		expect(ticks[1]! - ticks[0]!).toBe(120_000);
		expect(ticks.every((t) => t % 120_000 === 0)).toBe(true);
		expect(ticks[0]!).toBeGreaterThanOrEqual(range.start);
		expect(ticks[ticks.length - 1]!).toBeLessThanOrEqual(range.end);
	});

	it("maps times linearly", () => {
		const range = { start: 0, end: 100 };
		expect(timeToX(25, range, 200)).toBe(50);
	});
});

describe("ganttLane", () => {
	it("runs a live task to now and projects to eta_end", () => {
		const lane = ganttLane(
			task(3, {
				dispatched_at: iso(0),
				started_at: iso(10),
				eta_end: iso(500),
				wp: (i: number) =>
					i === 0 ? { reached_at: iso(20), stop: true } : {},
			}),
			true,
			T0 + 100_000,
		);
		expect(lane.waitFrom).toBe(T0);
		expect(lane.actualFrom).toBe(T0 + 10_000);
		expect(lane.actualTo).toBe(T0 + 100_000);
		expect(lane.projectedTo).toBe(T0 + 500_000);
		expect(lane.ticks).toEqual([{ index: 0, at: T0 + 20_000, stop: true }]);
	});

	it("ends at ended_at with no projection", () => {
		const lane = ganttLane(
			task(2, {
				started_at: iso(10),
				ended_at: iso(90),
				eta_end: iso(95),
			}),
			false,
			T0 + 10_000_000,
		);
		expect(lane.actualTo).toBe(T0 + 90_000);
		expect(lane.projectedTo).toBeNull();
	});

	it("does not grow an unterminated task of a finished mission", () => {
		const lane = ganttLane(
			task(2, { started_at: iso(10), last_edge_feedback_at: iso(40) }),
			false,
			T0 + 10_000_000,
		);
		expect(lane.actualTo).toBe(T0 + 40_000);
	});
});

describe("selectStations", () => {
	it("keeps everything that fits", () => {
		expect(selectStations(4, 10, [], null)).toEqual([0, 1, 2, 3]);
	});

	it("aggregates, always keeping ends, stops and the robot's leg", () => {
		const kept = selectStations(300, 20, [137], 201);
		expect(kept[0]).toBe(0);
		expect(kept[kept.length - 1]).toBe(299);
		expect(kept).toContain(137);
		expect(kept).toContain(200);
		expect(kept).toContain(201);
		expect(kept.length).toBeLessThan(30);
		expect([...kept].sort((a, b) => a - b)).toEqual(kept);
	});
});

describe("layoutStations", () => {
	it("spaces stations by path distance", () => {
		// Legs of 1, 1 and 2 units.
		const fb = parseMissionFeedback({
			mission_id: "m",
			status: 5,
			tasks: [
				{
					vehicle_id: "v",
					waypoints: [
						{ coordinates: [50, 4] },
						{ coordinates: [50, 4.001] },
						{ coordinates: [50, 4.002] },
						{ coordinates: [50, 4.004] },
					],
				},
			],
		})!;
		const { stations } = layoutStations(fb.tasks[0]!, 400, 10);
		// Distance fractions 0, .25, .5, 1 blended with uniform 0, 1/3, 2/3, 1.
		const blend = (d: number, u: number) =>
			Math.round((DISTANCE_WEIGHT * d + (1 - DISTANCE_WEIGHT) * u) * 400);
		expect(stations.map((s) => Math.round(s.x))).toEqual([
			0,
			blend(0.25, 1 / 3),
			blend(0.5, 2 / 3),
			400,
		]);
	});

	it("enforces the minimum gap and stays within the width", () => {
		const fb = parseMissionFeedback({
			mission_id: "m",
			status: 5,
			tasks: [
				{
					vehicle_id: "v",
					waypoints: [
						{ coordinates: [50, 4] },
						{ coordinates: [50, 4.000001] },
						{ coordinates: [50, 4.000002] },
						{ coordinates: [50, 4.01] },
					],
				},
			],
		})!;
		const { stations } = layoutStations(fb.tasks[0]!, 300, 20);
		for (let i = 1; i < stations.length; i++) {
			expect(stations[i]!.x - stations[i - 1]!.x).toBeGreaterThanOrEqual(
				19.9,
			);
		}
		expect(stations[stations.length - 1]!.x).toBeLessThanOrEqual(300);
	});

	it("collapses a coverage pattern and interpolates every waypoint", () => {
		const t = task(400, {
			current_waypoint_index: 150,
			wp: (i: number) => (i === 399 ? { stop: true } : {}),
		});
		const { stations, xs } = layoutStations(t, 280, 14);
		expect(stations.length).toBeLessThanOrEqual(30);
		expect(xs).toHaveLength(400);
		const collapsed = stations.reduce((n, s) => n + s.collapsedBefore, 0);
		expect(collapsed + stations.length).toBe(400);
		expect(stations[stations.length - 1]!.stop).toBe(true);
		// xs is monotonic.
		for (let i = 1; i < xs.length; i++) {
			expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
		}
	});

	it("handles 0 and 1 waypoints", () => {
		expect(layoutStations(task(0), 100).stations).toEqual([]);
		expect(layoutStations(task(1), 100).xs).toEqual([0]);
	});
});

describe("robotGlyphX", () => {
	const legM = 0.0001 * 111_195 * Math.cos((50 * Math.PI) / 180);

	it("sits between the last passed and the next waypoint by distance_to_next", () => {
		const t = task(3, {
			current_waypoint_index: 1,
			distance_to_next_m: legM / 4,
		});
		const xs = [0, 100, 200];
		expect(robotGlyphX(t, xs)!).toBeCloseTo(75, 0);
	});

	it("sits mid-leg without a distance, at the start before the first, at the end when done", () => {
		const xs = [0, 100, 200];
		expect(robotGlyphX(task(3, { current_waypoint_index: 2 }), xs)).toBe(
			150,
		);
		expect(robotGlyphX(task(3, { current_waypoint_index: 0 }), xs)).toBe(0);
		expect(robotGlyphX(task(3, { state: TaskState.COMPLETED }), xs)).toBe(
			200,
		);
		expect(robotGlyphX(task(3, { current_waypoint_index: 3 }), xs)).toBe(
			200,
		);
	});

	it("clamps and is absent for v1", () => {
		const xs = [0, 100];
		expect(
			robotGlyphX(
				task(2, { current_waypoint_index: 1, distance_to_next_m: 1e6 }),
				xs,
			),
		).toBe(0);
		expect(robotGlyphX(task(2), xs)).toBeNull();
	});
});

describe("statusTone", () => {
	it("maps statuses to the plugin's colour families", () => {
		expect(statusTone(MissionStatus.STARTED)).toBe("active");
		expect(statusTone(MissionStatus.PAUSED)).toBe("warn");
		expect(statusTone(MissionStatus.FAILED)).toBe("fail");
		expect(statusTone(MissionStatus.COMPLETED)).toBe("done");
		expect(statusTone(null)).toBe("neutral");
	});
});

describe("current run (a stopped and restarted mission)", () => {
	// Run 1 at 15:28-15:40, re-planned 15:50, run 2 from 15:53.
	const at = (hhmm: string) => `2026-09-18T${hhmm}:00Z`;
	const history = [
		{ status: MissionStatus.PLANNED, at: at("15:28") },
		{ status: MissionStatus.ACCEPTED, at: at("15:29") },
		{ status: MissionStatus.STARTED, at: at("15:30") },
		{ status: MissionStatus.STOPPED, at: at("15:40") },
		{ status: MissionStatus.PLANNED, at: at("15:50") },
		{ status: MissionStatus.PLANNED_ALTERNATIVE, at: at("15:51") },
		{ status: MissionStatus.ACCEPTED, at: at("15:52") },
		{ status: MissionStatus.STARTED, at: at("15:53") },
	];
	const fb = mission({
		status: MissionStatus.STARTED,
		status_history: history,
		tasks: [
			{
				vehicle_id: "a",
				dispatched_at: at("15:52"),
				started_at: at("15:53"),
				eta_end: at("15:56"),
				waypoints: [],
			},
		],
	});

	it("starts at the last (re)initialisation, not the first one", () => {
		// The PLANNED → PLANNED_ALTERNATIVE pair is one initialisation.
		expect(currentRunStart(fb)).toBe(Date.parse(at("15:50")));
		expect(hasEarlierRuns(fb)).toBe(true);
	});

	it("fits the axis to the current run unless earlier runs are asked for", () => {
		const now = Date.parse(at("15:54"));
		const current = fitTimeAxis([fb], now)!;
		expect(current.start).toBeGreaterThan(Date.parse(at("15:49")));
		const all = fitTimeAxis([fb], now, { earlierRuns: true })!;
		expect(all.start).toBeLessThan(Date.parse(at("15:28")));
	});

	it("falls back to the earliest dispatch without history", () => {
		const bare = mission({
			tasks: [
				{ vehicle_id: "a", dispatched_at: at("15:10"), waypoints: [] },
				{ vehicle_id: "b", dispatched_at: at("15:05"), waypoints: [] },
			],
		});
		expect(currentRunStart(bare)).toBe(Date.parse(at("15:05")));
		expect(hasEarlierRuns(bare)).toBe(false);
	});
});

describe("clusterMarkers", () => {
	it("merges markers closer than the threshold and keeps every member", () => {
		const markers = [0, 3, 5, 30, 31, 100].map((x) => ({ x }));
		const clusters = clusterMarkers(markers, 12);
		expect(clusters.map((c) => c.members.length)).toEqual([3, 2, 1]);
		expect(clusters.map((c) => c.x)).toEqual([0, 30, 100]);
	});

	it("keeps 100 markers honest: all members accounted for", () => {
		const markers = Array.from({ length: 100 }, (_, i) => ({ x: i * 2 }));
		const clusters = clusterMarkers(markers, 12);
		expect(clusters.reduce((n, c) => n + c.members.length, 0)).toBe(100);
		expect(clusters.length).toBe(Math.ceil(200 / 12));
	});
});

describe("sortLanes", () => {
	it("puts driving robots first and finished ones last, stable", () => {
		const t = (id: string, state?: number) =>
			({ vehicle_id: id, state, waypoints: [] }) as FeedbackTask;
		const sorted = sortLanes([
			t("done", TaskState.COMPLETED),
			t("v1"),
			t("drive1", TaskState.STARTED),
			t("wait", TaskState.STOPPED),
			t("drive2", TaskState.STARTED),
			t("paused", TaskState.PAUSED),
		]).map((x) => x.vehicle_id);
		expect(sorted).toEqual([
			"drive1",
			"drive2",
			"paused",
			"wait",
			"done",
			"v1",
		]);
	});
});

describe("large missions (8 robots x 400 coverage waypoints)", () => {
	const robots = Array.from({ length: 8 }, (_, r) =>
		task(400, {
			current_waypoint_index: 50 * r,
			distance_to_next_m: 0.2,
			wp: (i: number) => (i === 399 || i === 200 ? { stop: true } : {}),
		}),
	);

	it("switches to the compact route at any realistic width", () => {
		expect(needsCompactRoute(400, 1600)).toBe(true);
		expect(needsCompactRoute(12, 600)).toBe(false);
	});

	it("the compact track counts every waypoint exactly", () => {
		for (const [r, t] of robots.entries()) {
			const track = routeTrack(t);
			expect(track.total).toBe(400);
			expect(track.passed).toBe(50 * r);
			expect(track.passed + track.remaining).toBe(400);
			expect(track.stops.map((s) => s.index)).toEqual([200, 399]);
			if (r > 0) {
				expect(track.robot!).toBeGreaterThan(0);
				expect(track.robot!).toBeLessThan(1);
			}
		}
	});

	it("the zoomed strip is centred on the robot and clamped at the ends", () => {
		const mid = stationWindow(robots[3]!, 3, 5); // next = 150
		expect(mid.indices).toEqual([147, 148, 149, 150, 151, 152, 153, 154]);
		expect(mid.hiddenBefore).toBe(147);
		expect(mid.hiddenAfter).toBe(400 - 155);
		const start = stationWindow(robots[0]!, 3, 5); // next = 0
		expect(start.indices[0]).toBe(0);
		expect(start.indices).toHaveLength(8);
		const end = stationWindow(task(400, { state: TaskState.COMPLETED }));
		expect(end.indices[end.indices.length - 1]).toBe(399);
		expect(end.hiddenAfter).toBe(0);
		expect(stationWindow(task(4)).indices).toEqual([0, 1, 2, 3]);
	});

	it("the Gantt axis over several missions stays finite and ordered", () => {
		const many = Array.from({ length: 5 }, (_, m) =>
			mission({
				status: MissionStatus.STARTED,
				tasks: robots.map((_, r) => ({
					vehicle_id: `m${m}-r${r}`,
					started_at: iso(m * 60 + r),
					eta_end: iso(3600 + m * 60),
					waypoints: [],
				})),
			}),
		);
		const r = fitTimeAxis(many, T0 + 600_000)!;
		expect(r.end).toBeGreaterThan(r.start);
		expect(timeTicks(r, 8).length).toBeLessThanOrEqual(8);
	});
});
