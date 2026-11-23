import { describe, expect, it } from "bun:test";

import { DRAW_FINISH_DISTANCE_PX } from "./map-draw-finish";
import {
	SNAP_STORAGE_KEY,
	SNAP_TOLERANCE_COARSE_PX,
	SNAP_TOLERANCE_PX,
	buildSnapTargets,
	createSnapIndicatorStore,
	findSnap,
	isFinishingPointer,
	ownVertexTarget,
	pointerSearchBounds,
	readSnapEnabled,
	snapTolerancePx,
	writeSnapEnabled,
	type SnapPosition,
	type SnapSourceFeature,
	type SnapTarget,
} from "./map-snap";

/**
 * A flat projection for the tests: one degree is 1000 px, y grows down, as
 * on screen. The search only needs a consistent project/unproject pair.
 */
const SCALE = 1000;
const project = ([lng, lat]: SnapPosition) => ({
	x: lng * SCALE,
	y: -lat * SCALE,
});
const unproject = (x: number, y: number): SnapPosition => [
	x / SCALE,
	-y / SCALE,
];
const at = (x: number, y: number) => ({ x, y });

function polygon(
	id: string,
	ring: SnapPosition[],
	type = "risk",
): SnapSourceFeature {
	return {
		properties: { feature_id: id, feature_type: type },
		geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
	};
}

/** A 100 px square with corners at (0,0) and (0.1, 0.1) degrees. */
const square = polygon("square", [
	[0, 0],
	[0.1, 0],
	[0.1, 0.1],
	[0, 0.1],
]);

const noLayers = { hidden: new Set<string>() };

function snapAt(
	x: number,
	y: number,
	targets: SnapTarget[],
	tolerancePx = SNAP_TOLERANCE_PX,
) {
	return findSnap({
		pointer: at(x, y),
		targets,
		tolerancePx,
		project,
		unproject,
	});
}

describe("snap tolerance", () => {
	it("is a few pixels on a mouse, more for a finger", () => {
		expect(snapTolerancePx(false)).toBe(SNAP_TOLERANCE_PX);
		expect(snapTolerancePx(true)).toBe(SNAP_TOLERANCE_COARSE_PX);
		expect(SNAP_TOLERANCE_COARSE_PX).toBeGreaterThan(SNAP_TOLERANCE_PX);
		expect(SNAP_TOLERANCE_PX).toBeGreaterThanOrEqual(8);
		expect(SNAP_TOLERANCE_COARSE_PX).toBeLessThanOrEqual(24);
	});

	it("does not change the draw modes' finish distance", () => {
		expect(DRAW_FINISH_DISTANCE_PX).toBe(10);
	});
});

