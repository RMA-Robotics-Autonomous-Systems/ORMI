/**
 * Tests for the transform system - edge-table model, namespacing, races, chain resolution.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
	transformStore,
	transformSourcesAtom,
	transformFrameCountAtom,
	transformVersionAtom,
	processTFMessage,
	clearTransformsFromDatasource,
	clearAllTransforms,
	getTransformTable,
	type TFMessage,
} from "../transform-atoms";
import { findTransformChain } from "../utils";

/** Namespaced table key for a datasource + raw frame name. */
function K(source: string, frame: string): string {
	return `${source}::${frame}`;
}

/** Build a one-transform message helper. */
function tf(
	frameId: string,
	childId: string,
	pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
): TFMessage {
	return {
		transforms: [
			{
				header: { frame_id: frameId },
				child_frame_id: childId,
				transform: {
					translation: pos,
					rotation: { x: 0, y: 0, z: 0, w: 1 },
				},
			},
		],
	};
}

/** Multi-transform message helper. */
function tfs(...pairs: [string, string][]): TFMessage {
	return {
		transforms: pairs.map(([frame_id, child_frame_id]) => ({
			header: { frame_id },
			child_frame_id,
			transform: {
				translation: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
			},
		})),
	};
}

describe("Transform Atoms - Basic Functionality", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("creates a namespaced edge (no phantom parent)", () => {
		processTFMessage("ds1", tf("map", "odom", { x: 1, y: 2, z: 3 }));

		const table = getTransformTable();
		expect(table.size).toBe(1);
		expect(table.has(K("ds1", "map"))).toBe(false);

		const odom = table.get(K("ds1", "odom"));
		expect(odom?.frameId).toBe(K("ds1", "odom"));
		expect(odom?.rawFrameId).toBe("odom");
		expect(odom?.parentId).toBe(K("ds1", "map"));
	});

	test("handles hierarchical chains", () => {
		processTFMessage("ds1", tfs(["map", "odom"], ["odom", "base_link"]));

		const table = getTransformTable();
		expect(table.get(K("ds1", "odom"))?.parentId).toBe(K("ds1", "map"));
		expect(table.get(K("ds1", "base_link"))?.parentId).toBe(
			K("ds1", "odom"),
		);
	});

	test("tracks datasource contributions", () => {
		processTFMessage("datasource-1", tf("map", "odom"));
		processTFMessage("datasource-2", tf("map", "odom"));

		const sources = transformStore.get(transformSourcesAtom);
		expect(sources.size).toBe(2);
		expect(sources.has("datasource-1")).toBe(true);
		expect(sources.has("datasource-2")).toBe(true);
	});

	test("counts frames (edges)", () => {
		processTFMessage("ds1", tfs(["map", "odom"], ["odom", "base_link"]));
		expect(transformStore.get(transformFrameCountAtom)).toBe(2);
	});

	test("tags each edge with its source and keeps the raw name", () => {
		processTFMessage("dsX", tf("map", "odom"));
		const edge = getTransformTable().get(K("dsX", "odom"));
		expect(edge?.source).toBe("dsX");
		expect(edge?.rawFrameId).toBe("odom");
	});

	test("captures stamp and isStatic", () => {
		processTFMessage(
			"ds",
			{
				transforms: [
					{
						header: {
							frame_id: "map",
							stamp: { sec: 5, nsec: 500_000_000 },
						},
						child_frame_id: "odom",
						transform: {
							translation: { x: 0, y: 0, z: 0 },
							rotation: { x: 0, y: 0, z: 0, w: 1 },
						},
					},
				],
			},
			{ isStatic: true },
		);

		const edge = getTransformTable().get(K("ds", "odom"));
		expect(edge?.stamp).toBeCloseTo(5.5, 6);
		expect(edge?.isStatic).toBe(true);
		expect(edge?.receivedAt).toBeGreaterThan(0);
	});

	test("flags parentObserved per edge", () => {
		processTFMessage("ds", tfs(["map", "odom"], ["odom", "base_link"]));
		const table = getTransformTable();
		expect(table.get(K("ds", "odom"))?.parentObserved).toBe(false);
		expect(table.get(K("ds", "base_link"))?.parentObserved).toBe(true);
	});
});

