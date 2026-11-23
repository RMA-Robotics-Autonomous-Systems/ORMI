import { describe, expect, it } from "bun:test";

import type { C2Feature } from "../types/c2-types";
import { mercatorOffset } from "./map-group-move";
import {
	type GroupMember,
	NO_SELECTION,
	applyGroupDraft,
	bulkDeleteQuestion,
	bulkReport,
	changeSelection,
	closesOpenFeature,
	commonValue,
	groupActions,
	groupRetypeTargets,
	groupTakesCategory,
	groupTargets,
	joinNames,
	sameSelection,
	selectedIds,
	settleSelection,
} from "./map-multi-select";

const openable = () => true;
const lockedC = (id: string) => id !== "c";

describe("selection transitions", () => {
	it("one checked feature opens, as a click does", () => {
		expect(
			changeSelection(NO_SELECTION, ["a"], "toggle", openable),
		).toEqual({ groupIds: [], openId: "a" });
	});

	it("a second feature turns the open one into a group of two", () => {
		const open = { groupIds: [], openId: "a" };
		expect(changeSelection(open, ["b"], "toggle", openable)).toEqual({
			groupIds: ["a", "b"],
			openId: null,
		});
	});

	it("unchecking down to one opens the one left", () => {
		const group = { groupIds: ["a", "b"], openId: null };
		expect(changeSelection(group, ["a"], "toggle", openable)).toEqual({
			groupIds: [],
			openId: "b",
		});
	});

	it("unchecking the last one selects nothing", () => {
		const open = { groupIds: [], openId: "a" };
		expect(changeSelection(open, ["a"], "toggle", openable)).toEqual(
			NO_SELECTION,
		);
	});

	it("one feature that cannot be opened stays a group of one", () => {
		expect(changeSelection(NO_SELECTION, ["c"], "toggle", lockedC)).toEqual(
			{ groupIds: ["c"], openId: null },
		);
	});

	it("select all adds what is missing, and remove takes them out", () => {
		const open = { groupIds: [], openId: "a" };
		const all = changeSelection(open, ["a", "b", "c"], "add", openable);
		expect(all).toEqual({ groupIds: ["a", "b", "c"], openId: null });
		const none = changeSelection(all, ["a", "b", "c"], "remove", openable);
		expect(none).toEqual(NO_SELECTION);
	});

	it("lists the selected ids whatever form the selection takes", () => {
		expect(selectedIds(NO_SELECTION)).toEqual([]);
		expect(selectedIds({ groupIds: [], openId: "a" })).toEqual(["a"]);
		expect(selectedIds({ groupIds: ["a", "b"], openId: null })).toEqual([
			"a",
			"b",
		]);
	});

	it("says when a change closes the feature open", () => {
		const open = { groupIds: [], openId: "a" };
		expect(
			closesOpenFeature(
				open,
				changeSelection(open, ["b"], "toggle", openable),
			),
		).toBe(true);
		expect(closesOpenFeature(open, open)).toBe(false);
		expect(
			closesOpenFeature(
				{ groupIds: ["a", "b"], openId: null },
				{ groupIds: [], openId: "a" },
			),
		).toBe(false);
	});

	it("compares selections", () => {
		expect(
			sameSelection(settleSelection(["a", "b"], openable), {
				groupIds: ["a", "b"],
				openId: null,
			}),
		).toBe(true);
		expect(sameSelection(NO_SELECTION, { groupIds: [], openId: "a" })).toBe(
			false,
		);
	});
});

function member(
	id: string,
	featureType: string,
	extra: Partial<GroupMember> = {},
): GroupMember {
	return {
		id,
		name: id.toUpperCase(),
		featureType,
		category: "",
		locked: false,
		hidden: false,
		...extra,
	};
}

describe("what applies to the group", () => {
	it("excludes locked members and keeps hidden ones", () => {
		const targets = groupTargets([
			member("a", "risk"),
			member("b", "road", { locked: true }),
			member("c", "zone", { hidden: true }),
		]);
		expect(targets.eligible.map((m) => m.id)).toEqual(["a", "c"]);
		expect(targets.locked.map((m) => m.id)).toEqual(["b"]);
		expect(targets.hidden.map((m) => m.id)).toEqual(["c"]);
	});

	it("offers only the types every geometry takes", () => {
		expect(
			groupRetypeTargets([member("a", "risk"), member("b", "geofence")]),
		).toEqual(["geofence", "risk", "zone"]);
		expect(groupRetypeTargets([member("a", "road")])).toEqual(["road"]);
		expect(
			groupRetypeTargets([member("a", "risk"), member("b", "road")]),
		).toEqual([]);
		expect(
			groupRetypeTargets([member("a", "waypoint"), member("b", "cue")]),
		).toEqual(["waypoint", "cue"]);
		expect(groupRetypeTargets([member("a", "mystery")])).toEqual([]);
		expect(groupRetypeTargets([])).toEqual([]);
	});

	it("sets a category only where every resulting type takes one", () => {
		const areas = [member("a", "risk"), member("b", "zone")];
		expect(groupTakesCategory(areas, {})).toBe(false);
		expect(groupTakesCategory(areas, { featureType: "zone" })).toBe(true);
		expect(
			groupTakesCategory(
				[member("a", "waypoint"), member("b", "cue")],
				{},
			),
		).toBe(true);
	});

	it("offers nothing in View, while busy or with no eligible feature", () => {
		const base = {
			eligible: [member("a", "risk"), member("b", "zone")],
			draft: {},
			viewOnly: false,
			busy: false,
			canUpdate: true,
			canDelete: true,
		};
		expect(groupActions(base)).toEqual({
			delete: true,
			move: true,
			retype: true,
			categorise: false,
		});
		const none = {
			delete: false,
			move: false,
			retype: false,
			categorise: false,
		};
		expect(groupActions({ ...base, viewOnly: true })).toEqual(none);
		expect(groupActions({ ...base, busy: true })).toEqual(none);
		expect(groupActions({ ...base, eligible: [] })).toEqual(none);
		expect(groupActions({ ...base, canUpdate: false })).toEqual({
			...none,
			delete: true,
		});
		expect(
			groupActions({
				...base,
				eligible: [member("a", "risk"), member("b", "road")],
			}).retype,
		).toBe(false);
	});

	it("finds a value shared by all", () => {
		expect(commonValue(["risk", "risk"])).toBe("risk");
		expect(commonValue(["risk", "zone"])).toBeNull();
		expect(commonValue([])).toBeNull();
	});
});

