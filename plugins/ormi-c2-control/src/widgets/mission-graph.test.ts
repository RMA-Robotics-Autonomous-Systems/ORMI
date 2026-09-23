import { describe, expect, it } from "bun:test";

import {
	CONDITION_OPS,
	CONDITION_OP_SHAPE,
	EXECUTABLE_ACTIONS,
	GRAPH_ACTIONS,
	MISSION_GRAPH_DOC_KIND,
	SENSOR_MODALITIES,
	addAgentNode,
	buildGraphDocument,
	compileMissionGraph,
	emptyMissionGraph,
	freshGraphId,
	graphCompiles,
	graphDocId,
	hasAgentNode,
	isExecutableAction,
	isMissionGraphDocId,
	nextNodePosition,
	normalizeGraph,
	propagateAgents,
	readGraphDocument,
	removeAgentNode,
	toggleAgentNode,
	type CompiledMissionGraph,
	type ConditionOp,
	type GraphAction,
	type GraphCondition,
	type MissionGraph,
	type MissionGraphEdge,
	type MissionGraphIssue,
	type MissionGraphNode,
} from "./mission-graph";
import { normalizeMissions } from "./mission-list";
import { MissionBehavior } from "../types/c2-types";

/** Shorthand node builder. */
function node(
	id: string,
	kind: MissionGraphNode["kind"],
	extra: Partial<MissionGraphNode> = {},
): MissionGraphNode {
	return {
		id,
		kind,
		label: id,
		position: { x: 0, y: 0 },
		...extra,
	};
}

/** Shorthand edge builder. */
function edge(
	source: string,
	target: string,
	kind: MissionGraphEdge["kind"] = "exec",
): MissionGraphEdge {
	return { id: `${kind}-${source}-${target}`, source, target, kind };
}

/** Feature types for {@link targetScenario}'s three assets. */
const TARGET_FEATURE_TYPES = {
	"feat-zone-north": "zone",
	"feat-zone-south": "zone",
	"feat-holding-1": "waypoint",
};

/**
 * The target scenario, as a graph: two coverage agents each sweeping a zone,
 * and one effector agent holding at a waypoint, dispatched by a condition fed
 * from the sweeps' findings.
 */
function targetScenario(): MissionGraph {
	return {
		version: 1,
		nodes: [
			node("survey-a", "agent", { agent_id: "robot-a" }),
			node("survey-b", "agent", { agent_id: "robot-b" }),
			node("effector", "agent", { agent_id: "robot-c" }),
			node("zone-north", "asset", { feature_id: "feat-zone-north" }),
			node("zone-south", "asset", { feature_id: "feat-zone-south" }),
			node("hold-point", "asset", { feature_id: "feat-holding-1" }),
			node("sweep-north", "action", { action: "COVERAGE" }),
			node("sweep-south", "action", { action: "COVERAGE" }),
			node("hold", "action", { action: "HOLD" }),
			node("on-contact", "condition", {
				// A predicate the fog can actually evaluate, not a sentence.
				condition: {
					op: "ContactsFound",
					threshold: 1,
					negate: false,
				},
			}),
			node("mark", "action", { action: "MARK" }),
		],
		edges: [
			edge("survey-a", "sweep-north"),
			edge("sweep-north", "zone-north"),
			edge("survey-b", "sweep-south"),
			edge("sweep-south", "zone-south"),
			edge("effector", "hold"),
			edge("hold", "hold-point"),
			edge("hold", "on-contact"),
			edge("on-contact", "mark"),
			// The findings each sweep produces feed the condition. A data edge,
			// so it carries the value and NOT the assignment: the marker is
			// robot-c's job whoever found the thing.
			edge("sweep-north", "on-contact", "data"),
			edge("sweep-south", "on-contact", "data"),
		],
	};
}

describe("the graph document lives beside the mission, not inside it", () => {
	it("stores under '<mission_id>:graph'", () => {
		expect(graphDocId("m-1")).toBe("m-1:graph");
		expect(isMissionGraphDocId("m-1:graph")).toBe(true);
		expect(isMissionGraphDocId("m-1")).toBe(false);
		// The suffix alone is not a graph id — there is no mission it belongs to.
		expect(isMissionGraphDocId(":graph")).toBe(false);
		expect(isMissionGraphDocId(undefined)).toBe(false);
	});

	it("builds a document POST /missions accepts", () => {
		const doc = buildGraphDocument(
			"m-1",
			targetScenario(),
			() => new Date("2026-09-22T10:00:00.000Z"),
		);
		// The endpoint validates exactly two things: a non-empty `mission_id`
		// string, and no `$`-prefixed or dotted key anywhere in the body.
		expect(typeof doc.mission_id).toBe("string");
		expect(doc.mission_id.length).toBeGreaterThan(0);
		expect(doc.kind).toBe(MISSION_GRAPH_DOC_KIND);
		expect(doc.mission_ref).toBe("m-1");
		expect(doc.updated_at).toBe("2026-09-22T10:00:00.000Z");
		const keys = new Set<string>();
		const walk = (value: unknown) => {
			if (Array.isArray(value)) return value.forEach(walk);
			if (!value || typeof value !== "object") return;
			for (const [key, child] of Object.entries(value)) {
				keys.add(key);
				walk(child);
			}
		};
		walk(doc);
		for (const key of keys) {
			expect(key.startsWith("$")).toBe(false);
			expect(key.includes(".")).toBe(false);
		}
	});

	it("round-trips through the document", () => {
		const doc = buildGraphDocument("m-1", targetScenario());
		const back = readGraphDocument(doc);
		expect(back?.nodes.length).toBe(targetScenario().nodes.length);
		expect(back?.edges.length).toBe(targetScenario().edges.length);
	});

	it("reads a document written by nothing it recognises as no graph", () => {
		// The collection is `strict: false` and nothing validates it
		// server-side, so an unrecognised shape must mean "this mission has no
		// graph", never a throw inside a widget.
		expect(readGraphDocument(null)).toBeNull();
		expect(readGraphDocument({ mission_id: "m-1" })).toBeNull();
		expect(
			readGraphDocument({ mission_id: "m-1:graph", graph: "nope" }),
		).toBeNull();
		expect(
			readGraphDocument({ mission_id: "m-1:graph", graph: {} }),
		).toEqual(emptyMissionGraph());
	});

	it("is filtered out of the mission browser", () => {
		// It lives in the SAME `missions` collection, so without the filter
		// every mission with a graph grows a phantom row an operator could
		// select, submit and delete.
		const rows = normalizeMissions([
			{ mission_id: "m-1", name: "Sweep" },
			buildGraphDocument("m-1", emptyMissionGraph()),
		]);
		expect(rows.map((row) => row.mission_id)).toEqual(["m-1"]);
	});
});

