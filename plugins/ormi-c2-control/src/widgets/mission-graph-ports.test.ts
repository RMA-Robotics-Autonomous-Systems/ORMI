import { describe, expect, it } from "bun:test";

import type { MissionGraph, MissionGraphNode } from "./mission-graph";
import {
	applyDrop,
	dropChoices,
	dropOrphanedEdges,
	wireGraph,
} from "./mission-graph-editor-helpers";
import { compileProgram } from "./mission-program";
import {
	assetPortType,
	connectionPlan,
	nodePorts,
	portsFit,
} from "./mission-graph-ports";

/**
 * The typed ports: which output may be wired into which input, and what a
 * drag does to the graph. The fog's side of the same table is pinned by the
 * shared fixtures (mission-program.test.ts); this is the editor's stricter
 * side, which knows each map feature's type.
 */

function node(
	id: string,
	kind: MissionGraphNode["kind"],
	extra: Partial<MissionGraphNode> = {},
): MissionGraphNode {
	return { id, kind, label: id, position: { x: 0, y: 0 }, ...extra };
}

const TYPES = { "feat-wp": "waypoint", "feat-zone": "zone", "feat-cue": "cue" };

/** Es and Ge, a navigate, a sweep, a Wait, two conditions, two assets. */
function graph(): MissionGraph {
	return {
		version: 2,
		nodes: [
			node("es", "agent", { agent_id: "robot-es" }),
			node("ge", "agent", { agent_id: "robot-ge" }),
			node("go", "action", { action: "NAVIGATE" }),
			node("sweep", "action", { action: "COVERAGE" }),
			node("wait", "wait", { mode: "all" }),
			node("late", "condition", {
				condition: {
					op: "ElapsedSeconds",
					threshold: 30,
					negate: false,
				},
			}),
			node("held", "condition", {
				condition: { op: "AgentHolding", threshold: 0, negate: false },
			}),
			node("wp", "asset", { feature_id: "feat-wp" }),
			node("zone", "asset", { feature_id: "feat-zone" }),
		],
		edges: [],
	};
}

const plan = (g: MissionGraph, from: [string, string], to: [string, string]) =>
	connectionPlan(
		g.nodes,
		g.edges,
		{ node: from[0], port: from[1] },
		{ node: to[0], port: to[1] },
		TYPES,
	);

/** Apply a wire, failing the test when it is refused. */
function wire(
	g: MissionGraph,
	from: [string, string],
	to: [string, string],
): MissionGraph {
	const result = wireGraph(
		g,
		{ node: from[0], port: from[1] },
		{ node: to[0], port: to[1] },
		TYPES,
	);
	if ("reason" in result) throw new Error(result.reason);
	return result.graph;
}

describe("every node says what it takes and gives", () => {
	it("types an action's target by the action", () => {
		expect(
			nodePorts(node("a", "action", { action: "NAVIGATE" })).inputs.map(
				(p) => [p.id, p.type],
			),
		).toEqual([
			["in", "flow"],
			["target", "waypoint"],
		]);
		expect(
			nodePorts(node("a", "action", { action: "COVERAGE" })).inputs[1]
				?.type,
		).toBe("zone");
	});

	it("types an asset's output by its map feature; a cue is somewhere to go", () => {
		expect(assetPortType("zone")).toBe("zone");
		expect(assetPortType("waypoint")).toBe("waypoint");
		expect(assetPortType("cue")).toBe("waypoint");
		expect(assetPortType(undefined)).toBe("asset");
		expect(
			nodePorts(node("z", "asset", { feature_id: "feat-zone" }), TYPES)
				.outputs[0]?.type,
		).toBe("zone");
	});

	it("gives a condition an agent input only when it watches an agent", () => {
		const [, , , , , late, held] = graph().nodes;
		expect(nodePorts(late!).inputs).toEqual([]);
		expect(nodePorts(held!).inputs.map((p) => p.id)).toEqual(["agent"]);
	});

	it("lets an untyped asset fit either place, and nothing else cross", () => {
		expect(portsFit("asset", "zone")).toBe(true);
		expect(portsFit("waypoint", "asset")).toBe(true);
		expect(portsFit("waypoint", "zone")).toBe(false);
		expect(portsFit("bool", "flow")).toBe(false);
		expect(portsFit("agent", "waypoint")).toBe(false);
	});
});

