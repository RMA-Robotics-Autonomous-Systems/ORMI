import { describe, expect, it } from "bun:test";

import {
	ConfidenceStatistic,
	FindingEssence,
	cueFeatureToFinding,
	essenceLabel,
	findingKind,
	findingLabel,
	findingStampMs,
	findingsOfMission,
	findingsToFeatureCollection,
	isSimulatedEssence,
	parseFinding,
	tallyFindings,
	type Finding,
} from "./findings";

/** A raw `payload_msgs/msg/Finding` as a rosbridge/foxglove source delivers it. */
function rawFinding(overrides: Record<string, unknown> = {}) {
	return {
		uid: "f-1",
		mission_id: "m-1",
		stamp: { sec: 1758000000, nanosec: 500_000_000 },
		essence: FindingEssence.REAL,
		position: { latitude: 50.84, longitude: 4.39, altitude: 12 },
		position_covariance: new Array(9).fill(0),
		support_uids: [],
		confidence: {
			statistic_type: ConfidenceStatistic.PROBABILITY,
			value: 0.72,
			source_reliability: 0.9,
		},
		measurements: [
			{
				quantity: "conductivity",
				value: 3.2,
				unit: "S/m",
				sigma: 0.1,
				depth_m: 0.15,
			},
		],
		agent_id: "robot-a",
		payload_uid: "emi-0",
		source: "emi_driver",
		gate_used: "mad-3",
		sigma_at_creation: 1.0,
		degraded_fix: false,
		superseded_by: "",
		...overrides,
	};
}

/** A parsed finding, for the pure predicates. */
function finding(overrides: Partial<Finding> = {}): Finding {
	return {
		uid: "f-1",
		mission_id: "m-1",
		stampMs: 0,
		essence: FindingEssence.REAL,
		lngLat: [4.39, 50.84],
		altitude: 0,
		supportUids: [],
		confidenceStatistic: ConfidenceStatistic.PROBABILITY,
		confidence: 0.5,
		sourceReliability: 1,
		measurements: [],
		agent_id: "",
		payload_uid: "",
		source: "",
		gate_used: "",
		sigmaAtCreation: 0,
		degradedFix: false,
		supersededBy: "",
		channel: "observation",
		...overrides,
	};
}

describe("parseFinding", () => {
	it("reads a GeoPoint as [lng, lat] with no swap", () => {
		const parsed = parseFinding(rawFinding(), "observation");
		// `geographic_msgs/GeoPoint` is already geographic: there is no frame to
		// resolve and no swap to perform, which is exactly why the findings
		// topics were preferred over anything frame-relative.
		expect(parsed?.lngLat).toEqual([4.39, 50.84]);
		expect(parsed?.altitude).toBe(12);
	});

	it("carries provenance, confidence and measurements", () => {
		const parsed = parseFinding(rawFinding(), "observation");
		expect(parsed?.agent_id).toBe("robot-a");
		expect(parsed?.payload_uid).toBe("emi-0");
		expect(parsed?.gate_used).toBe("mad-3");
		expect(parsed?.confidence).toBeCloseTo(0.72);
		expect(parsed?.sourceReliability).toBeCloseTo(0.9);
		expect(parsed?.measurements[0]?.unit).toBe("S/m");
		expect(parsed?.channel).toBe("observation");
	});

	it("folds builtin_interfaces/Time to epoch milliseconds", () => {
		expect(findingStampMs({ sec: 2, nanosec: 500_000_000 })).toBe(2500);
		expect(findingStampMs({ sec: 0, nanosec: 0 })).toBe(0);
		expect(findingStampMs(undefined)).toBe(0);
	});

	it("REFUSES a finding with no uid", () => {
		// The uid is the append-only identity. Without one, every latched
		// republish would read as a brand-new finding and the map would fill up
		// with copies of the same report.
		expect(parseFinding(rawFinding({ uid: "" }), "item")).toBeNull();
		expect(parseFinding(rawFinding({ uid: 7 }), "item")).toBeNull();
	});

	it("REFUSES a finding it cannot place", () => {
		// A finding is a belief that something is AT A PLACE. One with no usable
		// position is not something a map can honestly draw anywhere, so it is
		// dropped and counted rather than plotted at null island.
		expect(
			parseFinding(rawFinding({ position: undefined }), "item"),
		).toBeNull();
		expect(
			parseFinding(rawFinding({ position: { latitude: 50.84 } }), "item"),
		).toBeNull();
		expect(
			parseFinding(
				rawFinding({
					position: { latitude: Number.NaN, longitude: 4.39 },
				}),
				"item",
			),
		).toBeNull();
	});

	it("degrades the fields it can, rather than refusing the whole record", () => {
		const parsed = parseFinding(
			{
				uid: "f-2",
				position: { latitude: 1, longitude: 2 },
			},
			"item",
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.confidence).toBe(0);
		expect(parsed?.supportUids).toEqual([]);
		expect(parsed?.measurements).toEqual([]);
		expect(parsed?.essence).toBe(FindingEssence.UNKNOWN);
	});

	it("returns null for junk", () => {
		expect(parseFinding(null, "item")).toBeNull();
		expect(parseFinding("finding", "item")).toBeNull();
		expect(parseFinding([], "item")).toBeNull();
	});
});

