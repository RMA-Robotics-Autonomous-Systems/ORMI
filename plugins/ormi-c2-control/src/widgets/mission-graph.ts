import { compileProgram, notExecutableYet } from "./mission-program";
import { MissionBehavior, type MissionGeometry } from "../types/c2-types";

/**
 * The mission behaviour graph: its data model, its compiler, and how it is
 * stored.
 *
 * Pure — no React, no `@xyflow/react`, no fetch — so every rule below is unit
 * tested directly and the editor widget only has to draw it.
 *
 * ## Geometry never appears in the graph
 *
 * A node names an asset by `feature_id` and carries **no coordinates**. Zones,
 * waypoints and cues are all assets and all live in the map, which is why the
 * C2 gained those three `feature_type`s and why `MissionGeometry` already
 * accepts a bare `{ feature_id }`. A graph that embedded coordinates would give
 * the same geometry two homes, and the day they disagreed nothing would say
 * which one the planner used.
 *
 * ## Typed ports (schema 2)
 *
 * Every edge joins an OUTPUT port of one node to an INPUT port of another, and
 * the two carry the same type (`mission-graph-ports.ts` holds the table). The
 * `flow` ports ("then") are the chains: an agent's `next` into its first step,
 * each step's `next` into the following one. The typed values feed a step: an
 * asset into an action's `target`, true/false conditions into a Wait's `when`,
 * an agent into an Agent holding condition. Only flow carries order, and an
 * agent assignment flows along it.
 *
 * Schema 1 (untyped exec/data edges) is not read: a stored v1 graph shows as
 * outdated and is rebuilt, never converted.
 *
 * ## What compiles, and what does not
 *
 * `MissionConfig` can express an objective geometry list and a vehicle
 * allocation, and nothing else in this graph. {@link compileMissionGraph}
 * therefore produces exactly those two things and reports everything it could
 * not express as an issue the operator can read — it never invents a field the
 * C2 does not have. The graph itself is persisted separately (see
 * {@link buildGraphDocument}) for the fog, which is where conditions and
 * branching are evaluated.
 *
 * ## Free text is for names, and for nothing else
 *
 * A node's `label` is a caption an operator writes for themselves. Everything
 * else a node carries is dispatched: an {@link GraphAction} comes from a closed
 * list, and a {@link GraphCondition} mirrors the fog's own evaluator field for
 * field. A control that lets an operator type a value nothing downstream
 * recognises fails silently — the mission submits, the robot does nothing, and
 * nothing on screen says which of the two happened.
 *
 * ## Where it is stored, and why not on the mission
 *
 * `InitMission.srv` caps `mission_config` at 10 000 characters, and everything
 * on a `MissionDraft` rides into that field — so a graph on the draft is a
 * mission that silently stops submitting once it gets interesting. The graph is
 * a **sibling document** in the same `missions` collection under
 * `"<mission_id>:graph"` (the collection's Mongo schema is `strict: false` and
 * `POST /missions` validates only a non-empty `mission_id` with no `$`/dotted
 * keys), and the mission carries a `graph_ref` string pointing at it. The
 * reference is ~45 characters and is the only thing about the graph that
 * reaches the wire.
 */

/** Schema version of a persisted graph document. */
export const MISSION_GRAPH_VERSION = 2;

/** `kind` marker on the sibling document, so a reader can tell what it is. */
export const MISSION_GRAPH_DOC_KIND = "ormi-mission-graph";

/** Suffix that makes a graph document's `mission_id` unambiguous. */
export const MISSION_GRAPH_ID_SUFFIX = ":graph";

// ============================================================================
// Action vocabulary
// ============================================================================

/**
 * Everything an action node is allowed to say.
 *
 * ## What actually reaches a robot
 *
 * The edge supervisor executes exactly **one** primitive type, `"waypoint"`. It
 * is the only type ever constructed
 * (`agent_tasks_supervisor_node.cpp:263`), the only type whose completion is
 * checked (`:645`), and the only type the goal-progress loop drives (`:767`).
 * Nothing else is built and nothing else is inspected, so an action is not a
 * thing the edge dispatches on — it is a thing the **fog** reads and turns into
 * waypoints.
 *
 * Consequently:
 *
 * - `NAVIGATE` reaches the robot as the waypoints the planner's navigate branch
 *   produced for the asset it is pointed at.
 * - `COVERAGE` reaches it as the planner's generated sweep — waypoints the fog
 *   derived from the zone's polygon, not a "coverage" the supervisor
 *   understands.
 *
 * ## `HOLD`, `MARK` and `NEUTRALISE` are gone (decided 2026-09-23)
 *
 * - **Hold** is a `NAVIGATE` to a waypoint followed by a condition: the robot
 *   sits where the step ended until the gate opens, and the fog's
 *   `AgentHolding` is exactly "that chain is waiting at a gate or is done".
 * - **Mark** is not something an agent is told to do: a sensor that finds
 *   something reports it, during whatever step the agent is running.
 * - **Neutralise** is dropped for now.
 *
 * A stored graph that still names one of them degrades exactly like `SURVEY`
 * below: {@link normalizeGraph} drops the action, the editor reports "no
 * action named", and the fog, which compiles the raw document, refuses it as
 * `ACTION_NOT_EXECUTABLE` and says what to use instead.
 *
 * ## Navigating and covering are ACTIONS, not a shape the compiler guesses
 *
 * `NAVIGATE` and `COVERAGE` name what an agent *does*, which is the one thing
 * this graph already has nodes for. `MissionConfig.behavior` is therefore read
 * off the action nodes (see {@link compileMissionGraph}) instead of inferred
 * from whether some referenced asset happens to be a zone — an inference about
 * geometry standing in for a statement about intent, which an operator can
 * neither see nor contradict.
 *
 * ## `SURVEY` is gone, deliberately and one-way
 *
 * `SURVEY` was absorbed into `COVERAGE`: sweeping an area with sensors is what
 * the C2 calls COVERAGE, and carrying both would be two names for one thing
 * with nothing to say which the fog honours. There is **no migration** — the
 * mission database was wiped, so no stored graph names it — and
 * {@link normalizeGraph} drops an action outside this list, so a `SURVEY` that
 * did survive somewhere degrades to "no action named", which the compiler
 * reports as an error the operator can act on. That degradation is one-way on
 * purpose: re-guessing `COVERAGE` from a retired name would silently change a
 * mission's behaviour.
 */
