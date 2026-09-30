import { nodePorts, portsFit, type PortType } from "./mission-graph-ports";

/**
 * The behaviour graph compiled into what the fog runs — a TypeScript mirror of
 * the fog's compiler.
 *
 * ## The fog is authoritative; this is a mirror
 *
 * The operator plans manually (decided 2026-09-23): the graph is exactly what
 * each agent does, in order. The FOG compiles the raw graph document itself
 * (`centralized_coordination/mission_program.hpp` in the multi-agent-framework)
 * and refuses a mission with these same codes. This file exists so the editor
 * can say so before submit instead of after.
 *
 * The two are held together by golden fixtures: `__fixtures__/mission-graphs/`
 * is a COPY of the fog's `test/fixtures/mission_graphs/` (written by its
 * `make_mission_graphs.py`), and `mission-program.test.ts` runs every one of
 * them. Change the fog first, copy the fixtures, then make this pass — never
 * the other way round.
 *
 * ## What compiles (graph schema 3 — see `mission-graph-ports.ts`)
 *
 * - The AGENT flows through the graph. A **chain** is one or more agent nodes
 *   wired into the same first step, then a line of steps along agent edges.
 *   Several agents on one chain are a **team**: they share every step and the
 *   planner splits the work between them.
 * - An action is NAVIGATE (one waypoint, one agent) or COVERAGE (one zone). Its
 *   target is picked on the node (`feature_id`), wired from an asset node, or
 *   wired from an On contact node's `position`.
 * - A **Hold until** (wait) before a step is that step's **gate**: what is
 *   wired into it, all of it or any. A step's `done` holds once that step has
 *   completed (StepDone); a condition node is ElapsedSeconds, ContactsFound or
 *   Always.
 * - An **On contact** node takes the contacts of one COVERAGE, in the order
 *   they come: for each, its robot goes out on `agent` with the contact's
 *   `position` and comes back into the node for the next one; once the
 *   coverage is done and every contact was taken, it leaves on `no_more`.
 *   That loop is the only one a graph may have, and loops do not nest.
 * - A graph of another schema version is refused, never converted.
 *
 * Anything else is an issue with a stable `code`. Input is read defensively,
 * the way the fog reads the stored document, because the fixtures are raw
 * documents and not normalized graphs.
 */

/** The graph schema the fog reads. Older graphs are refused, not converted. */
export const PROGRAM_GRAPH_VERSION = 3;

/** One predicate of a gate, as the fog's `to_json` writes it. */
export interface ProgramGateCondition {
	op: string;
	key: string;
	arg: string;
	threshold: number;
	negate: boolean;
}

/**
 * One thing a chain does, entered once its gate holds: a STEP (an action on
 * one target) or an ON_CONTACT (take the next contact and run `body`).
 */
export interface ProgramStep {
	/** The graph node's id — what the editor highlights. */
	step_id: string;
	kind: "STEP" | "ON_CONTACT";
	/** STEP: NAVIGATE | COVERAGE; "" for ON_CONTACT. */
	action: string;
	/** STEP: the asset it acts on; "" when its target is a contact. */
	feature_id: string;
	/** STEP: the On contact node whose current contact is the target. */
	contact_node: string;
	/** ON_CONTACT: the COVERAGE step whose contacts it takes. */
	source_step: string;
	/** ON_CONTACT: index of the first step done per contact; -1 otherwise. */
	body: number;
	/** Index of the step after this one; -1 ends the chain. */
	next: number;
	/** The Hold until node the gate comes from; "" when there is none. */
	wait_node: string;
	/** Whether the gate needs all of its inputs, or any one. */
	mode: "all" | "any";
	/** Empty: the step is entered as soon as the previous one ends. */
	gate: ProgramGateCondition[];
	/** The node behind each gate condition (a condition, or a step's done). */
	gate_nodes: string[];
}

/** The agents that run one piece of the graph together; steps[0] first. */
export interface ProgramChain {
	agents: string[];
	steps: ProgramStep[];
}

export interface MissionProgram {
	chains: ProgramChain[];
}

/** Why a graph does not compile. */
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

/** Every op the fog knows; only {@link EVALUABLE_OPS} can be picked. */
const KNOWN_OPS = new Set([
	"ZoneCoveredBy",
	"ZoneClear",
	"ContactsFound",
	"CuesRemaining",
	"ElapsedSeconds",
	"StepDone",
	"FlagSet",
	"Always",
	"Never",
]);

/**
 * The ops a condition node can hold. A step being done is not one of them:
 * it is that step's `done` output, wired. Zone coverage, cues and flags have
 * no source yet.
 */
