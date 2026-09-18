import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import {
	FeedbackTask,
	MissionFeedback,
	TaskState,
	parseMissionFeedback,
} from "../types/mission-feedback";
import {
	formatTaskProgressLine,
	missionElapsedMs,
	missionEndedAt,
	missionPhase,
	missionStartedAt,
	sortMissions,
	splitRoute,
	taskProgress,
	taskStateLabel,
} from "./mission-progress";

/** A parsed task with `n` waypoints along a line of longitude 4.0 + i/1000. */
function task(n: number, extra: Record<string, unknown> = {}): FeedbackTask {
	const fb = parseMissionFeedback({
		mission_id: "m",
		status: 5,
		tasks: [
			{
				vehicle_id: "v",
				waypoints: Array.from({ length: n }, (_, i) => ({
					coordinates: [50, 4 + i / 1000],
					...((extra.waypointExtra as (i: number) => object)?.(i) ??
						{}),
				})),
				...extra,
			},
		],
	});
	return fb!.tasks[0]!;
}

function mission(raw: Record<string, unknown>): MissionFeedback {
	return parseMissionFeedback({ mission_id: "m", tasks: [], ...raw })!;
}

describe("missionPhase", () => {
	it("classifies statuses", () => {
		expect(missionPhase(MissionStatus.STARTED)).toBe("active");
		expect(missionPhase(MissionStatus.PAUSED)).toBe("active");
		expect(missionPhase(MissionStatus.ACCEPTED)).toBe("active");
		expect(missionPhase(MissionStatus.PLANNED)).toBe("pending");
		expect(missionPhase(MissionStatus.COMPLETED)).toBe("finished");
		expect(missionPhase(MissionStatus.FAILED)).toBe("finished");
		expect(missionPhase(MissionStatus.STOPPED)).toBe("finished");
		expect(missionPhase(null)).toBe("pending");
	});
});

describe("taskProgress", () => {
	it("is unknown for a v1 task", () => {
		const p = taskProgress(task(4));
		expect(p.known).toBe(false);
		expect(p.fraction).toBeNull();
		expect(p.currentIndex).toBeNull();
		expect(formatTaskProgressLine(task(4))).toBeNull();
	});

	it("reads current_waypoint_index as the waypoint being driven to", () => {
		const p = taskProgress(task(56, { current_waypoint_index: 21 }));
		expect(p).toEqual({
			total: 56,
			done: 21,
			currentIndex: 21,
			fraction: 21 / 56,
			known: true,
		});
	});

	it("prefers the producer's progress for the fraction", () => {
		expect(
			taskProgress(task(4, { current_waypoint_index: 1, progress: 0.3 }))
				.fraction,
		).toBe(0.3);
	});

	it("marks everything passed on a COMPLETED task", () => {
		const p = taskProgress(
			task(4, { state: TaskState.COMPLETED, current_waypoint_index: 2 }),
		);
		expect(p.done).toBe(4);
		expect(p.currentIndex).toBeNull();
	});

	it("falls back to reached_at when there is no index", () => {
		const p = taskProgress(
			task(4, {
				waypointExtra: (i: number) =>
					i < 2 ? { reached_at: "2026-09-18T10:00:00Z" } : {},
			}),
		);
		expect(p.done).toBe(2);
		expect(p.currentIndex).toBe(2);
	});

	it("an index past the end means nothing is left", () => {
		const p = taskProgress(task(3, { current_waypoint_index: 3 }));
		expect(p.done).toBe(3);
		expect(p.currentIndex).toBeNull();
	});
});

describe("formatTaskProgressLine", () => {
	it("renders WP i/N · distance · ETA", () => {
		const eta = new Date(2026, 8, 18, 10, 42).toISOString();
		expect(
			formatTaskProgressLine(
				task(56, {
					current_waypoint_index: 21,
					distance_to_next_m: 14.2,
					eta_end: eta,
				}),
			),
		).toBe("WP 22/56 · 14 m · ETA 10:42");
	});

	it("omits what the producer did not send", () => {
		expect(
			formatTaskProgressLine(task(5, { current_waypoint_index: 0 })),
		).toBe("WP 1/5");
	});
});

