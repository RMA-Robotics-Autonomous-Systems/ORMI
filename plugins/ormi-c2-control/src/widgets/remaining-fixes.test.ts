import { beforeEach, describe, expect, it } from "bun:test";

import {
	MissionBehavior,
	VEHICLE_FORMATION_LABELS,
	VEHICLE_FORMATION_VALUES,
	VehicleFormation,
} from "../types/c2-types";
import { validateMissionConfig } from "../types/mission-config-validation";
import {
	__resetMissionFeedbackStore,
	feedbackFreshness,
	formatAge,
	getMissionFeedbackUpdatedAt,
	publishMissionFeedback,
} from "../state/mission-feedback-store";
import type { MissionFeedback } from "../types/mission-feedback";
import {
	c2FeatureToDrawFeature,
	describeUneditableGeometry,
	unwrapSinglePartGeometry,
} from "./feature-geojson";
import { pickProfileTelemetry } from "./fleet-status";
import {
	cleanMissionConfig,
	hydrateMissionDraft,
	mergeMissionOwnedFields,
} from "./mission-editor-helpers";
import { inlineGeometryToGeoJSON, isVertex } from "./mission-geometry";
import { isMissionCommitted } from "./map-view-mode";
import { MissionStatus } from "../types/c2-types";

describe("battery/fuel precedence", () => {
	const stash = { batteryPct: 80, fuelPct: null, sensors: [] } as never;
	const roster = { batteryPct: 10, fuelPct: 20, sensors: [] } as never;
	const empty = { batteryPct: null, fuelPct: null, sensors: [] } as never;
	it("prefers the agent_profile topic stash", () => {
		expect(pickProfileTelemetry(stash, roster)).toBe(stash);
	});
	it("falls back to the roster when the stash is absent or empty", () => {
		expect(pickProfileTelemetry(undefined, roster)).toBe(roster);
		expect(pickProfileTelemetry(empty, roster)).toBe(roster);
	});
});

describe("staleness", () => {
	beforeEach(() => __resetMissionFeedbackStore());
	it("marks a reading stale past the threshold, not before", () => {
		expect(feedbackFreshness(1000, 5000, 15_000).stale).toBe(false);
		expect(feedbackFreshness(1000, 17_000, 15_000).stale).toBe(true);
		expect(feedbackFreshness(null, 5000).ageMs).toBeNull();
	});
	it("an identical republish still refreshes the timestamp", async () => {
		const fb = {
			mission_id: "m1",
			status: 5,
			tasks: [],
		} as unknown as MissionFeedback;
		publishMissionFeedback(fb);
		const first = getMissionFeedbackUpdatedAt("m1")!;
		await new Promise((r) => setTimeout(r, 5));
		publishMissionFeedback({ ...fb });
		expect(getMissionFeedbackUpdatedAt("m1")!).toBeGreaterThan(first);
	});
	it("formats ages", () => {
		expect(formatAge(3_000)).toBe("3s ago");
		expect(formatAge(120_000)).toBe("2m ago");
		expect(formatAge(null)).toBe("—");
	});
});

describe("multi-part geometry", () => {
	it("unwraps a single-part MultiPolygon for editing", () => {
		const ring = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 0],
		];
		const drawn = c2FeatureToDrawFeature({
			geometry: { type: "MultiPolygon", coordinates: [[ring]] },
		});
		expect(drawn?.geometry.type).toBe("Polygon");
	});
	it("refuses a genuinely multi-part geometry, with a reason", () => {
		const f = {
			geometry: {
				type: "MultiLineString",
				coordinates: [
					[
						[0, 0],
						[1, 1],
					],
					[
						[2, 2],
						[3, 3],
					],
				],
			},
		};
		expect(c2FeatureToDrawFeature(f)).toBeNull();
		expect(describeUneditableGeometry(f)).toContain("2 parts");
	});
	it("unwrap is null for non-multi types", () => {
		expect(unwrapSinglePartGeometry("Polygon", [[]])).toBeNull();
	});
	it("renders inline multi-part mission geometry instead of dropping it", () => {
		expect(
			inlineGeometryToGeoJSON("MultiLineString", [
				[
					[0, 0],
					[1, 1],
				],
			])?.type,
		).toBe("LineString");
		expect(
			inlineGeometryToGeoJSON("MultiPolygon", [
				[
					[0, 0],
					[1, 0],
					[1, 1],
				],
			])?.type,
		).toBe("Polygon");
	});
});

describe("single sources of truth", () => {
	it("isVertex rejects non-finite coordinates (one semantics)", () => {
		expect(isVertex([1, 2])).toBe(true);
		expect(isVertex([Number.NaN, 2])).toBe(false);
		expect(isVertex([Infinity, 2])).toBe(false);
	});
	it("formation values derive from the enum", () => {
		expect(VEHICLE_FORMATION_VALUES).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(VEHICLE_FORMATION_LABELS[VehicleFormation.WEDGE]).toBe("Wedge");
	});
	it("the validator accepts every formation value and rejects 7", () => {
		const base = {
			mission_id: "m1",
			behavior: MissionBehavior.NAVIGATE,
			vehicles: ["a"],
			objective: { geometries: [{ feature_id: "f" }] },
		};
		for (const v of VEHICLE_FORMATION_VALUES) {
			const issues = validateMissionConfig({
				...base,
				objective: { ...base.objective, vehicle_formation: v },
			});
			expect(
				issues.some((i) => i.path.includes("vehicle_formation")),
			).toBe(false);
		}
		const bad = validateMissionConfig({
			...base,
			objective: { ...base.objective, vehicle_formation: 7 },
		});
		expect(bad.some((i) => i.path.includes("vehicle_formation"))).toBe(
			true,
		);
	});
	it("committed = ACCEPTED/STARTED/PAUSED, defined once", () => {
		expect(isMissionCommitted(MissionStatus.STARTED)).toBe(true);
		expect(isMissionCommitted(MissionStatus.PLANNED)).toBe(false);
	});
});

describe("POST /missions now REPLACES — the map's save body is complete", () => {
	it("keeps every stored field it does not own, and drops Mongo's _id", () => {
		const fresh = {
			_id: "abc",
			mission_id: "m1",
			behavior: 0,
			vehicles: [],
			objective: { geometries: [], arrival_time: { target: "t" } },
			transit: { desired_vehicle_constraints: { max_speed: 2 } },
			some_backend_field: 42,
		};
		const body = cleanMissionConfig(
			hydrateMissionDraft(
				mergeMissionOwnedFields(fresh as never, {
					geometries: [{ feature_id: "f" }],
					vehicles: ["a"],
					behavior: MissionBehavior.NAVIGATE,
					name: "N",
				}),
			),
		) as unknown as Record<string, unknown>;
		expect(body._id).toBeUndefined();
		expect(body.some_backend_field).toBe(42);
		expect(
			(body.transit as Record<string, unknown>)
				.desired_vehicle_constraints,
		).toBeDefined();
		expect(
			(body.objective as Record<string, unknown>).arrival_time,
		).toBeDefined();
	});
});
