import { beforeEach, describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import {
	isMissionConfigSubmittable,
	validateMissionConfig,
} from "../types/mission-config-validation";
import {
	__resetMissionDraftStore,
	commitSavedDraft,
	getMissionDraft,
	editMissionDraft,
	isMissionDraftDirty,
	setMissionDraft,
} from "../state/mission-draft-store";
import {
	cleanMissionConfig,
	hydrateMissionDraft,
	mergeStoredMission,
	missionContentEquals,
	missionDraftSignature,
	type MissionDraft,
} from "./mission-editor-helpers";

/**
 * The save path, and the two properties it has to hold.
 *
 *  - **Both panels validate the same object.** The map used to validate the RAW
 *    draft while the editor validated the CLEANED one, so a draft carrying
 *    `transit: {}` was savable in one widget and permanently blocked in the
 *    other, with an error naming a field the map has no control to fix.
 *  - **A save never eats a concurrent edit.** Both save paths captured config
 *    from the render closure, awaited, then overwrote the shared draft and
 *    cleared `dirty`, losing any edit made in the other widget meanwhile.
 *
 * What changed underneath them is ownership. There is no "map-owned" slice any
 * more: `objective.geometries`, `vehicles` and `behavior` are compiled into the
 * shared draft by the behaviour graph, the map authors none of them, and the
 * save writes the whole draft. So the write is wider — and the in-flight guard
 * had to widen with it, which is what {@link missionDraftSignature} is.
 */

function draft(overrides: Partial<MissionDraft> = {}): MissionDraft {
	return {
		mission_id: "m1",
		name: "Recon",
		behavior: MissionBehavior.NAVIGATE,
		vehicles: ["agent-1"],
		objective: {
			// What the graph compiles: a reference to a stored MapDB asset.
			// Never inline geometry — the map has no route that produces any.
			geometries: [{ feature_id: "zone-1" }],
		},
		...overrides,
	} as MissionDraft;
}

describe("map and editor validate the same thing", () => {
	// The exact draft shape that produced the deadlock: JSON-Forms materializes
	// an empty optional block the operator never filled in.
	const withEmptyTransit = draft({ transit: {} } as Partial<MissionDraft>);

	it("the RAW draft fails validation (the map's old behaviour)", () => {
		const raw = validateMissionConfig(withEmptyTransit);
		expect(raw.some((issue) => issue.severity === "error")).toBe(true);
	});

	it("the CLEANED draft passes (the editor's behaviour)", () => {
		expect(
			isMissionConfigSubmittable(cleanMissionConfig(withEmptyTransit)),
		).toBe(true);
	});

	it("cleaning is idempotent, so both paths converge", () => {
		// Both widgets now validate `cleanMissionConfig(draft)`. That only gives
		// one answer if cleaning twice equals cleaning once — otherwise the map's
		// pre-save check and the editor's could still diverge.
		const once = cleanMissionConfig(withEmptyTransit);
		expect(JSON.stringify(cleanMissionConfig(once))).toBe(
			JSON.stringify(once),
		);
	});

	it("the map's merged save output also validates clean", () => {
		const merged = cleanMissionConfig(
			hydrateMissionDraft(
				mergeStoredMission(draft({ transit: {} } as never), draft()),
			),
		);
		expect(isMissionConfigSubmittable(merged)).toBe(true);
	});
});

describe("a save never clobbers a concurrent edit", () => {
	beforeEach(() => {
		__resetMissionDraftStore();
	});

	it("commits the saved config when nothing raced the write", () => {
		const original = draft();
		setMissionDraft(original);
		editMissionDraft("m1", (d) => ({ ...d, name: "Recon v2" }));
		expect(isMissionDraftDirty("m1")).toBe(true);

		const saved = cleanMissionConfig(getMissionDraft("m1")!);
		const outcome = commitSavedDraft(
			"m1",
			saved,
			(current) =>
				JSON.stringify(cleanMissionConfig(current)) ===
				JSON.stringify(saved),
		);

		expect(outcome).toBe("committed");
		expect(isMissionDraftDirty("m1")).toBe(false);
		expect(getMissionDraft("m1")!.name).toBe("Recon v2");
	});

	it("KEEPS a concurrent edit instead of overwriting it", () => {
		const original = draft();
		setMissionDraft(original);

		// What the save captured when it started.
		const saved = cleanMissionConfig(original);
		// …then the operator edits in the OTHER widget while the save is awaiting.
		editMissionDraft("m1", (d) => ({ ...d, name: "Edited mid-save" }));

		const outcome = commitSavedDraft(
			"m1",
			saved,
			(current) =>
				JSON.stringify(cleanMissionConfig(current)) ===
				JSON.stringify(saved),
		);

		expect(outcome).toBe("kept-dirty");
		// The newer edit survives…
		expect(getMissionDraft("m1")!.name).toBe("Edited mid-save");
		// …and is still flagged unsaved, so the operator is not told it is safe.
		expect(isMissionDraftDirty("m1")).toBe(true);
	});

	it("reports an absent slot rather than resurrecting it", () => {
		expect(commitSavedDraft("gone", draft(), () => true)).toBe("absent");
		expect(getMissionDraft("gone")).toBeNull();
	});

	it("the in-flight signature follows what the save WRITES", () => {
		// The old narrow signature ignored `transit`, because the map's write
		// never touched it. The write is now the whole draft, so an edit to
		// `transit` mid-save is a real conflict and must read as one.
		const a = draft();
		const b = draft({
			transit: { geofence_maximum_coverage: true },
		} as never);
		expect(missionDraftSignature(a)).not.toBe(missionDraftSignature(b));
	});

	it("…and still catches a change to a compiled field", () => {
		expect(missionDraftSignature(draft())).not.toBe(
			missionDraftSignature(draft({ vehicles: ["agent-1", "agent-2"] })),
		);
	});
});

/**
 * The map's save, reduced to its store traffic: read the draft at write time,
 * fold it onto the server's copy, then commit — exactly the calls `saveMission`
 * makes now. Note what is NOT here any more: no per-field overlay from panel
 * state, and no live in-draw geometry captured by index, because the map does
 * not author mission geometry at all.
 */
function mapSave(fresh: MissionDraft, duringSave?: () => void) {
	const current = getMissionDraft("m1")!;
	const merged = cleanMissionConfig(
		hydrateMissionDraft(mergeStoredMission(fresh, current)),
	);
	duringSave?.();
	const readSignature = missionDraftSignature(current);
	const outcome = commitSavedDraft(
		"m1",
		merged,
		(d) => missionDraftSignature(d) === readSignature,
	);
	return { outcome, merged };
}

describe("the map's save persists the draft, and destroys nothing stored", () => {
	beforeEach(() => {
		__resetMissionDraftStore();
	});

	it("a name the wire form normalises does not read as a conflict", () => {
		setMissionDraft(draft());
		editMissionDraft("m1", (d) => ({ ...d, name: "  Recon  " }));
		const { outcome } = mapSave(draft());

		expect(outcome).toBe("committed");
		expect(getMissionDraft("m1")!.name).toBe("Recon");
	});

	it("an UNKNOWN stored block survives the save — nothing renders `transit`", () => {
		// `transit` / `start` / `arrival_time` have no UI at all right now, so
		// the save is the only thing standing between them and deletion. The
		// server copy carries them; the draft has never seen them.
		const stored = draft({
			transit: { desired_vehicle_constraints: { max_speed: 3 } },
			start: { geometry: { feature_id: "s" } },
			objective: {
				geometries: [{ feature_id: "zone-1" }],
				arrival_time: {
					earliest: "t0",
					target: "t1",
					latest: "t2",
				},
			},
			// A field this build does not model at all.
			some_backend_field: 42,
		} as never);
		setMissionDraft(draft());

		const { outcome, merged } = mapSave(stored);
		const body = merged as unknown as Record<string, unknown>;

		expect(outcome).toBe("committed");
		// What went on the wire still carries every one of them…
		expect(body.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 3 },
		});
		expect(body.start).toEqual({ geometry: { feature_id: "s" } });
		expect(
			(body.objective as Record<string, unknown>).arrival_time,
		).toEqual({ earliest: "t0", target: "t1", latest: "t2" });
		expect(body.some_backend_field).toBe(42);
		// …Mongo's own `_id` is still not one of them…
		expect(body._id).toBeUndefined();
		// …and the committed draft now carries them too, so the NEXT save does
		// not drop what this one preserved.
		const after = getMissionDraft("m1")! as unknown as Record<
			string,
			unknown
		>;
		expect(after.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 3 },
		});
		expect(after.some_backend_field).toBe(42);
	});

	it("persists what the GRAPH compiled into the draft, not a map-panel copy", () => {
		// The map used to overlay its own `vehicles` / `behavior` /
		// `objective.geometries` here, which threw away exactly this.
		setMissionDraft(draft());
		editMissionDraft("m1", (d) => ({
			...d,
			vehicles: ["agent-7"],
			behavior: MissionBehavior.COVERAGE,
			objective: { ...d.objective, geometries: [{ feature_id: "z-9" }] },
		}));

		const { outcome, merged } = mapSave(draft());

		expect(outcome).toBe("committed");
		expect(merged.vehicles).toEqual(["agent-7"]);
		expect(merged.behavior).toBe(MissionBehavior.COVERAGE);
		expect(merged.objective.geometries).toEqual([{ feature_id: "z-9" }]);
		expect(isMissionDraftDirty("m1")).toBe(false);
	});

	it("reports a real concurrent change, whatever field it landed on", () => {
		setMissionDraft(draft());
		const { outcome } = mapSave(draft(), () =>
			editMissionDraft("m1", (d) => ({
				...d,
				vehicles: [...d.vehicles, "agent-2"],
			})),
		);

		expect(outcome).toBe("kept-dirty");
		expect(getMissionDraft("m1")!.vehicles).toEqual(["agent-1", "agent-2"]);
		expect(isMissionDraftDirty("m1")).toBe(true);
	});

	it("reports a concurrent change to an UNRENDERED block too", () => {
		// Under the old narrow signature this read as "nothing changed" and the
		// edit was silently overwritten by the commit.
		setMissionDraft(draft());
		const { outcome } = mapSave(draft(), () =>
			editMissionDraft(
				"m1",
				(d) =>
					({
						...d,
						transit: {
							desired_vehicle_constraints: { max_speed: 1 },
						},
					}) as unknown as MissionDraft,
			),
		);

		expect(outcome).toBe("kept-dirty");
		const after = getMissionDraft("m1")! as unknown as Record<
			string,
			unknown
		>;
		expect(after.transit).toEqual({
			desired_vehicle_constraints: { max_speed: 1 },
		});
		expect(isMissionDraftDirty("m1")).toBe(true);
	});
});

describe("missionContentEquals", () => {
	it("ignores key order and empty optional blocks", () => {
		const a = draft();
		const b = {
			objective: a.objective,
			vehicles: a.vehicles,
			behavior: a.behavior,
			name: a.name,
			mission_id: a.mission_id,
			transit: {},
		} as unknown as MissionDraft;
		expect(missionContentEquals(a, b)).toBe(true);
	});

	it("sees a real difference", () => {
		expect(missionContentEquals(draft(), draft({ name: "Other" }))).toBe(
			false,
		);
	});
});
