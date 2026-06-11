/**
 * Tests for the pure geometry selectors over the transform table.
 */

import { describe, test, expect } from "bun:test";
import type { Quaternion, TransformEdge, TransformTable } from "../../types";
import {
	resolveWorldPose,
	selectFrameDiagnostics,
	selectWorldFrames,
} from "../geometry-selectors";

const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

function edge(
	frameId: string,
	parentId: string,
	pos: { x: number; y: number; z: number },
	rot: Quaternion = IDENTITY,
	opts: { receivedAt?: number; isStatic?: boolean } = {},
): TransformEdge {
	return {
		frameId,
		rawFrameId: frameId,
		parentId,
		source: "ds",
		transform: {
			position: { ...pos, w: 1 },
			rotation: rot,
			convention: "THREE",
		},
		stamp: undefined,
		receivedAt: opts.receivedAt ?? 1000,
		isStatic: opts.isStatic ?? false,
		parentObserved: false,
	};
}

function table(...edges: TransformEdge[]): TransformTable {
	return new Map(edges.map((e) => [e.frameId, e]));
}

describe("resolveWorldPose", () => {
	test("accumulates translation down a chain", () => {
		const t = table(
			edge("odom", "map", { x: 1, y: 0, z: 0 }),
			edge("base", "odom", { x: 0, y: 1, z: 0 }),
		);
		const pose = resolveWorldPose(t, "base");
		expect(pose).not.toBeNull();
		expect(pose!.position.x).toBeCloseTo(1, 6);
		expect(pose!.position.y).toBeCloseTo(1, 6);
		expect(pose!.position.z).toBeCloseTo(0, 6);
	});

	test("applies parent rotation to child translation", () => {
		// odom rotated 90° about Z; child at local (0,1,0) → world (-1,0,0).
		const halfSqrt2 = Math.SQRT1_2;
		const t = table(
			edge(
				"odom",
				"map",
				{ x: 0, y: 0, z: 0 },
				{
					x: 0,
					y: 0,
					z: halfSqrt2,
					w: halfSqrt2,
				},
			),
			edge("base", "odom", { x: 0, y: 1, z: 0 }),
		);
		const pose = resolveWorldPose(t, "base");
		expect(pose!.position.x).toBeCloseTo(-1, 6);
		expect(pose!.position.y).toBeCloseTo(0, 6);
		expect(pose!.position.z).toBeCloseTo(0, 6);
	});

	test("returns null for an unknown frame", () => {
		expect(resolveWorldPose(table(), "nope")).toBeNull();
	});

	test("returns null on a cycle instead of hanging", () => {
		const t = table(
			edge("A", "B", { x: 0, y: 0, z: 0 }),
			edge("B", "A", { x: 0, y: 0, z: 0 }),
		);
		expect(resolveWorldPose(t, "A")).toBeNull();
	});

	test("returns null on a degenerate (NaN) transform", () => {
		const t = table(edge("odom", "map", { x: NaN, y: 0, z: 0 }));
		expect(resolveWorldPose(t, "odom")).toBeNull();
	});
});

describe("selectWorldFrames", () => {
	const t = table(
		edge("odom", "map", { x: 1, y: 0, z: 0 }),
		edge("base", "odom", { x: 0, y: 1, z: 0 }),
	);

	test("emits the virtual root and resolves depth, parent positions, inferred", () => {
		const frames = selectWorldFrames(t);
		// The unobserved root (`map`) is a real frame in the output, at the tree origin.
		expect(frames.length).toBe(3);

		const map = frames.find((f) => f.frameId === "map")!;
		expect(map.depth).toBe(0);
		expect(map.parentWorldPosition).toBeNull();
		expect(map.inferred).toBe(true); // never observed as a child — identity assumed
		expect(map.worldPosition.x).toBeCloseTo(0, 6);
		expect(map.stale).toBe(false);

		const odom = frames.find((f) => f.frameId === "odom")!;
		expect(odom.depth).toBe(1);
		expect(odom.inferred).toBe(false); // real edge, real transform
		expect(odom.parentWorldPosition?.x).toBeCloseTo(0, 6); // parented to map's origin
		expect(odom.worldPosition.x).toBeCloseTo(1, 6);

		const base = frames.find((f) => f.frameId === "base")!;
		expect(base.depth).toBe(2);
		expect(base.inferred).toBe(false);
		expect(base.parentWorldPosition?.x).toBeCloseTo(1, 6);
		expect(base.worldPosition.y).toBeCloseTo(1, 6);
	});

	test("targetFrame includes the whole component (by node or by root name)", () => {
		// By a leaf node id (component = map + odom + base).
		expect(selectWorldFrames(t, { targetFrame: "base" }).length).toBe(3);
		// By the unobserved root name.
		expect(selectWorldFrames(t, { targetFrame: "map" }).length).toBe(3);
		// By a frame in another (nonexistent) component → nothing.
		expect(selectWorldFrames(t, { targetFrame: "other" }).length).toBe(0);
	});

	test("computes staleness against receivedAt (static is never stale)", () => {
		const now = 10_000;
		const st = table(
			edge("a", "root", { x: 0, y: 0, z: 0 }, IDENTITY, {
				receivedAt: now - 2000,
			}),
			edge("b", "root", { x: 0, y: 0, z: 0 }, IDENTITY, {
				receivedAt: now - 2000,
				isStatic: true,
			}),
			edge("c", "root", { x: 0, y: 0, z: 0 }, IDENTITY, {
				receivedAt: now - 100,
			}),
		);
		const frames = selectWorldFrames(st, { now, staleMs: 1000 });
		expect(frames.find((f) => f.frameId === "a")!.stale).toBe(true);
		expect(frames.find((f) => f.frameId === "b")!.stale).toBe(false);
		expect(frames.find((f) => f.frameId === "c")!.stale).toBe(false);
	});

	test("skips degenerate (NaN) frames rather than poisoning the result", () => {
		const bad = table(edge("x", "map", { x: NaN, y: 0, z: 0 }));
		const frames = selectWorldFrames(bad);
		// The virtual root is still emitted (identity is always finite); the NaN edge is not.
		expect(frames.length).toBe(1);
		expect(frames[0]!.frameId).toBe("map");
		expect(frames.some((f) => f.frameId === "x")).toBe(false);
	});
});

describe("selectFrameDiagnostics", () => {
	test("reports depth, source, inferred, staleness and age", () => {
		const now = 5000;
		const t = table(
			edge("odom", "map", { x: 0, y: 0, z: 0 }, IDENTITY, {
				receivedAt: now - 3000,
			}),
			edge("base", "odom", { x: 0, y: 0, z: 0 }, IDENTITY, {
				receivedAt: now - 100,
			}),
		);
		const diags = selectFrameDiagnostics(t, { now, staleMs: 1000 });

		const odom = diags.find((d) => d.frameId === "odom")!;
		expect(odom.depth).toBe(0);
		expect(odom.source).toBe("ds");
		expect(odom.inferred).toBe(true);
		expect(odom.stale).toBe(true);
		expect(odom.ageMs).toBeCloseTo(3000, 6);

		const base = diags.find((d) => d.frameId === "base")!;
		expect(base.depth).toBe(1);
		expect(base.inferred).toBe(false);
		expect(base.stale).toBe(false);
	});
});
