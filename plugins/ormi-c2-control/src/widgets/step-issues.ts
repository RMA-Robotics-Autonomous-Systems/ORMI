/**
 * Every error the mission editor can show about a step, in ONE shape: the node
 * it is about (or none), and the value it names.
 *
 * Four surfaces report a mission's problems: the graph compiler (the node
 * editor's mission check), Submit's refusal, the mission config check ("Not
 * ready to start"), and the C2's own feedback once it has planned or run the
 * mission. Each spoke its own words, and only the first led anywhere. Here
 * each source is mapped to a {@link StepIssue}, so every list renders the
 * same row: a click selects the step in the node editor and brings it into
 * view (an explicit reveal), and the map outlines what that step targets.
 *
 * Where a report cannot be tied to one step it carries no node, and the row
 * says so instead of selecting something plausible.
 *
 * Pure: no React, no store. Names are resolved where a row is drawn.
 */

import { MissionStatus } from "../types/c2-types";
import type { MissionConfigIssue } from "../types/mission-config-validation";
import { describeFeedbackIssue } from "../types/issue-labels";
import { type MissionFeedback, TaskState } from "../types/mission-feedback";
import { humanizeMissionIssues } from "./mission-config-words";
import {
	actionTargets,
	type GraphIssueRef,
	type GraphIssueValue,
	type MissionGraph,
	type MissionGraphIssue,
	type MissionGraphNode,
} from "./mission-graph";
import { chainSteps } from "./mission-graph-editor-helpers";

/** One problem, as every issue list shows it. */
export interface StepIssue {
	severity: "error" | "warning";
	/** The graph node to select, or null when it cannot be tied to one. */
	nodeId: string | null;
	/** What it names, `Target: Gate (not in this mission)`, when it names a value. */
	value?: GraphIssueValue;
	/** The rule, or what the C2 reported. */
	message: string;
}

/** Id → name lookups a value is resolved through. */
export interface IssueNames {
	/** `feature_id` → name: the mission's assets, then the map's catalogue. */
	features?: Readonly<Record<string, string>>;
	/** `agent_id` → the robot's name. */
	agents?: Readonly<Record<string, string>>;
}

/** What a field that holds nothing reads as. */
export const EMPTY_VALUE_WORD = "none";

/** An id with no known name, shortened the way the catalogue's `shortId` does. */
function shortened(id: string): string {
	return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/**
 * The name of one thing an issue names.
 * @param ref - The reference.
 * @param names - The lookups.
 * @returns Its name; a shortened id when no name is known.
 */
export function issueRefName(ref: GraphIssueRef, names: IssueNames): string {
	if (ref.kind === "text") return ref.id;
	const known =
		ref.kind === "feature"
			? names.features?.[ref.id]
			: names.agents?.[ref.id];
	return known?.trim() ? known : shortened(ref.id);
}

/**
 * The value an issue names, in one line: `Target: Gate (not in this mission)`,
 * `Robot: none`, `Zone: Yard, Field (needs one zone)`.
 *
 * @param value - The value.
 * @param names - The lookups.
 * @returns The line.
 */
export function issueValueText(
	value: GraphIssueValue,
	names: IssueNames,
): string {
	const held =
		value.refs.length > 0
			? value.refs.map((ref) => issueRefName(ref, names)).join(", ")
			: EMPTY_VALUE_WORD;
	return `${value.field}: ${held}${value.problem ? ` (${value.problem})` : ""}`;
}

/**
 * The compiler's issues as step issues, in the order given.
 * @param issues - Issues from `compileMissionGraph` (sorted by the caller).
 * @returns One step issue each.
 */
export function graphStepIssues(
	issues: readonly MissionGraphIssue[],
): StepIssue[] {
	return issues.map((issue) => ({
		severity: issue.severity,
		nodeId: issue.nodeId ?? null,
		...(issue.value ? { value: issue.value } : {}),
		message: issue.message,
	}));
}

// ============================================================================
// The mission config check
// ============================================================================

/** `vehicles[2]` and anything under it. */
const VEHICLE_PATH = /^vehicles\[(\d+)\]/;
/** `objective.geometries[3]` and anything under it. */
const GEOMETRY_PATH = /^objective\.geometries\[(\d+)\]/;

/** A record field, defensively. */
function field(value: unknown, key: string): unknown {
	return value != null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)[key]
		: undefined;
}

