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
	canvasWithInspector,
	DEFAULT_NODE_SIZE,
	estimateNodeSize,
	flowBoxToScreenRect,
	placeNewNode,
	revealDelta,
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

describe("revealing a node added after the selected one", () => {
	// The canvas left of the open inspector, in screen pixels.
	const canvas = { left: 100, top: 50, right: 1330, bottom: 950 };
	const MARGIN = 16;

	it("keeps every node of a 10-node chain on screen as it grows", () => {
		// The usability test (2026-11-12): nodes 2 to 10 were 0% visible, the
		// last one ~4,400 px past the canvas, because the reveal looked the new
		// node up in the DOM before React Flow had mounted it.
		let viewport = { x: 0, y: 0, zoom: 1 };
		const nodes: CanvasBox[] = [{ x: 400, y: 300, width: W, height: H }];
		for (let i = 1; i < 10; i++) {
			const after = nodes[nodes.length - 1] as CanvasBox;
			const at = placeNewNode({
				viewCentre: { x: 0, y: 0 },
				after,
				occupied: nodes,
			});
			const box = { x: at.x, y: at.y, width: W, height: H };
			nodes.push(box);
			const rect = flowBoxToScreenRect(box, viewport, canvas);
			const { dx, dy } = revealDelta(rect, canvas, MARGIN);
			viewport = { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
			const shown = flowBoxToScreenRect(box, viewport, canvas);
			expect(shown.left).toBeGreaterThanOrEqual(canvas.left);
			expect(shown.right).toBeLessThanOrEqual(canvas.right);
			expect(shown.top).toBeGreaterThanOrEqual(canvas.top);
			expect(shown.bottom).toBeLessThanOrEqual(canvas.bottom);
		}
	});

	it("maps a flow box to screen through the viewport and the canvas", () => {
		expect(
			flowBoxToScreenRect(
				{ x: 10, y: 20, width: 100, height: 50 },
				{ x: 5, y: -5, zoom: 2 },
				{ left: 100, top: 50 },
			),
		).toEqual({ left: 125, top: 85, right: 325, bottom: 185 });
	});

	it("does not move the view for a node already in view", () => {
		const rect = flowBoxToScreenRect(
			{ x: 200, y: 200, width: W, height: H },
			{ x: 0, y: 0, zoom: 1 },
			canvas,
		);
		expect(revealDelta(rect, canvas, MARGIN)).toEqual({ dx: 0, dy: 0 });
	});
});

describe("a node added to an empty graph lands clear of the details panel", () => {
	// Measured in a browser: the graph panel is x 300..1157, the details panel
	// opening in the same click leaves 300..901, and the view is at zoom 2.
	const canvas = { left: 300, top: 100, right: 1157, bottom: 900 };
	const viewport = { x: -248.891, y: -433.5, zoom: 2 };
	const NAVIGATE = { width: 256, height: 123 };
	const miniMap = { left: 686, top: 735, right: 886, bottom: 885 };
	const visible = canvasWithInspector(canvas, false, 256);
	const toFlow = (sx: number, sy: number) => ({
		x: (sx - canvas.left - viewport.x) / viewport.zoom,
		y: (sy - canvas.top - viewport.y) / viewport.zoom,
	});
	const centre = toFlow(
		(visible.left + visible.right) / 2,
		(visible.top + visible.bottom) / 2,
	);
	const screen = (at: { x: number; y: number }, size: typeof NAVIGATE) =>
		flowBoxToScreenRect({ ...at, ...size }, viewport, canvas);
	const inside = (r: ReturnType<typeof screen>) =>
		r.left >= visible.left &&
		r.right <= visible.right &&
		r.top >= visible.top &&
		r.bottom <= visible.bottom &&
		!(
			r.left < miniMap.right &&
			miniMap.left < r.right &&
			r.top < miniMap.bottom &&
			miniMap.top < r.bottom
		);

	it("judged at the assumed size, a real Navigate is wrongly seen as visible", () => {
		const at = placeNewNode({
			viewCentre: centre,
			after: null,
			occupied: [],
		});
		// The reveal used to judge the assumed 180 x 80 box: no pan...
		expect(
			revealDelta(screen(at, DEFAULT_NODE_SIZE), visible, 16, [miniMap]),
		).toEqual({ dx: 0, dy: 0 });
		// ...while the node as drawn runs under the details panel.
		expect(inside(screen(at, NAVIGATE))).toBe(false);
	});

	it("judged at its measured size, the reveal brings it wholly into view", () => {
		const at = placeNewNode({
			viewCentre: centre,
			after: null,
			occupied: [],
		});
		const drawn = screen(at, NAVIGATE);
		const { dx, dy } = revealDelta(drawn, visible, 16, [miniMap]);
		expect(dx).not.toBe(0);
		expect(
			inside({
				left: drawn.left + dx,
				right: drawn.right + dx,
				top: drawn.top + dy,
				bottom: drawn.bottom + dy,
			}),
		).toBe(true);
	});

	it("placed at the size of a Navigate already measured, it needs no pan", () => {
		const size = estimateNodeSize(
			{ kind: "action", action: "NAVIGATE" },
			[
				{
					id: "nav",
					kind: "action",
					action: "NAVIGATE",
					label: "Navigate",
					position: { x: 0, y: 0 },
				},
			],
			(id) => (id === "nav" ? NAVIGATE : undefined),
		);
		expect(size).toEqual(NAVIGATE);
		const at = placeNewNode({
			viewCentre: centre,
			after: null,
			occupied: [],
			size,
		});
		const drawn = screen(at, NAVIGATE);
		expect(inside(drawn)).toBe(true);
		expect(revealDelta(drawn, visible, 16, [miniMap])).toEqual({
			dx: 0,
			dy: 0,
		});
	});
});

describe("estimateNodeSize", () => {
	const node = (
		id: string,
		kind: MissionGraphNode["kind"],
		action?: MissionGraphNode["action"],
	): MissionGraphNode => ({
		id,
		kind,
		label: id,
		position: { x: 0, y: 0 },
		...(action ? { action } : {}),
	});

	it("assumes the default size on an empty canvas", () => {
		expect(
			estimateNodeSize({ kind: "agent" }, [], () => undefined),
		).toEqual({ width: W, height: H });
	});

	it("takes the first measured node of the same kind and action", () => {
		const sizes: Record<string, { width: number; height: number }> = {
			cov: { width: 300, height: 140 },
			nav2: { width: 256, height: 123 },
		};
		const nodes = [
			node("cov", "action", "COVERAGE"),
			node("nav1", "action", "NAVIGATE"),
			node("nav2", "action", "NAVIGATE"),
		];
		expect(
			estimateNodeSize(
				{ kind: "action", action: "NAVIGATE" },
				nodes,
				(id) => sizes[id],
			),
		).toEqual({ width: 256, height: 123 });
	});

	it("ignores a node of another kind", () => {
		expect(
			estimateNodeSize({ kind: "wait" }, [node("a", "agent")], () => ({
				width: 500,
				height: 500,
			})),
		).toEqual({ width: W, height: H });
	});
});