describe("a drag is refused with a reason, or wired", () => {
	it("refuses a zone into a NAVIGATE and a waypoint into a COVERAGE", () => {
		const g = graph();
		const zoneIntoGo = plan(g, ["zone", "value"], ["go", "target"]);
		expect(zoneIntoGo.ok).toBe(false);
		if (!zoneIntoGo.ok) expect(zoneIntoGo.reason).toContain("zone");
		expect(plan(g, ["wp", "value"], ["sweep", "target"]).ok).toBe(false);
		expect(plan(g, ["wp", "value"], ["go", "target"]).ok).toBe(true);
	});

	it("refuses a true/false into the chain, and a node into itself", () => {
		const g = graph();
		expect(plan(g, ["late", "value"], ["go", "in"]).ok).toBe(false);
		expect(plan(g, ["go", "next"], ["go", "in"]).ok).toBe(false);
	});

	it("re-wires a single port instead of refusing it", () => {
		let g = wire(graph(), ["wp", "value"], ["go", "target"]);
		const second = node("wp2", "asset", { feature_id: "feat-cue" });
		g = { ...g, nodes: [...g.nodes, second] };
		g = wire(g, ["wp2", "value"], ["go", "target"]);
		expect(
			g.edges
				.filter((e) => e.target === "go" && e.target_port === "target")
				.map((e) => e.source),
		).toEqual(["wp2"]);
	});

	it("moves a step's 'then' rather than forking the chain", () => {
		let g = wire(graph(), ["es", "next"], ["go", "in"]);
		g = wire(g, ["go", "next"], ["sweep", "in"]);
		g = wire(g, ["go", "next"], ["wait", "in"]);
		expect(
			g.edges.filter((e) => e.source === "go").map((e) => e.target),
		).toEqual(["wait"]);
	});

	it("lets a team share a first step, but never a step and an agent", () => {
		let g = wire(graph(), ["es", "next"], ["sweep", "in"]);
		g = wire(g, ["ge", "next"], ["sweep", "in"]);
		expect(g.edges.filter((e) => e.target === "sweep")).toHaveLength(2);
		// A step after another step cannot also start a chain, and vice versa.
		expect(plan(g, ["go", "next"], ["sweep", "in"]).ok).toBe(false);
		const chained = wire(graph(), ["go", "next"], ["sweep", "in"]);
		expect(plan(chained, ["es", "next"], ["sweep", "in"]).ok).toBe(false);
	});

	it("lets many conditions into one Wait, and one condition into many Waits", () => {
		let g = wire(graph(), ["late", "value"], ["wait", "when"]);
		g = wire(g, ["held", "value"], ["wait", "when"]);
		expect(g.edges.filter((e) => e.target === "wait")).toHaveLength(2);
		expect(plan(g, ["late", "value"], ["wait", "when"]).ok).toBe(false); // already wired
	});

	it("replaces the target picked on the node when an asset is wired in", () => {
		const g = graph();
		g.nodes = g.nodes.map((n) =>
			n.id === "go" ? { ...n, feature_id: "feat-cue" } : n,
		);
		const wired = wire(g, ["wp", "value"], ["go", "target"]);
		expect(
			wired.nodes.find((n) => n.id === "go")?.feature_id,
		).toBeUndefined();
	});

	it("replaces the agent picked on a condition when an agent is wired in", () => {
		const g = graph();
		g.nodes = g.nodes.map((n) =>
			n.id === "held" && n.condition
				? { ...n, condition: { ...n.condition, key: "robot-ge" } }
				: n,
		);
		const wired = wire(g, ["es", "agent"], ["held", "agent"]);
		expect(
			wired.nodes.find((n) => n.id === "held")?.condition?.key,
		).toBeUndefined();
	});

	it("drops the wire into a port the node no longer has", () => {
		let g = wire(graph(), ["es", "agent"], ["held", "agent"]);
		g = {
			...g,
			nodes: g.nodes.map((n) =>
				n.id === "held"
					? {
							...n,
							condition: {
								op: "ElapsedSeconds",
								threshold: 5,
								negate: false,
							},
						}
					: n,
			),
		};
		expect(dropOrphanedEdges(g, "held").edges).toEqual([]);
		// Nothing to drop: the same graph back.
		const kept = wire(graph(), ["wp", "value"], ["go", "target"]);
		expect(dropOrphanedEdges(kept, "go")).toBe(kept);
	});
});