describe("splitRoute", () => {
	it("leaves a v1 route entirely remaining", () => {
		const t = task(3);
		expect(splitRoute(t)).toEqual({
			done: [],
			remaining: t.waypoints.map((w) => w.lngLat),
		});
	});

	it("splits at the last passed waypoint", () => {
		const t = task(4, { current_waypoint_index: 2 });
		const pts = t.waypoints.map((w) => w.lngLat);
		expect(splitRoute(t)).toEqual({
			done: [pts[0]!, pts[1]!],
			remaining: [pts[1]!, pts[2]!, pts[3]!],
		});
	});

	it("joins both halves at the robot position when reported", () => {
		const t = task(3, {
			current_waypoint_index: 1,
			position: [50, 4.0005],
		});
		const pts = t.waypoints.map((w) => w.lngLat);
		expect(splitRoute(t)).toEqual({
			done: [pts[0]!, [4.0005, 50]],
			remaining: [[4.0005, 50], pts[1]!, pts[2]!],
		});
	});

	it("puts a completed task entirely in done", () => {
		const t = task(3, { state: TaskState.COMPLETED });
		expect(splitRoute(t).remaining).toEqual([]);
		expect(splitRoute(t).done).toHaveLength(3);
	});
});

describe("mission times", () => {
	it("takes started_at, else the first STARTED status", () => {
		expect(missionStartedAt(mission({ started_at: "S" }))).toBe("S");
		expect(
			missionStartedAt(
				mission({
					status_history: [
						{ status: 4, at: "A" },
						{ status: 5, at: "B" },
					],
				}),
			),
		).toBe("B");
		expect(missionStartedAt(mission({ status: 1 }))).toBeNull();
	});

	it("ends only when terminal", () => {
		const history = [
			{ status: 5, at: "2026-09-18T10:00:00Z" },
			{ status: 10, at: "2026-09-18T10:30:00Z" },
		];
		expect(
			missionEndedAt(mission({ status: 10, status_history: history })),
		).toBe("2026-09-18T10:30:00Z");
		expect(
			missionEndedAt(mission({ status: 5, status_history: history })),
		).toBeNull();
	});

	it("elapsed runs to now while active, to the end once finished", () => {
		const start = Date.parse("2026-09-18T10:00:00Z");
		const running = mission({
			status: 5,
			started_at: "2026-09-18T10:00:00Z",
		});
		expect(missionElapsedMs(running, start + 90_000)).toBe(90_000);
		const done = mission({
			status: 10,
			started_at: "2026-09-18T10:00:00Z",
			ended_at: "2026-09-18T10:30:00Z",
		});
		expect(missionElapsedMs(done, start + 10 * 3_600_000)).toBe(1_800_000);
		expect(missionElapsedMs(mission({ status: 5 }), start)).toBeNull();
	});
});

describe("sortMissions", () => {
	it("orders active, planned, finished; newest first within a group", () => {
		const list = [
			parseMissionFeedback({
				mission_id: "done-old",
				status: 10,
				ended_at: "2026-01-01T00:00:00Z",
			})!,
			parseMissionFeedback({ mission_id: "planned", status: 1 })!,
			parseMissionFeedback({
				mission_id: "done-new",
				status: 10,
				ended_at: "2026-02-01T00:00:00Z",
			})!,
			parseMissionFeedback({ mission_id: "running", status: 5 })!,
		];
		expect(sortMissions(list).map((m) => m.mission_id)).toEqual([
			"running",
			"planned",
			"done-new",
			"done-old",
		]);
	});
});

describe("taskStateLabel", () => {
	it("labels STOPPED as not started, and v1 as nothing", () => {
		expect(taskStateLabel(0)).toBe("Not started");
		expect(taskStateLabel(4)).toBe("Aborted");
		expect(taskStateLabel(undefined)).toBeNull();
		expect(taskStateLabel(9)).toBe("State 9");
	});
});
