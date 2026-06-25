import { describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import {
	buildMissionDraft,
	cleanMissionConfig,
	hydrateMissionDraft,
	mergeVehicles,
	patchDraft,
	pushFeatureRef,
	pushInlineGeometry,
	removeGeometryAt,
	toggleVehicle,
} from "./mission-editor-helpers";

describe("cleanMissionConfig (prune empty optional blocks)", () => {
	const base = () => buildMissionDraft("M", MissionBehavior.NAVIGATE);

	it("drops a wholly-empty transit block", () => {
		const draft = { ...base(), transit: {} } as ReturnType<typeof base>;
		expect("transit" in cleanMissionConfig(draft)).toBe(false);
	});

	it("drops a transit block whose only content prunes to nothing", () => {
		const draft = {
			...base(),
			transit: { optimalization: {}, vehicle_formation_distance: "" },
		} as unknown as ReturnType<typeof base>;
		expect("transit" in cleanMissionConfig(draft)).toBe(false);
	});

	it("keeps a transit block that has real data (constraints survive)", () => {
		const draft = {
			...base(),
			transit: { desired_vehicle_constraints: { max_speed: 3 } },
		} as unknown as ReturnType<typeof base>;
		const cleaned = cleanMissionConfig(draft);
		expect(cleaned.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 3 },
		});
	});

	it("drops an all-empty arrival_time but keeps a partial one", () => {
		const empty = {
			...base(),
			objective: {
				geometries: [],
				arrival_time: { earliest: "", target: "", latest: "" },
			},
		} as unknown as ReturnType<typeof base>;
		expect("arrival_time" in cleanMissionConfig(empty).objective).toBe(
			false,
		);

		const partial = {
			...base(),
			objective: {
				geometries: [],
				arrival_time: { earliest: "2026-06-24T12:00:00.000Z" },
			},
		} as unknown as ReturnType<typeof base>;
		expect(cleanMissionConfig(partial).objective.arrival_time).toEqual({
			earliest: "2026-06-24T12:00:00.000Z",
		});
	});

	it("never prunes required fields (empty vehicles/geometries survive)", () => {
		const cleaned = cleanMissionConfig(base());
		expect(cleaned.vehicles).toEqual([]);
		expect(cleaned.objective.geometries).toEqual([]);
		expect(typeof cleaned.mission_id).toBe("string");
		expect(cleaned.behavior).toBe(MissionBehavior.NAVIGATE);
	});
});

describe("buildMissionDraft", () => {
	it("builds a minimal draft with a fresh id and empty objective/vehicles", () => {
		const draft = buildMissionDraft("Test", MissionBehavior.COVERAGE);
		expect(draft.name).toBe("Test");
		expect(draft.behavior).toBe(MissionBehavior.COVERAGE);
		expect(draft.objective.geometries).toEqual([]);
		expect(draft.vehicles).toEqual([]);
		expect(typeof draft.mission_id).toBe("string");
		expect(draft.mission_id.length).toBeGreaterThan(0);
	});

	it("defaults to NAVIGATE", () => {
		expect(buildMissionDraft().behavior).toBe(MissionBehavior.NAVIGATE);
	});
});

describe("pushFeatureRef", () => {
	it("appends a feature_id reference without mutating the original", () => {
		const draft = buildMissionDraft();
		const next = pushFeatureRef(draft, "feat-1");
		expect(draft.objective.geometries).toHaveLength(0);
		expect(next.objective.geometries).toEqual([{ feature_id: "feat-1" }]);
	});
});

describe("pushInlineGeometry", () => {
	it("appends an inline geometry with [lng,lat] coordinates preserved", () => {
		const draft = buildMissionDraft();
		const next = pushInlineGeometry(draft, {
			geometry_type: "Point",
			coordinates: [4.39, 50.84],
		});
		expect(next.objective.geometries).toEqual([
			{
				geometry: {
					geometry_type: "Point",
					coordinates: [4.39, 50.84],
				},
			},
		]);
	});
});

describe("removeGeometryAt", () => {
	it("removes by index", () => {
		let draft = buildMissionDraft();
		draft = pushFeatureRef(draft, "a");
		draft = pushFeatureRef(draft, "b");
		const next = removeGeometryAt(draft, 0);
		expect(next.objective.geometries).toEqual([{ feature_id: "b" }]);
	});

	it("is a no-op (new identity) for an out-of-range index", () => {
		const draft = pushFeatureRef(buildMissionDraft(), "a");
		const next = removeGeometryAt(draft, 9);
		expect(next.objective.geometries).toEqual([{ feature_id: "a" }]);
	});
});

describe("mergeVehicles", () => {
	it("replaces with a deduped, order-preserving list", () => {
		const draft = buildMissionDraft();
		const next = mergeVehicles(draft, ["v1", "v2", "v1", "", "v3"]);
		expect(next.vehicles).toEqual(["v1", "v2", "v3"]);
	});
});

describe("toggleVehicle", () => {
	it("adds when absent and removes when present", () => {
		let draft = buildMissionDraft();
		draft = toggleVehicle(draft, "v1");
		expect(draft.vehicles).toEqual(["v1"]);
		draft = toggleVehicle(draft, "v2");
		expect(draft.vehicles).toEqual(["v1", "v2"]);
		draft = toggleVehicle(draft, "v1");
		expect(draft.vehicles).toEqual(["v2"]);
	});
});

describe("patchDraft", () => {
	it("shallow-overlays top-level fields", () => {
		const draft = buildMissionDraft("A");
		const next = patchDraft(draft, {
			name: "B",
			transit: { foo: 1 } as never,
		});
		expect(next.name).toBe("B");
		expect(next.transit).toEqual({ foo: 1 } as never);
		expect(next.mission_id).toBe(draft.mission_id);
	});
});

describe("hydrateMissionDraft", () => {
	it("hydrates from a stored mission, dropping Mongo _id and keeping fields", () => {
		const stored = {
			_id: "mongo-internal",
			mission_id: "m-1",
			name: "Stored mission",
			behavior: MissionBehavior.COVERAGE,
			objective: {
				geometries: [{ feature_id: "f1" }],
				maximize_coverage: true,
			},
			vehicles: ["v1", "v2"],
			transit: { desired_vehicle_constraints: { max_speed: 2 } },
		};
		const draft = hydrateMissionDraft(stored);
		expect(draft.mission_id).toBe("m-1");
		expect(draft.name).toBe("Stored mission");
		expect(draft.behavior).toBe(MissionBehavior.COVERAGE);
		expect(draft.objective.geometries).toEqual([{ feature_id: "f1" }]);
		expect(draft.vehicles).toEqual(["v1", "v2"]);
		expect(draft.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 2 },
		});
		expect(
			(draft as unknown as Record<string, unknown>)._id,
		).toBeUndefined();
	});

	it("defensively fills missing id/name/behavior/objective/vehicles", () => {
		const draft = hydrateMissionDraft({});
		expect(typeof draft.mission_id).toBe("string");
		expect(draft.name).toBe(draft.mission_id);
		expect(draft.behavior).toBe(MissionBehavior.NAVIGATE);
		expect(draft.objective.geometries).toEqual([]);
		expect(draft.vehicles).toEqual([]);
	});

	it("filters non-string vehicles and non-array geometries", () => {
		const draft = hydrateMissionDraft({
			mission_id: "m",
			vehicles: ["ok", 5, null, "ok2"],
			objective: { geometries: "nope" },
		});
		expect(draft.vehicles).toEqual(["ok", "ok2"]);
		expect(draft.objective.geometries).toEqual([]);
	});
});
