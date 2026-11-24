import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import {
	type MissionFeedback,
	type ProgramProgress,
	TaskState,
} from "../types/mission-feedback";
import { validateMissionConfig } from "../types/mission-config-validation";
import {
	compileMissionGraph,
	type MissionGraph,
	type MissionGraphIssue,
} from "./mission-graph";
import {
	UNTIED_FAILURE_MESSAGE,
	configIssueTarget,
	configStepIssues,
	feedbackFailureIssues,
	graphStepIssues,
	issueRefName,
	issueValueText,
	nodeForFeature,
} from "./step-issues";

const at = { x: 0, y: 0 };

function agent(id: string, agentId?: string, label = "Alpha") {
	return {
		id,
		kind: "agent" as const,
		label,
		position: at,
		...(agentId ? { agent_id: agentId } : {}),
	};
}

function action(
	id: string,
	act: "NAVIGATE" | "COVERAGE",
	label: string,
	featureId?: string,
) {
	return {
		id,
		kind: "action" as const,
		action: act,
		label,
		position: at,
		...(featureId ? { feature_id: featureId } : {}),
	};
}

function robot(source: string, target: string) {
	return {
		id: `${source}->${target}`,
		source,
		source_port: "agent",
		target,
		target_port: "agent",
	};
}

function graph(
	nodes: MissionGraph["nodes"],
	edges: MissionGraph["edges"],
): MissionGraph {
	return { version: 3, nodes, edges };
}

/** Alpha navigates to the gate, then sweeps nothing. */
const CHAIN = graph(
	[
		agent("a1", "alpha"),
		action("nav", "NAVIGATE", "To the gate", "gate"),
		action("sweep", "COVERAGE", "Sweep"),
	],
	[robot("a1", "nav"), robot("nav", "sweep")],
);

const NAMES = {
	features: { gate: "Gate", yard: "Yard", pond: "Pond" },
	agents: { alpha: "Alpha" },
};

function issueFor(
	issues: readonly MissionGraphIssue[],
	code: string,
): MissionGraphIssue {
	const found = issues.find((issue) => issue.code === code);
	expect(found, code).toBeDefined();
	return found!;
}

const valueOf = (issue: MissionGraphIssue) =>
	issueValueText(issue.value!, NAMES);

describe("the value a graph issue names", () => {
	it("names a target that is not in the mission by its name", () => {
		const { issues } = compileMissionGraph(CHAIN, { yard: "zone" });
		const missing = issueFor(issues, "TARGET_MISSING");
		expect(missing.nodeId).toBe("nav");
		expect(valueOf(missing)).toBe("Target: Gate (not in this mission)");
	});

	it("names a target of the wrong type, and what it is", () => {
		const g = graph(
			[agent("a1", "alpha"), action("nav", "NAVIGATE", "Go", "yard")],
			[robot("a1", "nav")],
		);
		const { issues } = compileMissionGraph(g, { yard: "zone" });
		expect(valueOf(issueFor(issues, "TARGET_TYPE"))).toBe(
			"Target: Yard (a zone, not a waypoint)",
		);
	});

	it("says a field that holds nothing holds none", () => {
		const { issues } = compileMissionGraph(CHAIN, { gate: "waypoint" });
		expect(valueOf(issueFor(issues, "COVERAGE_TARGET"))).toBe("Zone: none");
		const noRobot = compileMissionGraph(
			graph(
				[agent("a1"), action("nav", "NAVIGATE", "Go", "gate")],
				[robot("a1", "nav")],
			),
			{ gate: "waypoint" },
		);
		expect(valueOf(issueFor(noRobot.issues, "AGENT_MISSING"))).toBe(
			"Robot: none",
		);
	});

	it("lists every target of a step that takes one", () => {
		const g = graph(
			[
				agent("a1", "alpha"),
				action("nav", "NAVIGATE", "Go", "gate"),
				{
					id: "p",
					kind: "asset",
					label: "Pond",
					feature_id: "pond",
					position: at,
				},
			],
			[
				robot("a1", "nav"),
				{
					id: "p->nav",
					source: "p",
					source_port: "value",
					target: "nav",
					target_port: "target",
				},
			],
		);
		const { issues } = compileMissionGraph(g, {
			gate: "waypoint",
			pond: "waypoint",
		});
		expect(valueOf(issueFor(issues, "NAVIGATE_TARGET"))).toBe(
			"Waypoint: Gate, Pond (needs one waypoint)",
		);
	});

	it("names a condition the C2 cannot evaluate by its operator words", () => {
		const g = graph(
			[
				agent("a1", "alpha"),
				action("nav", "NAVIGATE", "Go", "gate"),
				{
					id: "c",
					kind: "condition",
					label: "When clear",
					condition: {
						op: "ZoneClear",
						key: "yard",
						threshold: 1,
						negate: false,
					},
					position: at,
				},
			],
			[robot("a1", "nav")],
		);
		const { issues } = compileMissionGraph(g, { gate: "waypoint" });
		expect(valueOf(issueFor(issues, "CONDITION_NOT_EVALUABLE"))).toBe(
			"Condition: Zone clear (cannot be evaluated)",
		);
	});

	it("gives a structural rule no value", () => {
		const g = graph(
			[
				agent("a1", "alpha"),
				action("nav", "NAVIGATE", "Go", "gate"),
				action("stray", "NAVIGATE", "Stray", "gate"),
			],
			[robot("a1", "nav")],
		);
		const { issues } = compileMissionGraph(g, { gate: "waypoint" });
		expect(issueFor(issues, "UNREACHED").value).toBeUndefined();
	});

	it("falls back to a shortened id when no name is known", () => {
		expect(
			issueRefName({ kind: "feature", id: "0123456789abcdef" }, {}),
		).toBe("01234567…");
		expect(issueRefName({ kind: "agent", id: "ugv1" }, {})).toBe("ugv1");
		expect(issueRefName({ kind: "text", id: "all" }, NAMES)).toBe("all");
	});
});

