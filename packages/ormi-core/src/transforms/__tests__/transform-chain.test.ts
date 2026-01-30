/**
 * Tests for findTransformChain - critical path-finding algorithm
 * Focus: Correctness of transforms, not chain length
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { findTransformChain, applyTransformChain } from "../utils";
import type { TransformTree, Transform, Vector3 } from "../../types";

describe("Transform Chain - Correctness Tests", () => {
	let trees: Map<string, TransformTree>;

	beforeEach(() => {
		// Build test tree: map -> odom -> base_link -> camera
		const cameraFrame: TransformTree = {
			id: "camera",
			parentId: "base_link",
			transform: {
				position: { x: 0.5, y: 0, z: 0.3, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const baseLinkFrame: TransformTree = {
			id: "base_link",
			parentId: "odom",
			transform: {
				position: { x: 2, y: 1, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([["camera", cameraFrame]]),
			convention: "ROS",
		};

		const odomFrame: TransformTree = {
			id: "odom",
			parentId: "map",
			transform: {
				position: { x: 10, y: 5, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([["base_link", baseLinkFrame]]),
			convention: "ROS",
		};

		const mapFrame: TransformTree = {
			id: "map",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([["odom", odomFrame]]),
			convention: "ROS",
		};

		trees = new Map([["map", mapFrame]]);
	});

	test("should correctly transform point from child to parent", () => {
		// Point at camera origin
		const pointInCamera: Vector3 = { x: 0, y: 0, z: 0 };

		const chain = findTransformChain(trees, "camera", "base_link");
		expect(chain).not.toBeNull();

		const pointInBaseLink = applyTransformChain(pointInCamera, chain!);

		// Camera is at (0.5, 0, 0.3) relative to base_link
		expect(pointInBaseLink.x).toBeCloseTo(0.5, 5);
		expect(pointInBaseLink.y).toBeCloseTo(0, 5);
		expect(pointInBaseLink.z).toBeCloseTo(0.3, 5);
	});

	test("should correctly transform point through multiple frames", () => {
		// Point at camera origin
		const pointInCamera: Vector3 = { x: 0, y: 0, z: 0 };

		const chain = findTransformChain(trees, "camera", "map");
		expect(chain).not.toBeNull();

		const pointInMap = applyTransformChain(pointInCamera, chain!);

		// Camera(0,0,0) -> base_link(0.5,0,0.3) -> odom(2.5,1,0.3) -> map(12.5,6,0.3)
		expect(pointInMap.x).toBeCloseTo(12.5, 5);
		expect(pointInMap.y).toBeCloseTo(6, 5);
		expect(pointInMap.z).toBeCloseTo(0.3, 5);
	});

	test("should correctly invert transform (parent to child)", () => {
		// Point at base_link origin
		const pointInBaseLink: Vector3 = { x: 0, y: 0, z: 0 };

		const chain = findTransformChain(trees, "base_link", "camera");
		expect(chain).not.toBeNull();

		const pointInCamera = applyTransformChain(pointInBaseLink, chain!);

		// base_link origin is at (-0.5, 0, -0.3) in camera frame
		expect(pointInCamera.x).toBeCloseTo(-0.5, 5);
		expect(pointInCamera.y).toBeCloseTo(0, 5);
		expect(pointInCamera.z).toBeCloseTo(-0.3, 5);
	});

	test("should handle sibling frame transformations correctly", () => {
		// Add lidar as sibling to camera
		const lidarFrame: TransformTree = {
			id: "lidar",
			parentId: "base_link",
			transform: {
				position: { x: 0.3, y: 0, z: 0.5, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const baseLinkFrame = trees
			.get("map")!
			.children.get("odom")!
			.children.get("base_link")!;
		baseLinkFrame.children.set("lidar", lidarFrame);

		// Point at camera origin
		const pointInCamera: Vector3 = { x: 0, y: 0, z: 0 };

		const chain = findTransformChain(trees, "camera", "lidar");
		expect(chain).not.toBeNull();

		const pointInLidar = applyTransformChain(pointInCamera, chain!);

		// camera(0,0,0) -> base_link(0.5,0,0.3) -> lidar(0.2,0,-0.2)
		expect(pointInLidar.x).toBeCloseTo(0.2, 5);
		expect(pointInLidar.y).toBeCloseTo(0, 5);
		expect(pointInLidar.z).toBeCloseTo(-0.2, 5);
	});

	test("should return empty chain for same frame (identity)", () => {
		const chain = findTransformChain(trees, "camera", "camera");

		expect(chain).not.toBeNull();
		expect(chain!.length).toBe(0);

		// Verify identity transform
		const point: Vector3 = { x: 1, y: 2, z: 3 };
		const transformed = applyTransformChain(point, chain!);

		expect(transformed.x).toBeCloseTo(1, 5);
		expect(transformed.y).toBeCloseTo(2, 5);
		expect(transformed.z).toBeCloseTo(3, 5);
	});

	test("should produce inverse results for opposite directions", () => {
		const pointInCamera: Vector3 = { x: 1, y: 2, z: 3 };

		// Transform from camera to map
		const forwardChain = findTransformChain(trees, "camera", "map");
		expect(forwardChain).not.toBeNull();
		const pointInMap = applyTransformChain(pointInCamera, forwardChain!);

		// Transform back from map to camera
		const reverseChain = findTransformChain(trees, "map", "camera");
		expect(reverseChain).not.toBeNull();
		const pointBackInCamera = applyTransformChain(
			pointInMap,
			reverseChain!,
		);

		// Should get back original point (within floating point precision)
		expect(pointBackInCamera.x).toBeCloseTo(pointInCamera.x, 5);
		expect(pointBackInCamera.y).toBeCloseTo(pointInCamera.y, 5);
		expect(pointBackInCamera.z).toBeCloseTo(pointInCamera.z, 5);
	});

	test("should handle parent-to-child vs child-to-parent correctly", () => {
		const pointInBaseLink: Vector3 = { x: 1, y: 0, z: 0 };

		// base_link to camera
		const chain1 = findTransformChain(trees, "base_link", "camera");
		expect(chain1).not.toBeNull();
		const pointInCamera = applyTransformChain(pointInBaseLink, chain1!);

		// camera to base_link (inverse)
		const chain2 = findTransformChain(trees, "camera", "base_link");
		expect(chain2).not.toBeNull();
		const pointBackInBaseLink = applyTransformChain(pointInCamera, chain2!);

		// Round trip should return to original
		expect(pointBackInBaseLink.x).toBeCloseTo(pointInBaseLink.x, 5);
		expect(pointBackInBaseLink.y).toBeCloseTo(pointInBaseLink.y, 5);
		expect(pointBackInBaseLink.z).toBeCloseTo(pointInBaseLink.z, 5);
	});

	test("should compose multiple transforms correctly", () => {
		// Test camera -> odom -> map chain
		const pointInCamera: Vector3 = { x: 0, y: 0, z: 0 };

		// Get intermediate results
		const chainCamToBase = findTransformChain(trees, "camera", "base_link");
		const pointInBase = applyTransformChain(pointInCamera, chainCamToBase!);

		const chainBaseToOdom = findTransformChain(trees, "base_link", "odom");
		const pointInOdom = applyTransformChain(pointInBase, chainBaseToOdom!);

		const chainOdomToMap = findTransformChain(trees, "odom", "map");
		const pointInMapStep = applyTransformChain(
			pointInOdom,
			chainOdomToMap!,
		);

		// Compare with direct chain
		const chainCamToMap = findTransformChain(trees, "camera", "map");
		const pointInMapDirect = applyTransformChain(
			pointInCamera,
			chainCamToMap!,
		);

		// Should produce same result within precision
		expect(pointInMapDirect.x).toBeCloseTo(pointInMapStep.x, 5);
		expect(pointInMapDirect.y).toBeCloseTo(pointInMapStep.y, 5);
		expect(pointInMapDirect.z).toBeCloseTo(pointInMapStep.z, 5);
	});
});

describe("Transform Chain - Edge Cases", () => {
	test("should return null when source frame doesn't exist", () => {
		const mapFrame: TransformTree = {
			id: "map",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const trees = new Map([["map", mapFrame]]);
		const chain = findTransformChain(trees, "nonexistent", "map");

		expect(chain).toBeNull();
	});

	test("should return null when target frame doesn't exist", () => {
		const mapFrame: TransformTree = {
			id: "map",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const trees = new Map([["map", mapFrame]]);
		const chain = findTransformChain(trees, "map", "nonexistent");

		expect(chain).toBeNull();
	});

	test("should return null when frames are in disconnected trees", () => {
		const tree1: TransformTree = {
			id: "robot1_base",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const tree2: TransformTree = {
			id: "robot2_base",
			parentId: "",
			transform: {
				position: { x: 10, y: 10, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const trees = new Map([
			["robot1_base", tree1],
			["robot2_base", tree2],
		]);

		// Cannot transform between disconnected trees
		const chain = findTransformChain(trees, "robot1_base", "robot2_base");
		expect(chain).toBeNull();
	});

	test("should handle empty tree map gracefully", () => {
		const trees = new Map<string, TransformTree>();
		const chain = findTransformChain(trees, "frame1", "frame2");

		expect(chain).toBeNull();
	});

	test("should handle single-node tree", () => {
		const singleFrame: TransformTree = {
			id: "solo",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const trees = new Map([["solo", singleFrame]]);

		// Same frame
		const chain = findTransformChain(trees, "solo", "solo");
		expect(chain).not.toBeNull();
		expect(chain!.length).toBe(0);
	});
});

describe("Transform Chain - Complex Scenarios", () => {
	test("should handle branching tree structure correctly", () => {
		// Tree:      root
		//           /    \
		//          a      b
		//         /        \
		//        c          d

		const frameC: TransformTree = {
			id: "c",
			parentId: "a",
			transform: {
				position: { x: 1, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const frameD: TransformTree = {
			id: "d",
			parentId: "b",
			transform: {
				position: { x: 0, y: 1, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const frameA: TransformTree = {
			id: "a",
			parentId: "root",
			transform: {
				position: { x: 10, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([["c", frameC]]),
			convention: "ROS",
		};

		const frameB: TransformTree = {
			id: "b",
			parentId: "root",
			transform: {
				position: { x: 0, y: 10, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([["d", frameD]]),
			convention: "ROS",
		};

		const rootFrame: TransformTree = {
			id: "root",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([
				["a", frameA],
				["b", frameB],
			]),
			convention: "ROS",
		};

		const trees = new Map([["root", rootFrame]]);

		// Transform point from c to d (must go through root)
		const pointInC: Vector3 = { x: 0, y: 0, z: 0 };
		const chain = findTransformChain(trees, "c", "d");

		expect(chain).not.toBeNull();

		const pointInD = applyTransformChain(pointInC, chain!);

		// c(0,0,0) -> a(1,0,0) -> root(11,0,0) -> b(11,-10,0) -> d(11,-11,0)
		expect(pointInD.x).toBeCloseTo(11, 5);
		expect(pointInD.y).toBeCloseTo(-11, 5);
		expect(pointInD.z).toBeCloseTo(0, 5);
	});

	test("should correctly handle rotations in transform chain", () => {
		// Camera rotated 90° around Z relative to base_link
		const cameraFrame: TransformTree = {
			id: "camera",
			parentId: "base_link",
			transform: {
				position: { x: 1, y: 0, z: 0, w: 0 },
				rotation: {
					x: 0,
					y: 0,
					z: Math.sin(Math.PI / 4), // 90° rotation
					w: Math.cos(Math.PI / 4),
				},
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		const baseLinkFrame: TransformTree = {
			id: "base_link",
			parentId: "",
			transform: {
				position: { x: 0, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map([["camera", cameraFrame]]),
			convention: "ROS",
		};

		const trees = new Map([["base_link", baseLinkFrame]]);

		// Point 1m forward in camera frame
		const pointInCamera: Vector3 = { x: 1, y: 0, z: 0 };
		const chain = findTransformChain(trees, "camera", "base_link");

		expect(chain).not.toBeNull();

		const pointInBaseLink = applyTransformChain(pointInCamera, chain!);

		// After rotation and translation
		// The point should be rotated 90° then translated
		expect(pointInBaseLink.x).toBeCloseTo(1, 4); // Translation
		expect(pointInBaseLink.y).toBeCloseTo(1, 4); // Rotated X becomes Y
		expect(pointInBaseLink.z).toBeCloseTo(0, 4);
	});

	test("should handle deep linear chain efficiently", () => {
		// Create chain: f0 -> f1 -> f2 -> ... -> f9 (10 nodes, 9 edges)
		let currentFrame: TransformTree = {
			id: "f9",
			parentId: "f8",
			transform: {
				position: { x: 1, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		for (let i = 8; i >= 0; i--) {
			const parentId = i === 0 ? "" : `f${i - 1}`;
			currentFrame = {
				id: `f${i}`,
				parentId,
				transform: {
					position: { x: 1, y: 0, z: 0, w: 0 },
					rotation: { x: 0, y: 0, z: 0, w: 1 },
					convention: "ROS",
				},
				children: new Map([[currentFrame.id, currentFrame]]),
				convention: "ROS",
			};
		}

		const trees = new Map([["f0", currentFrame]]);

		const pointInF9: Vector3 = { x: 0, y: 0, z: 0 };
		const startTime = performance.now();
		const chain = findTransformChain(trees, "f9", "f0");
		const duration = performance.now() - startTime;

		expect(chain).not.toBeNull();
		expect(duration).toBeLessThan(10); // Should be fast

		const pointInF0 = applyTransformChain(pointInF9, chain!);

		// 9 transforms: f9->f8->f7->...->f1->f0, each adds 1m in X = 9m
		expect(pointInF0.x).toBeCloseTo(9, 5);
		expect(pointInF0.y).toBeCloseTo(0, 5);
		expect(pointInF0.z).toBeCloseTo(0, 5);
	});
});

describe("Transform Chain - Performance", () => {
	test("should handle large tree efficiently", () => {
		// Create linear chain of 100 frames: f0 -> f1 -> ... -> f99 (100 nodes, 99 edges)
		let currentFrame: TransformTree = {
			id: "frame_99",
			parentId: "frame_98",
			transform: {
				position: { x: 1, y: 0, z: 0, w: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				convention: "ROS",
			},
			children: new Map(),
			convention: "ROS",
		};

		for (let i = 98; i >= 0; i--) {
			const parentId = i === 0 ? "" : `frame_${i - 1}`;
			currentFrame = {
				id: `frame_${i}`,
				parentId,
				transform: {
					position: { x: 1, y: 0, z: 0, w: 0 },
					rotation: { x: 0, y: 0, z: 0, w: 1 },
					convention: "ROS",
				},
				children: new Map([[currentFrame.id, currentFrame]]),
				convention: "ROS",
			};
		}

		const trees = new Map([["frame_0", currentFrame]]);

		const startTime = performance.now();
		const chain = findTransformChain(trees, "frame_99", "frame_0");
		const duration = performance.now() - startTime;

		expect(chain).not.toBeNull();
		expect(duration).toBeLessThan(50); // Should complete quickly

		// Verify correctness: 99 transforms (frame_99->...->frame_1), each adds 1m in X = 99m
		const point: Vector3 = { x: 0, y: 0, z: 0 };
		const transformed = applyTransformChain(point, chain!);
		expect(transformed.x).toBeCloseTo(99, 5);
		expect(transformed.y).toBeCloseTo(0, 5);
		expect(transformed.z).toBeCloseTo(0, 5);
	});
});
