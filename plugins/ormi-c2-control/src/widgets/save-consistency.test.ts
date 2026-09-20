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
	applyMissionOwnedFields,
	cleanMissionConfig,
	hydrateMissionDraft,
	mergeMissionOwnedFields,
	missionContentEquals,
	missionOwnedFieldsSignature,
	type MissionDraft,
} from "./mission-editor-helpers";

/**
 * The two save-path defects that made the map and the editor disagree about the
 * same mission:
 *
 *  - the map validated the RAW draft while the editor validated the CLEANED
 *    one, so a draft carrying `transit: {}` was savable in one widget and
 *    permanently blocked in the other, with an error naming a field the map
 *    has no control to fix.
 *  - both save paths captured config from the render closure, awaited, then
 *    overwrote the shared draft and cleared `dirty`, losing any edit made in
 *    the other widget meanwhile.
 */

function draft(overrides: Partial<MissionDraft> = {}): MissionDraft {
	return {
		mission_id: "m1",
		name: "Recon",
		behavior: MissionBehavior.NAVIGATE,
		vehicles: ["agent-1"],
		objective: {
			geometries: [
				{
					geometry: {
						geometry_type: "Point",
						coordinates: [[4.39, 50.84]],
					},
				},
			],
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
			mergeMissionOwnedFields(draft({ transit: {} } as never), {
				geometries: withEmptyTransit.objective.geometries,
				vehicles: ["agent-1"],
				behavior: MissionBehavior.NAVIGATE,
				name: "Recon",
			}) as MissionDraft,
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

	it("map-owned signature ignores editor-only blocks", () => {
		// The map writes geometries/vehicles/behavior/name. An editor change to
		// `transit` is NOT a conflict with a write that never touched it — using a
		// whole-draft comparison would report a false conflict on every save.
		const a = draft();
		const b = draft({
			transit: { geofence_maximum_coverage: true },
		} as never);
		expect(missionOwnedFieldsSignature(a)).toBe(
			missionOwnedFieldsSignature(b),
		);
	});

	it("map-owned signature DOES catch a change to an owned field", () => {
		const a = draft();
		const b = draft({ vehicles: ["agent-1", "agent-2"] });
		expect(missionOwnedFieldsSignature(a)).not.toBe(
			missionOwnedFieldsSignature(b),
		);
	});
});

/**
 * The map's save, reduced to its store traffic: read the draft at write time,
 * overlay the live in-draw geometry, merge the owned fields onto the server's
 * copy, then commit — exactly the calls `saveMission` makes.
 */
function mapSave(
	fresh: MissionDraft,
	liveGeometry?: {
		index: number;
		geometry: MissionDraft["objective"]["geometries"][number];
	},
	duringSave?: () => void,
) {
	const current = getMissionDraft("m1")!;
	let geometries = current.objective.geometries;
	if (liveGeometry) {
		geometries = geometries.map((g, i) =>
			i === liveGeometry.index ? liveGeometry.geometry : g,
		);
	}
	const merged = cleanMissionConfig(
		hydrateMissionDraft(
			mergeMissionOwnedFields(fresh, {
				geometries,
				vehicles: current.vehicles ?? [],
				behavior: current.behavior,
				name: current.name,
			}),
		),
	);
	duringSave?.();
	const readSignature = missionOwnedFieldsSignature(current);
	const outcome = commitSavedDraft(
		"m1",
		merged,
		(d) => missionOwnedFieldsSignature(d) === readSignature,
		{
			apply: (d) => applyMissionOwnedFields(d, merged),
			isSaved: (next) => missionContentEquals(next, merged),
		},
	);
	return { outcome, merged };
}

const reshaped = {
	geometry: {
		geometry_type: "Polygon",
		coordinates: [
			[4.3, 50.8],
			[4.4, 50.8],
			[4.4, 50.9],
			[4.3, 50.8],
		],
	},
} as MissionDraft["objective"]["geometries"][number];

describe("the map's save commits what it wrote, and only that", () => {
	beforeEach(() => {
		__resetMissionDraftStore();
	});

	it("a live reshape commits clean — no false 'changed while in flight'", () => {
		setMissionDraft(draft());
		// The reshape lives in the draw layer only; the draft is untouched.
		const { outcome } = mapSave(draft(), { index: 0, geometry: reshaped });

		expect(outcome).toBe("committed");
		expect(isMissionDraftDirty("m1")).toBe(false);
		// The reshape is now in the shared draft, so the next save keeps it.
		expect(getMissionDraft("m1")!.objective.geometries[0]).toEqual(
			reshaped,
		);
	});

	it("a name the wire form normalises does not read as a conflict", () => {
		setMissionDraft(draft());
		editMissionDraft("m1", (d) => ({ ...d, name: "  Recon  " }));
		const { outcome } = mapSave(draft());

		expect(outcome).toBe("committed");
		expect(getMissionDraft("m1")!.name).toBe("Recon");
	});

	it("keeps the editor's unsaved transit edit, and stays dirty", () => {
		setMissionDraft(draft());
		const transit = { geofence_maximum_coverage: true };
		editMissionDraft(
			"m1",
			(d) => ({ ...d, transit }) as unknown as MissionDraft,
		);
		// The server copy has no transit — the map's write never sends one.
		const { outcome } = mapSave(draft(), { index: 0, geometry: reshaped });

		expect(outcome).toBe("committed");
		const after = getMissionDraft("m1")! as MissionDraft & {
			transit?: unknown;
		};
		expect(after.transit).toEqual(transit);
		expect(after.objective.geometries[0]).toEqual(reshaped);
		// Something is still unsaved, and the operator is still told so.
		expect(isMissionDraftDirty("m1")).toBe(true);
	});

	it("still reports a real concurrent change to an owned field", () => {
		setMissionDraft(draft());
		const { outcome } = mapSave(draft(), undefined, () =>
			editMissionDraft("m1", (d) => ({
				...d,
				vehicles: [...d.vehicles, "agent-2"],
			})),
		);

		expect(outcome).toBe("kept-dirty");
		expect(getMissionDraft("m1")!.vehicles).toEqual(["agent-1", "agent-2"]);
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