describe("graph issues as step issues", () => {
	it("keeps the node, and ties a graph-wide issue to none", () => {
		const out = graphStepIssues([
			{ severity: "error", nodeId: "nav", message: "a" },
			{ severity: "error", message: "b" },
		]);
		expect(out.map((issue) => issue.nodeId)).toEqual(["nav", null]);
	});
});

describe("the step a mission config issue is about", () => {
	const config = {
		behavior: 0,
		vehicles: ["alpha", 7],
		objective: { geometries: [{ feature_id: "gate" }, { nope: 1 }] },
	};

	it("leads a robot's issue to its agent node", () => {
		expect(
			configIssueTarget(
				{ path: "vehicles[0]", message: "", severity: "error" },
				config,
				CHAIN,
			),
		).toEqual({
			nodeId: "a1",
			value: { field: "Robot", refs: [{ kind: "agent", id: "alpha" }] },
		});
	});

	it("leads an objective's issue to the step that acts on it", () => {
		expect(
			configIssueTarget(
				{
					path: "objective.geometries[0].feature_id",
					message: "",
					severity: "error",
				},
				config,
				CHAIN,
			),
		).toEqual({
			nodeId: "nav",
			value: { field: "Target", refs: [{ kind: "feature", id: "gate" }] },
		});
	});

	it("leads a whole-mission issue, or an index with no id, nowhere", () => {
		for (const path of [
			"vehicles",
			"behavior",
			"vehicles[1]",
			"objective.geometries[1]",
			"start.geometry",
		]) {
			expect(
				configIssueTarget(
					{ path, message: "", severity: "error" },
					config,
					CHAIN,
				).nodeId,
			).toBeNull();
		}
	});

	it("puts the issues in operator words, errors first", () => {
		const issues = validateMissionConfig({
			behavior: 0,
			vehicles: [],
			objective: { geometries: [] },
		});
		const out = configStepIssues(issues, {}, CHAIN);
		expect(out.length).toBeGreaterThan(0);
		expect(out[0]!.severity).toBe("error");
		expect(
			out.some((issue) => issue.message.startsWith("Vehicles: ")),
		).toBe(true);
		expect(out.every((issue) => issue.nodeId === null)).toBe(true);
	});

	it("prefers a step on a robot's chain over one that is not", () => {
		const g = graph(
			[
				action("loose", "NAVIGATE", "Loose", "gate"),
				agent("a1", "alpha"),
				action("nav", "NAVIGATE", "Go", "gate"),
			],
			[robot("a1", "nav")],
		);
		expect(nodeForFeature(g, "gate")).toBe("nav");
		expect(
			nodeForFeature(
				graph(
					[
						{
							id: "y",
							kind: "asset",
							label: "Yard",
							feature_id: "yard",
							position: at,
						},
					],
					[],
				),
				"yard",
			),
		).toBe("y");
		expect(nodeForFeature(CHAIN, "nowhere")).toBeNull();
	});
});