describe("the derived name", () => {
	it("is an item once two or more findings support it", () => {
		expect(findingKind(finding({ supportUids: ["a", "b"] }))).toBe("item");
		expect(findingKind(finding({ supportUids: ["a", "b", "c"] }))).toBe(
			"item",
		);
	});

	it("is a contact when exactly one finding supports it", () => {
		expect(findingKind(finding({ supportUids: ["a"] }))).toBe("contact");
	});

	it("is a cue only when support is empty AND the basis is human instinct", () => {
		// The message says a cue is "no support and HUMAN_INSTINCT confidence".
		// Support-emptiness alone is NOT the test: a payload's own first report
		// has no support either, and calling that a cue would tell the operator
		// a human had put it there.
		expect(
			findingKind(
				finding({
					supportUids: [],
					confidenceStatistic: ConfidenceStatistic.HUMAN_INSTINCT,
				}),
			),
		).toBe("cue");
		expect(
			findingKind(
				finding({
					supportUids: [],
					confidenceStatistic: ConfidenceStatistic.PROBABILITY,
				}),
			),
		).toBe("contact");
		expect(
			findingKind(
				finding({
					supportUids: [],
					confidenceStatistic: ConfidenceStatistic.SCORE,
				}),
			),
		).toBe("contact");
	});
});

describe("essence is a safety property", () => {
	it("flags everything that is not confirmed real, including UNKNOWN", () => {
		// A publisher that never sets the field sends 0. Flagging an unset
		// essence is the failure direction that cannot get anybody hurt;
		// treating it as real is the one that can.
		expect(isSimulatedEssence(FindingEssence.REAL)).toBe(false);
		expect(isSimulatedEssence(FindingEssence.UNKNOWN)).toBe(true);
		expect(isSimulatedEssence(FindingEssence.SIMULATED)).toBe(true);
		expect(isSimulatedEssence(FindingEssence.EXERCISE)).toBe(true);
		expect(isSimulatedEssence(FindingEssence.TEST)).toBe(true);
	});

	it("says which one in words, not only in colour", () => {
		expect(essenceLabel(FindingEssence.SIMULATED)).toBe("SIMULATED");
		expect(essenceLabel(FindingEssence.EXERCISE)).toBe("EXERCISE");
		expect(essenceLabel(FindingEssence.TEST)).toBe("TEST");
		expect(essenceLabel(FindingEssence.UNKNOWN)).toContain("unknown");
	});

	it("puts the essence in the label of anything that is not real", () => {
		expect(
			findingLabel(finding({ essence: FindingEssence.SIMULATED })),
		).toContain("SIMULATED");
		expect(
			findingLabel(finding({ essence: FindingEssence.REAL })),
		).not.toContain("SIMULATED");
	});
});

