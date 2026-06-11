/**
 * Tests for findTransformChain - critical path-finding algorithm (table-native).
 * Focus: Correctness of transforms, not chain length.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { findTransformChain, applyTransformChain } from "../utils";
import type {
	CoordinateConvention,
	TransformEdge,
	TransformTable,
	Vector3,
} from "../../types";

/** Build a transform edge (a frame expressed in its parent). */
function edge(
	frameId: string,
	parentId: string,
	pos: { x: number; y: number; z: number },
	rot: { x: number; y: number; z: number; w: number } = {
		x: 0,
		y: 0,
		z: 0,
		w: 1,
	},
	convention: CoordinateConvention = "ROS",
): TransformEdge {
	return {
		frameId,
		rawFrameId: frameId,
		parentId,
		source: "ds",
		transform: { position: { ...pos, w: 0 }, rotation: rot, convention },
		stamp: undefined,
		receivedAt: 0,
		isStatic: false,
		parentObserved: true,
	};
}

function table(...edges: TransformEdge[]): TransformTable {
	return new Map(edges.map((e) => [e.frameId, e]));
}

describe("Transform Chain - Correctness Tests", () => {
	let trees: TransformTable;

	beforeEach(() => {
		// map (virtual root) -> odom -> base_link -> camera
		trees = table(
			edge("odom", "map", { x: 10, y: 5, z: 0 }),
			edge("base_link", "odom", { x: 2, y: 1, z: 0 }),
			edge("camera", "base_link", { x: 0.5, y: 0, z: 0.3 }),
		);
	});

	test("should correctly transform point from child to parent", () => {
		const chain = findTransformChain(trees, "camera", "base_link");
		expect(chain).not.toBeNull();
		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(0.5, 5);
		expect(p.y).toBeCloseTo(0, 5);
		expect(p.z).toBeCloseTo(0.3, 5);
	});

	test("should correctly transform point through multiple frames", () => {
		const chain = findTransformChain(trees, "camera", "map");
		expect(chain).not.toBeNull();
		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(12.5, 5);
		expect(p.y).toBeCloseTo(6, 5);
		expect(p.z).toBeCloseTo(0.3, 5);
	});

	test("should correctly invert transform (parent to child)", () => {
		const chain = findTransformChain(trees, "base_link", "camera");
		expect(chain).not.toBeNull();
		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(-0.5, 5);
		expect(p.y).toBeCloseTo(0, 5);
		expect(p.z).toBeCloseTo(-0.3, 5);
	});

	test("should handle sibling frame transformations correctly", () => {
		const withLidar = table(
			...Array.from(trees.values()),
			edge("lidar", "base_link", { x: 0.3, y: 0, z: 0.5 }),
		);
		const chain = findTransformChain(withLidar, "camera", "lidar");
		expect(chain).not.toBeNull();
		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(0.2, 5);
		expect(p.y).toBeCloseTo(0, 5);
		expect(p.z).toBeCloseTo(-0.2, 5);
	});

	test("should return empty chain for same frame (identity)", () => {
		const chain = findTransformChain(trees, "camera", "camera");
		expect(chain).not.toBeNull();
		expect(chain!.length).toBe(0);
		const p = applyTransformChain({ x: 1, y: 2, z: 3 }, chain!);
		expect(p.x).toBeCloseTo(1, 5);
		expect(p.y).toBeCloseTo(2, 5);
		expect(p.z).toBeCloseTo(3, 5);
	});

	test("should produce inverse results for opposite directions", () => {
		const start: Vector3 = { x: 1, y: 2, z: 3 };
		const forward = findTransformChain(trees, "camera", "map");
		const inMap = applyTransformChain(start, forward!);
		const reverse = findTransformChain(trees, "map", "camera");
		const back = applyTransformChain(inMap, reverse!);
		expect(back.x).toBeCloseTo(start.x, 5);
		expect(back.y).toBeCloseTo(start.y, 5);
		expect(back.z).toBeCloseTo(start.z, 5);
	});

	test("should compose multiple transforms correctly", () => {
		const a = applyTransformChain(
			{ x: 0, y: 0, z: 0 },
			findTransformChain(trees, "camera", "base_link")!,
		);
		const b = applyTransformChain(
			a,
			findTransformChain(trees, "base_link", "odom")!,
		);
		const step = applyTransformChain(
			b,
			findTransformChain(trees, "odom", "map")!,
		);
		const direct = applyTransformChain(
			{ x: 0, y: 0, z: 0 },
			findTransformChain(trees, "camera", "map")!,
		);
		expect(direct.x).toBeCloseTo(step.x, 5);
		expect(direct.y).toBeCloseTo(step.y, 5);
		expect(direct.z).toBeCloseTo(step.z, 5);
	});

	test("should return null for child-to-parent with mixed conventions", () => {
		// base_link is a real ROS edge; lidar an ENU child.
		const t = table(
			edge("base_link", "world", { x: 0, y: 0, z: 0 }, undefined, "ROS"),
			edge("lidar", "base_link", { x: 1, y: 0, z: 0 }, undefined, "ENU"),
		);
		expect(findTransformChain(t, "lidar", "base_link")).toBeNull();
	});

	test("should return null for parent-to-child with mixed conventions", () => {
		const t = table(
			edge("base_link", "world", { x: 0, y: 0, z: 0 }, undefined, "ROS"),
			edge("lidar", "base_link", { x: 1, y: 0, z: 0 }, undefined, "ENU"),
		);
		expect(findTransformChain(t, "base_link", "lidar")).toBeNull();
	});
});

