/**
 * A node added from the palette appears where the operator is looking, and
 * after the selected node it is wired into that node's chain.
 *
 * It used to go to a grid counted from the canvas origin by node count, so
 * after a pan it was off screen and the operator had to hunt for it.
 */
import { describe, expect, it } from "bun:test";

import {
	addNodeAfter,
	DEFAULT_NODE_SIZE,
	placeNewNode,
	type CanvasBox,
} from "./mission-graph-editor-helpers";
import {
	addAgentNode,
	emptyMissionGraph,
	type MissionGraph,
	type MissionGraphNode,
} from "./mission-graph";

const W = DEFAULT_NODE_SIZE.width;
const H = DEFAULT_NODE_SIZE.height;

function overlaps(a: CanvasBox, b: CanvasBox): boolean {
	return (
		a.x < b.x + b.width &&
		b.x < a.x + a.width &&
		a.y < b.y + b.height &&
		b.y < a.y + a.height
	);
}

describe("placeNewNode", () => {
	it("centres the node on the visible canvas when nothing is selected", () => {
		// The operator has panned far from the origin: the view centre is there.
		const at = placeNewNode({
			viewCentre: { x: 5000, y: -3000 },
			after: null,
			occupied: [],
		});
		expect(at).toEqual({ x: 5000 - W / 2, y: -3000 - H / 2 });
	});

	it("goes to the right of the selected node, top-aligned", () => {
		const selected = { x: 100, y: 200, width: 220, height: 90 };
		const at = placeNewNode({
			viewCentre: { x: 0, y: 0 },
			after: selected,
			occupied: [selected],
		});
		expect(at.y).toBe(200);
		expect(at.x).toBeGreaterThan(selected.x + selected.width);
	});

	it("is nudged off a node already sitting at the view centre", () => {
		const blocking = { x: -W / 2, y: -H / 2, width: W, height: H };
		const at = placeNewNode({
			viewCentre: { x: 0, y: 0 },
			after: null,
			occupied: [blocking],
		});
		expect(overlaps({ ...at, width: W, height: H }, blocking)).toBe(false);
		// Nudged, not thrown far away: within a couple of node heights.
		expect(Math.abs(at.y - blocking.y)).toBeLessThanOrEqual(3 * H);
	});

	it("never overlaps when the spots below are taken too", () => {
		const occupied: CanvasBox[] = [0, 1, 2].map((i) => ({
			x: -W / 2,
			y: -H / 2 + i * (H + 40),
			width: W,
			height: H,
		}));
		const at = placeNewNode({
			viewCentre: { x: 0, y: 0 },
			after: null,
			occupied,
		});
		for (const box of occupied) {
			expect(overlaps({ ...at, width: W, height: H }, box)).toBe(false);
		}
	});
});

describe("addNodeAfter", () => {
	function withAgent(): { graph: MissionGraph; agentId: string } {
		const graph = addAgentNode(emptyMissionGraph(), "robot-1", "Robot 1");
		return { graph, agentId: graph.nodes[0]!.id };
	}

	function navigate(id: string): MissionGraphNode {
		return {
			id,
			kind: "action",
			action: "NAVIGATE",
			label: "Navigate",
			position: { x: 0, y: 0 },
		};
	}

	it("wires a Navigate added after a robot as that robot's first step", () => {
		const { graph, agentId } = withAgent();
		const next = addNodeAfter(graph, agentId, navigate("nav-1"));
		expect(next).not.toBeNull();
		expect(next!.nodes.map((n) => n.id)).toContain("nav-1");
		expect(next!.edges).toContainEqual(
			expect.objectContaining({
				source: agentId,
				source_port: "agent",
				target: "nav-1",
				target_port: "agent",
			}),
		);
	});

	it("extends the chain when added after a step", () => {
		const { graph, agentId } = withAgent();
		const one = addNodeAfter(graph, agentId, navigate("nav-1"))!;
		const two = addNodeAfter(one, "nav-1", navigate("nav-2"));
		expect(two).not.toBeNull();
		expect(two!.edges).toContainEqual(
			expect.objectContaining({ source: "nav-1", target: "nav-2" }),
		);
	});

	it("keeps the new node's own fields and position", () => {
		const { graph, agentId } = withAgent();
		const node = {
			...navigate("nav-1"),
			label: "To the gate",
			position: { x: 640, y: 120 },
		};
		const next = addNodeAfter(graph, agentId, node)!;
		const added = next.nodes.find((n) => n.id === "nav-1");
		expect(added?.label).toBe("To the gate");
		expect(added?.position).toEqual({ x: 640, y: 120 });
		expect(added?.action).toBe("NAVIGATE");
	});

	it("returns null when no output of the selected node takes the kind", () => {
		const { graph, agentId } = withAgent();
		// A robot has no output a condition node plugs into.
		const condition: MissionGraphNode = {
			id: "cond-1",
			kind: "condition",
			label: "Condition",
			position: { x: 0, y: 0 },
		};
		expect(addNodeAfter(graph, agentId, condition)).toBeNull();
	});

	it("returns null for an unknown selected node", () => {
		const { graph } = withAgent();
		expect(addNodeAfter(graph, "missing", navigate("nav-1"))).toBeNull();
	});
});

describe("addAgentNode", () => {
	it("takes the position the editor chose", () => {
		const graph = addAgentNode(emptyMissionGraph(), "robot-1", "Robot 1", {
			x: 900,
			y: 400,
		});
		expect(graph.nodes[0]?.position).toEqual({ x: 900, y: 400 });
	});
});