describe("applyGroupDraft", () => {
	const yard: C2Feature = {
		type: "Feature",
		properties: {
			feature_id: "yard",
			name: "Gravel yard",
			feature_type: "risk",
			source: "survey",
		},
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[4.397, 50.844],
					[4.398, 50.844],
					[4.398, 50.845],
					[4.397, 50.844],
				],
			],
		},
	};
	const none = { offset: { dx: 0, dy: 0 } };

	it("changes nothing without a draft", () => {
		expect(applyGroupDraft(yard, none)).toBeNull();
		expect(
			applyGroupDraft(yard, { ...none, featureType: "risk" }),
		).toBeNull();
	});

	it("retypes, keeping every other property and the geometry", () => {
		const out = applyGroupDraft(yard, { ...none, featureType: "zone" })!;
		expect(out.properties).toEqual({
			...yard.properties,
			feature_type: "zone",
		});
		expect(out.geometry).toBe(yard.geometry);
	});

	it("sets a category where the type takes one, and drops it where it does not", () => {
		const zone = applyGroupDraft(yard, {
			...none,
			featureType: "zone",
			category: "staging",
		})!;
		expect(zone.properties?.category).toBe("staging");
		const backToRisk = applyGroupDraft(zone, {
			...none,
			featureType: "risk",
		})!;
		expect(backToRisk.properties?.category).toBeUndefined();
		const cleared = applyGroupDraft(zone, { ...none, category: "" })!;
		expect("category" in (cleared.properties ?? {})).toBe(false);
	});

	it("moves the geometry and nothing else", () => {
		const offset = mercatorOffset([4.397, 50.844], [4.3975, 50.8441]);
		const out = applyGroupDraft(yard, { offset })!;
		expect(out.properties).toEqual(yard.properties);
		const ring = (out.geometry?.coordinates as number[][][])[0]!;
		expect(ring[0]![0]).toBeCloseTo(4.3975, 9);
		expect(ring[0]![1]).toBeCloseTo(50.8441, 9);
		expect(ring[0]).toEqual(ring[ring.length - 1]!);
		// The stored feature is never edited in place.
		expect((yard.geometry?.coordinates as number[][][])[0]![0]).toEqual([
			4.397, 50.844,
		]);
	});
});

describe("words", () => {
	it("joins names", () => {
		expect(joinNames(["A"])).toBe("A");
		expect(joinNames(["A", "B"])).toBe("A and B");
		expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
	});

	it("names up to five features in the delete question, and counts beyond", () => {
		expect(bulkDeleteQuestion(["A", "B", "C"], 0)).toEqual({
			title: "Delete 3 features?",
			description: "Permanently delete A, B and C from this map.",
		});
		const six = bulkDeleteQuestion(["A", "B", "C", "D", "E", "F"], 1);
		expect(six.title).toBe("Delete 6 features?");
		expect(six.description).toBe(
			"Permanently delete 6 features from this map. 1 feature on a locked layer is kept.",
		);
	});
});

describe("bulkReport", () => {
	it("reports nothing when every request succeeded", () => {
		expect(
			bulkReport(
				[
					{ id: "a", name: "A", ok: true },
					{ id: "b", name: "B", ok: true },
				],
				"save",
			),
		).toEqual({ succeeded: ["a", "b"], failed: [], message: null });
	});

	it("names each failure with its reason and counts the successes", () => {
		const report = bulkReport(
			[
				{ id: "a", name: "A", ok: true },
				{ id: "b", name: "B", ok: false, error: "HTTP 500" },
				{ id: "c", name: "C", ok: true },
				{ id: "d", name: "D", ok: false },
			],
			"save",
		);
		expect(report.succeeded).toEqual(["a", "c"]);
		expect(report.failed).toEqual(["b", "d"]);
		expect(report.message).toBe(
			"Not saved: B (HTTP 500), D. 2 features saved. Still selected.",
		);
	});

	it("never claims a success when all failed", () => {
		const report = bulkReport(
			[{ id: "a", name: "A", ok: false, error: "gone" }],
			"delete",
		);
		expect(report.succeeded).toEqual([]);
		expect(report.message).toBe("Not deleted: A (gone). Still selected.");
	});
});