export const GRAPH_ACTIONS = ["NAVIGATE", "COVERAGE"] as const;

/** One of {@link GRAPH_ACTIONS}. */
export type GraphAction = (typeof GRAPH_ACTIONS)[number];

/**
 * Whether a value names one of {@link GRAPH_ACTIONS}.
 *
 * @param value - Any candidate, typically off a stored graph.
 * @returns True when it is an action this build knows.
 */
export function isGraphAction(value: unknown): value is GraphAction {
	return (
		typeof value === "string" &&
		(GRAPH_ACTIONS as readonly string[]).includes(value)
	);
}

// ============================================================================
// Condition vocabulary
// ============================================================================

/**
 * The predicate operators, mirroring the fog's `conditions::Op` **exactly**.
 *
 * Source of truth:
 * `submodules/fog/centralized-coordination/src/centralized_coordination/include/centralized_coordination/mission_conditions.hpp`.
 *
 * The fog is the only thing that will ever evaluate one of these — conditions
 * live in the fog by design, never on the edge — so an op the UI invents is an
 * op that silently never holds. Adding one here without adding it there
 * produces a mission that stalls with nothing on screen to explain it.
 */
export const CONDITION_OPS = [
	"ZoneCoveredBy",
	"ZoneClear",
	"ContactsFound",
	"CuesRemaining",
	"ElapsedSeconds",
	"AgentHolding",
	"FlagSet",
	"Always",
	"Never",
] as const;

/** One of {@link CONDITION_OPS}. */
export type ConditionOp = (typeof CONDITION_OPS)[number];

/**
 * One predicate, field for field the fog's `conditions::Condition`.
 *
 * `negate` sits on the condition rather than on a separate NOT node so the
 * graph stays flat, which is the fog's own reasoning: an operator reads
 * "until NOT clear" on one node instead of following a wire to find the
 * inverter.
 */
export interface GraphCondition {
	op: ConditionOp;
	/** zone feature_id, agent_id, or flag name — depends on the op. */
	key?: string;
	/** modality, where the op needs one. */
	arg?: string;
	threshold: number;
	negate: boolean;
}

/**
 * Which fields an op actually uses, so an inspector can render a form from the
 * op alone.
 *
 * This is the **single** source of truth for that question: the rules are read
 * off the fog's `evaluate()` switch once, here, and a form that hardcoded them
 * a second time would drift the day an op changed.
 */
export interface ConditionOpShape {
	/** Operator-facing, e.g. "Zone covered by". */
	label: string;
	key: "none" | "zone" | "agent" | "flag";
	arg: "none" | "modality";
	threshold: "none" | "fraction" | "count" | "seconds";
}

/**
 * Per-op field usage, derived from the fog's `evaluate()` switch.
 *
 * | op              | key   | arg      | threshold | evaluator |
 * | --------------- | ----- | -------- | --------- | --------- |
 * | ZoneCoveredBy   | zone  | modality | fraction  | `coverage_of(s, key, arg) >= threshold` |
 * | ZoneClear       | zone  | —        | fraction  | `zone_clear(s, key, threshold)` |
 * | ContactsFound   | —     | —        | count     | `s.contacts >= (int) threshold` |
 * | CuesRemaining   | —     | —        | count     | `s.cues >= (int) threshold` |
 * | ElapsedSeconds  | —     | —        | seconds   | `s.elapsed_s >= threshold` |
 * | AgentHolding    | agent | —        | —         | `s.holding[key]` |
 * | FlagSet         | flag  | —        | —         | `s.flags.count(key) > 0` |
 * | Always          | —     | —        | —         | `true` |
 * | Never           | —     | —        | —         | `false` |
 *
 * `AgentHolding`, `FlagSet`, `Always` and `Never` read no `threshold` at all,
 * which is why offering one would be a control that changes nothing.
 */