describe("where the C2 says a mission failed", () => {
	function progress(stepId: string, state: ProgramProgress["state"]) {
		return {
			chain: 0,
			step_index: 0,
			steps_total: 2,
			step_id: stepId,
			state,
			steps: [],
			done_steps: [],
		} as ProgramProgress;
	}

	function feedback(extra: Partial<MissionFeedback>): MissionFeedback {
		return {
			mission_id: "m1",
			status: MissionStatus.FAILED,
			issue: null,
			tasks: [],
			...extra,
		};
	}

	it("says nothing about a mission that has not failed", () => {
		expect(
			feedbackFailureIssues(
				feedback({
					status: MissionStatus.STARTED,
					program: { alpha: progress("nav", "FAILED") },
				}),
				CHAIN,
			),
		).toEqual([]);
	});

	it("ties a failed program step to its node, naming the robot", () => {
		const out = feedbackFailureIssues(
			feedback({
				issue: 24,
				issue_code: "EDGE_LOST",
				issue_message: "no edge feedback from alpha for 60 s",
				program: {
					alpha: progress("nav", "FAILED"),
					bravo: progress("sweep", "RUNNING"),
				},
			}),
			CHAIN,
		);
		expect(out).toHaveLength(1);
		expect(out[0]!.nodeId).toBe("nav");
		expect(issueValueText(out[0]!.value!, NAMES)).toBe(
			"Robot: Alpha (failed at this step)",
		);
		expect(out[0]!.message).toBe("no edge feedback from alpha for 60 s.");
	});

	it("does not select a step the graph no longer has", () => {
		const out = feedbackFailureIssues(
			feedback({ program: { alpha: progress("gone", "FAILED") } }),
			CHAIN,
		);
		expect(out[0]!.nodeId).toBeNull();
		expect(out[0]!.value?.refs).toEqual([{ kind: "agent", id: "alpha" }]);
	});

	it("ties an aborted task to the robot's step, or its agent node", () => {
		const task = {
			vehicle_id: "alpha",
			waypoints: [],
			state: TaskState.ABORTED,
		};
		expect(
			feedbackFailureIssues(feedback({ tasks: [task] }), CHAIN)[0]!
				.nodeId,
		).toBe("a1");
		expect(
			feedbackFailureIssues(
				feedback({
					tasks: [task],
					program: { alpha: progress("sweep", "RUNNING") },
				}),
				CHAIN,
			)[0]!.nodeId,
		).toBe("sweep");
	});

	it("ties a robot held by another mission to its agent node", () => {
		const out = feedbackFailureIssues(
			feedback({
				status: MissionStatus.PLANNED_FAILED,
				issue_conflicts: [{ vehicle_id: "alpha", mission_id: "m2" }],
			}),
			CHAIN,
		);
		expect(out[0]!.nodeId).toBe("a1");
		expect(issueValueText(out[0]!.value!, NAMES)).toBe(
			"Robot: Alpha (in use by another mission)",
		);
	});

	it("says plainly when the C2 names no step, and selects nothing", () => {
		const out = feedbackFailureIssues(
			feedback({ status: MissionStatus.PLANNED_FAILED, issue: 40 }),
			CHAIN,
		);
		expect(out).toEqual([
			{
				severity: "error",
				nodeId: null,
				message: `No plan found. Adjust the config and submit again. ${UNTIED_FAILURE_MESSAGE}`,
			},
		]);
		expect(feedbackFailureIssues(feedback({}), null)[0]!.message).toBe(
			`The mission failed. ${UNTIED_FAILURE_MESSAGE}`,
		);
	});
});
