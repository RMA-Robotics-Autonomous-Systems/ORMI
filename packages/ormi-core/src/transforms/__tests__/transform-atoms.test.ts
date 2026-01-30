/**
 * Tests for transform system - race conditions and edge cases
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
	transformStore,
	transformTreesAtom,
	transformSourcesAtom,
	transformFrameCountAtom,
	processTFMessage,
	clearTransformsFromDatasource,
	clearAllTransforms,
	type TFMessage,
} from "../transform-atoms";
import type { TransformTree } from "../../types";

describe("Transform Atoms - Basic Functionality", () => {
	beforeEach(() => {
		// Clear the shared store state before each test
		transformStore.set(transformTreesAtom, new Map());
		transformStore.set(transformSourcesAtom, new Set());
	});

	test("should create a simple transform tree", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 1, y: 2, z: 3 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(1);
		expect(trees.has("map")).toBe(true);

		const mapFrame = trees.get("map");
		expect(mapFrame?.id).toBe("map");
		expect(mapFrame?.children.size).toBe(1);
		expect(mapFrame?.children.has("odom")).toBe(true);
	});

	test("should handle hierarchical transform chains", () => {
		const message: TFMessage = {
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
				{
					header: { frame_id: "base_link" },
					child_frame_id: "camera",
					transform: {
						translation: { x: 0, y: 0, z: 1 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(1);

		const mapFrame = trees.get("map");
		expect(mapFrame?.id).toBe("map");

		const odomFrame = mapFrame?.children.get("odom");
		expect(odomFrame?.id).toBe("odom");

		const baseLinkFrame = odomFrame?.children.get("base_link");
		expect(baseLinkFrame?.id).toBe("base_link");

		const cameraFrame = baseLinkFrame?.children.get("camera");
		expect(cameraFrame?.id).toBe("camera");
	});

	test("should track datasource contributions", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);
		processTFMessage("datasource-2", message);

		const sources = transformStore.get(transformSourcesAtom);
		expect(sources.size).toBe(2);
		expect(sources.has("datasource-1")).toBe(true);
		expect(sources.has("datasource-2")).toBe(true);
	});

	test("should count frames correctly", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
				{
					header: { frame_id: "odom" },
					child_frame_id: "base_link",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);

		const count = transformStore.get(transformFrameCountAtom);
		expect(count).toBe(3); // map, odom, base_link
	});
});

describe("Transform Atoms - Race Conditions", () => {
	beforeEach(() => {
		transformStore.set(transformTreesAtom, new Map());
		transformStore.set(transformSourcesAtom, new Set());
	});

	test("should handle out-of-order transform messages", () => {
		// Send child before parent
		const childFirst: TFMessage = {
			transforms: [
				{
					header: { frame_id: "odom" },
					child_frame_id: "base_link",
					transform: {
						translation: { x: 1, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", childFirst);

		let trees = transformStore.get(transformTreesAtom);
		// Should create both as root initially
		expect(trees.size).toBe(1);
		expect(trees.has("odom")).toBe(true);

		// Now send parent
		const parentAfter: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 1, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", parentAfter);

		trees = transformStore.get(transformTreesAtom);
		// Should consolidate into single tree with map as root
		expect(trees.size).toBe(1);
		expect(trees.has("map")).toBe(true);

		const mapFrame = trees.get("map");
		expect(mapFrame?.children.has("odom")).toBe(true);

		const odomFrame = mapFrame?.children.get("odom");
		expect(odomFrame?.children.has("base_link")).toBe(true);
	});

	test("should update transform without creating duplicates", () => {
		const message1: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message1);

		const message2: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 1, y: 2, z: 3 }, // Changed
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message2);

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(1);

		const mapFrame = trees.get("map");
		expect(mapFrame?.children.size).toBe(1);

		const odomFrame = mapFrame?.children.get("odom");
		expect(odomFrame?.transform.position.x).toBe(1);
		expect(odomFrame?.transform.position.y).toBe(2);
		expect(odomFrame?.transform.position.z).toBe(3);
	});

	test("should not update if transform hasn't changed (epsilon check)", () => {
		const message1: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 1.0, y: 2.0, z: 3.0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message1);

		const treesRef1 = transformStore.get(transformTreesAtom);

		// Send same transform with tiny difference (below epsilon)
		const message2: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 1.00001, y: 2.00001, z: 3.00001 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message2);

		const treesRef2 = transformStore.get(transformTreesAtom);

		// Reference should be same (no update triggered)
		expect(treesRef1).toBe(treesRef2);
	});

	test("should handle concurrent updates from multiple datasources", () => {
		const message1: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "robot1",
					transform: {
						translation: { x: 1, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		const message2: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "robot2",
					transform: {
						translation: { x: 0, y: 1, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		// Simulate concurrent updates
		processTFMessage("datasource-1", message1);
		processTFMessage("datasource-2", message2);

		const trees = transformStore.get(transformTreesAtom);
		const mapFrame = trees.get("map");

		expect(mapFrame?.children.size).toBe(2);
		expect(mapFrame?.children.has("robot1")).toBe(true);
		expect(mapFrame?.children.has("robot2")).toBe(true);
	});
});

describe("Transform Atoms - Cleanup", () => {
	beforeEach(() => {
		transformStore.set(transformTreesAtom, new Map());
		transformStore.set(transformSourcesAtom, new Set());
	});

	test("should clear all transforms when last datasource disconnects", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);

		let trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(1);

		clearTransformsFromDatasource("datasource-1");

		trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(0);
	});

	test("should NOT clear transforms if other datasources are active", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);
		processTFMessage("datasource-2", message);

		clearTransformsFromDatasource("datasource-1");

		const trees = transformStore.get(transformTreesAtom);
		const sources = transformStore.get(transformSourcesAtom);

		// Transforms should still exist
		expect(trees.size).toBe(1);
		expect(sources.size).toBe(1);
		expect(sources.has("datasource-2")).toBe(true);
	});

	test("should handle clearing non-existent datasource gracefully", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);

		// Clear non-existent datasource
		clearTransformsFromDatasource("datasource-2");

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(1); // Should still have transforms
	});

	test("should clear all transforms with clearAllTransforms", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);
		processTFMessage("datasource-2", message);

		clearAllTransforms();

		const trees = transformStore.get(transformTreesAtom);
		const sources = transformStore.get(transformSourcesAtom);

		expect(trees.size).toBe(0);
		expect(sources.size).toBe(0);
	});
});

describe("Transform Atoms - Edge Cases", () => {
	beforeEach(() => {
		transformStore.set(transformTreesAtom, new Map());
		transformStore.set(transformSourcesAtom, new Set());
	});

	test("should handle empty transform array", () => {
		const message: TFMessage = {
			transforms: [],
		};

		processTFMessage("datasource-1", message);

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(0);
	});

	test("should handle null/undefined message", () => {
		processTFMessage("datasource-1", null as any);
		processTFMessage("datasource-1", undefined as any);

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(0);
	});

	test("should handle malformed transform message", () => {
		const message = {
			transforms: [
				{
					// Missing required fields
					header: {},
					transform: {},
				},
			],
		} as any;

		// Should not throw
		expect(() => {
			processTFMessage("datasource-1", message);
		}).not.toThrow();
	});

	test("should handle circular references (child becomes parent)", () => {
		const message1: TFMessage = {
			transforms: [
				{
					header: { frame_id: "A" },
					child_frame_id: "B",
					transform: {
						translation: { x: 1, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message1);

		// This would create a circular reference if not handled
		const message2: TFMessage = {
			transforms: [
				{
					header: { frame_id: "B" },
					child_frame_id: "A",
					transform: {
						translation: { x: -1, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		// Should handle gracefully (typically last write wins in TF)
		processTFMessage("datasource-1", message2);

		const trees = transformStore.get(transformTreesAtom);
		// Should still have valid tree structure
		expect(trees.size).toBeGreaterThan(0);
	});

	test("should handle multiple root frames (disconnected trees)", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "robot1",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
				{
					header: { frame_id: "world" },
					child_frame_id: "robot2",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		processTFMessage("datasource-1", message);

		const trees = transformStore.get(transformTreesAtom);
		expect(trees.size).toBe(2); // Two separate root frames
		expect(trees.has("map")).toBe(true);
		expect(trees.has("world")).toBe(true);
	});
});

describe("Transform Atoms - Performance", () => {
	beforeEach(() => {
		transformStore.set(transformTreesAtom, new Map());
		transformStore.set(transformSourcesAtom, new Set());
	});

	test("should handle large transform tree efficiently", () => {
		// Create a tree with 100 frames
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

		const message: TFMessage = { transforms };

		const startTime = performance.now();
		processTFMessage("datasource-1", message);
		const duration = performance.now() - startTime;

		// Should complete in reasonable time (< 100ms for 100 frames)
		expect(duration).toBeLessThan(100);

		const count = transformStore.get(transformFrameCountAtom);
		expect(count).toBe(101); // root + 100 frames
	});

	test("should handle rapid updates efficiently", () => {
		const message: TFMessage = {
			transforms: [
				{
					header: { frame_id: "map" },
					child_frame_id: "odom",
					transform: {
						translation: { x: 0, y: 0, z: 0 },
						rotation: { x: 0, y: 0, z: 0, w: 1 },
					},
				},
			],
		};

		const startTime = performance.now();

		// Simulate 1000 rapid updates
		for (let i = 0; i < 1000; i++) {
			message.transforms[0]!.transform.translation.x = i;
			processTFMessage("datasource-1", message);
		}

		const duration = performance.now() - startTime;

		// Should handle 1000 updates in reasonable time (< 1s)
		expect(duration).toBeLessThan(1000);
	});
});