export const CONDITION_OP_SHAPE: Record<ConditionOp, ConditionOpShape> = {
	ZoneCoveredBy: {
		label: "Zone covered by",
		key: "zone",
		arg: "modality",
		threshold: "fraction",
	},
	ZoneClear: {
		label: "Zone clear",
		key: "zone",
		arg: "none",
		threshold: "fraction",
	},
	ContactsFound: {
		label: "Contacts found",
		key: "none",
		arg: "none",
		threshold: "count",
	},
	CuesRemaining: {
		label: "Cues remaining",
		key: "none",
		arg: "none",
		threshold: "count",
	},
	ElapsedSeconds: {
		label: "Elapsed time",
		key: "none",
		arg: "none",
		threshold: "seconds",
	},
	AgentHolding: {
		label: "Agent holding",
		key: "agent",
		arg: "none",
		threshold: "none",
	},
	FlagSet: { label: "Flag set", key: "flag", arg: "none", threshold: "none" },
	Always: { label: "Always", key: "none", arg: "none", threshold: "none" },
	Never: { label: "Never", key: "none", arg: "none", threshold: "none" },
};

/**
 * The survey modalities a zone can be swept by.
 *
 * Taken from what payloads actually declare
 * (`config_autonomy.yaml`): `EMI` and `GPR` are sensor modalities a survey
 * payload sweeps with, and the fog's `coverage` map is keyed by exactly those.
 * The file also declares `MARKER`, which is the **effector** arm's modality —
 * it sweeps nothing and no zone is ever required to be covered by it, so
 * offering it on a coverage predicate would be a choice that can never hold.
 */
export const SENSOR_MODALITIES = ["EMI", "GPR"] as const;

/** One of {@link SENSOR_MODALITIES}. */
export type SensorModality = (typeof SENSOR_MODALITIES)[number];

/**
 * Whether a value names one of {@link CONDITION_OPS}.
 *
 * @param value - Any candidate, typically off a stored graph.
 * @returns True when it is an op this build (and therefore the fog) knows.
 */
export function isConditionOp(value: unknown): value is ConditionOp {
	return (
		typeof value === "string" &&
		(CONDITION_OPS as readonly string[]).includes(value)
	);
}

/** What an op's threshold means when nothing usable was stored. */
function defaultThreshold(shape: ConditionOpShape): number {
	switch (shape.threshold) {
		case "fraction":
			// The fog's own `Condition::threshold` default. "Covered" means
			// fully covered unless the operator says otherwise; a 0 default
			// would make a coverage predicate hold before a robot moved.
			return 1;
		case "count":
			return 1;
		default:
			return 0;
	}
}

/** Coerce a stored threshold into something the fog can act on. */
function coerceThreshold(value: unknown, shape: ConditionOpShape): number {
	const fallback = defaultThreshold(shape);
	if (shape.threshold === "none") return fallback;
	const raw = num(value, fallback);
	switch (shape.threshold) {
		case "fraction":
			// A fraction above 1 is a predicate that can never hold, and the
			// mission stalls with nothing on screen saying why.
			return Math.min(1, Math.max(0, raw));
		case "count":
			// The fog truncates (`static_cast<int>`), so truncate here too:
			// storing 2.9 and evaluating 2 is a number the operator can read
			// and the fog disagrees with.
			return Math.max(0, Math.trunc(raw));
		default:
			return Math.max(0, raw);
	}
}

/**
 * Read a stored value back as a condition, or `undefined` when it is not one.
 *
 * Deliberately strict about the op and forgiving about everything else. An op
 * this build does not know is dropped outright — **including the legacy
 * free-text string form**, because a stored sentence is not a predicate anyone
 * can evaluate and keeping it would let a condition node read as configured
 * while the fog ignores it. `key` and `arg` the op's shape does not use are
 * stripped, so a graph cannot carry a stale zone id on an `ElapsedSeconds`
 * condition and show it in a form.
 *
 * @param value - Any candidate, typically off a stored graph.
 * @returns A canonical condition, or `undefined`.
 */
export function normalizeCondition(value: unknown): GraphCondition | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	if (!isConditionOp(candidate.op)) return undefined;
	const shape = CONDITION_OP_SHAPE[candidate.op];
	const key =
		shape.key === "none" ? undefined : optionalString(candidate.key);
	const arg =
		shape.arg === "none" ? undefined : optionalString(candidate.arg);
	return {
		op: candidate.op,
		...(key ? { key } : {}),
		...(arg ? { arg } : {}),
		threshold: coerceThreshold(candidate.threshold, shape),
		negate: candidate.negate === true,
	};
}

/** What a node is. */
export type GraphNodeKind = "agent" | "asset" | "action" | "condition" | "wait";

/** Whether a Wait opens when ALL of its conditions hold, or ANY one. */
export type WaitMode = "all" | "any";

