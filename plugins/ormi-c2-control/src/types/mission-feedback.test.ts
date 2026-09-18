import { describe, it, expect } from "bun:test";
import {
	feedbackPlanSignature,
	feedbackSignature,
	parseMissionFeedback,
} from "./mission-feedback";
import { MissionStatus } from "./c2-types";

describe("parseMissionFeedback", () => {
	it("parses a JSON string and swaps [lat,lng] → lngLat", () => {
		const raw = JSON.stringify({
			mission_id: "m-1",
			status: 5,
			tasks: [
				{
					vehicle_id: "v-1",
					waypoints: [
						{
							coordinates: [50.8443, 4.3926],
							average_speed: 2,
							eta: "t",
						},
					],
				},
			],
		});
		const fb = parseMissionFeedback(raw);
		expect(fb).not.toBeNull();
		expect(fb!.mission_id).toBe("m-1");
		expect(fb!.status).toBe(MissionStatus.STARTED);
		const wp = fb!.tasks[0]!.waypoints[0]!;
		expect(wp.coordinates).toEqual([50.8443, 4.3926]); // raw [lat,lng]
		expect(wp.lngLat).toEqual([4.3926, 50.8443]); // GeoJSON [lng,lat]
	});

	it("treats a missing `issue` as null", () => {
		const fb = parseMissionFeedback({ mission_id: "m-2", status: 1 });
		expect(fb!.issue).toBeNull();
	});

	it("accepts an already-parsed object", () => {
		const fb = parseMissionFeedback({
			mission_id: "m-3",
			status: 4,
			tasks: [],
		});
		expect(fb!.status).toBe(MissionStatus.ACCEPTED);
		expect(fb!.tasks).toEqual([]);
	});

	it("returns null for invalid / id-less input", () => {
		expect(parseMissionFeedback("not json")).toBeNull();
		expect(parseMissionFeedback(null)).toBeNull();
		expect(parseMissionFeedback({} as never)).toBeNull();
	});

	it("drops malformed waypoints (missing coordinates)", () => {
		const fb = parseMissionFeedback({
			mission_id: "m-4",
			status: 5,
			tasks: [
				{ vehicle_id: "v", waypoints: [{ average_speed: 1 } as never] },
			],
		});
		expect(fb!.tasks[0]!.waypoints).toHaveLength(0);
	});
});