describe("normalizeGraph", () => {
	it("drops an edge whose endpoint is gone", () => {
		// A dangling edge is what a partially-applied delete produces and is
		// the one shape that reliably breaks a graph renderer.
		const normalized = normalizeGraph({
			version: 1,
			nodes: [node("a", "agent", { agent_id: "r" })],
			edges: [edge("a", "missing")],
		});
		expect(normalized.edges).toEqual([]);
		expect(normalized.nodes).toHaveLength(1);
	});

	it("drops self-edges and duplicate ids", () => {
		const normalized = normalizeGraph({
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "r" }),
				node("a", "asset", { feature_id: "f" }),
				node("b", "asset", { feature_id: "f" }),
			],
			edges: [edge("a", "a"), edge("a", "b"), edge("a", "b")],
		});
		expect(normalized.nodes.map((n) => n.id)).toEqual(["a", "b"]);
		expect(normalized.nodes[0]?.kind).toBe("agent");
		expect(normalized.edges).toHaveLength(1);
	});

	it("drops a node with no usable kind or id", () => {
		const normalized = normalizeGraph({
			version: 1,
			nodes: [
				{ id: "", kind: "agent" } as unknown as MissionGraphNode,
				{ id: "x", kind: "nope" } as unknown as MissionGraphNode,
				node("ok", "action", { action: "HOLD" }),
			],
			edges: [],
		});
		expect(normalized.nodes.map((n) => n.id)).toEqual(["ok"]);
	});

	it("blanks a whitespace-only field rather than storing it", () => {
		const normalized = normalizeGraph({
			version: 1,
			nodes: [node("a", "asset", { feature_id: "   " })],
			edges: [],
		});
		expect(normalized.nodes[0]?.feature_id).toBeUndefined();
	});
});

describe("agent assignment flows along 'then' edges", () => {
	it("reaches everything downstream of an agent", () => {
		const assignment = propagateAgents(targetScenario());
		expect(assignment.get("sweep-north")).toEqual(["robot-a"]);
		expect(assignment.get("zone-north")).toEqual(["robot-a"]);
		expect(assignment.get("sweep-south")).toEqual(["robot-b"]);
		expect(assignment.get("hold")).toEqual(["robot-c"]);
		expect(assignment.get("hold-point")).toEqual(["robot-c"]);
		// Down through the condition to the action it gates.
		expect(assignment.get("on-contact")).toEqual(["robot-c"]);
		expect(assignment.get("mark")).toEqual(["robot-c"]);
	});

	it("does NOT flow along a data edge", () => {
		// The surveys feed the condition with findings, but consuming a value
		// is not being commanded by whoever produced it — the marker stays
		// robot-c's job whoever found the thing.
		const assignment = propagateAgents(targetScenario());
		expect(assignment.get("mark")).not.toContain("robot-a");
		expect(assignment.get("mark")).not.toContain("robot-b");
	});

	it("carries two agents into a node both reach", () => {
		const assignment = propagateAgents({
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "robot-a" }),
				node("b", "agent", { agent_id: "robot-b" }),
				node("meet", "action", { action: "HOLD" }),
			],
			edges: [edge("a", "meet"), edge("b", "meet")],
		});
		expect(assignment.get("meet")).toEqual(["robot-a", "robot-b"]);
	});

	it("terminates on a cycle", () => {
		const assignment = propagateAgents({
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "robot-a" }),
				node("x", "action", { action: "COVERAGE" }),
				node("y", "action", { action: "COVERAGE" }),
			],
			edges: [edge("a", "x"), edge("x", "y"), edge("y", "x")],
		});
		expect(assignment.get("y")).toEqual(["robot-a"]);
	});

	it("assigns an agent node to itself", () => {
		const assignment = propagateAgents(targetScenario());
		expect(assignment.get("survey-a")).toEqual(["robot-a"]);
	});
});

/**
 * The editor's own issues: those the fog cannot raise (feature types), which
 * carry no code. Tests about the editor's rules read through this; the fog's
 * rules are pinned by mission-program.test.ts against the shared fixtures.
 */
function editorOnly(issues: readonly MissionGraphIssue[]): MissionGraphIssue[] {
	return issues.filter((issue) => issue.code === undefined);
}

/** The fog-contract issues, as sorted (code, node) pairs. */
function fogCodes(issues: readonly MissionGraphIssue[]): [string, string][] {
	return issues
		.filter((issue) => issue.code !== undefined)
		.map((issue): [string, string] => [
			issue.code ?? "",
			issue.nodeId ?? "",
		])
		.sort();
}