describe("Transform Atoms - Namespacing (multi-source)", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("two sources with identical frame names do not collide", () => {
		processTFMessage("robotA", tf("map", "odom", { x: 1, y: 0, z: 0 }));
		processTFMessage("robotB", tf("map", "odom", { x: 9, y: 0, z: 0 }));

		const table = getTransformTable();
		expect(table.size).toBe(2);
		expect(table.get(K("robotA", "odom"))?.transform.position.x).toBe(1);
		expect(table.get(K("robotB", "odom"))?.transform.position.x).toBe(9);
	});

	test("clearing one source leaves the other intact", () => {
		processTFMessage("robotA", tf("map", "odom"));
		processTFMessage("robotB", tf("map", "odom"));

		clearTransformsFromDatasource("robotA");

		const table = getTransformTable();
		expect(table.has(K("robotA", "odom"))).toBe(false);
		expect(table.has(K("robotB", "odom"))).toBe(true);
	});
});

describe("Transform Atoms - Re-parenting & cycles", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("re-parents a frame when its parent changes", () => {
		processTFMessage("ds", tf("A", "C", { x: 1, y: 0, z: 0 }));
		expect(getTransformTable().get(K("ds", "C"))?.parentId).toBe(
			K("ds", "A"),
		);

		processTFMessage("ds", tf("B", "C", { x: 2, y: 0, z: 0 }));
		const c = getTransformTable().get(K("ds", "C"));
		expect(c?.parentId).toBe(K("ds", "B"));
		expect(c?.transform.position.x).toBe(2);
		expect(getTransformTable().size).toBe(1);
	});

	test("rejects a direct cycle (A->B then B->A)", () => {
		processTFMessage("ds", tf("A", "B"));
		processTFMessage("ds", tf("B", "A"));

		const table = getTransformTable();
		expect(table.size).toBe(1);
		expect(table.has(K("ds", "B"))).toBe(true);
		expect(table.has(K("ds", "A"))).toBe(false);
	});

	test("rejects a deep cycle (A->B->C then C->A)", () => {
		processTFMessage("ds", tfs(["A", "B"], ["B", "C"]));
		processTFMessage("ds", tf("C", "A"));

		const table = getTransformTable();
		expect(table.size).toBe(2);
		expect(table.has(K("ds", "A"))).toBe(false);
	});

	test("rejects self-loops", () => {
		processTFMessage("ds", tf("A", "A"));
		expect(getTransformTable().size).toBe(0);
	});
});

describe("Transform Atoms - Reactivity (version coalescing)", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("a sub-epsilon update does not bump the version", () => {
		processTFMessage("ds", tf("map", "odom", { x: 1, y: 2, z: 3 }));
		const v1 = transformStore.get(transformVersionAtom);

		processTFMessage(
			"ds",
			tf("map", "odom", { x: 1.00001, y: 2.00001, z: 3.00001 }),
		);
		expect(transformStore.get(transformVersionAtom)).toBe(v1);
	});

	test("a material change bumps the version", () => {
		processTFMessage("ds", tf("map", "odom", { x: 1, y: 0, z: 0 }));
		const v1 = transformStore.get(transformVersionAtom);

		processTFMessage("ds", tf("map", "odom", { x: 5, y: 0, z: 0 }));
		expect(transformStore.get(transformVersionAtom)).not.toBe(v1);
		expect(
			getTransformTable().get(K("ds", "odom"))?.transform.position.x,
		).toBe(5);
	});
});

describe("Transform Atoms - Race Conditions", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("handles out-of-order transform messages", () => {
		processTFMessage("ds", tf("odom", "base_link", { x: 1, y: 0, z: 0 }));

		let table = getTransformTable();
		expect(table.size).toBe(1);
		expect(table.get(K("ds", "base_link"))?.parentId).toBe(K("ds", "odom"));

		processTFMessage("ds", tf("map", "odom", { x: 0, y: 1, z: 0 }));

		table = getTransformTable();
		expect(table.get(K("ds", "odom"))?.parentId).toBe(K("ds", "map"));
		expect(table.get(K("ds", "base_link"))?.parentId).toBe(K("ds", "odom"));
	});

	test("updates a transform without creating duplicates", () => {
		processTFMessage("ds", tf("map", "odom", { x: 0, y: 0, z: 0 }));
		processTFMessage("ds", tf("map", "odom", { x: 1, y: 2, z: 3 }));

		const table = getTransformTable();
		expect(table.size).toBe(1);
		const odom = table.get(K("ds", "odom"));
		expect(odom?.transform.position.x).toBe(1);
		expect(odom?.transform.position.z).toBe(3);
	});

	test("handles concurrent updates from multiple datasources", () => {
		processTFMessage("ds1", tf("map", "robot1", { x: 1, y: 0, z: 0 }));
		processTFMessage("ds2", tf("map", "robot2", { x: 0, y: 1, z: 0 }));

		const table = getTransformTable();
		expect(table.size).toBe(2);
		expect(table.get(K("ds1", "robot1"))?.source).toBe("ds1");
		expect(table.get(K("ds2", "robot2"))?.source).toBe("ds2");
	});
});