describe("findSnap", () => {
	const targets = buildSnapTargets([square], noLayers);

	it("snaps to a vertex's stored position exactly", () => {
		// Corner (0.1, 0) is at screen (100, 0).
		const snap = snapAt(105, 4, targets);
		expect(snap).toEqual({
			kind: "vertex",
			position: [0.1, 0],
			targetId: "square",
		});
	});

	it("prefers a vertex over a nearer edge", () => {
		// 3 px from the edge x=100, 10 px from corner (100, 0).
		const snap = snapAt(103, 9.5, targets);
		expect(snap?.kind).toBe("vertex");
		expect(snap?.position).toEqual([0.1, 0]);
	});

	it("snaps to the nearest point on an edge when no vertex is in reach", () => {
		// Edge from (100, 0) to (100, -100) on screen; pointer 6 px right of it.
		const snap = snapAt(106, -50, targets);
		expect(snap?.kind).toBe("edge");
		if (snap?.kind !== "edge") return;
		expect(snap.position[0]).toBeCloseTo(0.1, 9);
		expect(snap.position[1]).toBeCloseTo(0.05, 9);
		expect(snap.segment).toEqual([
			[0.1, 0],
			[0.1, 0.1],
		]);
	});

	it("snaps to a polygon's closing edge", () => {
		// Closing edge from (0, -100) back to (0, 0).
		const snap = snapAt(-4, -50, targets);
		expect(snap?.kind).toBe("edge");
		expect(snap?.position[0]).toBeCloseTo(0, 9);
	});

	it("leaves the pointer alone outside the tolerance", () => {
		expect(snapAt(100 + SNAP_TOLERANCE_PX + 1, -50, targets)).toBeNull();
		expect(snapAt(50, -50, targets)).toBeNull();
		expect(snapAt(100 + SNAP_TOLERANCE_PX, -50, targets)?.kind).toBe(
			"edge",
		);
	});

	it("reaches farther with the coarse tolerance", () => {
		const fine = snapTolerancePx(false);
		const coarse = snapTolerancePx(true);
		const x = 100 + (fine + coarse) / 2;
		expect(snapAt(x, -50, targets, fine)).toBeNull();
		expect(snapAt(x, -50, targets, coarse)?.kind).toBe("edge");
	});

	it("picks the nearest of two vertices", () => {
		const other = polygon("other", [
			[0.108, 0],
			[0.2, 0],
			[0.2, 0.1],
		]);
		const both = buildSnapTargets([square, other], noLayers);
		expect(snapAt(105, 0, both)?.targetId).toBe("other");
		expect(snapAt(103, 0, both)?.targetId).toBe("square");
	});

	it("snaps to a point feature", () => {
		const point: SnapSourceFeature = {
			properties: { feature_id: "wp", feature_type: "waypoint" },
			geometry: { type: "Point", coordinates: [0.5, 0.5] },
		};
		const snap = snapAt(503, -497, buildSnapTargets([point], noLayers));
		expect(snap).toEqual({
			kind: "vertex",
			position: [0.5, 0.5],
			targetId: "wp",
		});
	});

	it("skips targets outside the search bounds without projecting them", () => {
		let projected = 0;
		const counting = (p: SnapPosition) => {
			projected++;
			return project(p);
		};
		const far = polygon("far", [
			[5, 5],
			[5.1, 5],
			[5.1, 5.1],
		]);
		const pointer = at(105, 4);
		const snap = findSnap({
			pointer,
			targets: buildSnapTargets([square, far], noLayers),
			tolerancePx: SNAP_TOLERANCE_PX,
			project: counting,
			unproject,
			searchBounds: pointerSearchBounds(
				pointer,
				SNAP_TOLERANCE_PX,
				unproject,
			),
		});
		expect(snap?.targetId).toBe("square");
		// The square's five ring positions; nothing of the far polygon.
		expect(projected).toBe(5);
	});
});

describe("buildSnapTargets", () => {
	const gravel = polygon(
		"gravel",
		[
			[1, 1],
			[1.1, 1],
			[1.1, 1.1],
		],
		"risk",
	);
	const fence = polygon(
		"fence",
		[
			[2, 2],
			[2.1, 2],
			[2.1, 2.1],
		],
		"geofence",
	);

	it("excludes hidden layers", () => {
		const targets = buildSnapTargets([gravel, fence], {
			hidden: new Set(["risk"]),
		});
		expect(targets.map((t) => t.id)).toEqual(["fence"]);
		expect(snapAt(1000, -1000, targets)).toBeNull();
	});

	it("includes locked layers: locked is not editable, not invisible", () => {
		const targets = buildSnapTargets([gravel, fence], {
			hidden: new Set(),
			locked: new Set(["risk", "geofence"]),
		});
		expect(targets.map((t) => t.id)).toEqual(["gravel", "fence"]);
		expect(snapAt(1002, -1001, targets)?.position).toEqual([1, 1]);
	});

	it("excludes the feature open for editing", () => {
		const targets = buildSnapTargets([gravel, fence], noLayers, "gravel");
		expect(targets.map((t) => t.id)).toEqual(["fence"]);
		expect(snapAt(1002, -1001, targets)).toBeNull();
	});

	it("skips a feature with no coordinates", () => {
		const empty: SnapSourceFeature = {
			properties: { feature_id: "empty", feature_type: "risk" },
			geometry: { type: "Polygon", coordinates: [] },
		};
		const nothing: SnapSourceFeature = {
			properties: { feature_id: "none" },
			geometry: null,
		};
		expect(buildSnapTargets([empty, nothing], noLayers)).toEqual([]);
	});

	it("keeps every ring of a polygon with a hole", () => {
		const holed: SnapSourceFeature = {
			properties: { feature_id: "holed", feature_type: "zone" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
					[
						[0.4, 0.2],
						[0.6, 0.2],
						[0.6, 0.4],
						[0.4, 0.2],
					],
				],
			},
		};
		const [target] = buildSnapTargets([holed], noLayers);
		expect(target?.lines).toHaveLength(2);
		expect(snapAt(601, -201, [target!])?.position).toEqual([0.6, 0.2]);
	});
});