describe("dropping a wire on empty canvas offers what fits it", () => {
	it("offers steps after a 'then', and the matching action for a place", () => {
		expect(dropChoices("source", "flow").map((c) => c.label)).toEqual([
			"Navigate",
			"Coverage",
			"Wait",
		]);
		expect(dropChoices("source", "zone").map((c) => c.node.action)).toEqual(
			["COVERAGE"],
		);
		expect(dropChoices("source", "waypoint")[0]?.port).toBe("target");
	});

	it("offers conditions the fog evaluates for a Wait's input", () => {
		const choices = dropChoices("target", "bool");
		expect(choices.map((c) => c.node.condition?.op)).toEqual([
			"ElapsedSeconds",
			"ContactsFound",
			"ItemsFound",
			"AgentHolding",
		]);
		expect(choices.every((c) => c.port === "value")).toBe(true);
	});

	it("offers an asset for a target, and no agent anywhere", () => {
		expect(dropChoices("target", "zone").map((c) => c.node.kind)).toEqual([
			"asset",
		]);
		for (const side of ["source", "target"] as const) {
			for (const type of [
				"flow",
				"waypoint",
				"zone",
				"asset",
				"agent",
				"bool",
			] as const) {
				expect(
					dropChoices(side, type).some(
						(c) => c.node.kind === "agent",
					),
				).toBe(false);
			}
		}
	});

	it("only offers choices whose port fits the wire", () => {
		for (const side of ["source", "target"] as const) {
			for (const type of [
				"flow",
				"waypoint",
				"zone",
				"asset",
				"agent",
				"bool",
			] as const) {
				for (const choice of dropChoices(side, type)) {
					const ports = nodePorts(choice.node);
					const port = (
						side === "source" ? ports.inputs : ports.outputs
					).find((p) => p.id === choice.port);
					expect(port).toBeDefined();
					expect(
						side === "source"
							? portsFit(type, port!.type)
							: portsFit(port!.type, type),
					).toBe(true);
				}
			}
		}
	});
});

describe("a step dropped on empty canvas goes INTO the chain", () => {
	const AT = { x: 0, y: 0 };
	/** Es → go → sweep, each with its target. */
	function chain(): MissionGraph {
		let g = graph();
		g = wire(g, ["es", "next"], ["go", "in"]);
		g = wire(g, ["go", "next"], ["sweep", "in"]);
		g = wire(g, ["wp", "value"], ["go", "target"]);
		return wire(g, ["zone", "value"], ["sweep", "target"]);
	}
	const WAIT = dropChoices("source", "flow").find((c) => c.label === "Wait")!;
	const NAV_BEFORE = dropChoices("target", "flow").find(
		(c) => c.label === "Navigate",
	)!;
	/** The chain the fog would compile, as step and Wait ids in order. */
	const order = (g: MissionGraph) => {
		const out: string[] = [];
		let at = g.edges.find((e) => e.source === "es")?.target;
		while (at && !out.includes(at)) {
			out.push(at);
			at = g.edges.find(
				(e) => e.source === at && e.source_port === "next",
			)?.target;
		}
		return out;
	};

	it("after a step: go → new → sweep, nothing cut off", () => {
		const g = applyDrop(
			chain(),
			{ node: "go", port: "next", side: "source" },
			WAIT,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["go", "new", "sweep"]);
	});

	it("before a mid-chain step: go → new → sweep", () => {
		const g = applyDrop(
			chain(),
			{ node: "sweep", port: "in", side: "target" },
			NAV_BEFORE,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["go", "new", "sweep"]);
	});

	it("before a chain's first step: the agent starts at the new step", () => {
		const g = applyDrop(
			chain(),
			{ node: "go", port: "in", side: "target" },
			NAV_BEFORE,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["new", "go", "sweep"]);
	});

	it("after an agent that already has a chain: the new step leads it", () => {
		const g = applyDrop(
			chain(),
			{ node: "es", port: "next", side: "source" },
			WAIT,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["new", "go", "sweep"]);
	});

	it("keeps a team together when a step is put before its first step", () => {
		let g = wire(graph(), ["es", "next"], ["sweep", "in"]);
		g = wire(g, ["ge", "next"], ["sweep", "in"]);
		g = applyDrop(
			g,
			{ node: "sweep", port: "in", side: "target" },
			NAV_BEFORE,
			"new",
			AT,
		)!;
		expect(
			g.edges
				.filter((e) => e.target === "new")
				.map((e) => e.source)
				.sort(),
		).toEqual(["es", "ge"]);
		// No JOIN: the chain is still a straight line.
		const codes = compileProgram(
			g,
			new Set(["robot-es", "robot-ge"]),
		).errors.map((e) => e.code);
		expect(codes).not.toContain("JOIN");
	});

	it("creates nothing when the node the wire came from is gone", () => {
		const cond = dropChoices("target", "bool")[0]!;
		expect(
			applyDrop(
				graph(),
				{ node: "deleted", port: "when", side: "target" },
				cond,
				"n",
				AT,
			),
		).toBeNull();
	});

	it("wires a condition into the Wait it was dragged from", () => {
		const cond = dropChoices("target", "bool")[0]!;
		const g = applyDrop(
			graph(),
			{ node: "wait", port: "when", side: "target" },
			cond,
			"n",
			AT,
		)!;
		expect(
			g.edges.map((e) => [
				e.source,
				e.source_port,
				e.target,
				e.target_port,
			]),
		).toEqual([["n", "value", "wait", "when"]]);
	});
});