describe("compileMissionGraph", () => {
	it("compiles the target scenario's flat slice; the fog refuses its HOLD, MARK and finding condition", () => {
		const compiled = compileMissionGraph(
			targetScenario(),
			TARGET_FEATURE_TYPES,
		);
		expect(graphCompiles(editorOnly(compiled.issues))).toBe(true);
		expect(fogCodes(compiled.issues)).toEqual([
			["ACTION_NOT_EXECUTABLE", "hold"],
			["ACTION_NOT_EXECUTABLE", "mark"],
			["CONDITION_NOT_EVALUABLE", "on-contact"],
		]);
		expect(compiled.behavior).toBe(MissionBehavior.COVERAGE);
		expect(compiled.vehicles).toEqual(["robot-a", "robot-b", "robot-c"]);
		expect(compiled.geometries).toEqual([
			{ feature_id: "feat-zone-north" },
			{ feature_id: "feat-zone-south" },
			{ feature_id: "feat-holding-1" },
		]);
	});

	it("emits objective geometries as REFERENCES, never coordinates", () => {
		// Geometry never appears in the behaviour graph: a node names an asset
		// by feature_id, and the map is that geometry's one home.
		const compiled = compileMissionGraph(targetScenario());
		for (const geometry of compiled.geometries) {
			expect(geometry.feature_id).toBeTruthy();
			expect(geometry.geometry).toBeUndefined();
		}
	});

	it("is deterministic — the same graph compiles byte-identically", () => {
		// The output feeds a save. A compile that reordered `geometries`
		// between runs would make every mission read as dirty.
		const first = compileMissionGraph(targetScenario());
		const second = compileMissionGraph(targetScenario());
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});

	it("reports an agent node with no agent as an error", () => {
		const graph = targetScenario();
		graph.nodes[0] = node("survey-a", "agent");
		const compiled = compileMissionGraph(graph);
		expect(graphCompiles(compiled.issues)).toBe(false);
		expect(compiled.vehicles).not.toContain("robot-a");
	});

	it("reports an action no agent reaches as an error", () => {
		const graph = targetScenario();
		graph.edges = graph.edges.filter(
			(e) => !(e.source === "effector" && e.target === "hold"),
		);
		const compiled = compileMissionGraph(graph);
		expect(graphCompiles(compiled.issues)).toBe(false);
		expect(
			compiled.issues.some(
				(issue) =>
					issue.nodeId === "hold" && issue.severity === "error",
			),
		).toBe(true);
	});

	it("reports an unreached ASSET as a warning, and still submits it", () => {
		// An objective nobody is assigned to is a planning question, not a
		// broken mission — the C2 will still plan it. An ACTION nobody is
		// assigned to simply never runs, which is why that one is an error.
		const graph = targetScenario();
		graph.edges = graph.edges.filter(
			(e) => !(e.source === "sweep-north" && e.target === "zone-north"),
		);
		const compiled = compileMissionGraph(graph);
		expect(
			compiled.issues.find((issue) => issue.nodeId === "zone-north")
				?.severity,
		).toBe("warning");
		expect(compiled.geometries).toContainEqual({
			feature_id: "feat-zone-north",
		});
	});

	it("reports a condition with no outgoing branch as an error", () => {
		const graph = targetScenario();
		graph.edges = graph.edges.filter(
			(e) => !(e.source === "on-contact" && e.target === "mark"),
		);
		const compiled = compileMissionGraph(graph);
		expect(
			compiled.issues.some(
				(issue) =>
					issue.nodeId === "on-contact" && issue.severity === "error",
			),
		).toBe(true);
	});

	it("does not ask for a data input the evaluable conditions never read", () => {
		// ElapsedSeconds, AgentHolding and Always read nothing from a data
		// edge; warning that one "is evaluated against nothing" was wrong.
		const graph = targetScenario();
		graph.edges = graph.edges.filter((e) => e.kind !== "data");
		const compiled = compileMissionGraph(graph);
		expect(
			compiled.issues.some(
				(issue) =>
					issue.nodeId === "on-contact" &&
					issue.severity === "warning",
			),
		).toBe(false);
	});

	it("dedupes a repeated asset and refuses a repeated agent", () => {
		const graph = targetScenario();
		graph.nodes.push(
			node("zone-north-2", "asset", { feature_id: "feat-zone-north" }),
			node("survey-a-2", "agent", { agent_id: "robot-a" }),
		);
		graph.edges.push(edge("survey-a", "zone-north-2"));
		const compiled = compileMissionGraph(graph);
		expect(
			compiled.geometries.filter(
				(g) => g.feature_id === "feat-zone-north",
			),
		).toHaveLength(1);
		expect(compiled.vehicles.filter((v) => v === "robot-a")).toHaveLength(
			1,
		);
		// An agent runs one chain: a second node for it is the fog's AGENT_TWICE.
		expect(
			compiled.issues.find((issue) => issue.nodeId === "survey-a-2")
				?.code,
		).toBe("AGENT_TWICE");
	});

	it("refuses an empty graph with reasons the operator can act on", () => {
		const compiled = compileMissionGraph(emptyMissionGraph());
		expect(graphCompiles(compiled.issues)).toBe(false);
		expect(fogCodes(compiled.issues)).toEqual([["EMPTY", ""]]);
		expect(compiled.issues).toHaveLength(1);
		expect(compiled.vehicles).toEqual([]);
		expect(compiled.geometries).toEqual([]);
	});
});

describe("an action comes from a vocabulary, never from a text field", () => {
	it("drops an action nothing downstream recognises", () => {
		// An old free-text graph must degrade to "no action named" — which the
		// compiler reports and the operator can act on — rather than carry a
		// value the fog will never turn into a primitive.
		const normalized = normalizeGraph({
			version: 1,
			nodes: [
				node("a", "action", {
					action: "RENDEZVOUS" as unknown as never,
				}),
				node("b", "action", { action: "COVERAGE" }),
			],
			edges: [],
		});
		expect(normalized.nodes[0]?.action).toBeUndefined();
		expect(normalized.nodes[1]?.action).toBe("COVERAGE");
	});

	it("drops a stored SURVEY — absorbed into COVERAGE, one-way", () => {
		// SURVEY was retired into COVERAGE: sweeping an area with sensors is
		// what the C2 calls COVERAGE, and two names for one thing leaves
		// nothing to say which the fog honours. There is no migration (the
		// mission database was wiped), and the degradation is deliberately
		// one-way — re-guessing COVERAGE from a retired name would silently
		// change a mission's behaviour. It becomes "no action named", which
		// the compiler reports as an error the operator can act on.
		const normalized = normalizeGraph({
			version: 1,
			nodes: [
				node("s", "action", { action: "SURVEY" as unknown as never }),
			],
			edges: [],
		});
		expect(normalized.nodes[0]?.action).toBeUndefined();
		expect((GRAPH_ACTIONS as readonly string[]).includes("SURVEY")).toBe(
			false,
		);
	});

	it("names exactly the five authorable actions", () => {
		// NAVIGATE and COVERAGE are actions — they are nodes in this system,
		// not a shape the compiler infers from a referenced asset.
		expect([...GRAPH_ACTIONS]).toEqual([
			"NAVIGATE",
			"COVERAGE",
			"HOLD",
			"MARK",
			"NEUTRALISE",
		]);
	});

	it("says which actions the edge can actually run today", () => {
		// The supervisor builds and checks exactly one primitive type,
		// "waypoint" (agent_tasks_supervisor_node.cpp:263, :645, :767).
		// NAVIGATE arrives as a route to a waypoint, COVERAGE as the
		// waypoints the planner's generated sweep produced.
		expect(isExecutableAction("NAVIGATE")).toBe(true);
		expect(isExecutableAction("COVERAGE")).toBe(true);
		// Nothing holds: the supervisor ignores wait_time and the fog emits
		// no hold. Refused until something executes it.
		expect(isExecutableAction("HOLD")).toBe(false);
		// Declared by the effector payload, no executor on the edge — the UI
		// must say so instead of letting an operator believe an arm moved.
		expect(isExecutableAction("MARK")).toBe(false);
		expect(isExecutableAction("NEUTRALISE")).toBe(false);
		expect(isExecutableAction("nonsense")).toBe(false);
		expect(isExecutableAction("SURVEY")).toBe(false);
		expect([...EXECUTABLE_ACTIONS]).toEqual(["NAVIGATE", "COVERAGE"]);
	});
});

