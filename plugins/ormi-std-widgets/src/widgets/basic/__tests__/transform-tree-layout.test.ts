import { describe, test, expect } from "bun:test";
import {
	SUPER_ROOT,
	buildStratifyNodes,
	computeTreeLayout,
	filterByTree,
	topologySignature,
	translationMagnitude,
	type TfNodeInput,
} from "../transform-tree-layout";

function node(
	frameId: string,
	parentId: string,
	extra: Partial<TfNodeInput> = {},
): TfNodeInput {
	return {
		frameId,
		parentId,
		rawFrameId: frameId,
		source: "ds",
		isStatic: false,
		parentObserved: false,
		receivedAt: 0,
		magnitude: 0,
		...extra,
	};
}

describe("translationMagnitude", () => {
	test("euclidean length", () => {
		expect(translationMagnitude({ x: 3, y: 4, z: 0 })).toBeCloseTo(5, 6);
	});
});

describe("topologySignature", () => {
	test("stable across input order and pose changes", () => {
		const a = [node("odom", "map"), node("base", "odom")];
		const b = [
			node("base", "odom", { magnitude: 99, receivedAt: 1234 }),
			node("odom", "map", { magnitude: 7 }),
		];
		expect(topologySignature(a)).toBe(topologySignature(b));
	});

	test("changes on re-parent and on treeId", () => {
		const a = [node("base", "odom")];
		const b = [node("base", "map")];
		expect(topologySignature(a)).not.toBe(topologySignature(b));
		expect(topologySignature(a, "x")).not.toBe(topologySignature(a, "y"));
	});
});

describe("buildStratifyNodes", () => {
	test("adds a virtual root per unobserved parent and one super-root", () => {
		const nodes = buildStratifyNodes([
			node("odom", "map"),
			node("base", "odom"),
		]);
		const byId = new Map(nodes.map((n) => [n.id, n]));

		// super-root present and parentless
		expect(byId.get(SUPER_ROOT)?.parentId).toBeNull();
		// "map" is an inferred virtual root under the super-root
		expect(byId.get("map")?.isVirtual).toBe(true);
		expect(byId.get("map")?.parentId).toBe(SUPER_ROOT);
		// real frames keep their real parents
		expect(byId.get("odom")?.parentId).toBe("map");
		expect(byId.get("base")?.parentId).toBe("odom");
	});

	test("dedupes a shared unobserved parent into one virtual root", () => {
		const nodes = buildStratifyNodes([
			node("robot1", "map"),
			node("robot2", "map"),
		]);
		expect(nodes.filter((n) => n.id === "map").length).toBe(1);
	});
});

describe("filterByTree", () => {
	const inputs = [
		node("odom", "map"),
		node("base", "odom"),
		node("drone", "world"),
	];

	test("scopes by a frame id to its whole component", () => {
		const scoped = filterByTree(inputs, "base");
		expect(scoped.map((n) => n.frameId).sort()).toEqual(["base", "odom"]);
	});

	test("scopes by an unobserved root name", () => {
		const scoped = filterByTree(inputs, "world");
		expect(scoped.map((n) => n.frameId)).toEqual(["drone"]);
	});

	test("falls back to all inputs when treeId matches nothing", () => {
		expect(filterByTree(inputs, "nope").length).toBe(3);
		expect(filterByTree(inputs, "").length).toBe(3);
	});
});

describe("computeTreeLayout", () => {
	test("lays out a multi-root forest under one super-root without throwing", () => {
		const layout = computeTreeLayout(
			buildStratifyNodes([
				node("odom", "map"),
				node("base", "odom"),
				node("drone", "world"),
			]),
		);
		expect(layout.ok).toBe(true);
		expect(layout.root).not.toBeNull();
		const ids = layout.root!.descendants().map((d) => d.data.id);
		expect(ids).toContain("map");
		expect(ids).toContain("world");
		expect(ids).toContain(SUPER_ROOT);
	});

	test("degrades (ok:false) instead of throwing on an invalid (no-root cycle) input", () => {
		const layout = computeTreeLayout([
			{ id: "a", parentId: "b", isVirtual: false },
			{ id: "b", parentId: "a", isVirtual: false },
		]);
		expect(layout.ok).toBe(false);
		expect(layout.root).toBeNull();
	});
});
