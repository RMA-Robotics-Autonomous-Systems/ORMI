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
	mergeStoredMission,
	missionDraftSignature,
	patchDraft,
	shouldLoadActiveMission,
	type MissionDraft,
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

/**
 * OWNERSHIP. There is no longer a "map-owned" slice of a mission. The shared
 * draft is the single in-memory truth — the behaviour graph compiles
 * `objective.geometries`, `vehicles` and `behavior` into it, and a save writes
 * that draft. What the freshly-fetched stored config is still for is everything
 * the draft has never seen: the `transit` / `start` / `arrival_time` blocks that
 * have no UI at all, and any field the backend carries that this build does not
 * model.
 */
describe("mergeStoredMission (draft over stored, for the save)", () => {
	const fresh = (): MissionConfig => ({
		mission_id: "m1",
		name: "Stored name",
		behavior: MissionBehavior.NAVIGATE,
		objective: {
			geometries: [{ feature_id: "old" }],
			arrival_time: { earliest: "t0", latest: "t1", target: "t2" },
		},
		vehicles: ["v-old"],
		transit: { desired_vehicle_constraints: { max_speed: 3 } },
		start: { geometry: { feature_id: "s" } },
	});

	const compiled = (): MissionDraft =>
		({
			mission_id: "m1",
			name: "New name",
			behavior: MissionBehavior.COVERAGE,
			vehicles: ["v-a", "v-b"],
			objective: { geometries: [{ feature_id: "new" }] },
		}) as MissionDraft;

	it("the DRAFT wins on every field it carries — the graph's compile is not overwritten", () => {
		const merged = mergeStoredMission(fresh(), compiled());
		expect(merged.objective.geometries).toEqual([{ feature_id: "new" }]);
		expect(merged.vehicles).toEqual(["v-a", "v-b"]);
		expect(merged.behavior).toBe(MissionBehavior.COVERAGE);
		expect(merged.name).toBe("New name");
	});

	it("keeps a stored block the draft has never seen (transit / start / arrival_time)", () => {
		const merged = mergeStoredMission(fresh(), compiled());
		expect(merged.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 3 },
		});
		expect(merged.start).toEqual({ geometry: { feature_id: "s" } });
		// Inside `objective` too — the draft's objective replaces only the keys
		// it actually carries.
		expect(merged.objective.arrival_time).toEqual({
			earliest: "t0",
			latest: "t1",
			target: "t2",
		});
	});

	it("keeps a stored field this build does not model at all", () => {
		const stored = {
			...fresh(),
			some_backend_field: 42,
		} as unknown as MissionConfig;
		const merged = mergeStoredMission(
			stored,
			compiled(),
		) as unknown as Record<string, unknown>;
		expect(merged.some_backend_field).toBe(42);
	});

	it("a draft that DOES carry the optional block still wins it", () => {
		const draft = {
			...compiled(),
			transit: { desired_vehicle_constraints: { max_speed: 9 } },
		} as unknown as MissionDraft;
		const merged = mergeStoredMission(fresh(), draft) as MissionDraft & {
			transit?: unknown;
		};
		expect(merged.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 9 },
		});
	});

	it("trims the name, and never blanks the stored one with an empty draft name", () => {
		expect(
			mergeStoredMission(fresh(), {
				...compiled(),
				name: "  Padded  ",
			}).name,
		).toBe("Padded");
		expect(
			mergeStoredMission(fresh(), { ...compiled(), name: "   " }).name,
		).toBe("Stored name");
	});

	it("does not mutate either input", () => {
		const stored = fresh();
		const draft = compiled();
		mergeStoredMission(stored, draft);
		expect(stored.objective.geometries).toEqual([{ feature_id: "old" }]);
		expect(stored.vehicles).toEqual(["v-old"]);
		expect(stored.behavior).toBe(MissionBehavior.NAVIGATE);
		expect(draft.name).toBe("New name");
	});

	it("makes a new empty mission submittable once the graph has compiled into the draft", () => {
		// A mission the browser just created, plus what the graph compiled.
		const empty: MissionConfig = {
			mission_id: "m2",
			behavior: MissionBehavior.NAVIGATE,
			objective: { geometries: [] },
			vehicles: [],
		};
		const merged = mergeStoredMission(empty, {
			mission_id: "m2",
			name: "Recon",
			behavior: MissionBehavior.COVERAGE,
			vehicles: ["v-a"],
			objective: { geometries: [{ feature_id: "zone-1" }] },
		} as MissionDraft);
		expect(merged.objective.geometries).toEqual([{ feature_id: "zone-1" }]);
		expect(merged.vehicles).toEqual(["v-a"]);
		expect(merged.behavior).toBe(MissionBehavior.COVERAGE);
	});
});

/**
 * The concurrency guard. It used to fingerprint only the four fields the map
 * claimed; the save now writes the WHOLE draft, so the signature has to cover
 * the whole draft — a narrower one would let a concurrent edit to a field the
 * save DID persist pass as "nothing changed".
 */
describe("missionDraftSignature (save-in-flight guard)", () => {
	const base = (): MissionDraft =>
		({
			mission_id: "m1",
			name: "Recon",
			behavior: MissionBehavior.NAVIGATE,
			vehicles: ["agent-1"],
			objective: { geometries: [{ feature_id: "f1" }] },
		}) as MissionDraft;

	it("catches a change to a compiled field", () => {
		expect(missionDraftSignature(base())).not.toBe(
			missionDraftSignature({
				...base(),
				vehicles: ["agent-1", "agent-2"],
			}),
		);
		expect(missionDraftSignature(base())).not.toBe(
			missionDraftSignature({
				...base(),
				behavior: MissionBehavior.COVERAGE,
			}),
		);
		expect(missionDraftSignature(base())).not.toBe(
			missionDraftSignature({
				...base(),
				objective: { geometries: [{ feature_id: "f2" }] },
			}),
		);
	});

	it("NOW catches a change to transit — the save writes it, so it can be raced", () => {
		const edited = {
			...base(),
			transit: { desired_vehicle_constraints: { max_speed: 2 } },
		} as unknown as MissionDraft;
		expect(missionDraftSignature(base())).not.toBe(
			missionDraftSignature(edited),
		);
	});

	it("ignores key order", () => {
		const reordered = {
			objective: base().objective,
			behavior: base().behavior,
			vehicles: base().vehicles,
			name: base().name,
			mission_id: base().mission_id,
		} as MissionDraft;
		expect(missionDraftSignature(reordered)).toBe(
			missionDraftSignature(base()),
		);
	});

	it("ignores an empty optional block that cleaning prunes before the wire", () => {
		const withEmpty = { ...base(), transit: {} } as unknown as MissionDraft;
		expect(missionDraftSignature(withEmpty)).toBe(
			missionDraftSignature(base()),
		);
	});
});