/** One node in the behaviour graph. */
export interface MissionGraphNode {
	/** Stable id, unique within the graph. */
	id: string;
	kind: GraphNodeKind;
	/** Operator-facing caption. */
	label: string;
	/** Canvas position, persisted so the graph reopens as it was left. */
	position: { x: number; y: number };
	/** `agent` nodes: the allocated vehicle's `agent_id`. */
	agent_id?: string;
	/**
	 * `asset` nodes: the MapDB `feature_id`. `action` nodes: the target
	 * picked on the node (the same as wiring an asset into its `target`).
	 * NEVER geometry.
	 */
	feature_id?: string;
	/**
	 * `action` nodes: what to do. A closed vocabulary — see
	 * {@link GRAPH_ACTIONS}.
	 */
	action?: GraphAction;
	/**
	 * `condition` nodes: what must hold for the outgoing branch to run. A
	 * structured predicate mirroring the fog's evaluator, never a sentence —
	 * see {@link GraphCondition}.
	 */
	condition?: GraphCondition;
	/** `wait` nodes: all of the wired conditions, or any one. */
	mode?: WaitMode;
}

/**
 * One edge: an output port of `source` into an input port of `target`. The
 * ports are the ids in `mission-graph-ports.ts`.
 */
export interface MissionGraphEdge {
	id: string;
	source: string;
	source_port: string;
	target: string;
	target_port: string;
}

/** A whole behaviour graph. */
export interface MissionGraph {
	version: number;
	nodes: MissionGraphNode[];
	edges: MissionGraphEdge[];
}

/** An empty graph — what a mission with no authored behaviour looks like. */
export function emptyMissionGraph(): MissionGraph {
	return { version: MISSION_GRAPH_VERSION, nodes: [], edges: [] };
}

/** The `mission_id` a mission's graph document is stored under. */
export function graphDocId(missionId: string): string {
	return `${missionId}${MISSION_GRAPH_ID_SUFFIX}`;
}

/**
 * Whether a stored `mission_id` belongs to a graph document rather than a
 * mission.
 *
 * `normalizeMissions` filters on this: the graph lives in the `missions`
 * collection (the backend has no other generic document store), so without the
 * filter every mission would grow a phantom sibling row in the browser that an
 * operator could select, submit and delete.
 *
 * @param missionId - A stored document's `mission_id`.
 * @returns True when it is a graph document.
 */
export function isMissionGraphDocId(missionId: unknown): boolean {
	return (
		typeof missionId === "string" &&
		missionId.endsWith(MISSION_GRAPH_ID_SUFFIX) &&
		missionId.length > MISSION_GRAPH_ID_SUFFIX.length
	);
}

/** The persisted sibling document. */
export interface MissionGraphDocument extends Record<string, unknown> {
	mission_id: string;
	kind: typeof MISSION_GRAPH_DOC_KIND;
	/** The mission this graph belongs to. */
	mission_ref: string;
	schema_version: number;
	graph: MissionGraph;
	updated_at: string;
}

/**
 * Build the document to POST to `/missions` for a mission's graph.
 *
 * @param missionId - The mission the graph belongs to.
 * @param graph - The graph to persist.
 * @param now - Injectable clock, so the document is testable.
 * @returns The sibling document.
 */
export function buildGraphDocument(
	missionId: string,
	graph: MissionGraph,
	now: () => Date = () => new Date(),
): MissionGraphDocument {
	return {
		mission_id: graphDocId(missionId),
		kind: MISSION_GRAPH_DOC_KIND,
		mission_ref: missionId,
		schema_version: MISSION_GRAPH_VERSION,
		graph: normalizeGraph(graph),
		updated_at: now().toISOString(),
	};
}

/** Read a number defensively. */
function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: fallback;
}

/** Read a non-empty trimmed string, else undefined. */
function optionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/** Whether a value names one of the five node kinds. */
function toNodeKind(value: unknown): GraphNodeKind | null {
	return value === "agent" ||
		value === "asset" ||
		value === "action" ||
		value === "condition" ||
		value === "wait"
		? value
		: null;
}

/**
 * Normalize a graph into its canonical stored shape: drop unusable nodes, drop
 * edges whose endpoints do not exist, and drop duplicate ids.
 *
 * Applied on the way out (so a malformed graph is never written) and on the way
 * in (so a document written by an older build cannot crash the editor). An edge
 * pointing at a node that is gone is the one shape that reliably breaks a graph
 * renderer, and it is exactly what a partially-applied edit produces.
 *
 * @param graph - Any candidate graph.
 * @returns A canonical graph.
 */