describe("Transform Chain - Edge Cases", () => {
	test("should return null when source frame doesn't exist", () => {
		const t = table(edge("odom", "map", { x: 0, y: 0, z: 0 }));
		expect(findTransformChain(t, "nonexistent", "map")).toBeNull();
	});

	test("should return null when target frame doesn't exist", () => {
		const t = table(edge("odom", "map", { x: 0, y: 0, z: 0 }));
		expect(findTransformChain(t, "map", "nonexistent")).toBeNull();
	});

	test("should return null when frames are in disconnected trees", () => {
		const t = table(
			edge("a", "robot1_base", { x: 0, y: 0, z: 0 }),
			edge("b", "robot2_base", { x: 0, y: 0, z: 0 }),
		);
		expect(findTransformChain(t, "robot1_base", "robot2_base")).toBeNull();
	});

	test("should handle empty table gracefully", () => {
		expect(findTransformChain(table(), "frame1", "frame2")).toBeNull();
	});

	test("should handle a same-frame query on an empty table", () => {
		expect(findTransformChain(table(), "solo", "solo")).toEqual([]);
	});
});

describe("Transform Chain - Complex Scenarios", () => {
	test("should handle branching tree structure correctly", () => {
		// root -> a -> c ; root -> b -> d
		const t = table(
			edge("a", "root", { x: 10, y: 0, z: 0 }),
			edge("b", "root", { x: 0, y: 10, z: 0 }),
			edge("c", "a", { x: 1, y: 0, z: 0 }),
			edge("d", "b", { x: 0, y: 1, z: 0 }),
		);
		const chain = findTransformChain(t, "c", "d");
		expect(chain).not.toBeNull();
		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(11, 5);
		expect(p.y).toBeCloseTo(-11, 5);
		expect(p.z).toBeCloseTo(0, 5);
	});

	test("should correctly handle rotations in transform chain", () => {
		const t = table(
			edge(
				"camera",
				"base_link",
				{ x: 1, y: 0, z: 0 },
				{
					x: 0,
					y: 0,
					z: Math.sin(Math.PI / 4),
					w: Math.cos(Math.PI / 4),
				},
			),
		);
		const chain = findTransformChain(t, "camera", "base_link");
		expect(chain).not.toBeNull();
		const p = applyTransformChain({ x: 1, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(1, 4);
		expect(p.y).toBeCloseTo(1, 4);
		expect(p.z).toBeCloseTo(0, 4);
	});

	test("should handle a deep linear chain efficiently", () => {
		// f0 (virtual root) -> f1 -> ... -> f9
		const edges: TransformEdge[] = [];
		for (let i = 1; i <= 9; i++) {
			edges.push(edge(`f${i}`, `f${i - 1}`, { x: 1, y: 0, z: 0 }));
		}
		const t = table(...edges);

		const start = performance.now();
		const chain = findTransformChain(t, "f9", "f0");
		expect(performance.now() - start).toBeLessThan(10);
		expect(chain).not.toBeNull();

		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(9, 5);
		expect(p.y).toBeCloseTo(0, 5);
		expect(p.z).toBeCloseTo(0, 5);
	});
});

describe("Transform Chain - Performance", () => {
	test("should handle a large tree efficiently", () => {
		const edges: TransformEdge[] = [];
		for (let i = 1; i <= 99; i++) {
			edges.push(
				edge(`frame_${i}`, `frame_${i - 1}`, { x: 1, y: 0, z: 0 }),
			);
		}
		const t = table(...edges);

		const start = performance.now();
		const chain = findTransformChain(t, "frame_99", "frame_0");
		expect(performance.now() - start).toBeLessThan(50);
		expect(chain).not.toBeNull();

		const p = applyTransformChain({ x: 0, y: 0, z: 0 }, chain!);
		expect(p.x).toBeCloseTo(99, 5);
		expect(p.y).toBeCloseTo(0, 5);
		expect(p.z).toBeCloseTo(0, 5);
	});
});