/** The agent node that allocates a robot. */
function agentNode(
	graph: MissionGraph | null | undefined,
	agentId: string,
): MissionGraphNode | undefined {
	return graph?.nodes.find(
		(node) => node.kind === "agent" && node.agent_id === agentId,
	);
}

/**
 * The step that acts on a feature: the first action in chain order that
 * targets it, else the asset node that holds it.
 *
 * @param graph - The graph.
 * @param featureId - The feature.
 * @returns The node id, or null.
 */
export function nodeForFeature(
	graph: MissionGraph | null | undefined,
	featureId: string,
): string | null {
	if (!graph) return null;
	const steps = chainSteps(graph);
	const actions = graph.nodes
		.filter(
			(node) =>
				node.kind === "action" &&
				actionTargets(graph, node.id).includes(featureId),
		)
		// On a robot's chain first; graph order otherwise (a stable sort).
		.sort((a, b) => Number(!steps.has(a.id)) - Number(!steps.has(b.id)));
	if (actions[0]) return actions[0].id;
	return (
		graph.nodes.find(
			(node) => node.kind === "asset" && node.feature_id === featureId,
		)?.id ?? null
	);
}

/**
 * The step a mission config issue is about, and the value it names.
 *
 * The config is what the graph compiled to, so an indexed path leads back to
 * a node: `vehicles[i]` to the agent node of that robot, and
 * `objective.geometries[i]` to the step that acts on that feature. Any other
 * path is about the mission as a whole and leads nowhere.
 *
 * @param issue - One issue from `validateMissionConfig`.
 * @param config - The config it was raised on.
 * @param graph - The mission's graph, or null when none is loaded.
 * @returns The node (or null) and the value (or none).
 */
export function configIssueTarget(
	issue: MissionConfigIssue,
	config: unknown,
	graph: MissionGraph | null | undefined,
): { nodeId: string | null; value?: GraphIssueValue } {
	const vehicle = VEHICLE_PATH.exec(issue.path);
	if (vehicle) {
		const vehicles = field(config, "vehicles");
		const id = Array.isArray(vehicles)
			? vehicles[Number(vehicle[1])]
			: undefined;
		if (typeof id !== "string" || !id) return { nodeId: null };
		return {
			nodeId: agentNode(graph, id)?.id ?? null,
			value: { field: "Robot", refs: [{ kind: "agent", id }] },
		};
	}
	const geometry = GEOMETRY_PATH.exec(issue.path);
	if (geometry) {
		const list = field(field(config, "objective"), "geometries");
		const item = Array.isArray(list)
			? list[Number(geometry[1])]
			: undefined;
		const id = field(item, "feature_id");
		if (typeof id !== "string" || !id) return { nodeId: null };
		return {
			nodeId: nodeForFeature(graph, id),
			value: { field: "Target", refs: [{ kind: "feature", id }] },
		};
	}
	return { nodeId: null };
}

/**
 * The mission config check's issues as step issues, in operator words.
 *
 * @param issues - Issues from `validateMissionConfig`.
 * @param config - The config they were raised on.
 * @param graph - The mission's graph, or null.
 * @returns Errors first, then warnings, each tied to its step where one can be.
 */
export function configStepIssues(
	issues: readonly MissionConfigIssue[],
	config: unknown,
	graph: MissionGraph | null | undefined,
): StepIssue[] {
	const words = humanizeMissionIssues(issues);
	const out = issues.map((issue, index) => {
		const target = configIssueTarget(issue, config, graph);
		const said = words[index]!;
		return {
			severity: issue.severity,
			nodeId: target.nodeId,
			...(target.value ? { value: target.value } : {}),
			message: said.path ? `${said.path}: ${said.message}` : said.message,
		};
	});
	return [
		...out.filter((issue) => issue.severity === "error"),
		...out.filter((issue) => issue.severity !== "error"),
	];
}

