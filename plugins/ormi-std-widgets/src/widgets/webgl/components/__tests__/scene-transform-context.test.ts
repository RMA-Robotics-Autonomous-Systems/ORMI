import { describe, test, expect } from "bun:test";
import {
	findTransformChain,
	namespaceFrame,
} from "@workspace/ormi-core/transforms";
import type { TransformEdge, TransformTable } from "@workspace/ormi-core/types";
import {
	buildAnchoredTable,
	qualifyFrame,
	sceneWorldKey,
} from "../scene-transform-context";
import type { SceneAnchor } from "../../types/scene-3d-types";

function edge(source: string, raw: string, parentRaw: string): TransformEdge {
	return {
		frameId: namespaceFrame(source, raw),
		rawFrameId: raw,
		parentId: namespaceFrame(source, parentRaw),
		source,
		transform: {
			position: { x: 0, y: 0, z: 0, w: 1 },
			rotation: { x: 0, y: 0, z: 0, w: 1 },
			convention: "THREE",
		},
		stamp: undefined,
		receivedAt: 0,
		isStatic: false,
		parentObserved: false,
	};
}

function table(...edges: TransformEdge[]): TransformTable {
	return new Map(edges.map((e) => [e.frameId, e]));
}

const anchor = (source: string, x: number): SceneAnchor => ({
	source,
	rootFrame: "map",
	position: { x, y: 0, z: 0 },
	rotation: { x: 0, y: 0, z: 0, w: 1 },
});

describe("buildAnchoredTable", () => {
	test("returns the same table when there are no anchors", () => {
		const t = table(edge("A", "odom", "map"));
		expect(buildAnchoredTable(t, undefined, "world")).toBe(t);
		expect(buildAnchoredTable(t, [], "world")).toBe(t);
	});

	test("adds an anchor edge connecting world → ${source}::${rootFrame}", () => {
		const t = table(edge("A", "odom", "map"));
		const eff = buildAnchoredTable(t, [anchor("A", 5)], "world");

		const anchorEdge = eff.get(namespaceFrame("A", "map"));
		expect(anchorEdge).toBeDefined();
		expect(anchorEdge?.parentId).toBe(sceneWorldKey("world"));
		expect(anchorEdge?.isStatic).toBe(true);
		expect(anchorEdge?.transform.position.x).toBe(5);
		// core edge untouched
		expect(eff.get(namespaceFrame("A", "odom"))).toBe(
			t.get(namespaceFrame("A", "odom")),
		);
	});

	test("co-locates two sources under the shared world (via chain resolution)", () => {
		const t = table(edge("A", "odom", "map"), edge("B", "odom", "map"));
		const eff = buildAnchoredTable(
			t,
			[anchor("A", 0), anchor("B", 10)],
			"world",
		);

		// Each source's map is anchored under the shared scene world.
		expect(eff.get(namespaceFrame("A", "map"))?.parentId).toBe(
			sceneWorldKey("world"),
		);
		expect(eff.get(namespaceFrame("B", "map"))?.parentId).toBe(
			sceneWorldKey("world"),
		);

		// Both sources resolve a chain to the shared world (anchoring the layers).
		expect(
			findTransformChain(eff, namespaceFrame("A", "map"), "world"),
		).not.toBeNull();
		expect(
			findTransformChain(eff, namespaceFrame("B", "odom"), "world"),
		).not.toBeNull();
		// And across sources via the world.
		expect(
			findTransformChain(
				eff,
				namespaceFrame("A", "odom"),
				namespaceFrame("B", "odom"),
			),
		).not.toBeNull();
	});

	test("does not overwrite an observed edge", () => {
		// "A::map" is actually observed (published as a child of "A::earth").
		const observed = edge("A", "map", "earth");
		const t = table(observed, edge("A", "odom", "map"));
		const eff = buildAnchoredTable(t, [anchor("A", 7)], "world");
		expect(eff.get(namespaceFrame("A", "map"))).toBe(observed);
	});
});

