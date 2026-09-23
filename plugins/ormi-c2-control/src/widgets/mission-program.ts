import { nodePorts, portsFit, type PortType } from "./mission-graph-ports";

/**
 * The behaviour graph compiled into what the fog runs — a TypeScript mirror of
 * the fog's compiler.
 *
 * ## The fog is authoritative; this is a mirror
 *
 * The operator plans manually (decided 2026-09-23): each agent's chain is
 * exactly what that agent does, in order. The FOG compiles the raw graph
 * document itself (`centralized_coordination/mission_program.hpp` in the
 * multi-agent-framework) and refuses a mission with these same codes. This
 * file exists so the editor can say so before submit instead of after.
 *
 * The two are held together by golden fixtures: `__fixtures__/mission-graphs/`
 * is a COPY of the fog's `test/fixtures/mission_graphs/` (written by its
 * `make_mission_graphs.py`), and `mission-program.test.ts` runs every one of
 * them. Change the fog first, copy the fixtures, then make this pass — never
 * the other way round.
 *
 * ## What compiles (graph schema 2, typed ports — see `mission-graph-ports.ts`)
 *
 * - A **chain** is one or more agent nodes wired into the same first node,
 *   then a straight line of action and Wait nodes along flow edges. Several
 *   agents on one chain are a **team**: they share every step and the planner
 *   splits the work between them.
 * - An action is NAVIGATE (one waypoint, one agent) or COVERAGE (one zone). Its
 *   target is picked on the node (`feature_id`) or wired from an asset node.
 * - A **Wait** before an action is that step's **gate**: the conditions wired
 *   into it, all of them or any of them.
 * - Only ElapsedSeconds, AgentHolding, ContactsFound and Always can be
 *   evaluated. An AgentHolding condition's agent is picked on the node or
 *   wired from an agent node.
 * - A graph of another schema version is refused, never converted.
 *
 * Anything else is an issue with a stable `code`. Input is read defensively,
 * the way the fog reads the stored document, because the fixtures are raw
 * documents and not normalized graphs.
 */

/** The graph schema the fog reads. Older graphs are refused, not converted. */
export const PROGRAM_GRAPH_VERSION = 2;

/** One predicate of a gate, as the fog's `to_json` writes it. */
export interface ProgramGateCondition {
	op: string;
	key: string;
	arg: string;
	threshold: number;
	negate: boolean;
}

/** One thing a chain does: an action on one asset, once its gate holds. */
export interface ProgramStep {
	/** The action node's id — what the editor highlights. */
	step_id: string;
	action: string;
	feature_id: string;
	/** The Wait node the gate comes from; "" when there is none. */
	wait_node: string;
	/** Whether the gate needs all of its conditions, or any one. */
	mode: "all" | "any";
	/** Empty: the step starts as soon as the previous one ends. */
	gate: ProgramGateCondition[];
	/** The condition nodes that make up `gate`, in order. */
	gate_nodes: string[];
}

/** The agents that run a list of steps together. */
export interface ProgramChain {
	agents: string[];
	steps: ProgramStep[];
}

export interface MissionProgram {
	chains: ProgramChain[];
}

/** Why a graph does not compile, or cannot run yet. */
export interface ProgramIssue {
	/** Stable, shared with the fog. */
	code: string;
	/** "" when the issue is about the graph as a whole. */
	nodeId: string;
	message: string;
}

export interface ProgramCompileResult {
	program: MissionProgram;
	errors: ProgramIssue[];
}

/** Every op the fog knows; only {@link EVALUABLE_OPS} can be run. */
const KNOWN_OPS = new Set([
	"ZoneCoveredBy",
	"ZoneClear",
	"ContactsFound",
	"CuesRemaining",
	"ElapsedSeconds",
	"AgentHolding",
	"FlagSet",
	"Always",
	"Never",
]);

/**
 * The ops the fog can evaluate today. The contact count is the
 * mission's own: its robots' contacts.
 * Zone coverage, cues and flags have no source yet.
 */
