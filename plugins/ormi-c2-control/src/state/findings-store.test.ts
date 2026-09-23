import { beforeEach, describe, expect, it } from "bun:test";

import {
	__resetFindingsStore,
	getFindingsSnapshot,
	getFindingsStats,
	recordDroppedFinding,
	recordFinding,
	subscribe,
} from "./findings-store";
import {
	ConfidenceStatistic,
	FindingEssence,
	type Finding,
} from "../widgets/findings";

/** A parsed finding. */
function finding(overrides: Partial<Finding> = {}): Finding {
	return {
		uid: "f-1",
		mission_id: "m-1",
		stampMs: 1,
		essence: FindingEssence.REAL,
		lngLat: [4.39, 50.84],
		altitude: 0,
		supportUids: [],
		confidenceStatistic: ConfidenceStatistic.PROBABILITY,
		confidence: 0.6,
		sourceReliability: 1,
		measurements: [],
		agent_id: "robot-a",
		payload_uid: "emi-0",
		source: "emi_driver",
		gate_used: "",
		sigmaAtCreation: 1,
		degradedFix: false,
		supersededBy: "",
		channel: "observation",
		...overrides,
	};
}

beforeEach(() => {
	__resetFindingsStore();
});

describe("the store is append-only", () => {
	it("keeps every distinct finding", () => {
		recordFinding(finding({ uid: "a" }));
		recordFinding(finding({ uid: "b" }));
		expect(
			getFindingsSnapshot()
				.map((f) => f.uid)
				.sort(),
		).toEqual(["a", "b"]);
		expect(getFindingsStats().stored).toBe(2);
	});

	it("NEVER rewrites a stored finding from a repeat", () => {
		// `/payload/item` is latched, so the same item is redelivered on every
		// reconnect. A republish that moved a finding under the operator would
		// be the worst kind of silent change: they may already have dispatched
		// an effector to where it said it was.
		recordFinding(finding({ uid: "a", confidence: 0.4 }));
		recordFinding(finding({ uid: "a", confidence: 0.99, lngLat: [0, 0] }));
		const [stored] = getFindingsSnapshot();
		expect(stored?.confidence).toBeCloseTo(0.4);
		expect(stored?.lngLat).toEqual([4.39, 50.84]);
		expect(getFindingsStats().repeats).toBe(1);
		expect(getFindingsStats().stored).toBe(1);
	});

	it("folds in a supersession, because that is additive and not a rewrite", () => {
		recordFinding(finding({ uid: "a" }));
		recordFinding(finding({ uid: "a", supersededBy: "b" }));
		const [stored] = getFindingsSnapshot();
		expect(stored?.supersededBy).toBe("b");
		// Still one record — a superseded finding gets `superseded_by`, never a
		// tombstone.
		expect(getFindingsSnapshot()).toHaveLength(1);
		expect(getFindingsStats().supersessions).toBe(1);
	});

	it("takes the mission a raw contact lacked from the fog's stamped copy", () => {
		// The fog republishes its robots' contacts on /mission/findings with
		// the mission that has them leased; the raw /payload/observation copy
		// may have arrived first.
		recordFinding(finding({ uid: "a", mission_id: "" }));
		recordFinding(finding({ uid: "a", mission_id: "m-1" }));
		recordFinding(finding({ uid: "a", mission_id: "m-2" }));
		expect(getFindingsSnapshot()[0]?.mission_id).toBe("m-1");
		expect(getFindingsSnapshot()).toHaveLength(1);
		expect(getFindingsStats().repeats).toBe(1);
		expect(getFindingsStats().supersessions).toBe(0);
	});

	it("does not re-point a supersession that is already recorded", () => {
		recordFinding(finding({ uid: "a" }));
		recordFinding(finding({ uid: "a", supersededBy: "b" }));
		recordFinding(finding({ uid: "a", supersededBy: "c" }));
		expect(getFindingsSnapshot()[0]?.supersededBy).toBe("b");
		expect(getFindingsStats().supersessions).toBe(1);
		expect(getFindingsStats().repeats).toBe(1);
	});
});

describe("the counters are the visible part of the risk", () => {
	it("counts every message received, stored or not", () => {
		recordFinding(finding({ uid: "a" }));
		recordFinding(finding({ uid: "a" }));
		recordDroppedFinding();
		const stats = getFindingsStats();
		expect(stats.received).toBe(3);
		expect(stats.stored).toBe(1);
		expect(stats.repeats).toBe(1);
		expect(stats.dropped).toBe(1);
	});
});

describe("the snapshots satisfy useSyncExternalStore", () => {
	it("returns the SAME array reference while nothing changed", () => {
		recordFinding(finding({ uid: "a" }));
		const first = getFindingsSnapshot();
		expect(getFindingsSnapshot()).toBe(first);
		// A repeat changes no finding, so the array must not churn — a fresh
		// identity here re-renders every consumer on every latched republish.
		recordFinding(finding({ uid: "a" }));
		expect(getFindingsSnapshot()).toBe(first);
	});

	it("returns a FRESH array reference after a real insert", () => {
		recordFinding(finding({ uid: "a" }));
		const first = getFindingsSnapshot();
		recordFinding(finding({ uid: "b" }));
		expect(getFindingsSnapshot()).not.toBe(first);
	});

	it("gives the stats a fresh identity whenever a counter moves", () => {
		const first = getFindingsStats();
		recordDroppedFinding();
		expect(getFindingsStats()).not.toBe(first);
		const second = getFindingsStats();
		expect(getFindingsStats()).toBe(second);
	});

	it("notifies subscribers and unsubscribes cleanly", () => {
		let calls = 0;
		const unsubscribe = subscribe(() => {
			calls += 1;
		});
		recordFinding(finding({ uid: "a" }));
		expect(calls).toBe(1);
		unsubscribe();
		recordFinding(finding({ uid: "b" }));
		expect(calls).toBe(1);
	});
});
