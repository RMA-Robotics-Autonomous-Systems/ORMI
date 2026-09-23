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
 * is a COPY of the fog's `test/fixtures/mission_graphs/`, and
 * `mission-program.test.ts` runs every one of them. Change the fog first, copy
 * the fixtures, then make this pass — never the other way round.
 *
 * ## What compiles (v1)
 *
 * - A **chain** is one or more agent nodes wired into the same first node,
 *   then a straight line of condition and action nodes. Several agents on one
 *   chain are a **team**: they share every step and the planner splits the
 *   work between them.
 * - An action is NAVIGATE (one asset, one agent) or COVERAGE (one asset).
 * - The conditions met before an action are that step's **gate**, ANDed. Only
 *   ElapsedSeconds, AgentHolding and Always can be evaluated.
 * - A chain may run THROUGH an asset (action → asset → next action) when that
 *   asset belongs to that action alone.
 *
 * Anything else is an issue with a stable `code`. Input is read defensively,
 * the way the fog reads the stored document, because the fixtures are raw
 * documents and not normalized graphs.
 */

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
	/** Empty: the step starts as soon as the previous one ends. */
	gate: ProgramGateCondition[];
	/** The condition nodes that make up `gate`. */
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
	"ItemsFound",
	"ContactsFound",
	"CuesRemaining",
	"ElapsedSeconds",
	"AgentHolding",
	"FlagSet",
	"Always",
	"Never",
]);

/** The ops the fog can evaluate today. */
export const EVALUABLE_OPS: readonly string[] = [
	"ElapsedSeconds",
	"AgentHolding",
	"Always",
];