// ============================================================================
// The C2's feedback
// ============================================================================

/** What a row says when the C2 does not say which step failed. */
export const UNTIED_FAILURE_MESSAGE = "The C2 does not say which step failed.";

/**
 * Whether a feedback status reports a failure the editor should lead to:
 * planning failed, or the run failed.
 * @param status - The feedback's status.
 */
export function isFailedStatus(status: MissionStatus): boolean {
	return (
		status === MissionStatus.PLANNED_FAILED ||
		status === MissionStatus.FAILED
	);
}

/**
 * Where a planned or running mission failed, as far as the C2 says.
 *
 * What the feedback can carry, and what each becomes:
 *
 * - `program[agent].state === "FAILED"`: that agent's current step failed.
 *   The one per-step fact; tied to `step_id`'s node.
 * - `tasks[i].state === ABORTED`: that robot's task was aborted. Tied to its
 *   current step when the program names one, else to its agent node.
 * - `issue_conflicts`: a robot held by another mission. Tied to its agent node.
 * - `issue` / `issue_code` / `issue_message`: the mission's one current
 *   issue, about the mission as a whole. It is the message of every row, and
 *   the only row (tied to nothing) when nothing above names a robot.
 *
 * A node the graph no longer has (the graph was edited after the run) is not
 * selected: the row stays, tied to nothing.
 *
 * @param fb - The mission's feedback.
 * @param graph - Its graph, or null when none is loaded.
 * @returns Nothing unless the status is PLANNED_FAILED or FAILED; else at
 *   least one row.
 */
export function feedbackFailureIssues(
	fb: MissionFeedback,
	graph: MissionGraph | null | undefined,
): StepIssue[] {
	if (!isFailedStatus(fb.status)) return [];
	const issue = describeFeedbackIssue(fb);
	const said =
		issue?.description ||
		(fb.status === MissionStatus.PLANNED_FAILED
			? "Planning failed."
			: "The mission failed.");
	const reported = /[.!?]$/.test(said) ? said : `${said}.`;
	const has = (id: string | undefined) =>
		Boolean(id && graph?.nodes.some((node) => node.id === id));
	const out: StepIssue[] = [];
	const named = new Set<string>();
	const robot = (agentId: string, problem: string): GraphIssueValue => ({
		field: "Robot",
		refs: [{ kind: "agent", id: agentId }],
		problem,
	});

	for (const [agentId, progress] of Object.entries(fb.program ?? {})) {
		if (progress.state !== "FAILED") continue;
		named.add(agentId);
		out.push({
			severity: "error",
			nodeId: has(progress.step_id) ? progress.step_id : null,
			value: robot(agentId, "failed at this step"),
			message: reported,
		});
	}
	for (const task of fb.tasks) {
		if (task.state !== TaskState.ABORTED || !task.vehicle_id) continue;
		if (named.has(task.vehicle_id)) continue;
		named.add(task.vehicle_id);
		const step = fb.program?.[task.vehicle_id]?.step_id;
		out.push({
			severity: "error",
			nodeId: has(step)
				? step!
				: (agentNode(graph, task.vehicle_id)?.id ?? null),
			value: robot(task.vehicle_id, "task aborted"),
			message: reported,
		});
	}
	for (const conflict of fb.issue_conflicts ?? []) {
		if (named.has(conflict.vehicle_id)) continue;
		named.add(conflict.vehicle_id);
		out.push({
			severity: "error",
			nodeId: agentNode(graph, conflict.vehicle_id)?.id ?? null,
			value: robot(conflict.vehicle_id, "in use by another mission"),
			message: reported,
		});
	}
	if (out.length === 0) {
		out.push({
			severity: "error",
			nodeId: null,
			message: `${reported} ${UNTIED_FAILURE_MESSAGE}`,
		});
	}
	return out;
}