export function normalizeGraph(graph: MissionGraph): MissionGraph {
	const nodes: MissionGraphNode[] = [];
	const seen = new Set<string>();
	for (const node of graph.nodes ?? []) {
		const kind = toNodeKind(node?.kind);
		const id = optionalString(node?.id);
		if (!kind || !id || seen.has(id)) continue;
		seen.add(id);
		const condition = normalizeCondition(node.condition);
		nodes.push({
			id,
			kind,
			label: typeof node.label === "string" ? node.label : "",
			position: {
				x: num(node.position?.x),
				y: num(node.position?.y),
			},
			...(optionalString(node.agent_id)
				? { agent_id: optionalString(node.agent_id) }
				: {}),
			...(optionalString(node.feature_id)
				? { feature_id: optionalString(node.feature_id) }
				: {}),
			// An action outside the vocabulary is dropped rather than
			// carried: an old free-text graph degrades to "no action named",
			// which the compiler reports, instead of storing a value nothing
			// can run.
			...(isGraphAction(node.action) ? { action: node.action } : {}),
			// A condition whose op this build does not know — including the
			// legacy free-text string — is not a predicate anyone can
			// evaluate, so it becomes unset rather than stored.
			...(condition ? { condition } : {}),
			// A Wait always says which: "any" only when it was chosen.
			...(kind === "wait"
				? { mode: node.mode === "any" ? "any" : "all" }
				: {}),
		});
	}

	const edges: MissionGraphEdge[] = [];
	const edgeIds = new Set<string>();
	for (const edge of graph.edges ?? []) {
		const id = optionalString(edge?.id);
		const source = optionalString(edge?.source);
		const target = optionalString(edge?.target);
		const sourcePort = optionalString(edge?.source_port);
		const targetPort = optionalString(edge?.target_port);
		if (!id || !source || !target || !sourcePort || !targetPort) continue;
		if (edgeIds.has(id)) continue;
		if (!seen.has(source) || !seen.has(target)) continue;
		if (source === target) continue;
		edgeIds.add(id);
		edges.push({
			id,
			source,
			source_port: sourcePort,
			target,
			target_port: targetPort,
		});
	}

	return { version: MISSION_GRAPH_VERSION, nodes, edges };
}

// ============================================================================
// Agent-node mutators
// ============================================================================

/**
 * Mint a fresh id for a node or an edge.
 *
 * Lives here, beside the graph model, rather than in a widget: the editor and
 * the mission map both add nodes, and two callers minting ids two different
 * ways is how a collision arrives — {@link normalizeGraph} drops a duplicate
 * id outright, so the second node would simply never appear.
 *
 * `crypto.randomUUID` where it exists, a `Date.now`/`Math.random` pair where it
 * does not (older Safari, and any non-secure context).
 *
 * @param prefix - A human-readable prefix, typically the node kind.
 * @returns An id unique within any graph a session will build.
 */
export function freshGraphId(prefix: string): string {
	const c = globalThis.crypto as Crypto | undefined;
	const suffix =
		c && typeof c.randomUUID === "function"
			? c.randomUUID().slice(0, 8)
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	return `${prefix}-${suffix}`;
}

/**
 * Where the next node added to `graph` should sit.
 *
 * Staggered four to a row, so a run of adds does not stack every node on the
 * same pixel — which reads as one node, and is exactly what a marker click on
 * the map would otherwise produce for a whole fleet.
 *
 * @param graph - The graph the node is being added to.
 * @returns A canvas position.
 */
export function nextNodePosition(graph: MissionGraph): {
	x: number;
	y: number;
} {
	const n = graph.nodes.length;
	return { x: 40 + (n % 4) * 190, y: 40 + Math.floor(n / 4) * 110 };
}

/**
 * Whether the graph already has an agent node for this agent id.
 *
 * @param graph - The graph to inspect.
 * @param agentId - The vehicle's `agent_id`.
 * @returns True when some `agent` node allocates it.
 */
export function hasAgentNode(graph: MissionGraph, agentId: string): boolean {
	const id = optionalString(agentId);
	if (!id) return false;
	return graph.nodes.some(
		(node) => node.kind === "agent" && node.agent_id === id,
	);
}

/**
 * Add an agent node for `agentId`, or return the graph unchanged when one
 * already exists.
 *
 * Returns the **same object reference** when nothing changes. Both callers feed
 * `useSyncExternalStore`, which compares snapshots by identity: a fresh
 * identity for a no-op is a render that schedules another render.
 *
 * @param graph - The graph to add to.
 * @param agentId - The vehicle's `agent_id`.
 * @param label - Operator-facing caption, typically the agent's name.
 * @returns A new graph, or `graph` itself.
 */
export function addAgentNode(
	graph: MissionGraph,
	agentId: string,
	label?: string,
): MissionGraph {
	const id = optionalString(agentId);
	// A blank agent_id is dropped by `normalizeGraph`, so adding one would
	// produce an agent node the compiler then reports as unselected.
	if (!id) return graph;
	if (hasAgentNode(graph, id)) return graph;
	return {
		...graph,
		nodes: [
			...graph.nodes,
			{
				id: freshGraphId("agent"),
				kind: "agent",
				label: optionalString(label) ?? id,
				position: nextNodePosition(graph),
				agent_id: id,
			},
		],
	};
}

/**
 * Remove every agent node for `agentId`, and every edge touching them.
 *
 * Every node, not the first: nothing stops an operator adding the same agent
 * twice from two surfaces, and leaving one behind would make the toggle read as
 * having done nothing. Incident edges go with the nodes — a dangling edge is
 * the one shape that reliably breaks a graph renderer, and the same invariant
 * `deleteNode` and {@link normalizeGraph} maintain.
 *
 * Returns the same object reference when the agent has no node.
 *
 * @param graph - The graph to remove from.
 * @param agentId - The vehicle's `agent_id`.
 * @returns A new graph, or `graph` itself.
 */