describe("buildAnchoredTable autoAnchor", () => {
	test("anchors every source root to the world origin (no manual anchors)", () => {
		const t = table(edge("A", "odom", "map"), edge("B", "odom", "map"));
		const eff = buildAnchoredTable(t, undefined, "world", true);

		expect(eff.get(namespaceFrame("A", "map"))?.parentId).toBe(
			sceneWorldKey("world"),
		);
		expect(eff.get(namespaceFrame("B", "map"))?.parentId).toBe(
			sceneWorldKey("world"),
		);
		// Identity placement → both roots coincide at the world origin.
		expect(eff.get(namespaceFrame("A", "map"))?.transform.position.x).toBe(
			0,
		);
		// Layers can resolve to the shared world.
		expect(
			findTransformChain(eff, namespaceFrame("A", "odom"), "world"),
		).not.toBeNull();
	});

	test("is a no-op when autoAnchor is off and there are no manual anchors", () => {
		const t = table(edge("A", "odom", "map"));
		expect(buildAnchoredTable(t, undefined, "world", false)).toBe(t);
	});

	test("does not overwrite an observed root; anchors the real root instead", () => {
		const observed = edge("A", "map", "earth"); // A::map is observed
		const t = table(observed, edge("A", "odom", "map"));
		const eff = buildAnchoredTable(t, undefined, "world", true);

		expect(eff.get(namespaceFrame("A", "map"))).toBe(observed);
		// A::earth is the actual unobserved root → it gets anchored.
		expect(eff.get(namespaceFrame("A", "earth"))?.parentId).toBe(
			sceneWorldKey("world"),
		);
	});

	test("a manual anchor takes precedence over auto-anchor for the same root", () => {
		const t = table(edge("A", "odom", "map"));
		const eff = buildAnchoredTable(t, [anchor("A", 5)], "world", true);
		// Manual pose (x=5), not the auto identity.
		expect(eff.get(namespaceFrame("A", "map"))?.transform.position.x).toBe(
			5,
		);
	});
});

describe("buildAnchoredTable no-op identity", () => {
	test("autoAnchor on an empty table returns the input by reference", () => {
		const empty = table();
		expect(buildAnchoredTable(empty, undefined, "world", true)).toBe(empty);
	});

	test("autoAnchor returns the input by reference when every root already hangs off the world", () => {
		// A snapshot whose only root is already parented to the scene world key.
		const rooted: TransformEdge = {
			...edge("A", "map", "ignored"),
			parentId: sceneWorldKey("world"),
		};
		const t = table(rooted, edge("A", "odom", "map"));
		expect(buildAnchoredTable(t, undefined, "world", true)).toBe(t);
	});

	test("manual anchors return the input by reference when every target is already observed", () => {
		const observed = edge("A", "map", "earth");
		const t = table(observed, edge("A", "odom", "map"));
		// "A::map" is observed, so the anchor adds nothing; "A::earth" stays
		// unanchored because autoAnchor is off.
		expect(buildAnchoredTable(t, [anchor("A", 7)], "world", false)).toBe(t);
	});

	test("still copies when an anchor edge is actually added", () => {
		const t = table(edge("A", "odom", "map"));
		const eff = buildAnchoredTable(t, undefined, "world", true);
		expect(eff).not.toBe(t);
		// Input table is left untouched.
		expect(t.has(namespaceFrame("A", "map"))).toBe(false);
		expect(eff.has(namespaceFrame("A", "map"))).toBe(true);
	});
});

describe("qualifyFrame", () => {
	test("namespaces a bare frame by datasource", () => {
		expect(qualifyFrame("A", "base_link")).toBe(
			namespaceFrame("A", "base_link"),
		);
	});

	test("passes through already-namespaced, empty, or undatasourced refs", () => {
		expect(qualifyFrame("A", namespaceFrame("B", "x"))).toBe(
			namespaceFrame("B", "x"),
		);
		expect(qualifyFrame(undefined, "base_link")).toBe("base_link");
		expect(qualifyFrame("A", "")).toBe("");
	});
});