describe("ownVertexTarget", () => {
	const line: SnapSourceFeature["geometry"] = {
		type: "LineString",
		coordinates: [
			[0, 0],
			[0.1, 0],
			[0.2, 0],
			[0.3, 0],
			[0.35, 0.05],
		],
	};

	it("offers a line's placed points but the last, never the one under the pointer", () => {
		// Four placed, the fifth is provisional.
		const target = ownVertexTarget(line, { kind: "drawing", placed: 4 });
		expect(target?.vertices).toEqual([
			[0, 0],
			[0.1, 0],
			[0.2, 0],
		]);
		expect(target?.lines).toEqual([]);
	});

	it("excludes the dragged vertex and its neighbours", () => {
		const target = ownVertexTarget(line, { kind: "dragging", index: 2 });
		expect(target?.vertices).toEqual([
			[0, 0],
			[0.35, 0.05],
		]);
		const snap = snapAt(203, 0, [target!]);
		expect(snap).toBeNull();
	});

	it("never offers a polygon its own corners", () => {
		const ring: SnapSourceFeature["geometry"] = {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[0.1, 0],
					[0.1, 0.1],
					[0.05, 0.15],
					[0, 0],
				],
			],
		};
		expect(ownVertexTarget(ring, { kind: "drawing", placed: 4 })).toBe(
			null,
		);
		expect(ownVertexTarget(ring, { kind: "dragging", index: 1 })).toBe(
			null,
		);
	});
});

describe("isFinishingPointer", () => {
	// Three corners placed, the fourth position is provisional, then the
	// ring closes on the first.
	const drawing: SnapSourceFeature["geometry"] = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[0.1, 0],
				[0.1, 0.1],
				[0.05, 0.12],
				[0, 0],
			],
		],
	};
	const finishing = (x: number, y: number, placed = 3) =>
		isFinishingPointer(
			drawing,
			placed,
			at(x, y),
			project,
			DRAW_FINISH_DISTANCE_PX,
		);

	it("is true near a polygon's first corner, so the ring still closes", () => {
		expect(finishing(3, -3)).toBe(true);
		expect(finishing(DRAW_FINISH_DISTANCE_PX + 1, 0)).toBe(false);
	});

	it("is true near the last corner placed", () => {
		expect(finishing(100, -97)).toBe(true);
	});

	it("is false before a polygon has three corners", () => {
		expect(finishing(3, -3, 2)).toBe(false);
	});

	it("is true near a line's last point from its second point on", () => {
		const line: SnapSourceFeature["geometry"] = {
			type: "LineString",
			coordinates: [
				[0, 0],
				[0.1, 0],
				[0.15, 0.02],
			],
		};
		const check = (placed: number) =>
			isFinishingPointer(
				line,
				placed,
				at(102, 0),
				project,
				DRAW_FINISH_DISTANCE_PX,
			);
		expect(check(2)).toBe(true);
		expect(check(1)).toBe(false);
	});
});

describe("Snap toggle storage", () => {
	function memory(initial: Record<string, string> = {}) {
		const values = new Map(Object.entries(initial));
		return {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => {
				values.set(key, value);
			},
		};
	}
	const throwing = {
		getItem: () => {
			throw new Error("blocked");
		},
		setItem: () => {
			throw new Error("blocked");
		},
	};

	it("is on by default", () => {
		expect(readSnapEnabled(memory())).toBe(true);
		expect(readSnapEnabled(null)).toBe(true);
	});

	it("keeps the operator's choice", () => {
		const storage = memory();
		writeSnapEnabled(storage, false);
		expect(storage.getItem(SNAP_STORAGE_KEY)).toBe("off");
		expect(readSnapEnabled(storage)).toBe(false);
		writeSnapEnabled(storage, true);
		expect(readSnapEnabled(storage)).toBe(true);
	});

	it("falls back to on when storage throws", () => {
		expect(readSnapEnabled(throwing)).toBe(true);
		expect(() => writeSnapEnabled(throwing, false)).not.toThrow();
	});
});

describe("snap indicator store", () => {
	it("notifies only on a change", () => {
		const store = createSnapIndicatorStore();
		let calls = 0;
		const unsubscribe = store.subscribe(() => calls++);
		store.set({ kind: "vertex", position: [1, 2] });
		store.set({ kind: "vertex", position: [1, 2] });
		expect(calls).toBe(1);
		store.set({
			kind: "edge",
			position: [1, 2],
			segment: [
				[0, 0],
				[2, 4],
			],
		});
		expect(calls).toBe(2);
		store.set(null);
		store.set(null);
		expect(calls).toBe(3);
		expect(store.get()).toBeNull();
		unsubscribe();
		store.set({ kind: "vertex", position: [0, 0] });
		expect(calls).toBe(3);
	});
});