export function removeAgentNode(
	graph: MissionGraph,
	agentId: string,
): MissionGraph {
	const id = optionalString(agentId);
	if (!id) return graph;
	const doomed = new Set(
		graph.nodes
			.filter((node) => node.kind === "agent" && node.agent_id === id)
			.map((node) => node.id),
	);
	if (doomed.size === 0) return graph;
	return {
		...graph,
		nodes: graph.nodes.filter((node) => !doomed.has(node.id)),
		edges: graph.edges.filter(
			(edge) => !doomed.has(edge.source) && !doomed.has(edge.target),
		),
	};
}

/**
 * {@link addAgentNode} when absent, {@link removeAgentNode} when present.
 *
 * What a click on an agent marker means: the marker is the affordance and the
 * node is the state, so one gesture has to carry both directions.
 *
 * @param graph - The graph to toggle in.
 * @param agentId - The vehicle's `agent_id`.
 * @param label - Operator-facing caption, typically the agent's name.
 * @returns A new graph, or `graph` itself when `agentId` is unusable.
 */
export function toggleAgentNode(
	graph: MissionGraph,
	agentId: string,
	label?: string,
): MissionGraph {
	return hasAgentNode(graph, agentId)
		? removeAgentNode(graph, agentId)
		: addAgentNode(graph, agentId, label);
}

/** The `graph` object of a stored graph document, whatever its version. */
function storedGraph(raw: unknown): Partial<MissionGraph> | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const doc = raw as Record<string, unknown>;
	if (!isMissionGraphDocId(doc.mission_id)) return null;
	const graph = doc.graph;
	if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
		return null;
	}
	return graph as Partial<MissionGraph>;
}

/**
 * Whether a stored graph document was written by an older editor (schema 1).
 * It is not read — a mission whose graph is outdated opens on an empty canvas
 * and says so, and the next save replaces it.
 *
 * @param raw - A document from `c2.missions.list`.
 * @returns True when it is a graph document of another schema version.
 */
export function isOutdatedGraphDocument(raw: unknown): boolean {
	const candidate = storedGraph(raw);
	return candidate !== null && candidate.version !== MISSION_GRAPH_VERSION;
}

/**
 * Read a stored document back into a graph.
 *
 * Tolerant by construction: this reads a `strict: false` Mongo document that
 * nothing validates server-side, so a shape it does not recognise — including
 * a graph of another schema version — yields `null` rather than throwing
 * inside a widget. {@link isOutdatedGraphDocument} tells the two apart.
 *
 * @param raw - A document from `c2.missions.list`.
 * @returns The graph, or `null` when the document is not a usable one.
 */
export function readGraphDocument(raw: unknown): MissionGraph | null {
	const candidate = storedGraph(raw);
	if (!candidate || candidate.version !== MISSION_GRAPH_VERSION) return null;
	return normalizeGraph({
		version: MISSION_GRAPH_VERSION,
		nodes: Array.isArray(candidate.nodes) ? candidate.nodes : [],
		edges: Array.isArray(candidate.edges) ? candidate.edges : [],
	});
}

/**
 * Which agents reach each node.
 *
 * An agent assignment flows along the **flow** edges ("then") to every step
 * after it, so an operator says "this agent" once at the head of a chain. A
 * node that FEEDS a step — an asset into an action's target, a condition into
 * a Wait — works for the agents of the step it feeds. Two agents can reach the
 * same node (a team, or one asset used by two chains), so this is a set per
 * node and not a single owner.
 *
 * Cycle-safe: a node already visited for a given agent is not walked again, so
 * an accidental loop costs nothing rather than hanging the editor.
 *
 * @param graph - The graph to walk.
 * @returns node id → the agent ids that reach it, in stable order.
 */
export function propagateAgents(graph: MissionGraph): Map<string, string[]> {
	const flowOut = new Map<string, string[]>();
	const feeds = new Map<string, string[]>();
	for (const edge of graph.edges) {
		const map = edge.target_port === "in" ? flowOut : feeds;
		const list = map.get(edge.source);
		if (list) list.push(edge.target);
		else map.set(edge.source, [edge.target]);
	}

	const reached = new Map<string, Set<string>>();
	for (const node of graph.nodes) {
		if (node.kind !== "agent" || !node.agent_id) continue;
		const agentId = node.agent_id;
		// The agent node is assigned to itself, so a downstream reader does not
		// have to special-case the head of the branch.
		const stack = [node.id];
		const visited = new Set<string>();
		while (stack.length > 0) {
			const current = stack.pop() as string;
			if (visited.has(current)) continue;
			visited.add(current);
			const set = reached.get(current) ?? new Set<string>();
			set.add(agentId);
			reached.set(current, set);
			for (const next of flowOut.get(current) ?? []) stack.push(next);
		}
	}
	// One hop back from each step: what feeds it works for its agents.
	for (const [source, targets] of feeds) {
		const node = graph.nodes.find((n) => n.id === source);
		if (node?.kind === "agent") continue; // an agent watched is not assigned
		for (const target of targets) {
			for (const agentId of reached.get(target) ?? []) {
				const set = reached.get(source) ?? new Set<string>();
				set.add(agentId);
				reached.set(source, set);
			}
		}
	}

	const out = new Map<string, string[]>();
	for (const node of graph.nodes) {
		const set = reached.get(node.id);
		if (set && set.size > 0) out.set(node.id, [...set].sort());
	}
	return out;
}