describe("a condition mirrors the fog's evaluator", () => {
	it("names exactly the ops the fog header declares", () => {
		// Coupling, stated on purpose. Source of truth:
		// submodules/fog/centralized-coordination/src/centralized_coordination/
		//   include/centralized_coordination/mission_conditions.hpp
		//   enum class Op { … }
		// An op the UI invents is an op that silently never holds, so this
		// list is transcribed from that enum and must be changed with it.
		const fogHeaderOps: ConditionOp[] = [
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
		];
		expect([...CONDITION_OPS]).toEqual(fogHeaderOps);
		// Every op has a form to render, and nothing else does.
		expect(Object.keys(CONDITION_OP_SHAPE).sort()).toEqual(
			[...fogHeaderOps].sort(),
		);
	});

	it("describes each op's fields the way evaluate() reads them", () => {
		const shape = (op: ConditionOp) => {
			const s = CONDITION_OP_SHAPE[op];
			return [s.key, s.arg, s.threshold];
		};
		// coverage_of(s, key, arg) >= threshold
		expect(shape("ZoneCoveredBy")).toEqual([
			"zone",
			"modality",
			"fraction",
		]);
		// zone_clear(s, key, threshold) — no modality, it uses every REQUIRED one
		expect(shape("ZoneClear")).toEqual(["zone", "none", "fraction"]);
		// s.items / s.contacts / s.cues >= (int) threshold
		expect(shape("ItemsFound")).toEqual(["none", "none", "count"]);
		expect(shape("ContactsFound")).toEqual(["none", "none", "count"]);
		expect(shape("CuesRemaining")).toEqual(["none", "none", "count"]);
		// s.elapsed_s >= threshold
		expect(shape("ElapsedSeconds")).toEqual(["none", "none", "seconds"]);
		// s.holding[key] — the threshold is never read
		expect(shape("AgentHolding")).toEqual(["agent", "none", "none"]);
		// s.flags.count(key) > 0 — likewise
		expect(shape("FlagSet")).toEqual(["flag", "none", "none"]);
		expect(shape("Always")).toEqual(["none", "none", "none"]);
		expect(shape("Never")).toEqual(["none", "none", "none"]);
	});

	it("offers the modalities payloads actually sweep with", () => {
		// config_autonomy.yaml also declares MARKER, but that is the effector
		// arm's modality: it sweeps nothing, so no zone is ever required to be
		// covered by it and offering it would be a choice that can never hold.
		expect([...SENSOR_MODALITIES]).toEqual(["EMI", "GPR"]);
	});

	it("drops a legacy free-text condition", () => {
		// A stored sentence is not a predicate anyone can evaluate. Keeping it
		// would let a condition node read as configured while the fog ignores
		// it, which is the one failure nothing on screen reports.
		const normalized = normalizeGraph({
			version: 1,
			nodes: [
				node("c", "condition", {
					condition: "finding.kind >= contact" as unknown as never,
				}),
				node("d", "condition", {
					condition: {
						op: "Nope",
						threshold: 1,
						negate: false,
					} as unknown as GraphCondition,
				}),
			],
			edges: [],
		});
		expect(normalized.nodes[0]?.condition).toBeUndefined();
		expect(normalized.nodes[1]?.condition).toBeUndefined();
	});

	it("round-trips a well-formed condition", () => {
		const condition: GraphCondition = {
			op: "ZoneCoveredBy",
			key: "feat-zone-north",
			arg: "EMI",
			threshold: 0.8,
			negate: false,
		};
		const doc = buildGraphDocument("m-1", {
			version: 1,
			nodes: [node("c", "condition", { condition })],
			edges: [],
		});
		const back = readGraphDocument(doc);
		expect(back?.nodes[0]?.condition).toEqual(condition);
	});

	it("strips a key or arg the op does not use", () => {
		// A stale zone id on an ElapsedSeconds condition would show up in the
		// inspector's form and read as though it mattered.
		const normalized = normalizeGraph({
			version: 1,
			nodes: [
				node("c", "condition", {
					condition: {
						op: "ElapsedSeconds",
						key: "feat-zone-north",
						arg: "EMI",
						threshold: 90,
						negate: false,
					},
				}),
				node("d", "condition", {
					condition: {
						op: "ZoneClear",
						key: "feat-zone-north",
						// ZoneClear uses EVERY required modality, so it takes
						// none of its own.
						arg: "EMI",
						threshold: 1,
						negate: false,
					},
				}),
			],
			edges: [],
		});
		expect(normalized.nodes[0]?.condition).toEqual({
			op: "ElapsedSeconds",
			threshold: 90,
			negate: false,
		});
		expect(normalized.nodes[1]?.condition).toEqual({
			op: "ZoneClear",
			key: "feat-zone-north",
			threshold: 1,
			negate: false,
		});
	});

	it("coerces an unusable threshold to the shape's default", () => {
		const thresholdOf = (condition: unknown) =>
			normalizeGraph({
				version: 1,
				nodes: [
					node("c", "condition", {
						condition: condition as GraphCondition,
					}),
				],
				edges: [],
			}).nodes[0]?.condition?.threshold;

		for (const bad of [Number.NaN, undefined, Number.POSITIVE_INFINITY]) {
			// fraction -> 1.0: "covered" means fully covered unless the
			// operator says otherwise.
			expect(
				thresholdOf({ op: "ZoneClear", threshold: bad, negate: false }),
			).toBe(1);
			// count -> 1: "found one" is the smallest useful question.
			expect(
				thresholdOf({
					op: "ItemsFound",
					threshold: bad,
					negate: false,
				}),
			).toBe(1);
			// seconds -> 0.
			expect(
				thresholdOf({
					op: "ElapsedSeconds",
					threshold: bad,
					negate: false,
				}),
			).toBe(0);
			// An op that reads no threshold gets 0 whatever was stored.
			expect(
				thresholdOf({ op: "Always", threshold: bad, negate: false }),
			).toBe(0);
		}
		expect(
			thresholdOf({ op: "Always", threshold: 42, negate: false }),
		).toBe(0);
		// A fraction above 1 can never hold; a count is truncated the way the
		// fog's `static_cast<int>` truncates it.
		expect(
			thresholdOf({ op: "ZoneClear", threshold: 4, negate: false }),
		).toBe(1);
		expect(
			thresholdOf({ op: "ItemsFound", threshold: 2.9, negate: false }),
		).toBe(2);
	});

	it("coerces negate to a boolean", () => {
		const negateOf = (negate: unknown) =>
			normalizeGraph({
				version: 1,
				nodes: [
					node("c", "condition", {
						condition: {
							op: "Always",
							negate,
						} as unknown as GraphCondition,
					}),
				],
				edges: [],
			}).nodes[0]?.condition?.negate;
		expect(negateOf(true)).toBe(true);
		expect(negateOf(undefined)).toBe(false);
		expect(negateOf("yes")).toBe(false);
		expect(negateOf(1)).toBe(false);
	});
});