describe("a cue map feature is the same record", () => {
	const cue = {
		type: "Feature" as const,
		properties: {
			feature_id: "cue-1",
			name: "Disturbed soil",
			feature_type: "cue",
			category: "observation",
			confidence: 0.3,
		},
		geometry: { type: "Point", coordinates: [4.39, 50.84] },
	};

	it("lifts an operator-placed cue into a Finding that reads as a cue", () => {
		const lifted = cueFeatureToFinding(cue);
		expect(lifted).not.toBeNull();
		expect(lifted?.uid).toBe("cue-1");
		expect(lifted?.lngLat).toEqual([4.39, 50.84]);
		expect(lifted?.supportUids).toEqual([]);
		expect(lifted?.confidenceStatistic).toBe(
			ConfidenceStatistic.HUMAN_INSTINCT,
		);
		expect(findingKind(lifted!)).toBe("cue");
		expect(lifted?.channel).toBe("map");
	});

	it("honours a stated confidence and defaults to 0.5 without one", () => {
		expect(cueFeatureToFinding(cue)?.confidence).toBeCloseTo(0.3);
		const bare = {
			...cue,
			properties: { ...cue.properties, confidence: undefined },
		};
		expect(cueFeatureToFinding(bare)?.confidence).toBeCloseTo(0.5);
	});

	it("is REAL: an operator looking at the ground is a real observation", () => {
		// The uncertainty of a cue lives in its confidence, not in its essence.
		// Marking it simulated would put a ring around every operator hunch and
		// make the ring stop meaning "not a real thing".
		expect(cueFeatureToFinding(cue)?.essence).toBe(FindingEssence.REAL);
	});

	it("ignores every other feature type", () => {
		expect(
			cueFeatureToFinding({
				...cue,
				properties: { ...cue.properties, feature_type: "waypoint" },
			}),
		).toBeNull();
	});

	it("reads a MultiPoint cue at its first vertex, and refuses junk", () => {
		expect(
			cueFeatureToFinding({
				...cue,
				geometry: { type: "MultiPoint", coordinates: [[1, 2]] },
			})?.lngLat,
		).toEqual([1, 2]);
		expect(cueFeatureToFinding({ ...cue, geometry: undefined })).toBeNull();
		expect(
			cueFeatureToFinding({
				...cue,
				properties: { ...cue.properties, feature_id: undefined },
			}),
		).toBeNull();
	});
});

describe("tallyFindings", () => {
	it("counts by derived kind plus the two states that change what to do", () => {
		const tally = tallyFindings([
			finding({
				uid: "a",
				confidenceStatistic: ConfidenceStatistic.HUMAN_INSTINCT,
			}),
			finding({ uid: "b", supportUids: ["a"] }),
			finding({ uid: "c", supportUids: ["a", "b"] }),
			finding({ uid: "d", essence: FindingEssence.SIMULATED }),
			finding({ uid: "e", supersededBy: "c" }),
		]);
		expect(tally.total).toBe(5);
		expect(tally.cues).toBe(1);
		expect(tally.contacts).toBe(3);
		expect(tally.items).toBe(1);
		expect(tally.notReal).toBe(1);
		expect(tally.superseded).toBe(1);
	});
});

describe("findingsOfMission", () => {
	it("keeps the selected mission's findings, or all without a selection", () => {
		const all = [
			finding({ uid: "a", mission_id: "m-1" }),
			finding({ uid: "b", mission_id: "m-2" }),
			finding({ uid: "c", mission_id: "" }),
		];
		expect(findingsOfMission(all, "m-1").map((f) => f.uid)).toEqual(["a"]);
		expect(findingsOfMission(all, null)).toHaveLength(3);
	});
});

describe("findingsToFeatureCollection", () => {
	it("clamps support depth to the three visual weights", () => {
		const fc = findingsToFeatureCollection([
			finding({ uid: "a" }),
			finding({ uid: "b", supportUids: ["a"] }),
			finding({ uid: "c", supportUids: ["a", "b", "x", "y"] }),
		]);
		const weights = fc.features.map((f) => f.properties.weight);
		expect(weights.sort()).toEqual([0, 1, 2]);
	});

	it("draws superseded findings FIRST, so the live ones sit on top", () => {
		// MapLibre paints a source's features in the order the data gives them,
		// so this ordering is the only place the stacking can be decided. A
		// superseded finding is still drawn — an operator may already have
		// acted on it — but it must never cover a live one.
		const fc = findingsToFeatureCollection([
			finding({ uid: "live" }),
			finding({ uid: "old", supersededBy: "live" }),
		]);
		expect(fc.features.map((f) => f.properties.uid)).toEqual([
			"old",
			"live",
		]);
		expect(fc.features[0]?.properties.superseded).toBe(true);
	});

	it("marks not-real findings so the layer can ring them", () => {
		const fc = findingsToFeatureCollection([
			finding({ uid: "sim", essence: FindingEssence.SIMULATED }),
			finding({ uid: "real", essence: FindingEssence.REAL }),
			finding({ uid: "unset", essence: FindingEssence.UNKNOWN }),
		]);
		const notReal = new Map(
			fc.features.map((f) => [f.properties.uid, f.properties.notReal]),
		);
		expect(notReal.get("sim")).toBe(true);
		expect(notReal.get("unset")).toBe(true);
		expect(notReal.get("real")).toBe(false);
	});

	it("keeps the position as [lng, lat]", () => {
		const fc = findingsToFeatureCollection([finding()]);
		expect(fc.features[0]?.geometry.coordinates).toEqual([4.39, 50.84]);
	});
});