/**
 * The map features an action acts on: the one picked on the node, then every
 * asset wired into its `target` port. More or fewer than one is the fog's
 * NAVIGATE_TARGET / COVERAGE_TARGET.
 *
 * @param graph - A normalized graph.
 * @param actionId - The action node.
 * @returns Its `feature_id`s, inline first, in edge order, deduped.
 */
export function actionTargets(graph: MissionGraph, actionId: string): string[] {
	const action = graph.nodes.find((node) => node.id === actionId);
	const out: string[] = action?.feature_id ? [action.feature_id] : [];
	for (const edge of graph.edges) {
		if (edge.target !== actionId || edge.target_port !== "target") continue;
		const asset = graph.nodes.find((node) => node.id === edge.source);
		if (asset?.feature_id && !out.includes(asset.feature_id)) {
			out.push(asset.feature_id);
		}
	}
	return out;
}

/** Severity of a compile issue. */
export type GraphIssueSeverity = "error" | "warning";

/** Something the operator has to know about the graph. */
export interface MissionGraphIssue {
	severity: GraphIssueSeverity;
	/** The node the issue is about, when it is about one. */
	nodeId?: string;
	message: string;
	/**
	 * Stable code shared with the fog (see `mission-program.ts`), on every
	 * issue the fog would also raise. Editor-only issues (feature types the
	 * fog cannot see) carry none.
	 */
	code?: string;
}

/** What a graph compiles down to, plus what it could not express. */
export interface CompiledMissionGraph {
	/**
	 * `MissionConfig.behavior` — **derived**, never picked by the operator.
	 * See {@link compileMissionGraph}.
	 */
	behavior: MissionBehavior;
	/** `MissionConfig.vehicles` — the agents the graph allocates. */
	vehicles: string[];
	/** `MissionConfig.objective.geometries` — asset references, never geometry. */
	geometries: MissionGeometry[];
	issues: MissionGraphIssue[];
}

/**
 * Compile a graph into the slice of a `MissionConfig` it can express.
 *
 * Deliberately narrow. `MissionConfig` has a vehicle allocation and an
 * objective-geometry list and nothing that can hold an action, a condition or
 * an ordering, so those are **not** silently flattened into something that
 * looks like they were honoured: they are persisted in the graph document for
 * the fog, and anything the compiler could not express and the operator might
 * think it had is reported as an issue.
 *
 * Determinism matters here — the output feeds a save, and a compile that
 * reordered `geometries` between two runs would make every mission look dirty.
 * Both lists follow node declaration order, deduped.
 *
 * ## `behavior` is derived, not asked
 *
 * `MissionConfig.behavior` stays on the wire because the fog **requires** it:
 * the planner raises `ValueError: Unsupported behavior` for anything that is
 * not 0 or 1
 * (`submodules/fog/planner/ros2ws/src/path_planning_lib/path_planning_lib/multi_robot_path_planning.py:153`),
 * and `mission_manager.cpp:178-185` reads it as NAVIGATE-or-COVERAGE and
 * defaults to NAVIGATE with an `RCLCPP_ERROR` and a swarm log when the field is
 * missing or not an integer. What goes away is the **operator** picking it: the
 * graph already says what the mission is, and a dropdown that can disagree with
 * the geometry is a dropdown that will.
 *
 * The rule: **any `COVERAGE` action node** in the graph makes the mission
 * {@link MissionBehavior.COVERAGE}; otherwise {@link MissionBehavior.NAVIGATE}.
 * {@link MissionBehavior.NAVIGATE_NO_PLANNING} is never derived — it was a
 * local-navigation test mode and is no longer offered.
 *
 * It reads the **action nodes** and nothing else. Navigating and covering are
 * things an agent does, and this graph has nodes that say so; deriving them
 * instead from whether a referenced asset happens to be a zone substituted a
 * fact about geometry for a statement about intent, which the operator could
 * neither see on the canvas nor contradict.
 *
 * ## One behaviour per mission, and the graph can out-say it
 *
 * `MissionConfig.behavior` is ONE number for the WHOLE mission
 * (`multi_robot_path_planning.py:84` reads `mission["behavior"]`, singular, per
 * mission), so a graph where one agent navigates while another covers **cannot
 * be expressed faithfully**. That is reported, never hidden: both actions
 * present still compiles to COVERAGE, plus a **warning** naming the choice and
 * what it does to the navigate branch. It is not an error — the operator may
 * well want it, and the fog may cope — but they must not learn it from watching
 * a robot.
 *
 * @param graph - The graph to compile.
 * @param featureTypes - `feature_id` → MapDB `feature_type`. It no longer has
 *   any part in the `behavior` decision; it is what the action/asset pairing
 *   check reads, and a feature_id it does not carry is treated as unknown
 *   rather than as not-a-zone.
 * @returns The compiled slice and the issues found.
 */
