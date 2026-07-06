import { describe, expect, it } from "bun:test";

import { FeedbackTask, FeedbackWaypoint } from "../types/mission-feedback";
import {
	formatDistance,
	formatDuration,
	planSummary,
	taskDistanceMeters,
	taskDurationSeconds,
	vehicleColor,
} from "./plan-metrics";

/** Build a waypoint from a `[lng, lat]` pair plus optional eta. */
function wp(lng: number, lat: number, eta?: string | null): FeedbackWaypoint {
	return {
		coordinates: [lat, lng],
		lngLat: [lng, lat],
		eta: eta ?? null,
	};
}

/** Build a task from waypoints. */
function task(vehicle_id: string, waypoints: FeedbackWaypoint[]): FeedbackTask {
	return { vehicle_id, waypoints };
}

describe("vehicleColor", () => {
	it("is deterministic — same id → same colour", () => {
		expect(vehicleColor("themis-fr")).toBe(vehicleColor("themis-fr"));
	});

	it("spreads distinct ids (different ids → likely different colours)", () => {
		const a = vehicleColor("agent-a");
		const b = vehicleColor("agent-b");
		const c = vehicleColor("agent-c");
		// Not a guarantee, but these three fixtures land on distinct entries.
		expect(new Set([a, b, c]).size).toBeGreaterThan(1);
	});

	it("always returns a palette hex string", () => {
		for (const id of ["", "x", "very-long-vehicle-identifier-0001"]) {
			expect(vehicleColor(id)).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it("falls back to a stable colour for an empty id", () => {
		expect(vehicleColor("")).toBe(vehicleColor(""));
	});
});

describe("taskDistanceMeters", () => {
	it("returns 0 for fewer than two waypoints", () => {
		expect(taskDistanceMeters(task("v", []))).toBe(0);
		expect(taskDistanceMeters(task("v", [wp(4.39, 50.84)]))).toBe(0);
	});

	it("matches a known haversine distance (~1° latitude ≈ 111 km)", () => {
		// 0°,0° → 0°,1° is one degree of latitude.
		const d = taskDistanceMeters(task("v", [wp(0, 0), wp(0, 1)]));
		expect(d).toBeGreaterThan(111_000);
		expect(d).toBeLessThan(111_400);
	});

	it("sums consecutive legs", () => {
		const oneLeg = taskDistanceMeters(task("v", [wp(0, 0), wp(0, 1)]));
		const twoLegs = taskDistanceMeters(
			task("v", [wp(0, 0), wp(0, 1), wp(0, 2)]),
		);
		expect(twoLegs).toBeGreaterThan(oneLeg);
		expect(twoLegs).toBeCloseTo(oneLeg * 2, -2);
	});
});

describe("taskDurationSeconds", () => {
	it("returns null when fewer than two waypoints", () => {
		expect(taskDurationSeconds(task("v", []))).toBeNull();
		expect(
			taskDurationSeconds(task("v", [wp(0, 0, "2026-01-01T00:00:00Z")])),
		).toBeNull();
	});

	it("derives seconds from ISO-8601 first/last etas", () => {
		const d = taskDurationSeconds(
			task("v", [
				wp(0, 0, "2026-01-01T00:00:00Z"),
				wp(0, 1, "2026-01-01T00:10:00Z"),
			]),
		);
		expect(d).toBe(600);
	});

	it("parses the exact C2 wire format (Isotime::ToIso8601 → %FT%TZ, UTC)", () => {
		// Ground truth: C2 serializes eta/est as a `T`-separated ISO-8601 UTC
		// timestamp; this is the literal shape that arrives on the wire.
		const d = taskDurationSeconds(
			task("v", [
				wp(0, 0, "2026-06-25T07:11:00Z"),
				wp(0, 1, "2026-06-25T07:17:00Z"),
			]),
		);
		expect(d).toBe(360);
	});

	it("returns null when an endpoint eta is missing/unparseable", () => {
		expect(
			taskDurationSeconds(
				task("v", [wp(0, 0, "2026-01-01T00:00:00Z"), wp(0, 1, null)]),
			),
		).toBeNull();
		expect(
			taskDurationSeconds(
				task("v", [
					wp(0, 0, "not-a-date"),
					wp(0, 1, "2026-01-01T00:10:00Z"),
				]),
			),
		).toBeNull();
	});
});

describe("planSummary", () => {
	it("counts vehicles, sums distance, and takes the max duration as makespan", () => {
		const tasks: FeedbackTask[] = [
			task("v1", [
				wp(0, 0, "2026-01-01T00:00:00Z"),
				wp(0, 1, "2026-01-01T00:10:00Z"),
			]),
			task("v2", [
				wp(0, 0, "2026-01-01T00:00:00Z"),
				wp(0, 2, "2026-01-01T00:30:00Z"),
			]),
		];
		const s = planSummary(tasks);
		expect(s.vehicleCount).toBe(2);
		expect(s.totalDistanceMeters).toBeGreaterThan(0);
		// v2 is the slowest (30 min) → makespan = 1800s, not the 2400s sum.
		expect(s.makespanSeconds).toBe(1800);
	});

	it("reports null makespan when no task has a derivable duration", () => {
		const s = planSummary([task("v", [wp(0, 0), wp(0, 1)])]);
		expect(s.vehicleCount).toBe(1);
		expect(s.makespanSeconds).toBeNull();
		expect(s.totalDistanceMeters).toBeGreaterThan(0);
	});

	it("handles an empty plan", () => {
		const s = planSummary([]);
		expect(s.vehicleCount).toBe(0);
		expect(s.totalDistanceMeters).toBe(0);
		expect(s.makespanSeconds).toBeNull();
	});
});

describe("formatDistance", () => {
	it("renders metres below 1 km", () => {
		expect(formatDistance(0)).toBe("0 m");
		expect(formatDistance(740.4)).toBe("740 m");
	});

	it("renders kilometres with one decimal at/above 1 km", () => {
		expect(formatDistance(1000)).toBe("1.0 km");
		expect(formatDistance(3214)).toBe("3.2 km");
	});

	it("renders '—' for negative/non-finite", () => {
		expect(formatDistance(-1)).toBe("—");
		expect(formatDistance(Number.NaN)).toBe("—");
	});
});

describe("formatDuration", () => {
	it("renders seconds, minutes, and hours", () => {
		expect(formatDuration(45)).toBe("45s");
		expect(formatDuration(750)).toBe("12m 30s");
		expect(formatDuration(3900)).toBe("1h 05m");
	});

	it("renders '—' for null/non-finite/negative", () => {
		expect(formatDuration(null)).toBe("—");
		expect(formatDuration(undefined)).toBe("—");
		expect(formatDuration(-5)).toBe("—");
		expect(formatDuration(Number.NaN)).toBe("—");
	});
});