export const EVALUABLE_OPS: readonly string[] = [
	"ElapsedSeconds",
	"AgentHolding",
	"ContactsFound",
	"Always",
];

const KINDS = new Set(["agent", "action", "asset", "condition", "wait"]);

interface RawNode {
	id: string;
	kind: string;
	label: string;
	agent_id: string;
	action: string;
	feature_id: string;
	mode: string;
	condition: Record<string, unknown> | null;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The fog's port table, from the shared registry, with every asset untyped
 * (the fog has no map).
 */
function portType(
	n: RawNode,
	port: string,
	output: boolean,
): PortType | undefined {
	const ports = nodePorts({
		kind: n.kind,
		action: n.action,
		condition: { op: str(n.condition?.op) },
	});
	// The fog accepts an agent wire into ANY condition and reports it as
	// EDGE_TYPE, so the condition's agent input exists here for every op.
	if (!output && n.kind === "condition" && port === "agent") return "agent";
	return (output ? ports.outputs : ports.inputs).find((p) => p.id === port)
		?.type;
}

const PORT_TYPE_WORD: Record<PortType, string> = {
	flow: "flow",
	asset: "asset",
	waypoint: "waypoint",
	zone: "zone",
	agent: "agent",
	bool: "true/false",
};

/**
 * Compile a behaviour graph for a mission whose vehicles are `knownAgents`.
 *
 * @param graph - The graph (`{ version, nodes, edges }`), raw or normalized.
 * @param knownAgents - The mission's vehicle ids.
 * @returns The program, and every reason it cannot run.
 */
export function compileProgram(
	graph: unknown,
	knownAgents: ReadonlySet<string>,
): ProgramCompileResult {
	const program: MissionProgram = { chains: [] };
	const errors: ProgramIssue[] = [];
	if (!isObject(graph)) {
		return {
			program,
			errors: [
				{
					code: "MALFORMED",
					nodeId: "",
					message: "The behaviour graph is not an object.",
				},
			],
		};
	}
	if (graph.version !== PROGRAM_GRAPH_VERSION) {
		const seen =
			typeof graph.version === "number" ? String(graph.version) : "none";
		return {
			program,
			errors: [
				{
					code: "GRAPH_VERSION",
					nodeId: "",
					message: `This behaviour graph was made by an older editor (version ${seen}, this fog reads ${PROGRAM_GRAPH_VERSION}). Rebuild it in the current graph editor.`,
				},
			],
		};
	}

	const issue = (code: string, nodeId: string, message: string) => {
		if (errors.some((i) => i.code === code && i.nodeId === nodeId)) return;
		errors.push({ code, nodeId, message });
	};

	// -- input: the same filtering the fog applies ----------------------------
	const nodes = new Map<string, RawNode>();
	const order: string[] = [];
	for (const raw of Array.isArray(graph.nodes) ? graph.nodes : []) {
		if (!isObject(raw)) continue;
		const id = str(raw.id);
		const kind = str(raw.kind);
		if (!id || nodes.has(id) || !KINDS.has(kind)) continue;
		nodes.set(id, {
			id,
			kind,
			label: str(raw.label),
			agent_id: str(raw.agent_id),
			action: str(raw.action),
			feature_id: str(raw.feature_id),
			mode: str(raw.mode),
			condition: isObject(raw.condition) ? raw.condition : null,
		});
		order.push(id);
	}
	const node = (id: string) => nodes.get(id) as RawNode;
	const caption = (n: RawNode) => n.label || n.id;

	// Links by what they carry: the chain order, an action's target assets, a
	// Wait's conditions and a condition's agents.
	const flowOut = new Map<string, string[]>();
	const flowIn = new Map<string, string[]>();
	const targetIn = new Map<string, string[]>();
	const whenIn = new Map<string, string[]>();
	const agentIn = new Map<string, string[]>();
	const used = new Set<string>();
	const push = (m: Map<string, string[]>, key: string, value: string) =>
		m.set(key, [...(m.get(key) ?? []), value]);
	const at = (m: Map<string, string[]>, key: string) => m.get(key) ?? [];

	const seenEdges = new Set<string>();
	for (const raw of Array.isArray(graph.edges) ? graph.edges : []) {
		if (!isObject(raw)) continue;
		const s = str(raw.source);
		const t = str(raw.target);
		const sp = str(raw.source_port);
		const tp = str(raw.target_port);
		if (s === t || !nodes.has(s) || !nodes.has(t)) continue;
		const key = JSON.stringify([s, sp, t, tp]);
		if (seenEdges.has(key)) continue;
		seenEdges.add(key);
		const src = node(s);
		const dst = node(t);
		const out = portType(src, sp, true);
		if (!out) {
			issue(
				"PORT_UNKNOWN",
				s,
				`"${caption(src)}" has no output "${sp}"; a link from it is ignored.`,
			);
			continue;
		}
		const into = portType(dst, tp, false);
		if (!into) {
			issue(
				"PORT_UNKNOWN",
				t,
				`"${caption(dst)}" has no input "${tp}"; a link into it is ignored.`,
			);
			continue;
		}
		if (!portsFit(out, into)) {
			issue(
				"EDGE_TYPE",
				t,
				`"${caption(dst)}" takes a ${PORT_TYPE_WORD[into]} on "${tp}" but is wired a ${PORT_TYPE_WORD[out]} from "${caption(src)}".`,
			);
			continue;
		}
		if (into === "flow") {
			push(flowOut, s, t);
			push(flowIn, t, s);
		} else if (tp === "target") {
			push(targetIn, t, s);
		} else if (tp === "when") {
			push(whenIn, t, s);
			used.add(s);
		} else if (tp === "agent") {
			push(agentIn, t, s);
		}
	}

	const isFlow = (id: string) => {
		const k = node(id).kind;
		return k === "action" || k === "wait";
	};
	/** The inline pick, then every asset wired into the target. */
	const targets = (n: RawNode): string[] => {
		const out = n.feature_id ? [n.feature_id] : [];
		for (const a of at(targetIn, n.id)) {
			if (node(a).feature_id) out.push(node(a).feature_id);
		}
		return out;
	};
	/** The agents an AgentHolding condition watches: inline, then wired. */
	const watched = (n: RawNode): string[] => {
		const out: string[] = [];
		const inline = str(n.condition?.key);
		if (inline) out.push(inline);
		for (const a of at(agentIn, n.id)) {
			const id = node(a).agent_id;
			if (id && !out.includes(id)) out.push(id);
		}
		return out;
	};

	// -- per-node checks ----------------------------------------------------------
	const seenAgents = new Set<string>();
	for (const id of order) {
		const n = node(id);
		if (n.kind === "agent") {
			if (!n.agent_id) {
				issue(
					"AGENT_MISSING",
					id,
					`"${caption(n)}" is an agent node with no agent selected.`,
				);
			} else if (!knownAgents.has(n.agent_id)) {
				issue(
					"AGENT_UNKNOWN",
					id,
					`"${caption(n)}" names an agent that is not in this mission's vehicle list.`,
				);
			} else if (seenAgents.has(n.agent_id)) {
				issue(
					"AGENT_TWICE",
					id,
					`"${caption(n)}" repeats an agent another node already has. An agent runs one chain: give it one agent node.`,
				);
			} else {
				seenAgents.add(n.agent_id);
			}
		} else if (n.kind === "asset") {
			if (!n.feature_id) {
				issue(
					"ASSET_MISSING_FEATURE",
					id,
					`"${caption(n)}" names no map feature.`,
				);
			}
		} else if (n.kind === "action") {
			if (!n.action) {
				issue(
					"ACTION_MISSING",
					id,
					`"${caption(n)}" is an action node with no action named.`,
				);
			} else if (n.action !== "NAVIGATE" && n.action !== "COVERAGE") {
				issue(
					"ACTION_NOT_EXECUTABLE",
					id,
					`"${caption(n)}" is a ${n.action} action, which does not exist: only NAVIGATE and COVERAGE run. To hold, navigate to a waypoint and put a Wait after it; sensors report what they find on their own.`,
				);
			}
			const features = targets(n);
			if (n.action === "NAVIGATE" && features.length !== 1) {
				issue(
					"NAVIGATE_TARGET",
					id,
					`"${caption(n)}" must go to exactly one waypoint; it names ${features.length}. Pick one, or wire one asset into its target.`,
				);
			}
			if (n.action === "COVERAGE" && features.length !== 1) {
				issue(
					"COVERAGE_TARGET",
					id,
					`"${caption(n)}" must sweep exactly one zone; it names ${features.length}. Pick one, or wire one asset into its target.`,
				);
			}
		} else if (n.kind === "wait") {
			if (n.mode && n.mode !== "all" && n.mode !== "any") {
				issue(
					"WAIT_MODE",
					id,
					`"${caption(n)}" must wait for all or any of its conditions, not "${n.mode}".`,
				);
			}
			if (at(whenIn, id).length === 0) {
				issue(
					"WAIT_EMPTY",
					id,
					`"${caption(n)}" has no condition wired into it, so it would never open.`,
				);
			}
		} else if (n.kind === "condition") {
			const op = str(n.condition?.op);
			if (!op) {
				issue(
					"CONDITION_MISSING",
					id,
					`"${caption(n)}" is a condition node with nothing to evaluate.`,
				);
			} else if (!KNOWN_OPS.has(op)) {
				issue(
					"CONDITION_MISSING",
					id,
					`"${caption(n)}" uses ${op}, which this fog does not know.`,
				);
			} else if (!EVALUABLE_OPS.includes(op)) {
				issue(
					"CONDITION_NOT_EVALUABLE",
					id,
					`"${caption(n)}" uses ${op}, which the fog cannot evaluate yet: only ElapsedSeconds, AgentHolding, ContactsFound and Always.`,
				);
			} else if (op === "AgentHolding") {
				const agents = watched(n);
				if (agents.length !== 1) {
					issue(
						"CONDITION_AGENT",
						id,
						`"${caption(n)}" must watch exactly one agent; it names ${agents.length}. Pick one, or wire one agent into it.`,
					);
				} else if (!knownAgents.has(agents[0] as string)) {
					issue(
						"AGENT_UNKNOWN",
						id,
						`"${caption(n)}" waits on an agent that is not in this mission.`,
					);
				}
			} else if (at(agentIn, id).length > 0) {
				issue(
					"EDGE_TYPE",
					id,
					`"${caption(n)}" reads no agent: only an Agent holding condition does.`,
				);
			}
			if (!used.has(id)) {
				issue(
					"CONDITION_UNUSED",
					id,
					`"${caption(n)}" is wired into no Wait, so nothing waits on it.`,
				);
			}
		}
	}

	// -- joins: a flow node is entered from one place, or only from agents ----
	for (const id of order) {
		if (!isFlow(id)) continue;
		let agents = 0;
		let others = 0;
		for (const p of at(flowIn, id)) {
			if (node(p).kind === "agent") agents += 1;
			else others += 1;
		}
		if (others > 1 || (others >= 1 && agents >= 1)) {
			issue(
				"JOIN",
				id,
				`"${caption(node(id))}" is reached from more than one place. A chain is a straight line: each step has one step before it.`,
			);
		}
	}

	// -- chains ------------------------------------------------------------------
	const walked = new Set<string>();
	const markDownstream = (from: string) => {
		const stack = [from];
		while (stack.length > 0) {
			const id = stack.pop() as string;
			if (walked.has(id)) continue;
			walked.add(id);
			stack.push(...at(flowOut, id));
		}
	};
	const conditionOf = (n: RawNode): ProgramGateCondition => {
		const c = n.condition ?? {};
		const op = str(c.op);
		if (!KNOWN_OPS.has(op)) {
			return {
				op: "Always",
				key: "",
				arg: "",
				threshold: 1,
				negate: false,
			};
		}
		let key = str(c.key);
		if (op === "AgentHolding") {
			const agents = watched(n);
			key = agents.length === 1 ? (agents[0] as string) : "";
		}
		return {
			op,
			key,
			arg: str(c.arg),
			threshold: typeof c.threshold === "number" ? c.threshold : 1,
			negate: c.negate === true,
		};
	};

	for (const head of order) {
		if (!isFlow(head)) continue;
		const p = at(flowIn, head);
		if (p.length === 0 || !p.every((x) => node(x).kind === "agent"))
			continue;
		const chain: ProgramChain = { agents: [], steps: [] };
		for (const agentNode of p) {
			const agentId = node(agentNode).agent_id;
			if (agentId && !chain.agents.includes(agentId))
				chain.agents.push(agentId);
		}

		const visited = new Set<string>();
		let wait = "";
		let id = head;
		for (;;) {
			if (visited.has(id)) {
				issue(
					"CYCLE",
					id,
					`The chain through "${caption(node(id))}" loops back on itself.`,
				);
				break;
			}
			visited.add(id);
			walked.add(id);
			const n = node(id);
			if (n.kind === "wait") {
				if (wait) {
					issue(
						"WAIT_STACKED",
						id,
						`"${caption(n)}" follows another Wait with no action between them. Wire every condition into one Wait.`,
					);
				}
				wait = id;
			} else {
				const features = targets(n);
				const gateNodes = wait ? at(whenIn, wait) : [];
				chain.steps.push({
					step_id: id,
					action: n.action,
					feature_id:
						features.length === 1 ? (features[0] as string) : "",
					wait_node: wait,
					mode: wait && node(wait).mode === "any" ? "any" : "all",
					gate: gateNodes.map((c) => conditionOf(node(c))),
					gate_nodes: [...gateNodes],
				});
				wait = "";
				if (n.action === "NAVIGATE" && chain.agents.length > 1) {
					issue(
						"TEAM_NAVIGATE",
						id,
						`"${caption(n)}" sends a team of ${chain.agents.length} agents to one point. A team can sweep a zone together; to go somewhere, give each agent its own chain.`,
					);
				}
			}

			const next = at(flowOut, id);
			if (next.length === 0) {
				if (n.kind === "wait") {
					issue(
						"WAIT_DANGLING",
						id,
						`"${caption(n)}" has no action after it, so nothing waits on it.`,
					);
				}
				break;
			}
			if (next.length > 1) {
				issue(
					"FANOUT",
					id,
					`"${caption(n)}" continues into more than one step. A chain is a straight line.`,
				);
				for (const x of next) markDownstream(x);
				break;
			}
			id = next[0] as string;
		}
		program.chains.push(chain);
	}

	for (const id of order) {
		const n = node(id);
		if (n.kind !== "agent") continue;
		const flow = at(flowOut, id);
		if (flow.length === 0) {
			issue(
				"AGENT_IDLE",
				id,
				`"${caption(n)}" is wired into nothing, so it would be leased and never used.`,
			);
		} else if (flow.length > 1) {
			issue(
				"FANOUT",
				id,
				`"${caption(n)}" starts more than one chain. An agent runs one chain, in order.`,
			);
		}
	}

	for (const id of order) {
		if (isFlow(id) && !walked.has(id)) {
			issue(
				"UNREACHED",
				id,
				`"${caption(node(id))}" is not on any agent's chain, so it never runs. Wire it after an agent, or delete it.`,
			);
		}
	}
	if (!program.chains.some((c) => c.steps.length > 0)) {
		issue(
			"EMPTY",
			"",
			"The graph gives no agent anything to do: wire an agent into an action.",
		);
	}

	return { program, errors };
}

/**
 * What compiles but the fog's CURRENT executor cannot run, reported apart from
 * compile errors so {@link compileProgram} does not change as the executor
 * grows. Empty since the fog runs conditions (its step 3c).
 *
 * @param program - A program that compiled.
 * @returns One `NOT_EXECUTABLE_YET` issue per node the executor would not honour.
 */
export function notExecutableYet(program: MissionProgram): ProgramIssue[] {
	// Everything that compiles runs (the fog's step 3c: conditions too).
	void program;
	return [];
}