export function compileMissionGraph(
	graph: MissionGraph,
	featureTypes?: Readonly<Record<string, string>>,
): CompiledMissionGraph {
	const normalized = normalizeGraph(graph);
	const issues: MissionGraphIssue[] = [];

	const vehicles: string[] = [];
	const seenVehicles = new Set<string>();
	for (const node of normalized.nodes) {
		if (node.kind !== "agent") continue;
		// A missing or repeated agent is reported by the program compiler
		// (AGENT_MISSING / AGENT_TWICE); the flat list just skips it.
		if (!node.agent_id || seenVehicles.has(node.agent_id)) continue;
		seenVehicles.add(node.agent_id);
		vehicles.push(node.agent_id);
	}

	// The objectives are what the actions act on — never an asset node that
	// nothing uses.
	const geometries: MissionGeometry[] = [];
	const seenFeatures = new Set<string>();
	for (const node of normalized.nodes) {
		if (node.kind !== "action") continue;
		for (const featureId of actionTargets(normalized, node.id)) {
			if (seenFeatures.has(featureId)) continue;
			seenFeatures.add(featureId);
			geometries.push({ feature_id: featureId });
		}
	}

	// An asset node wired into nothing does nothing: said, not refused.
	for (const node of normalized.nodes) {
		if (node.kind !== "asset") continue;
		if (normalized.edges.some((edge) => edge.source === node.id)) continue;
		issues.push({
			severity: "warning",
			nodeId: node.id,
			message: `"${node.label || node.id}" is wired into no action, so it is not part of the mission. Wire its output into an action's target, or delete it.`,
		});
	}

	// What the graph says the mission does. Read off the action nodes, because
	// navigating and covering are things an agent DOES and this graph has
	// nodes for exactly that.
	let hasCoverageAction = false;
	let hasNavigateAction = false;

	for (const node of normalized.nodes) {
		if (node.kind !== "action") continue;
		// ACTION_MISSING and UNREACHED come from the program compiler.
		if (node.action === "COVERAGE") hasCoverageAction = true;
		if (node.action === "NAVIGATE") hasNavigateAction = true;
		if (node.action !== "COVERAGE" && node.action !== "NAVIGATE") continue;

		// The target's TYPE, which only the editor can see (the fog has no
		// map). The canvas refuses a wrong drag already; this catches an
		// inline pick, an action switched after wiring, and a feature retyped
		// on the map. An unknown type (catalogue not loaded, or a feature the
		// map does not carry) says nothing: an unknown must not manufacture a
		// verdict that blocks a mission which is fine.
		const caption = node.label || node.id;
		const known = actionTargets(normalized, node.id)
			.map((featureId) => featureTypes?.[featureId])
			.filter((type): type is string => typeof type === "string");
		if (
			node.action === "COVERAGE" &&
			known.length > 0 &&
			!known.includes("zone")
		) {
			issues.push({
				severity: "error",
				nodeId: node.id,
				message: `"${caption}" sweeps something that is not a zone. COVERAGE needs a zone; the planner returns an empty route for anything else and the robot never moves.`,
			});
		}
		if (node.action === "NAVIGATE" && known.includes("zone")) {
			issues.push({
				severity: "error",
				nodeId: node.id,
				message: `"${caption}" goes to a zone. NAVIGATE goes to a waypoint; to sweep the zone, make it a COVERAGE.`,
			});
		}
	}

	// No agent, no asset: reported once, as EMPTY / *_TARGET, by the program
	// compiler below.

	// One COVERAGE action anywhere makes the mission a coverage mission: the
	// C2 carries one behaviour for the whole mission, and a coverage branch
	// planned under NAVIGATE is a zone reduced to a single point.
	const behavior = hasCoverageAction
		? MissionBehavior.COVERAGE
		: MissionBehavior.NAVIGATE;

	if (hasCoverageAction && hasNavigateAction) {
		// Surfaced rather than hidden. The operator may well want this and the
		// fog may cope — but discovering it from robot behaviour is not an
		// option, so it is said plainly here and never made an error.
		issues.push({
			severity: "warning",
			message:
				"This graph both navigates and covers, and the C2 carries a single behaviour for the whole mission. COVERAGE was chosen, so the NAVIGATE branch will be planned under a coverage behaviour.",
		});
	}

	// The fog's own rules, mirrored (mission-program.ts): what it would refuse,
	// with the same codes, and what its executor cannot run yet.
	const compiled = compileProgram(normalized, new Set(vehicles));
	const programIssues =
		compiled.errors.length > 0
			? compiled.errors
			: notExecutableYet(compiled.program);
	for (const issue of programIssues) {
		issues.push({
			severity: "error",
			code: issue.code,
			...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
			message: issue.message,
		});
	}

	return { behavior, vehicles, geometries, issues };
}

/**
 * Whether the graph is complete enough to compile into a submittable mission.
 *
 * @param issues - Issues from {@link compileMissionGraph}.
 * @returns True when nothing is an error.
 */
export function graphCompiles(issues: readonly MissionGraphIssue[]): boolean {
	return !issues.some((issue) => issue.severity === "error");
}