describe("behavior is derived from the ACTION NODES, never picked", () => {
	/**
	 * An agent, one action, and the asset that action acts on — wired the way
	 * the graph states association: agent → action → asset, along `exec`.
	 */
	function oneAction(
		action: GraphAction | undefined,
		featureId = "feat-zone-north",
	): MissionGraph {
		return {
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "robot-a" }),
				node("act", "action", action ? { action } : {}),
				node("asset", "asset", { feature_id: featureId }),
			],
			edges: [edge("a", "act"), edge("act", "asset")],
		};
	}

	it("is COVERAGE when the graph has a COVERAGE action node", () => {
		const compiled = compileMissionGraph(oneAction("COVERAGE"), {
			"feat-zone-north": "zone",
		});
		expect(compiled.behavior).toBe(MissionBehavior.COVERAGE);
		expect(graphCompiles(compiled.issues)).toBe(true);
	});

	it("is NAVIGATE when the graph has a NAVIGATE action node", () => {
		const compiled = compileMissionGraph(
			oneAction("NAVIGATE", "feat-wp-1"),
			{
				"feat-wp-1": "waypoint",
			},
		);
		expect(compiled.behavior).toBe(MissionBehavior.NAVIGATE);
		expect(graphCompiles(compiled.issues)).toBe(true);
	});

	it("is NAVIGATE when the graph has no action nodes at all", () => {
		const compiled = compileMissionGraph(
			{
				version: 1,
				nodes: [
					node("a", "agent", { agent_id: "robot-a" }),
					node("asset", "asset", { feature_id: "feat-zone-north" }),
				],
				edges: [edge("a", "asset")],
			},
			{ "feat-zone-north": "zone" },
		);
		// The inversion, stated: the objective IS a zone and the mission is
		// still NAVIGATE, because nothing in the graph says anyone covers it.
		// Geometry is a fact about the map; behaviour is a statement of
		// intent, and only an action node makes one.
		expect(compiled.behavior).toBe(MissionBehavior.NAVIGATE);
	});

	it("does not consult featureTypes for the decision", () => {
		// A COVERAGE action over a waypoint is still a coverage mission —
		// wrongly paired, which the pairing check reports as its own error,
		// but never silently re-read as NAVIGATE behind the operator.
		const compiled = compileMissionGraph(
			oneAction("COVERAGE", "feat-wp-1"),
			{
				"feat-wp-1": "waypoint",
			},
		);
		expect(compiled.behavior).toBe(MissionBehavior.COVERAGE);
		// And with no map at all, a COVERAGE action still means coverage.
		expect(compileMissionGraph(oneAction("COVERAGE")).behavior).toBe(
			MissionBehavior.COVERAGE,
		);
	});

	it("chooses COVERAGE when the graph does both, and SAYS so", () => {
		// `MissionConfig.behavior` is ONE number for the WHOLE mission
		// (multi_robot_path_planning.py:84 reads mission["behavior"],
		// singular), so a graph where one agent navigates and another covers
		// cannot be expressed faithfully. The operator may want it and the fog
		// may cope — but they must not discover it from robot behaviour.
		const graph: MissionGraph = {
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "robot-a" }),
				node("b", "agent", { agent_id: "robot-b" }),
				node("sweep", "action", { action: "COVERAGE" }),
				node("go", "action", { action: "NAVIGATE" }),
				node("zone", "asset", { feature_id: "feat-zone-north" }),
				node("wp", "asset", { feature_id: "feat-wp-1" }),
			],
			edges: [
				edge("a", "sweep"),
				edge("sweep", "zone"),
				edge("b", "go"),
				edge("go", "wp"),
			],
		};
		const compiled = compileMissionGraph(graph, {
			"feat-zone-north": "zone",
			"feat-wp-1": "waypoint",
		});
		expect(compiled.behavior).toBe(MissionBehavior.COVERAGE);
		const ambiguity = compiled.issues.find(
			(issue) =>
				issue.nodeId === undefined &&
				issue.message.includes("single behaviour"),
		);
		expect(ambiguity?.severity).toBe("warning");
		expect(ambiguity?.message).toContain("COVERAGE was chosen");
		expect(ambiguity?.message).toContain("NAVIGATE branch");
		// A warning, never an error (the stop-gap refuses the second action
		// separately, and says so).
		expect(graphCompiles(editorOnly(compiled.issues))).toBe(true);
	});

	it("says nothing about ambiguity when the graph only covers", () => {
		const compiled = compileMissionGraph(oneAction("COVERAGE"), {
			"feat-zone-north": "zone",
		});
		expect(
			compiled.issues.some((issue) =>
				issue.message.includes("single behaviour"),
			),
		).toBe(false);
	});

	it("never derives NAVIGATE_NO_PLANNING", () => {
		// It was a local-navigation test mode and is no longer offered; the
		// planner raises `ValueError: Unsupported behavior` for it.
		for (const action of [...GRAPH_ACTIONS, undefined]) {
			for (const types of [
				undefined,
				{ "feat-zone-north": "zone" },
				{ "feat-zone-north": "waypoint" },
				{ "feat-zone-north": "cue" },
			]) {
				expect(
					compileMissionGraph(oneAction(action), types).behavior,
				).not.toBe(MissionBehavior.NAVIGATE_NO_PLANNING);
			}
		}
	});
});