interface RawNode {
	id: string;
	kind: string;
	label: string;
	agent_id: string;
	action: string;
	feature_id: string;
	condition: Record<string, unknown> | null;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FLOW = new Set(["action", "condition"]);

/**
 * Compile a behaviour graph for a mission whose vehicles are `knownAgents`.
 *
 * @param graph - The graph (`{ nodes, edges }`), raw or normalized.
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

	// -- input: the same filtering the fog applies ----------------------------
	const nodes = new Map<string, RawNode>();
	const order: string[] = [];
	for (const raw of Array.isArray(graph.nodes) ? graph.nodes : []) {
		if (!isObject(raw)) continue;
		const id = str(raw.id);
		const kind = str(raw.kind);
		if (!id || nodes.has(id)) continue;
		if (!["agent", "action", "asset", "condition"].includes(kind)) continue;
		nodes.set(id, {
			id,
			kind,
			label: str(raw.label),
			agent_id: str(raw.agent_id),
			action: str(raw.action),
			feature_id: str(raw.feature_id),
			condition: isObject(raw.condition) ? raw.condition : null,
		});
		order.push(id);
	}
	const out = new Map<string, string[]>();
	const inn = new Map<string, string[]>();
	for (const raw of Array.isArray(graph.edges) ? graph.edges : []) {
		if (!isObject(raw) || str(raw.kind) !== "exec") continue;
		const s = str(raw.source);
		const t = str(raw.target);
		if (s === t || !nodes.has(s) || !nodes.has(t)) continue;
		const list = out.get(s) ?? [];
		if (list.includes(t)) continue;
		list.push(t);
		out.set(s, list);
		inn.set(t, [...(inn.get(t) ?? []), s]);
	}

	// -- helpers ----------------------------------------------------------------
	const node = (id: string) => nodes.get(id) as RawNode;
	const caption = (n: RawNode) => n.label || n.id;
	const isFlow = (id: string) => FLOW.has(node(id).kind);
	const succ = (id: string, flow: boolean) =>
		(out.get(id) ?? []).filter((t) => isFlow(t) === flow);
	const preds = (id: string) => inn.get(id) ?? [];
	const issue = (code: string, nodeId: string, message: string) => {
		if (errors.some((i) => i.code === code && i.nodeId === nodeId)) return;
		errors.push({ code, nodeId, message });
	};
	const nextOf = (id: string): string[] => {
		const flow = succ(id, true);
		if (flow.length > 0 || node(id).kind !== "action") return flow;
		const assets = succ(id, false);
		if (assets.length === 1 && preds(assets[0] as string).length === 1) {
			return succ(assets[0] as string, true);
		}
		return flow;
	};
	const walked = new Set<string>();
	const markDownstream = (from: string) => {
		const stack = [from];
		while (stack.length > 0) {
			const id = stack.pop() as string;
			if (walked.has(id)) continue;
			walked.add(id);
			stack.push(...(out.get(id) ?? []));
		}
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
					`"${caption(n)}" is a ${n.action} action, which the robots cannot perform: only NAVIGATE and COVERAGE run.`,
				);
			}
		} else if (n.kind === "condition") {
			const op = n.condition ? str(n.condition.op) : "";
			if (!op || !KNOWN_OPS.has(op)) {
				issue(
					"CONDITION_MISSING",
					id,
					`"${caption(n)}" is a condition node with nothing to evaluate.`,
				);
			} else if (!EVALUABLE_OPS.includes(op)) {
				issue(
					"CONDITION_NOT_EVALUABLE",
					id,
					`"${caption(n)}" uses ${op}, which the fog cannot evaluate yet: only ElapsedSeconds, AgentHolding and Always.`,
				);
			} else if (
				op === "AgentHolding" &&
				!knownAgents.has(str(n.condition?.key))
			) {
				issue(
					"AGENT_UNKNOWN",
					id,
					`"${caption(n)}" waits on an agent that is not in this mission.`,
				);
			}
		}
	}

	// -- joins: a flow node is entered from one place, or only from agents ----
	for (const id of order) {
		if (!isFlow(id)) continue;
		let agents = 0;
		let others = 0;
		for (const p of preds(id)) {
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
	for (const head of order) {
		if (!isFlow(head)) continue;
		const p = preds(head);
		if (p.length === 0 || !p.every((x) => node(x).kind === "agent"))
			continue;
		const chain: ProgramChain = { agents: [], steps: [] };
		for (const agentNode of p) {
			const agentId = node(agentNode).agent_id;
			if (agentId && !chain.agents.includes(agentId))
				chain.agents.push(agentId);
		}

		const visited = new Set<string>();
		let gate: ProgramGateCondition[] = [];
		let gateNodes: string[] = [];
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
			if (n.kind === "condition") {
				const c = n.condition ?? {};
				gate.push({
					op: KNOWN_OPS.has(str(c.op)) ? str(c.op) : "Always",
					key: str(c.key),
					arg: str(c.arg),
					threshold:
						typeof c.threshold === "number" ? c.threshold : 1,
					negate: c.negate === true,
				});
				gateNodes.push(id);
			} else {
				const features = succ(id, false)
					.map((a) => node(a).feature_id)
					.filter((f) => f !== "");
				chain.steps.push({
					step_id: id,
					action: n.action,
					feature_id:
						features.length === 1 ? (features[0] as string) : "",
					gate,
					gate_nodes: gateNodes,
				});
				gate = [];
				gateNodes = [];
				if (n.action === "NAVIGATE" && features.length !== 1) {
					issue(
						"NAVIGATE_TARGET",
						id,
						`"${caption(n)}" must name exactly one map asset to go to; it names ${features.length}. Chain one NAVIGATE per waypoint.`,
					);
				}
				if (n.action === "COVERAGE" && features.length !== 1) {
					issue(
						"COVERAGE_TARGET",
						id,
						`"${caption(n)}" must name exactly one zone to sweep; it names ${features.length}.`,
					);
				}
				if (n.action === "NAVIGATE" && chain.agents.length > 1) {
					issue(
						"TEAM_NAVIGATE",
						id,
						`"${caption(n)}" sends a team of ${chain.agents.length} agents to one point. A team can sweep a zone together; to go somewhere, give each agent its own chain.`,
					);
				}
			}

			const next = nextOf(id);
			if (next.length === 0) {
				if (n.kind === "condition") {
					issue(
						"CONDITION_DANGLING",
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
		const flow = succ(id, true);
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
 * What the fog's CURRENT executor cannot run. Until the fog's program executor
 * exists it runs one action, with no gate, by every agent of one chain — the
 * planner allocates within that team. This shrinks as the executor grows;
 * {@link compileProgram} does not change.
 *
 * @param program - A program that compiled.
 * @returns One `NOT_EXECUTABLE_YET` issue per node the executor would not honour.
 */
export function notExecutableYet(program: MissionProgram): ProgramIssue[] {
	const issues: ProgramIssue[] = [];
	const code = "NOT_EXECUTABLE_YET";
	program.chains.forEach((chain) => {
		chain.steps.forEach((step) => {
			for (const g of step.gate_nodes) {
				issues.push({
					code,
					nodeId: g,
					message:
						"Conditions are not executed yet: nothing would evaluate this one, and the step after it would start at once.",
				});
			}
		});
	});
	return issues;
}
