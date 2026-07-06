import { describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import type { MissionConfig } from "../types/c2-types";
import {
	advancedSliceEquals,
	buildMissionDraft,
	cleanMissionConfig,
	drawShapeToMode,
	hasUsableCoordinates,
	hydrateMissionDraft,
	mergeMissionOwnedFields,
	mergeVehicles,
	patchDraft,
	pushFeatureRef,
	pushInlineGeometry,
	removeGeometryAt,
	shouldLoadActiveMission,
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

describe("hasUsableCoordinates", () => {
	it("is true for a Point pair", () => {
		expect(hasUsableCoordinates([4.39, 50.84])).toBe(true);
	});

	it("is true for a LineString", () => {
		expect(
			hasUsableCoordinates([
				[4.39, 50.84],
				[4.4, 50.85],
			]),
		).toBe(true);
	});

	it("is true for a Polygon (3-level)", () => {
		expect(
			hasUsableCoordinates([
				[
					[4.39, 50.84],
					[4.4, 50.84],
					[4.4, 50.85],
					[4.39, 50.84],
				],
			]),
		).toBe(true);
	});

	it("is true for a MultiPolygon (4-level)", () => {
		expect(
			hasUsableCoordinates([
				[
					[
						[4.39, 50.84],
						[4.4, 50.84],
						[4.4, 50.85],
						[4.39, 50.84],
					],
				],
			]),
		).toBe(true);
	});

	it("is false for empty, degenerate ring, single number, and non-array", () => {
		expect(hasUsableCoordinates([])).toBe(false);
		expect(hasUsableCoordinates([[]])).toBe(false);
		expect(hasUsableCoordinates([5])).toBe(false);
		expect(hasUsableCoordinates("nope")).toBe(false);
		expect(hasUsableCoordinates(null)).toBe(false);
		expect(hasUsableCoordinates(undefined)).toBe(false);
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

	it("appends a valid Polygon geometry", () => {
		const draft = buildMissionDraft();
		const polygon = [
			[
				[4.39, 50.84],
				[4.4, 50.84],
				[4.4, 50.85],
				[4.39, 50.84],
			],
		];
		const next = pushInlineGeometry(draft, {
			geometry_type: "Polygon",
			coordinates: polygon,
		});
		expect(next.objective.geometries).toEqual([
			{ geometry: { geometry_type: "Polygon", coordinates: polygon } },
		]);
	});

	it("does NOT append a geometry with empty coordinates", () => {
		const draft = buildMissionDraft();
		const next = pushInlineGeometry(draft, {
			geometry_type: "Polygon",
			coordinates: [],
		});
		expect(next.objective.geometries).toHaveLength(0);
	});

	it("does NOT append a degenerate empty ring [[]]", () => {
		const draft = buildMissionDraft();
		const next = pushInlineGeometry(draft, {
			geometry_type: "Polygon",
			coordinates: [[]],
		});
		expect(next.objective.geometries).toHaveLength(0);
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

describe("shouldLoadActiveMission (editor follows active mission)", () => {
	it("loads when a non-empty active id differs from the draft", () => {
		expect(shouldLoadActiveMission("m-2", "m-1")).toBe(true);
	});

	it("loads when there is no draft yet (initial mount)", () => {
		expect(shouldLoadActiveMission("m-1", null)).toBe(true);
		expect(shouldLoadActiveMission("m-1", undefined)).toBe(true);
	});

	it("does not load when active matches the draft (loop avoidance)", () => {
		expect(shouldLoadActiveMission("m-1", "m-1")).toBe(false);
	});

	it("does not load when there is no active selection", () => {
		expect(shouldLoadActiveMission(null, "m-1")).toBe(false);
		expect(shouldLoadActiveMission(undefined, null)).toBe(false);
		expect(shouldLoadActiveMission("", "m-1")).toBe(false);
	});
});

describe("advancedSliceEquals (mount-echo dirty guard)", () => {
	it("treats equal slices (the JSON-Forms mount echo) as unchanged", () => {
		const slice = { transit: { desired_vehicle_constraints: { max: 3 } } };
		expect(advancedSliceEquals(slice, { ...slice })).toBe(true);
	});

	it("treats an empty slice and undefined/null as equal", () => {
		expect(advancedSliceEquals({}, undefined)).toBe(true);
		expect(advancedSliceEquals(null, {})).toBe(true);
	});

	it("detects a real change", () => {
		expect(
			advancedSliceEquals({ transit: { x: 1 } }, { transit: { x: 2 } }),
		).toBe(false);
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

describe("drawShapeToMode (shape → terra-draw mode)", () => {
	it("maps point → point", () => {
		expect(drawShapeToMode("point")).toBe("point");
	});

	it("maps line → linestring", () => {
		expect(drawShapeToMode("line")).toBe("linestring");
	});

	it("maps polygon → polygon", () => {
		expect(drawShapeToMode("polygon")).toBe("polygon");
	});

	it("maps rectangle → rectangle", () => {
		expect(drawShapeToMode("rectangle")).toBe("rectangle");
	});
});

describe("mergeMissionOwnedFields (map save-merge)", () => {
	const fresh = (): MissionConfig => ({
		mission_id: "m1",
		name: "Stored name",
		behavior: MissionBehavior.NAVIGATE,
		objective: {
			geometries: [{ feature_id: "old" }],
			// An advanced block F5 owns — must be preserved verbatim.
			arrival_time: { earliest: "t0", latest: "t1", target: "t2" },
		},
		vehicles: ["v-old"],
		transit: { desired_vehicle_constraints: { max_speed: 3 } },
		start: { geometry: { feature_id: "s" } },
	});

	it("overlays the four map-owned fields", () => {
		const merged = mergeMissionOwnedFields(fresh(), {
			geometries: [{ feature_id: "new" }],
			vehicles: ["v-a", "v-b"],
			behavior: MissionBehavior.COVERAGE,
			name: "New name",
		});
		expect(merged.objective.geometries).toEqual([{ feature_id: "new" }]);
		expect(merged.vehicles).toEqual(["v-a", "v-b"]);
		expect(merged.behavior).toBe(MissionBehavior.COVERAGE);
		expect(merged.name).toBe("New name");
	});

	it("preserves F5's advanced blocks (transit / start / arrival_time)", () => {
		const merged = mergeMissionOwnedFields(fresh(), {
			geometries: [{ feature_id: "new" }],
			vehicles: ["v-a"],
			behavior: MissionBehavior.NAVIGATE,
		});
		expect(merged.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 3 },
		});
		expect(merged.start).toEqual({ geometry: { feature_id: "s" } });
		expect(merged.objective.arrival_time).toEqual({
			earliest: "t0",
			latest: "t1",
			target: "t2",
		});
	});

	it("does not write name when omitted or blank (keeps the stored name)", () => {
		expect(
			mergeMissionOwnedFields(fresh(), {
				geometries: [{ feature_id: "new" }],
				vehicles: ["v-a"],
				behavior: MissionBehavior.NAVIGATE,
			}).name,
		).toBe("Stored name");
		expect(
			mergeMissionOwnedFields(fresh(), {
				geometries: [{ feature_id: "new" }],
				vehicles: ["v-a"],
				behavior: MissionBehavior.NAVIGATE,
				name: "   ",
			}).name,
		).toBe("Stored name");
	});

	it("does not mutate the input config", () => {
		const input = fresh();
		mergeMissionOwnedFields(input, {
			geometries: [{ feature_id: "new" }],
			vehicles: ["v-a"],
			behavior: MissionBehavior.COVERAGE,
		});
		expect(input.objective.geometries).toEqual([{ feature_id: "old" }]);
		expect(input.vehicles).toEqual(["v-old"]);
		expect(input.behavior).toBe(MissionBehavior.NAVIGATE);
	});

	it("makes a new empty mission submittable once the quartet is filled", () => {
		// A mission F4 just created: behavior + empty objective + no vehicles.
		const empty: MissionConfig = {
			mission_id: "m2",
			behavior: MissionBehavior.NAVIGATE,
			objective: { geometries: [] },
			vehicles: [],
		};
		const merged = mergeMissionOwnedFields(empty, {
			geometries: [
				{
					geometry: {
						geometry_type: "Polygon",
						coordinates: [
							[
								[0, 0],
								[1, 0],
								[1, 1],
								[0, 0],
							],
						],
					},
				},
			],
			vehicles: ["v-a"],
			behavior: MissionBehavior.COVERAGE,
		});
		expect(merged.objective.geometries.length).toBe(1);
		expect(merged.vehicles).toEqual(["v-a"]);
		expect(merged.behavior).toBe(MissionBehavior.COVERAGE);
	});
});
