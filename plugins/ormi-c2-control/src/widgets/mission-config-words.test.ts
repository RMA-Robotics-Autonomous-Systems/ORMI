import { describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import type { MissionConfigIssue } from "../types/mission-config-validation";
import {
	humanizeMissionIssues,
	missionBehaviourWord,
	missionFieldLabel,
} from "./mission-config-words";

/** An issue as `validateMissionConfig` emits it. */
function issue(
	path: string,
	message: string,
	severity: MissionConfigIssue["severity"] = "error",
): MissionConfigIssue {
	return { path, message, severity };
}

describe("missionFieldLabel", () => {
	it("names the fields a mission being authored actually trips", () => {
		expect(missionFieldLabel("vehicles")).toBe("Vehicles");
		expect(missionFieldLabel("objective.geometries")).toBe("Objectives");
		expect(missionFieldLabel("behavior")).toBe("Behaviour");
		expect(missionFieldLabel("start.geometry")).toBe("Start point");
	});

	it("counts objectives from one, the way an operator does", () => {
		expect(missionFieldLabel("objective.geometries[0]")).toBe(
			"Objective 1",
		);
		expect(missionFieldLabel("objective.geometries[2].geometry")).toBe(
			"Objective 3 geometry",
		);
		expect(missionFieldLabel("objective.geometries[1].feature_id")).toBe(
			"Objective 2 map feature",
		);
	});

	it("keeps an indexed objective's unknown tail out of the words", () => {
		// The index still says WHICH objective; inventing prose for a tail we
		// do not know would be a guess printed as a fact.
		expect(missionFieldLabel("objective.geometries[0].weird_field")).toBe(
			"Objective 1",
		);
	});

	it("has no words for a path nobody authors, so it stays raw", () => {
		// Deliberately not prettified: "Transit desired vehicle constraints max
		// speed" is longer, no clearer, and no longer greppable.
		expect(
			missionFieldLabel("transit.desired_vehicle_constraints.max_speed"),
		).toBeNull();
		expect(missionFieldLabel("")).toBeNull();
	});
});

describe("humanizeMissionIssues", () => {
	it("moves a known path out of the chrome and into the sentence", () => {
		const [out] = humanizeMissionIssues([
			issue(
				"vehicles",
				"At least one vehicle must be assigned to the mission.",
			),
		]);
		// An empty path is what tells the renderer to print no monospace code
		// element at all — the developer artefact this exists to remove.
		expect(out!.path).toBe("");
		expect(out!.message).toBe(
			"Vehicles: At least one vehicle must be assigned to the mission.",
		);
		expect(out!.severity).toBe("error");
	});

	it("does not print the same path twice when the message repeats it", () => {
		const [out] = humanizeMissionIssues([
			issue(
				"objective.geometries",
				"objective.geometries must contain at least one geometry.",
			),
		]);
		expect(out!.message).toBe(
			"Objectives: must contain at least one geometry.",
		);
		expect(out!.message).not.toContain("objective.geometries");
	});

	it("rewrites a raw path buried mid-sentence, longest match first", () => {
		const [out] = humanizeMissionIssues([
			issue("behavior", "Coverage needs objective.geometries to plan."),
		]);
		// `objective` must not eat the head of `objective.geometries`, which
		// would leave the operator reading "objective.geometries".
		expect(out!.message).toBe(
			"Behaviour: Coverage needs objectives to plan.",
		);
	});

	it("strips only a LEADING repetition of the path, once", () => {
		const [out] = humanizeMissionIssues([
			issue("vehicles", "vehicles must be an array of vehicles ids."),
		]);
		expect(out!.message).toBe(
			"Vehicles: must be an array of vehicles ids.",
		);
	});

	it("returns an unknown path untouched", () => {
		const raw = issue(
			"transit.desired_vehicle_constraints.max_speed",
			"Max speed must be a number.",
			"warning",
		);
		const [out] = humanizeMissionIssues([raw]);
		expect(out).toBe(raw);
	});

	it("does not modify the list it was given", () => {
		const input = [issue("vehicles", "At least one vehicle.")];
		const before = JSON.stringify(input);
		humanizeMissionIssues(input);
		expect(JSON.stringify(input)).toBe(before);
	});
});

describe("missionBehaviourWord", () => {
	it("names the behaviours this build knows", () => {
		expect(missionBehaviourWord(MissionBehavior.NAVIGATE)).toBe("Navigate");
		expect(missionBehaviourWord(MissionBehavior.COVERAGE)).toBe("Cover");
	});

	it("keeps an unknown value visible rather than guessing a word", () => {
		// The behaviour is derived from the graph: a value this build does not
		// know is a fact worth showing, not one to round to the nearest label.
		expect(missionBehaviourWord(99)).toBe("behaviour 99");
		expect(missionBehaviourWord(undefined)).toBe("unset");
	});
});