describe("Transform Atoms - Cleanup", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("clears a datasource's dynamic edges", () => {
		processTFMessage("ds1", tf("map", "odom"));
		expect(getTransformTable().size).toBe(1);

		clearTransformsFromDatasource("ds1");
		expect(getTransformTable().size).toBe(0);
	});

	test("retains static edges on a default (dynamic-only) clear", () => {
		processTFMessage("ds1", tf("map", "odom"), { isStatic: false });
		processTFMessage("ds1", tf("base", "laser"), { isStatic: true });

		clearTransformsFromDatasource("ds1");
		expect(getTransformTable().has(K("ds1", "odom"))).toBe(false);
		expect(getTransformTable().has(K("ds1", "laser"))).toBe(true);

		clearTransformsFromDatasource("ds1", { includeStatic: true });
		expect(getTransformTable().has(K("ds1", "laser"))).toBe(false);
	});

	test("handles clearing a non-existent datasource gracefully", () => {
		processTFMessage("ds1", tf("map", "odom"));
		clearTransformsFromDatasource("ds2");
		expect(getTransformTable().size).toBe(1);
	});

	test("clears everything with clearAllTransforms", () => {
		processTFMessage("ds1", tf("map", "odom"));
		processTFMessage("ds2", tf("world", "robot"));

		clearAllTransforms();
		expect(getTransformTable().size).toBe(0);
		expect(transformStore.get(transformSourcesAtom).size).toBe(0);
	});
});

describe("Transform Atoms - Edge Cases", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("handles empty transform array", () => {
		processTFMessage("ds1", { transforms: [] });
		expect(getTransformTable().size).toBe(0);
	});

	test("handles null/undefined message", () => {
		processTFMessage("ds1", null as unknown as TFMessage);
		processTFMessage("ds1", undefined as unknown as TFMessage);
		expect(getTransformTable().size).toBe(0);
	});

	test("handles malformed transform message", () => {
		const message = {
			transforms: [{ header: {}, transform: {} }],
		} as unknown as TFMessage;
		expect(() => processTFMessage("ds1", message)).not.toThrow();
		expect(getTransformTable().size).toBe(0);
	});

	test("handles multiple disconnected root frames", () => {
		processTFMessage("ds", tfs(["map", "robot1"], ["world", "robot2"]));

		const table = getTransformTable();
		expect(table.size).toBe(2);
		expect(table.has(K("ds", "robot1"))).toBe(true);
		expect(table.has(K("ds", "robot2"))).toBe(true);
	});
});

describe("Transform Atoms - Chain resolution", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("findTransformChain resolves legacy bare endpoints against the namespaced table", () => {
		processTFMessage("ds", {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 1, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
				{
					header: { frame_id: "odom" },
					child_frame_id: "base_link",
					transform: {
						translation: { x: 0, y: 1, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		});

		const table = getTransformTable();
		// Bare names (as saved in legacy configs) resolve to the single matching tree.
		expect(findTransformChain(table, "base_link", "map")?.length).toBe(2);
		expect(findTransformChain(table, "map", "base_link")?.length).toBe(2);
		// Namespaced names too.
		expect(
			findTransformChain(table, K("ds", "base_link"), K("ds", "map"))
				?.length,
		).toBe(2);
		// Identity + missing.
		expect(findTransformChain(table, "map", "map")).toEqual([]);
		expect(findTransformChain(table, "base_link", "nope")).toBeNull();
	});

	test("ambiguous bare endpoints (two sources) do not resolve", () => {
		processTFMessage("robotA", tf("map", "base_link"));
		processTFMessage("robotB", tf("map", "base_link"));
		const table = getTransformTable();
		expect(findTransformChain(table, "base_link", "map")).toBeNull();
		expect(
			findTransformChain(
				table,
				K("robotA", "base_link"),
				K("robotA", "map"),
			),
		).not.toBeNull();
	});
});

describe("Transform Atoms - Performance", () => {
	beforeEach(() => {
		clearAllTransforms();
	});

	test("handles a large transform tree efficiently", () => {
		const transforms = [];
		for (let i = 0; i < 100; i++) {
			transforms.push({
				header: { frame_id: i === 0 ? "root" : `frame_${i - 1}` },
				child_frame_id: `frame_${i}`,
				transform: {
					translation: { x: i, y: 0, z: 0 },
					rotation: { x: 0, y: 0, z: 0, w: 1 },
				},
			});
		}

		const start = performance.now();
		processTFMessage("ds1", { transforms });
		expect(performance.now() - start).toBeLessThan(100);
		expect(transformStore.get(transformFrameCountAtom)).toBe(100);
	});
});