export const EVALUABLE_OPS: readonly string[] = [
	"ElapsedSeconds",
	"ContactsFound",
	"Always",
];

const KINDS = new Set([
	"agent",
	"action",
	"asset",
	"condition",
	"wait",
	"on_contact",
]);

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

/** The fog's port table, from the shared registry, every asset untyped. */
function portType(
	n: RawNode,
	port: string,
	output: boolean,
): PortType | undefined {
	const ports = nodePorts({ kind: n.kind, action: n.action });
	return (output ? ports.outputs : ports.inputs).find((p) => p.id === port)
		?.type;
}

const PORT_TYPE_WORD: Record<PortType, string> = {
	agent: "agent",
	asset: "asset",
	waypoint: "waypoint",
	zone: "zone",
	bool: "true/false",
	event: "event",
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
					message: "The graph could not be read.",
				},
			],
		};
	}
	if (graph.version !== PROGRAM_GRAPH_VERSION) {
		return {
			program,
			errors: [
				{
					code: "GRAPH_VERSION",
					nodeId: "",
					message:
						"This graph was made by an older editor. Start a new graph.",
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

	// Links by what they carry: the robot (agent edges, and an On contact's
	// exit), an action's targets, a Hold until's inputs, an On contact's event.
	const agentOut = new Map<string, string[]>();
	const exitOut = new Map<string, string[]>();
	const agentIn = new Map<string, string[]>();
	const targetIn = new Map<string, string[]>();
	const whenIn = new Map<string, string[]>();
	const eventIn = new Map<string, string[]>();
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
		if (into === "agent") {
			push(sp === "no_more" ? exitOut : agentOut, s, t);
			push(agentIn, t, s);
		} else if (tp === "target") {
			push(targetIn, t, s);
		} else if (tp === "when") {
			push(whenIn, t, s);
			used.add(s);
		} else if (tp === "event") {
			push(eventIn, t, s);
		}
	}

	const isStep = (id: string) => {
		const k = node(id).kind;
		return k === "action" || k === "wait" || k === "on_contact";
	};
	/** The inline pick, then every asset wired into the target. */
	const targets = (n: RawNode): string[] => {
		const out = n.feature_id ? [n.feature_id] : [];
		for (const a of at(targetIn, n.id)) {
			if (node(a).kind === "asset" && node(a).feature_id)
				out.push(node(a).feature_id);
		}
		return out;
	};
	/** The On contact nodes whose `position` is wired into the target. */
	const contactTargets = (n: RawNode): string[] =>
		at(targetIn, n.id).filter((a) => node(a).kind === "on_contact");

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
					`"${caption(n)}" names no asset.`,
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
					`"${caption(n)}" is a ${n.action} action, which cannot run. Use Navigate or Coverage; to hold, add a Hold until after it.`,
				);
			}
			const count = targets(n).length + contactTargets(n).length;
			if (n.action === "NAVIGATE" && count !== 1) {
				issue(
					"NAVIGATE_TARGET",
					id,
					`"${caption(n)}" must go to exactly one waypoint; it names ${count}. Pick one, or wire one asset (or a contact's position) into its target.`,
				);
			}
			if (n.action === "COVERAGE" && count !== 1) {
				issue(
					"COVERAGE_TARGET",
					id,
					`"${caption(n)}" must sweep exactly one zone; it names ${count}. Pick one, or wire one asset into its target.`,
				);
			}
		} else if (n.kind === "wait") {
			if (n.mode && n.mode !== "all" && n.mode !== "any") {
				issue(
					"WAIT_MODE",
					id,
					`"${caption(n)}" must hold until all or any of its inputs, not "${n.mode}".`,
				);
			}
			if (at(whenIn, id).length === 0) {
				issue(
					"WAIT_EMPTY",
					id,
					`"${caption(n)}" has nothing to wait for. Wire a condition or a step's "done" into it.`,
				);
			}
		} else if (n.kind === "condition") {
			const op = str(n.condition?.op);
			if (!op) {
				issue(
					"CONDITION_MISSING",
					id,
					`"${caption(n)}" has no condition. Pick one.`,
				);
			} else if (!KNOWN_OPS.has(op)) {
				issue(
					"CONDITION_MISSING",
					id,
					`"${caption(n)}" uses ${op}, which the C2 does not know.`,
				);
			} else if (op === "StepDone") {
				issue(
					"CONDITION_NOT_EVALUABLE",
					id,
					`"${caption(n)}" asks whether a step is done: wire that step's "done" output into the Hold until instead.`,
				);
			} else if (!EVALUABLE_OPS.includes(op)) {
				issue(
					"CONDITION_NOT_EVALUABLE",
					id,
					`"${caption(n)}" uses ${op}, which the C2 cannot evaluate. Use Elapsed time, Contacts found or Always.`,
				);
			}
			if (!used.has(id)) {
				issue(
					"CONDITION_UNUSED",
					id,
					`"${caption(n)}" is not wired into any Hold until.`,
				);
			}
		} else if (n.kind === "on_contact") {
			const events = at(eventIn, id);
			if (events.length !== 1) {
				issue(
					"ON_CONTACT_EVENT",
					id,
					`"${caption(n)}" must take the contacts of exactly one Coverage; it is wired to ${events.length}. Wire one Coverage's "on contact" into it.`,
				);
			}
		}
	}

	// -- joins: an action or a Hold until is entered from one place ------------
	for (const id of order) {
		const k = node(id).kind;
		if (k !== "action" && k !== "wait") continue;
		let agents = 0;
		let others = 0;
		for (const p of at(agentIn, id)) {
			if (node(p).kind === "agent") agents += 1;
			else others += 1;
		}
		if (others > 1 || (others >= 1 && agents >= 1)) {
			issue(
				"JOIN",
				id,
				`"${caption(node(id))}" is reached from more than one place. A step can follow only one step.`,
			);
		}
	}

	// -- chains ------------------------------------------------------------------
	const walked = new Set<string>();
	const onIndex = new Map<string, number>();
	const closed = new Set<string>();
	const inBody = new Map<string, string>();

	const markDownstream = (from: string) => {
		const seen = new Set<string>();
		const stack = [from];
		while (stack.length > 0) {
			const id = stack.pop() as string;
			if (seen.has(id)) continue;
			seen.add(id);
			walked.add(id);
			stack.push(...at(agentOut, id), ...at(exitOut, id));
		}
	};
	const conditionOf = (n: RawNode): ProgramGateCondition => {
		if (n.kind === "action") {
			return {
				op: "StepDone",
				key: n.id,
				arg: "",
				threshold: 1,
				negate: false,
			};
		}
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
		return {
			op,
			key: str(c.key),
			arg: str(c.arg),
			threshold: typeof c.threshold === "number" ? c.threshold : 1,
			negate: c.negate === true,
		};
	};
	const newStep = (id: string, wait: string): ProgramStep => {
		const gateNodes = wait ? at(whenIn, wait) : [];
		return {
			step_id: id,
			kind: "STEP",
			action: "",
			feature_id: "",
			contact_node: "",
			source_step: "",
			body: -1,
			next: -1,
			wait_node: wait,
			mode: wait && node(wait).mode === "any" ? "any" : "all",
			gate: gateNodes.map((c) => conditionOf(node(c))),
			gate_nodes: [...gateNodes],
		};
	};

	/**
	 * Compile the steps from `start` on into `chain`; the index of the first
	 * one, or -1. Inside an On contact loop the walk ends where it comes back.
	 */
	const segment = (
		start: string,
		chain: ProgramChain,
		loopOwner: string,
		visited: Set<string>,
	): number => {
		let first = -1;
		let prev = -1;
		const linkTo = (idx: number) => {
			if (prev >= 0) (chain.steps[prev] as ProgramStep).next = idx;
			else first = idx;
		};
		let wait = "";
		let id = start;
		for (;;) {
			if (loopOwner && id === loopOwner) {
				if (wait) {
					issue(
						"WAIT_DANGLING",
						wait,
						`"${caption(node(wait))}" is the last node before the loop goes back for the next contact. Put it before a step.`,
					);
				}
				linkTo(onIndex.get(loopOwner) as number);
				closed.add(loopOwner);
				return first;
			}
			if (visited.has(id)) {
				issue(
					"CYCLE",
					id,
					`The chain through "${caption(node(id))}" loops back on itself. Only an On contact node can take a loop.`,
				);
				return first;
			}
			visited.add(id);
			walked.add(id);
			if (loopOwner) inBody.set(id, loopOwner);
			const n = node(id);

			if (n.kind === "wait") {
				if (wait) {
					issue(
						"WAIT_STACKED",
						id,
						`"${caption(n)}" follows another Hold until with no step between them. Wire everything it waits for into one Hold until.`,
					);
				}
				wait = id;
			} else if (n.kind === "action") {
				const step = newStep(id, wait);
				wait = "";
				step.action = n.action;
				const features = targets(n);
				const contacts = contactTargets(n);
				if (features.length === 1 && contacts.length === 0)
					step.feature_id = features[0] as string;
				if (contacts.length === 1 && features.length === 0) {
					step.contact_node = contacts[0] as string;
					if (contacts[0] !== loopOwner) {
						issue(
							"POSITION_OUTSIDE_LOOP",
							id,
							`"${caption(n)}" goes to a contact's position but is not in that On contact loop. Move it into the loop.`,
						);
					}
				}
				if (n.action === "NAVIGATE" && chain.agents.length > 1) {
					issue(
						"TEAM_NAVIGATE",
						id,
						`"${caption(n)}" sends ${chain.agents.length} agents to one point. Give each agent its own chain.`,
					);
				}
				chain.steps.push(step);
				const idx = chain.steps.length - 1;
				linkTo(idx);
				prev = idx;
			} else {
				// on_contact
				if (loopOwner) {
					issue(
						"NESTED_ON_CONTACT",
						id,
						`"${caption(n)}" is inside another On contact loop. Loops cannot nest: use a separate robot for each Coverage's contacts.`,
					);
					markDownstream(id);
					return first;
				}
				const step = newStep(id, wait);
				wait = "";
				step.kind = "ON_CONTACT";
				const events = at(eventIn, id);
				if (events.length === 1) step.source_step = events[0] as string;
				chain.steps.push(step);
				const idx = chain.steps.length - 1;
				onIndex.set(id, idx);
				linkTo(idx);
				prev = idx;

				const body = at(agentOut, id);
				if (body.length > 1) {
					issue(
						"FANOUT",
						id,
						`"${caption(n)}" sends its robot to more than one step per contact.`,
					);
					for (const x of body) markDownstream(x);
				} else if (body.length === 0) {
					issue(
						"ON_CONTACT_BODY",
						id,
						`"${caption(n)}" sends its robot nowhere. Wire its agent output into a step, and that step back into it.`,
					);
				} else {
					const b = segment(body[0] as string, chain, id, visited);
					if (b < 0 || b === idx) {
						issue(
							"ON_CONTACT_BODY",
							id,
							`"${caption(n)}" does nothing at a contact. Put a step (a Navigate to its position) between its agent output and the way back.`,
						);
					} else {
						(chain.steps[idx] as ProgramStep).body = b;
					}
					if (!closed.has(id)) {
						issue(
							"ON_CONTACT_LOOP",
							id,
							`The robot "${caption(n)}" sends to a contact never comes back. Wire the last step of the loop into its agent input.`,
						);
					}
				}
				const exit = at(exitOut, id);
				if (exit.length === 0) return first;
				if (exit.length > 1) {
					issue(
						"FANOUT",
						id,
						`"${caption(n)}" continues into more than one step once there are no more contacts.`,
					);
					for (const x of exit) markDownstream(x);
					return first;
				}
				id = exit[0] as string;
				continue;
			}

			const next = at(agentOut, id);
			if (next.length === 0) {
				if (n.kind === "wait") {
					issue(
						"WAIT_DANGLING",
						id,
						`"${caption(n)}" has no step after it.`,
					);
				}
				return first;
			}
			if (next.length > 1) {
				issue(
					"FANOUT",
					id,
					`"${caption(n)}" hands its robot on to more than one step.`,
				);
				for (const x of next) markDownstream(x);
				return first;
			}
			id = next[0] as string;
		}
	};

	for (const head of order) {
		if (!isStep(head)) continue;
		const p = at(agentIn, head);
		if (!p.some((x) => node(x).kind === "agent")) continue;
		if (
			node(head).kind !== "on_contact" &&
			!p.every((x) => node(x).kind === "agent")
		)
			continue; // a JOIN, reported already
		const chain: ProgramChain = { agents: [], steps: [] };
		for (const agentNode of p) {
			const a = node(agentNode);
			if (a.kind !== "agent" || !a.agent_id) continue;
			if (!chain.agents.includes(a.agent_id))
				chain.agents.push(a.agent_id);
		}
		segment(head, chain, "", new Set<string>());
		program.chains.push(chain);
	}

	for (const id of order) {
		const n = node(id);
		if (n.kind !== "agent") continue;
		const out = at(agentOut, id);
		if (out.length === 0) {
			issue(
				"AGENT_IDLE",
				id,
				`"${caption(n)}" is wired into nothing. Wire it into an action, or delete it.`,
			);
		} else if (out.length > 1) {
			issue(
				"FANOUT",
				id,
				`"${caption(n)}" hands its robot to more than one step.`,
			);
		}
	}

	// -- On contact nodes: how they are entered, and their Coverage -------------
	for (const id of order) {
		const n = node(id);
		if (n.kind !== "on_contact" || !onIndex.has(id)) continue;
		let agents = 0;
		let others = 0;
		for (const p of at(agentIn, id)) {
			if (inBody.get(p) === id) continue; // a way back from its loop
			if (node(p).kind === "agent") agents += 1;
			else others += 1;
		}
		if (others > 1 || (others >= 1 && agents >= 1)) {
			issue(
				"JOIN",
				id,
				`"${caption(n)}" is reached from more than one place besides its own loop.`,
			);
		}
		const events = at(eventIn, id);
		if (events.length !== 1 || !walked.has(events[0] as string)) continue;
		const source = events[0] as string;
		if (inBody.has(source)) {
			issue(
				"ON_CONTACT_SOURCE",
				id,
				`"${caption(n)}" takes the contacts of "${caption(node(source))}", which runs inside a contact loop. Take the contacts of a Coverage that runs once.`,
			);
		}
	}

	// -- nothing waits forever -------------------------------------------------
	// A `done` from inside a contact loop may never hold (no contact, no trip
	// round the loop).
	for (const id of order) {
		const n = node(id);
		if (n.kind !== "wait" || !walked.has(id)) continue;
		for (const src of at(whenIn, id)) {
			if (node(src).kind === "action" && inBody.has(src)) {
				issue(
					"DONE_IN_LOOP",
					id,
					`"${caption(n)}" waits for "${caption(node(src))}" to be done, but it is inside a contact loop and may never run.`,
				);
			}
		}
	}
	// "X must be done before Y can start" — a chain's order, a Hold until on
	// a `done`, an On contact node's exit on its Coverage — must not go round
	// in a circle.
	const before = new Map<string, Set<string>>();
	const addBefore = (from: string, to: string) => {
		const set = before.get(from) ?? new Set<string>();
		set.add(to);
		before.set(from, set);
	};
	const watched: { from: string; to: string; code: string; node: string }[] =
		[];
	const steps = new Set<string>();
	for (const chain of program.chains) {
		chain.steps.forEach((st, i) => {
			steps.add(st.step_id);
			// Forward links only: a way back into an On contact node is the loop.
			if (st.next > i)
				addBefore(
					st.step_id,
					(chain.steps[st.next] as ProgramStep).step_id,
				);
			if (st.kind === "ON_CONTACT" && st.body > i)
				addBefore(
					st.step_id,
					(chain.steps[st.body] as ProgramStep).step_id,
				);
		});
	}
	for (const chain of program.chains) {
		for (const st of chain.steps) {
			st.gate.forEach((g, k) => {
				// A `done` wire (a StepDone condition node is refused already).
				const from = st.gate_nodes[k];
				const wired =
					from !== undefined && nodes.get(from)?.kind === "action";
				if (g.op !== "StepDone" || !wired || !steps.has(g.key)) return;
				addBefore(g.key, st.step_id);
				watched.push({
					from: g.key,
					to: st.step_id,
					code: "DONE_DEADLOCK",
					node: st.wait_node,
				});
			});
			if (
				st.kind === "ON_CONTACT" &&
				st.next >= 0 &&
				steps.has(st.source_step)
			) {
				const exit = (chain.steps[st.next] as ProgramStep).step_id;
				addBefore(st.source_step, exit);
				watched.push({
					from: st.source_step,
					to: exit,
					code: "ON_CONTACT_DEADLOCK",
					node: st.step_id,
				});
			}
		}
	}
	const reaches = (from: string, to: string): boolean => {
		const seen = new Set<string>();
		const stack = [from];
		while (stack.length > 0) {
			const x = stack.pop() as string;
			if (x === to) return true;
			if (seen.has(x)) continue;
			seen.add(x);
			stack.push(...(before.get(x) ?? []));
		}
		return false;
	};
	for (const w of watched) {
		if (!reaches(w.to, w.from)) continue;
		const what = nodes.has(w.node) ? caption(node(w.node)) : w.node;
		issue(
			w.code,
			w.node,
			w.code === "DONE_DEADLOCK"
				? `"${what}" waits for "${caption(node(w.from))}" to be done, which can only happen after it lets go. It would wait forever.`
				: `"${what}" waits for the contacts of "${caption(node(w.from))}", which can only sweep after this robot moves on. It would wait forever.`,
		);
	}

	for (const id of order) {
		if (isStep(id) && !walked.has(id)) {
			issue(
				"UNREACHED",
				id,
				`"${caption(node(id))}" is not on any agent's chain. Wire it after an agent, or delete it.`,
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