describe("the action/asset pairing is validated, not inferred", () => {
	/**
	 * Association rule under test: an action acts on every `asset` node
	 * reachable DOWNSTREAM of it along `exec` edges — the same walk
	 * `propagateAgents` makes for an assignment, and the way the graph is
	 * already wired (agent → action → asset).
	 */
	function paired(
		action: GraphAction,
		featureId?: string,
		assetEdgeKind: MissionGraphEdge["kind"] = "exec",
	): MissionGraph {
		return {
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "robot-a" }),
				node("act", "action", { action }),
				...(featureId
					? [node("asset", "asset", { feature_id: featureId })]
					: []),
				// An objective always exists, so the compile only ever fails
				// on the pairing and never on "no map asset".
				node("objective", "asset", { feature_id: "feat-objective" }),
			],
			edges: [
				edge("a", "act"),
				edge("a", "objective"),
				...(featureId ? [edge("act", "asset", assetEdgeKind)] : []),
			],
		};
	}

	/** Issues the pairing check raised against the action node itself. */
	const issuesOn = (
		compiled: CompiledMissionGraph,
		severity: MissionGraphIssue["severity"],
	) =>
		editorOnly(compiled.issues).filter(
			(issue) => issue.nodeId === "act" && issue.severity === severity,
		);
	const errorsOn = (compiled: CompiledMissionGraph) =>
		issuesOn(compiled, "error");
	const warningsOn = (compiled: CompiledMissionGraph) =>
		issuesOn(compiled, "warning");

	it("errors when a COVERAGE action covers something that is not a zone", () => {
		// The failure worth an error, because it is otherwise silent AND
		// severe: the planner's coverage branch given no Polygon/LineString
		// logs "[coverage] behavior 1 needs a Polygon/LineString zone to
		// sweep" and returns an EMPTY route for every agent — the mission is
		// accepted, dispatched, and nothing moves.
		const compiled = compileMissionGraph(paired("COVERAGE", "feat-wp-1"), {
			"feat-wp-1": "waypoint",
			"feat-objective": "waypoint",
		});
		expect(graphCompiles(compiled.issues)).toBe(false);
		expect(errorsOn(compiled)).toHaveLength(1);
		expect(errorsOn(compiled)[0]?.message).toContain(
			"empty route for EVERY agent",
		);
	});

	it("errors when a COVERAGE action is paired with no asset at all", () => {
		const compiled = compileMissionGraph(paired("COVERAGE"), {
			"feat-objective": "zone",
		});
		expect(graphCompiles(compiled.issues)).toBe(false);
		// The fog's COVERAGE_TARGET, not an editor-only check.
		expect(fogCodes(compiled.issues)).toContainEqual([
			"COVERAGE_TARGET",
			"act",
		]);
	});

	it("associates along 'then' edges, never along a data edge", () => {
		// A data edge carries a value, not a command and not an association —
		// so a zone merely feeding the action is not a zone it sweeps.
		const compiled = compileMissionGraph(
			paired("COVERAGE", "feat-zone-north", "data"),
			{ "feat-zone-north": "zone", "feat-objective": "zone" },
		);
		expect(fogCodes(compiled.issues)).toContainEqual([
			"COVERAGE_TARGET",
			"act",
		]);
	});

	it("accepts a COVERAGE action over a zone", () => {
		const compiled = compileMissionGraph(
			paired("COVERAGE", "feat-zone-north"),
			{ "feat-zone-north": "zone", "feat-objective": "zone" },
		);
		expect(graphCompiles(compiled.issues)).toBe(true);
		expect(errorsOn(compiled)).toHaveLength(0);
	});

	it("emits NOTHING when featureTypes is absent", () => {
		// An unknown type must not manufacture a confident error: a catalogue
		// that has not loaded yet would otherwise block a mission that is fine.
		const compiled = compileMissionGraph(
			paired("COVERAGE", "feat-zone-north"),
		);
		expect(errorsOn(compiled)).toHaveLength(0);
		expect(warningsOn(compiled)).toHaveLength(0);
		expect(graphCompiles(compiled.issues)).toBe(true);
	});

	it("emits NOTHING for a feature id the map does not carry", () => {
		const compiled = compileMissionGraph(
			paired("COVERAGE", "feat-unknown"),
			{ "feat-other": "zone" },
		);
		expect(errorsOn(compiled)).toHaveLength(0);
		expect(warningsOn(compiled)).toHaveLength(0);
	});

	it("warns, never errors, when a NAVIGATE action targets a zone", () => {
		// It will be planned to a single point derived from the polygon, which
		// is probably not what was meant — but it is a mission that moves.
		const compiled = compileMissionGraph(
			paired("NAVIGATE", "feat-zone-north"),
			{ "feat-zone-north": "zone", "feat-objective": "waypoint" },
		);
		expect(graphCompiles(compiled.issues)).toBe(true);
		expect(warningsOn(compiled)).toHaveLength(1);
		expect(warningsOn(compiled)[0]?.message).toContain(
			"navigates to a zone",
		);
	});

	it("says nothing about a NAVIGATE action over a waypoint", () => {
		const compiled = compileMissionGraph(paired("NAVIGATE", "feat-wp-1"), {
			"feat-wp-1": "waypoint",
			"feat-objective": "waypoint",
		});
		expect(errorsOn(compiled)).toHaveLength(0);
		expect(warningsOn(compiled)).toHaveLength(0);
	});

	it("says nothing about a HOLD, MARK or NEUTRALISE action", () => {
		for (const action of ["HOLD", "MARK", "NEUTRALISE"] as const) {
			const compiled = compileMissionGraph(
				paired(action, "feat-zone-north"),
				{ "feat-zone-north": "zone", "feat-objective": "zone" },
			);
			expect(errorsOn(compiled)).toHaveLength(0);
			expect(warningsOn(compiled)).toHaveLength(0);
		}
	});

	it("leaves the target scenario clean", () => {
		const compiled = compileMissionGraph(
			targetScenario(),
			TARGET_FEATURE_TYPES,
		);
		expect(graphCompiles(editorOnly(compiled.issues))).toBe(true);
	});

	it("does not read the NEXT step's asset as this action's", () => {
		// NAVIGATE -> wp -> COVERAGE -> zone: the zone belongs to the COVERAGE
		// step. Walking through the next action made NAVIGATE "navigate to a
		// zone".
		const graph: MissionGraph = {
			version: 1,
			nodes: [
				node("a", "agent", { agent_id: "robot-a" }),
				node("act", "action", { action: "NAVIGATE" }),
				node("wp", "asset", { feature_id: "feat-wp-1" }),
				node("sweep", "action", { action: "COVERAGE" }),
				node("zone", "asset", { feature_id: "feat-zone-north" }),
			],
			edges: [
				edge("a", "act"),
				edge("act", "wp"),
				edge("wp", "sweep"),
				edge("sweep", "zone"),
			],
		};
		const compiled = compileMissionGraph(graph, {
			"feat-wp-1": "waypoint",
			"feat-zone-north": "zone",
		});
		expect(warningsOn(compiled)).toHaveLength(0);
	});
});

