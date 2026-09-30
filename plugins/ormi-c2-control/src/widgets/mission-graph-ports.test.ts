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
	PORT_TYPE_LABEL,
	withArticle,
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
		version: 3,
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
			node("on", "on_contact"),
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
			["agent", "agent"],
			["target", "waypoint"],
		]);
		expect(
			nodePorts(node("a", "action", { action: "COVERAGE" })).inputs[1]
				?.type,
		).toBe("zone");
	});

	it("hands the robot on, says when it is done, and a Coverage reports contacts", () => {
		const outs = (action: "NAVIGATE" | "COVERAGE") =>
			nodePorts(node("a", "action", { action })).outputs.map((p) => [
				p.id,
				p.type,
			]);
		expect(outs("NAVIGATE")).toEqual([
			["agent", "agent"],
			["done", "bool"],
		]);
		expect(outs("COVERAGE")).toEqual([
			["agent", "agent"],
			["done", "bool"],
			["contact", "event"],
		]);
		const on = nodePorts(node("o", "on_contact"));
		expect(on.inputs.map((p) => [p.id, p.type])).toEqual([
			["agent", "agent"],
			["event", "event"],
		]);
		expect(on.outputs.map((p) => [p.id, p.type])).toEqual([
			["agent", "agent"],
			["position", "waypoint"],
			["no_more", "agent"],
		]);
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

	it("gives a condition no input: it is a true/false, read by a Hold until", () => {
		const late = graph().nodes.find((n) => n.id === "late")!;
		expect(nodePorts(late).inputs).toEqual([]);
	});

	it("lets an untyped asset fit either place, and nothing else cross", () => {
		expect(portsFit("asset", "zone")).toBe(true);
		expect(portsFit("waypoint", "asset")).toBe(true);
		expect(portsFit("waypoint", "zone")).toBe(false);
		expect(portsFit("bool", "agent")).toBe(false);
		expect(portsFit("event", "bool")).toBe(false);
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
		expect(plan(g, ["late", "value"], ["go", "agent"]).ok).toBe(false);
		expect(plan(g, ["go", "agent"], ["go", "agent"]).ok).toBe(false);
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
		let g = wire(graph(), ["es", "agent"], ["go", "agent"]);
		g = wire(g, ["go", "agent"], ["sweep", "agent"]);
		g = wire(g, ["go", "agent"], ["wait", "agent"]);
		expect(
			g.edges.filter((e) => e.source === "go").map((e) => e.target),
		).toEqual(["wait"]);
	});

	it("lets a team share a first step, but never a step and an agent", () => {
		let g = wire(graph(), ["es", "agent"], ["sweep", "agent"]);
		g = wire(g, ["ge", "agent"], ["sweep", "agent"]);
		expect(g.edges.filter((e) => e.target === "sweep")).toHaveLength(2);
		// A step after another step cannot also start a chain, and vice versa.
		expect(plan(g, ["go", "agent"], ["sweep", "agent"]).ok).toBe(false);
		const chained = wire(graph(), ["go", "agent"], ["sweep", "agent"]);
		expect(plan(chained, ["es", "agent"], ["sweep", "agent"]).ok).toBe(
			false,
		);
	});

	it("lets a condition and a step's `done` into one Hold until", () => {
		let g = wire(graph(), ["late", "value"], ["wait", "when"]);
		g = wire(g, ["sweep", "done"], ["wait", "when"]);
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

	it("drops the wire into a port the node no longer has", () => {
		// A Coverage turned Navigate has no "on contact" any more.
		let g = wire(graph(), ["sweep", "contact"], ["on", "event"]);
		g = {
			...g,
			nodes: g.nodes.map((n) =>
				n.id === "sweep" ? { ...n, action: "NAVIGATE" as const } : n,
			),
		};
		expect(dropOrphanedEdges(g, "sweep").edges).toEqual([]);
		// Nothing to drop: the same graph back.
		const kept = wire(graph(), ["wp", "value"], ["go", "target"]);
		expect(dropOrphanedEdges(kept, "go")).toBe(kept);
	});
});

describe("dropping a wire on empty canvas offers what fits it", () => {
	it("offers steps after a 'then', and the matching action for a place", () => {
		expect(dropChoices("source", "agent").map((c) => c.label)).toEqual([
			"Navigate",
			"Coverage",
			"Hold until",
			"On contact",
		]);
		expect(dropChoices("source", "event").map((c) => c.node.kind)).toEqual([
			"on_contact",
		]);
		expect(dropChoices("source", "bool").map((c) => c.label)).toEqual([
			"Hold until",
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
		]);
		expect(choices.every((c) => c.port === "value")).toBe(true);
	});

	it("offers an asset for a target, and no agent anywhere", () => {
		expect(dropChoices("target", "zone").map((c) => c.node.kind)).toEqual([
			"asset",
		]);
		for (const side of ["source", "target"] as const) {
			for (const type of [
				"agent",
				"waypoint",
				"zone",
				"asset",
				"bool",
				"event",
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
				"agent",
				"waypoint",
				"zone",
				"asset",
				"bool",
				"event",
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
		g = wire(g, ["es", "agent"], ["go", "agent"]);
		g = wire(g, ["go", "agent"], ["sweep", "agent"]);
		g = wire(g, ["wp", "value"], ["go", "target"]);
		return wire(g, ["zone", "value"], ["sweep", "target"]);
	}
	const WAIT = dropChoices("source", "agent").find(
		(c) => c.label === "Hold until",
	)!;
	const NAV_BEFORE = dropChoices("target", "agent").find(
		(c) => c.label === "Navigate",
	)!;
	/** The chain the fog would compile, as step and Wait ids in order. */
	const order = (g: MissionGraph) => {
		const out: string[] = [];
		let at = g.edges.find((e) => e.source === "es")?.target;
		while (at && !out.includes(at)) {
			out.push(at);
			at = g.edges.find(
				(e) => e.source === at && e.source_port === "agent",
			)?.target;
		}
		return out;
	};

	it("after a step: go → new → sweep, nothing cut off", () => {
		const g = applyDrop(
			chain(),
			{ node: "go", port: "agent", side: "source" },
			WAIT,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["go", "new", "sweep"]);
	});

	it("before a mid-chain step: go → new → sweep", () => {
		const g = applyDrop(
			chain(),
			{ node: "sweep", port: "agent", side: "target" },
			NAV_BEFORE,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["go", "new", "sweep"]);
	});

	it("before a chain's first step: the agent starts at the new step", () => {
		const g = applyDrop(
			chain(),
			{ node: "go", port: "agent", side: "target" },
			NAV_BEFORE,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["new", "go", "sweep"]);
	});

	it("after an agent that already has a chain: the new step leads it", () => {
		const g = applyDrop(
			chain(),
			{ node: "es", port: "agent", side: "source" },
			WAIT,
			"new",
			AT,
		)!;
		expect(order(g)).toEqual(["new", "go", "sweep"]);
	});

	it("keeps a team together when a step is put before its first step", () => {
		let g = wire(graph(), ["es", "agent"], ["sweep", "agent"]);
		g = wire(g, ["ge", "agent"], ["sweep", "agent"]);
		g = applyDrop(
			g,
			{ node: "sweep", port: "agent", side: "target" },
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

	it("before an On contact node: the robot comes to the new step, the loop still comes back", () => {
		// ge → on; on.agent → go → back into on.
		let g = wire(graph(), ["ge", "agent"], ["on", "agent"]);
		g = wire(g, ["on", "agent"], ["go", "agent"]);
		g = wire(g, ["go", "agent"], ["on", "agent"]);
		g = applyDrop(
			g,
			{ node: "on", port: "agent", side: "target" },
			NAV_BEFORE,
			"new",
			AT,
		)!;
		const into = (id: string) =>
			g.edges
				.filter((e) => e.target === id && e.target_port === "agent")
				.map((e) => e.source)
				.sort();
		expect(into("new")).toEqual(["ge"]);
		expect(into("on")).toEqual(["go", "new"]);
	});

	it("after an On contact node's `no more`: the new step follows it", () => {
		let g = wire(graph(), ["ge", "agent"], ["on", "agent"]);
		g = wire(g, ["on", "no_more"], ["go", "agent"]);
		g = applyDrop(
			g,
			{ node: "on", port: "no_more", side: "source" },
			WAIT,
			"new",
			AT,
		)!;
		const edge = (source: string, port: string) =>
			g.edges.find((e) => e.source === source && e.source_port === port)
				?.target;
		expect(edge("on", "no_more")).toBe("new");
		expect(edge("new", "agent")).toBe("go");
	});

	it("an On contact node dropped into a chain goes on by `no more`, not into its loop", () => {
		const ON = dropChoices("source", "agent").find(
			(c) => c.label === "On contact",
		)!;
		const g = applyDrop(
			chain(),
			{ node: "go", port: "agent", side: "source" },
			ON,
			"new",
			AT,
		)!;
		const out = (id: string, port: string) =>
			g.edges.find((e) => e.source === id && e.source_port === port)
				?.target;
		expect(out("go", "agent")).toBe("new");
		expect(out("new", "no_more")).toBe("sweep");
		expect(out("new", "agent")).toBeUndefined();
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

describe("withArticle", () => {
	it("agrees with the label it is given", () => {
		expect(withArticle("agent")).toBe("an agent");
		expect(withArticle("asset")).toBe("an asset");
		expect(withArticle("event")).toBe("an event");
		expect(withArticle("waypoint")).toBe("a waypoint");
		expect(withArticle("zone")).toBe("a zone");
		expect(withArticle("true/false")).toBe("a true/false");
	});

	it("covers every port type, so a new one cannot ship the wrong article", () => {
		for (const label of Object.values(PORT_TYPE_LABEL)) {
			expect(
				withArticle(label).startsWith("a ") ||
					withArticle(label).startsWith("an "),
			).toBe(true);
		}
	});
});

describe("the refusal an operator reads mid-drag", () => {
	it('does not say "A agent"', () => {
		const nodes: MissionGraphNode[] = [
			{
				id: "a",
				kind: "agent",
				label: "Rover",
				agent_id: "r1",
				position: { x: 0, y: 0 },
			},
			{
				id: "n",
				kind: "action",
				label: "Navigate",
				action: "NAVIGATE",
				position: { x: 200, y: 0 },
			},
		];
		const plan = connectionPlan(
			nodes,
			[],
			{ node: "a", port: "agent" },
			{ node: "n", port: "target" },
		);
		expect(plan.ok).toBe(false);
		if (plan.ok) return;
		expect(plan.reason).toBe("An agent cannot go into a waypoint input.");
	});
});