describe("parseMissionFeedback — schema v2 (optional progress/timing keys)", () => {
	const v2 = {
		schema: 2,
		mission_id: "m-v2",
		status: 5,
		plan_version: 3,
		planner_run_id: "run-7",
		started_at: "2026-09-18T10:04:00Z",
		status_history: [
			{ status: 1, at: "2026-09-18T10:02:00Z" },
			{ status: 4, at: "2026-09-18T10:03:00Z" },
			{ status: 5, at: "2026-09-18T10:04:00Z" },
		],
		tasks: [
			{
				vehicle_id: "v-1",
				task_id: "t-1",
				state: 1,
				current_waypoint_index: 1,
				dispatched_at: "2026-09-18T10:03:30Z",
				started_at: "2026-09-18T10:04:00Z",
				ended_at: null,
				position: [50.8444, 4.3927],
				speed_mps: 1.2,
				distance_to_next_m: 14.5,
				remaining_m: 120,
				progress: 0.4,
				eta_end: "2026-09-18T10:42:00Z",
				last_edge_feedback_at: "2026-09-18T10:10:00Z",
				waypoints: [
					{
						coordinates: [50.8443, 4.3926],
						waypoint_id: "p-1",
						objective_id: "o-1",
						stop: false,
						reached_at: "2026-09-18T10:05:00Z",
					},
					{
						coordinates: [50.845, 4.393],
						waypoint_id: "p-2",
						objective_id: "o-1",
						stop: true,
						eta: "2026-09-18T10:42:00Z",
					},
				],
			},
		],
	};

	it("reads every v2 key", () => {
		const fb = parseMissionFeedback(JSON.stringify(v2))!;
		expect(fb.schema).toBe(2);
		expect(fb.plan_version).toBe(3);
		expect(fb.planner_run_id).toBe("run-7");
		expect(fb.started_at).toBe("2026-09-18T10:04:00Z");
		expect(fb.status_history).toEqual([
			{ status: MissionStatus.PLANNED, at: "2026-09-18T10:02:00Z" },
			{ status: MissionStatus.ACCEPTED, at: "2026-09-18T10:03:00Z" },
			{ status: MissionStatus.STARTED, at: "2026-09-18T10:04:00Z" },
		]);
		const t = fb.tasks[0]!;
		expect(t.task_id).toBe("t-1");
		expect(t.state).toBe(1);
		expect(t.current_waypoint_index).toBe(1);
		expect(t.ended_at).toBeNull();
		expect(t.position).toEqual([50.8444, 4.3927]);
		expect(t.positionLngLat).toEqual([4.3927, 50.8444]);
		expect(t.speed_mps).toBe(1.2);
		expect(t.distance_to_next_m).toBe(14.5);
		expect(t.remaining_m).toBe(120);
		expect(t.progress).toBe(0.4);
		expect(t.eta_end).toBe("2026-09-18T10:42:00Z");
		const [w1, w2] = t.waypoints;
		expect(w1!.waypoint_id).toBe("p-1");
		expect(w1!.objective_id).toBe("o-1");
		expect(w1!.stop).toBe(false);
		expect(w1!.reached_at).toBe("2026-09-18T10:05:00Z");
		expect(w2!.stop).toBe(true);
		expect(w2!.reached_at).toBeUndefined();
		expect(w2!.eta).toBe("2026-09-18T10:42:00Z");
	});

	it("parses a v1 payload to exactly the v1 shape (no v2 keys added)", () => {
		const fb = parseMissionFeedback({
			mission_id: "m-v1",
			status: 5,
			tasks: [
				{
					vehicle_id: "v",
					est: "e",
					waypoints: [{ coordinates: [1, 2], eta: "t" }],
				},
			],
		})!;
		expect(Object.keys(fb).sort()).toEqual(
			[
				"behavior",
				"date",
				"issue",
				"mission_id",
				"requested_status",
				"status",
				"tasks",
			].sort(),
		);
		expect(Object.keys(fb.tasks[0]!).sort()).toEqual(
			["est", "vehicle_id", "waypoints"].sort(),
		);
		expect(fb.tasks[0]!.waypoints[0]).toEqual({
			coordinates: [1, 2],
			lngLat: [2, 1],
			average_speed: undefined,
			eta: "t",
			orientation: null,
		});
	});

	it("drops v2 values of the wrong type instead of coercing them", () => {
		const fb = parseMissionFeedback({
			mission_id: "m-bad",
			status: 5,
			plan_version: "3",
			status_history: [{ status: "5", at: 1 }, null, { at: "x" }],
			tasks: [
				{
					vehicle_id: "v",
					state: -1,
					current_waypoint_index: 1.5,
					position: [50, "4"],
					progress: "0.5",
					speed_mps: Number.NaN,
					waypoints: [{ coordinates: [1, 2], stop: "yes" }],
				},
			],
		})!;
		expect(fb.plan_version).toBeUndefined();
		expect(fb.status_history).toEqual([]);
		const t = fb.tasks[0]!;
		expect(t.state).toBeUndefined();
		expect(t.current_waypoint_index).toBeUndefined();
		expect(t.position).toBeUndefined();
		expect(t.progress).toBeUndefined();
		expect(t.speed_mps).toBeUndefined();
		expect(t.waypoints[0]!.stop).toBeUndefined();
	});

	it("clamps progress to 0..1", () => {
		const fb = parseMissionFeedback({
			mission_id: "m",
			status: 5,
			tasks: [
				{ vehicle_id: "a", progress: 1.0000001, waypoints: [] },
				{ vehicle_id: "b", progress: -0.1, waypoints: [] },
			],
		})!;
		expect(fb.tasks.map((t) => t.progress)).toEqual([1, 0]);
	});

	it("survives a null task entry", () => {
		const fb = parseMissionFeedback({
			mission_id: "m",
			status: 5,
			tasks: [null as never, { vehicle_id: "v", waypoints: [] }],
		})!;
		expect(fb.tasks).toHaveLength(1);
	});
});

describe("feedbackPlanSignature vs feedbackSignature — v2 progress", () => {
	const base = {
		mission_id: "m",
		status: 5,
		tasks: [
			{
				vehicle_id: "v",
				current_waypoint_index: 0,
				waypoints: [
					{ coordinates: [1, 2] as [number, number], eta: "t1" },
					{ coordinates: [1, 3] as [number, number] },
				],
			},
		],
	};
	const moved = {
		...base,
		tasks: [
			{
				...base.tasks[0]!,
				current_waypoint_index: 1,
				waypoints: [
					{
						coordinates: [1, 2] as [number, number],
						eta: "t2",
						reached_at: "r",
					},
					{ coordinates: [1, 3] as [number, number] },
				],
			},
		],
	};

	it("the full signature changes when progress moves (timeline re-renders)", () => {
		expect(feedbackSignature(parseMissionFeedback(base)!)).not.toBe(
			feedbackSignature(parseMissionFeedback(moved)!),
		);
	});

	it("the plan signature ignores eta / reached_at / progress (no per-second plan rebuild)", () => {
		expect(feedbackPlanSignature(parseMissionFeedback(base)!)).toBe(
			feedbackPlanSignature(parseMissionFeedback(moved)!),
		);
	});

	it("is identical for identical content", () => {
		expect(feedbackPlanSignature(parseMissionFeedback(base)!)).toBe(
			feedbackPlanSignature(parseMissionFeedback(base)!),
		);
	});
});

describe("feedbackSignature — v1 envelope fields", () => {
	const base = {
		mission_id: "m",
		status: 5,
		tasks: [],
		date: "2026-01-01T00:00:00Z",
	};

	it("changes when only the date moves (v1 missions sort and age on it)", () => {
		expect(feedbackSignature(parseMissionFeedback(base)!)).not.toBe(
			feedbackSignature(
				parseMissionFeedback({
					...base,
					date: "2026-01-01T00:05:00Z",
				})!,
			),
		);
	});

	it("changes when only the requested status moves", () => {
		expect(
			feedbackSignature(
				parseMissionFeedback({ ...base, requested_status: 1 })!,
			),
		).not.toBe(
			feedbackSignature(
				parseMissionFeedback({ ...base, requested_status: 3 })!,
			),
		);
	});
});