describe("what the fog's current executor cannot run is refused before submit", () => {
	// The fog runs one action, with no gate, per mission until its program
	// executor exists; everything past that is NOT_EXECUTABLE_YET.
	const stopGap = (compiled: CompiledMissionGraph) =>
		compiled.issues.filter((issue) => issue.code === "NOT_EXECUTABLE_YET");
	const types = { "feat-zone-north": "zone", "feat-wp-1": "waypoint" };

	it("accepts one agent, one action, its asset", () => {
		const compiled = compileMissionGraph(
			{
				version: 1,
				nodes: [
					node("a", "agent", { agent_id: "robot-a" }),
					node("go", "action", { action: "NAVIGATE" }),
					node("wp", "asset", { feature_id: "feat-wp-1" }),
				],
				edges: [edge("a", "go"), edge("go", "wp")],
			},
			types,
		);
		expect(compiled.issues).toEqual([]);
	});

	it("accepts a team wired into ONE action (the planner splits the work)", () => {
		const compiled = compileMissionGraph(
			{
				version: 1,
				nodes: [
					node("a", "agent", { agent_id: "robot-a" }),
					node("b", "agent", { agent_id: "robot-b" }),
					node("sweep", "action", { action: "COVERAGE" }),
					node("zone", "asset", { feature_id: "feat-zone-north" }),
				],
				edges: [
					edge("a", "sweep"),
					edge("b", "sweep"),
					edge("sweep", "zone"),
				],
			},
			types,
		);
		expect(stopGap(compiled)).toEqual([]);
		expect(graphCompiles(compiled.issues)).toBe(true);
	});

	it("refuses the operator's two-branch graph for its condition only", () => {
		// The screenshot of 2026-09-23: Es -> NAVIGATE -> Open field, and
		// Ge -> When(elapsed >= 30 s) -> NAVIGATE -> Open field.
		const compiled = compileMissionGraph(
			{
				version: 1,
				nodes: [
					node("es", "agent", { agent_id: "robot-a" }),
					node("ge", "agent", { agent_id: "robot-b" }),
					node("go-es", "action", { action: "NAVIGATE" }),
					node("when", "condition", {
						condition: {
							op: "ElapsedSeconds",
							threshold: 30,
							negate: false,
						},
					}),
					node("go-ge", "action", { action: "NAVIGATE" }),
					node("field", "asset", { feature_id: "feat-zone-north" }),
				],
				edges: [
					edge("es", "go-es"),
					edge("go-es", "field"),
					edge("ge", "when"),
					edge("when", "go-ge"),
					edge("go-ge", "field"),
				],
			},
			types,
		);
		// Two chains of one step each run (step 3a); the condition does not.
		const on = stopGap(compiled)
			.map((issue) => issue.nodeId)
			.sort();
		expect(on).toEqual(["when"]);
		expect(graphCompiles(compiled.issues)).toBe(false);
	});

	it("refuses HOLD, MARK and NEUTRALISE", () => {
		for (const action of ["HOLD", "MARK", "NEUTRALISE"] as const) {
			const compiled = compileMissionGraph({
				version: 1,
				nodes: [
					node("a", "agent", { agent_id: "robot-a" }),
					node("act", "action", { action }),
					node("wp", "asset", { feature_id: "feat-wp-1" }),
				],
				edges: [edge("a", "act"), edge("act", "wp")],
			});
			expect(fogCodes(compiled.issues)).toEqual([
				["ACTION_NOT_EXECUTABLE", "act"],
			]);
		}
	});
});

describe("agent nodes are added and removed by one shared pure mutator", () => {
	/** A graph carrying one agent node for `robot-a`, plus an asset it works. */
	function withRobotA(): MissionGraph {
		return {
			version: 1,
			nodes: [
				node("agent-1", "agent", { agent_id: "robot-a" }),
				node("asset", "asset", { feature_id: "feat-wp-1" }),
			],
			edges: [edge("agent-1", "asset")],
		};
	}

	it("answers whether the graph already has the agent", () => {
		expect(hasAgentNode(withRobotA(), "robot-a")).toBe(true);
		expect(hasAgentNode(withRobotA(), "robot-b")).toBe(false);
		expect(hasAgentNode(withRobotA(), "")).toBe(false);
		// An asset node is not an agent node, whatever it is called.
		expect(hasAgentNode(withRobotA(), "asset")).toBe(false);
	});

	it("adds an agent node with a label, a unique id and a free position", () => {
		const graph = withRobotA();
		const next = addAgentNode(graph, "robot-b", "Husky 2");
		expect(next).not.toBe(graph);
		const added = next.nodes.find((n) => n.agent_id === "robot-b");
		expect(added?.kind).toBe("agent");
		expect(added?.label).toBe("Husky 2");
		// Ids are minted the same way by both callers, so they cannot collide
		// — `normalizeGraph` drops a duplicate id outright, which would make
		// the second node simply never appear.
		expect(new Set(next.nodes.map((n) => n.id)).size).toBe(
			next.nodes.length,
		);
		// Staggered, so a node added from the map does not land on top of one
		// that is already there.
		expect(
			next.nodes.some(
				(n) =>
					n.id !== added?.id &&
					n.position.x === added?.position.x &&
					n.position.y === added?.position.y,
			),
		).toBe(false);
		expect(normalizeGraph(next).nodes).toHaveLength(3);
	});

	it("captions a node with the agent id when no label is given", () => {
		const added = addAgentNode(emptyMissionGraph(), "robot-b").nodes[0];
		expect(added?.label).toBe("robot-b");
		// A blank label is a placeholder, not a caption.
		expect(
			addAgentNode(emptyMissionGraph(), "robot-b", "   ").nodes[0]?.label,
		).toBe("robot-b");
	});

	it("returns the SAME graph when the agent is already there", () => {
		// The callers feed `useSyncExternalStore`, which compares snapshots by
		// identity: a fresh identity for a no-op is a render that schedules
		// another render.
		const graph = withRobotA();
		expect(addAgentNode(graph, "robot-a")).toBe(graph);
		expect(addAgentNode(graph, "robot-a", "Renamed")).toBe(graph);
		// A blank agent_id is dropped by `normalizeGraph`, so adding one would
		// only produce an agent node the compiler reports as unselected.
		expect(addAgentNode(graph, "   ")).toBe(graph);
	});

	it("returns the SAME graph when removing an agent that is not there", () => {
		const graph = withRobotA();
		expect(removeAgentNode(graph, "robot-b")).toBe(graph);
		expect(removeAgentNode(graph, "")).toBe(graph);
	});

	it("strips every incident edge with the node it removes", () => {
		// The invariant `deleteNode` and `normalizeGraph` both maintain: a
		// dangling edge is the one shape that reliably breaks a renderer.
		const graph: MissionGraph = {
			version: 1,
			nodes: [
				node("agent-1", "agent", { agent_id: "robot-a" }),
				node("act", "action", { action: "NAVIGATE" }),
				node("asset", "asset", { feature_id: "feat-wp-1" }),
			],
			edges: [
				edge("agent-1", "act"),
				edge("act", "asset"),
				edge("act", "agent-1", "data"),
			],
		};
		const next = removeAgentNode(graph, "robot-a");
		expect(next.nodes.map((n) => n.id)).toEqual(["act", "asset"]);
		// Both directions: the edge INTO the removed node goes too.
		expect(next.edges.map((e) => e.id)).toEqual(["exec-act-asset"]);
		// And normalizing changes nothing, because nothing dangles.
		expect(normalizeGraph(next).edges).toHaveLength(1);
	});

	it("removes EVERY node for the agent, not just the first", () => {
		// Nothing stops the same agent being added twice from two surfaces,
		// and leaving one behind makes the toggle read as having done nothing.
		const graph: MissionGraph = {
			version: 1,
			nodes: [
				node("agent-1", "agent", { agent_id: "robot-a" }),
				node("agent-2", "agent", { agent_id: "robot-a" }),
				node("agent-3", "agent", { agent_id: "robot-b" }),
			],
			edges: [],
		};
		const next = removeAgentNode(graph, "robot-a");
		expect(next.nodes.map((n) => n.id)).toEqual(["agent-3"]);
		expect(hasAgentNode(next, "robot-a")).toBe(false);
	});

	it("toggles both ways", () => {
		const graph = withRobotA();
		const off = toggleAgentNode(graph, "robot-a");
		expect(hasAgentNode(off, "robot-a")).toBe(false);
		const on = toggleAgentNode(off, "robot-a", "Husky 1");
		expect(hasAgentNode(on, "robot-a")).toBe(true);
		expect(on.nodes.find((n) => n.agent_id === "robot-a")?.label).toBe(
			"Husky 1",
		);
		// An unusable id changes nothing, in either direction.
		expect(toggleAgentNode(graph, "  ")).toBe(graph);
	});

	it("produces a graph the compiler allocates", () => {
		// The whole point of the mutator: a click on an agent marker has to
		// end up in `MissionConfig.vehicles`.
		const graph = addAgentNode(
			{
				version: 1,
				nodes: [node("asset", "asset", { feature_id: "feat-wp-1" })],
				edges: [],
			},
			"robot-b",
			"Husky 2",
		);
		expect(compileMissionGraph(graph).vehicles).toEqual(["robot-b"]);
	});

	it("mints ids that are unique and prefixed", () => {
		const ids = new Set(
			Array.from({ length: 200 }, () => freshGraphId("agent")),
		);
		expect(ids.size).toBe(200);
		for (const id of ids) expect(id.startsWith("agent-")).toBe(true);
	});

	it("staggers four positions to a row", () => {
		// Reused from the editor, so a node added from the map lands where a
		// node added from the toolbar would have.
		const positions = Array.from({ length: 5 }, (_, n) =>
			nextNodePosition({
				version: 1,
				nodes: Array.from({ length: n }, (__, i) =>
					node(`n-${i}`, "action", { action: "HOLD" }),
				),
				edges: [],
			}),
		);
		expect(positions[0]).toEqual({ x: 40, y: 40 });
		expect(positions[3]).toEqual({ x: 40 + 3 * 190, y: 40 });
		expect(positions[4]).toEqual({ x: 40, y: 150 });
	});
});
