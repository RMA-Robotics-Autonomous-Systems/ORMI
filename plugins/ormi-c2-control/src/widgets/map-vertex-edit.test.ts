import { describe, expect, it } from "bun:test";
import {
	TerraDraw,
	TerraDrawLineStringMode,
	TerraDrawPolygonMode,
	TerraDrawSelectMode,
	type GeoJSONStoreFeatures,
} from "terra-draw";

import {
	COARSE_POINTER_HANDLES,
	FINE_POINTER_HANDLES,
	MAP_SELECT_KEY_EVENTS,
	MAP_SELECT_OPTIONS,
	SELECT_POINTER_DISTANCE_PX,
	mapSelectOptions,
	selectHandleStyles,
	deleteVertex,
	isVertexDeleteKey,
	removeVertex,
	vertexAtClick,
	type VertexCandidate,
	type VertexPosition,
} from "./map-vertex-edit";

const square = {
	type: "Polygon",
	coordinates: [
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
			[0, 0],
		],
	],
};

describe("removeVertex", () => {
	it("removes a point from a line of 3", () => {
		const result = removeVertex(
			{
				type: "LineString",
				coordinates: [
					[0, 0],
					[1, 0],
					[2, 0],
				],
			},
			1,
		);
		expect(result).toEqual({
			ok: true,
			geometry: {
				type: "LineString",
				coordinates: [
					[0, 0],
					[2, 0],
				],
			},
		});
	});

	it("refuses to take a line below 2 points", () => {
		const result = removeVertex(
			{
				type: "LineString",
				coordinates: [
					[0, 0],
					[1, 0],
				],
			},
			0,
		);
		expect(result.ok).toBe(false);
	});

	it("removes a middle corner of an area", () => {
		const result = removeVertex(square, 2);
		expect(result).toEqual({
			ok: true,
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[0, 1],
						[0, 0],
					],
				],
			},
		});
	});

	it("re-closes the ring when the first corner is removed", () => {
		const result = removeVertex(square, 0);
		expect(result).toEqual({
			ok: true,
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[1, 0],
						[1, 1],
						[0, 1],
						[1, 0],
					],
				],
			},
		});
	});

	it("keeps holes untouched", () => {
		const hole = [
			[0.2, 0.2],
			[0.4, 0.2],
			[0.4, 0.4],
			[0.2, 0.2],
		];
		const result = removeVertex(
			{ type: "Polygon", coordinates: [square.coordinates[0], hole] },
			1,
		);
		expect(
			result.ok && (result.geometry.coordinates as unknown[])[1],
		).toEqual(hole);
	});

	it("refuses to take an area below 3 corners (4 positions)", () => {
		const triangle = {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 0],
				],
			],
		};
		expect(removeVertex(triangle, 1).ok).toBe(false);
	});

	it("refuses an index that is not a vertex", () => {
		// The closing position is not a handle of its own.
		expect(removeVertex(square, 4).ok).toBe(false);
		expect(removeVertex(square, -1).ok).toBe(false);
	});

	it("refuses a point", () => {
		expect(removeVertex({ type: "Point", coordinates: [0, 0] }, 0).ok).toBe(
			false,
		);
	});
});

describe("vertexAtClick", () => {
	const handle = (
		index: number,
		position: VertexPosition,
		featureId = "f1",
	): VertexCandidate => ({
		geometry: { type: "Point", coordinates: position },
		properties: {
			mode: "select",
			selectionPoint: true,
			selectionPointFeatureId: featureId,
			index,
		},
	});
	const midpoint: VertexCandidate = {
		geometry: { type: "Point", coordinates: [0.5, 0] },
		properties: { mode: "select", midPoint: true },
	};
	const shape: VertexCandidate = {
		geometry: square,
		properties: { mode: "polygon", selected: true },
	};
	// One degree is 100 px here.
	const from =
		(click: VertexPosition) =>
		(p: VertexPosition): number =>
			Math.hypot(p[0] - click[0], p[1] - click[1]) * 100;

	it("picks the nearest vertex handle", () => {
		const vertex = vertexAtClick(
			[shape, handle(0, [0, 0]), handle(1, [1, 0]), midpoint],
			from([0.9, 0.05]),
		);
		expect(vertex).toEqual({
			featureId: "f1",
			index: 1,
			position: [1, 0],
		});
	});

	it("ignores midpoints and the shape itself", () => {
		expect(vertexAtClick([shape, midpoint], from([0.5, 0]))).toBeNull();
	});

	it("ignores a handle out of reach", () => {
		expect(vertexAtClick([handle(0, [0, 0])], from([1, 1]), 40)).toBeNull();
	});
});

describe("isVertexDeleteKey", () => {
	it("takes Delete and Backspace", () => {
		expect(isVertexDeleteKey({ key: "Delete" })).toBe(true);
		expect(isVertexDeleteKey({ key: "Backspace" })).toBe(true);
	});

	it("ignores other keys and modified presses", () => {
		expect(isVertexDeleteKey({ key: "d" })).toBe(false);
		expect(isVertexDeleteKey({ key: "Delete", ctrlKey: true })).toBe(false);
		expect(isVertexDeleteKey({ key: "Backspace", metaKey: true })).toBe(
			false,
		);
	});
});

// --- Against the real terra-draw select mode -------------------------------

/** Screen pixels per degree in the stub projection. */
const PX_PER_DEGREE = 10_000;

/** A terra-draw adapter with a linear projection and nothing rendered. */
function stubAdapter() {
	return {
		project: (lng: number, lat: number) => ({
			x: lng * PX_PER_DEGREE,
			y: -lat * PX_PER_DEGREE,
		}),
		unproject: (x: number, y: number) => ({
			lng: x / PX_PER_DEGREE,
			lat: -y / PX_PER_DEGREE,
		}),
		setCursor: () => {},
		getLngLatFromEvent: () => null,
		setDoubleClickToZoom: () => {},
		setDraggability: () => {},
		getMapEventElement: () => ({}) as HTMLElement,
		register: (callbacks: { onReady?: () => void }) =>
			callbacks.onReady?.(),
		unregister: () => {},
		render: () => {},
		clear: () => {},
		getCoordinatePrecision: () => 9,
	};
}

function startedDraw(
	options: ConstructorParameters<
		typeof TerraDrawSelectMode
	>[0] = MAP_SELECT_OPTIONS,
) {
	const select = new TerraDrawSelectMode(options);
	const draw = new TerraDraw({
		adapter: stubAdapter() as never,
		modes: [
			new TerraDrawLineStringMode(),
			new TerraDrawPolygonMode(),
			select,
		],
	});
	draw.start();
	return { draw, select };
}

const pentagon = {
	type: "Feature",
	properties: { mode: "polygon" },
	geometry: {
		type: "Polygon",
		coordinates: [
			[
				[4.35, 50.84],
				[4.36, 50.84],
				[4.365, 50.845],
				[4.36, 50.85],
				[4.35, 50.85],
				[4.35, 50.84],
			],
		],
	},
};

function loadSelected(draw: TerraDraw) {
	const [loaded] = draw.addFeatures([pentagon as GeoJSONStoreFeatures]);
	expect(loaded?.valid).toBe(true);
	draw.selectFeature(loaded!.id!);
	return loaded!.id!;
}

function clickVertex(draw: TerraDraw, at: VertexPosition) {
	const click = stubAdapter().project(at[0], at[1]);
	return vertexAtClick(
		draw.getFeaturesAtLngLat(
			{ lng: at[0], lat: at[1] },
			{
				ignoreSelectFeatures: false,
				pointerDistance: SELECT_POINTER_DISTANCE_PX,
			},
		) as unknown as VertexCandidate[],
		(p) => {
			const xy = stubAdapter().project(p[0], p[1]);
			return Math.hypot(xy.x - click.x, xy.y - click.y);
		},
	);
}

const keyUp = (key: string) => ({
	key,
	heldKeys: [],
	preventDefault: () => {},
});

describe("the map's select mode", () => {
	it("terra-draw's default Delete removes the whole shape (the defect)", () => {
		const { draw, select } = startedDraw({
			...MAP_SELECT_OPTIONS,
			keyEvents: undefined,
		});
		const id = loadSelected(draw);
		select.onKeyUp(keyUp("Delete"));
		expect(draw.hasFeature(id)).toBe(false);
	});

	it("keeps the shape on Delete with the map's key bindings", () => {
		const { draw, select } = startedDraw();
		const id = loadSelected(draw);
		select.onKeyUp(keyUp("Delete"));
		select.onKeyUp(keyUp("Backspace"));
		select.onKeyUp(keyUp("Escape"));
		expect(draw.hasFeature(id)).toBe(true);
		expect(draw.getSnapshotFeature(id)?.properties.selected).toBe(true);
	});

	it("finds the clicked vertex handle and deletes that vertex only", () => {
		const { draw } = startedDraw();
		const id = loadSelected(draw);
		const vertex = clickVertex(draw, [4.3649, 50.8451]);
		expect(vertex).toEqual({
			featureId: id,
			index: 2,
			position: [4.365, 50.845],
		});

		const result = deleteVertex(draw, vertex!);
		expect(result.ok).toBe(true);
		const ring = (
			draw.getSnapshotFeature(id)?.geometry.coordinates as number[][][]
		)[0];
		expect(ring).toEqual([
			[4.35, 50.84],
			[4.36, 50.84],
			[4.36, 50.85],
			[4.35, 50.85],
			[4.35, 50.84],
		]);
		expect(result.ok && result.feature.geometry).toEqual(
			draw.getSnapshotFeature(id)!.geometry,
		);
		// terra-draw redrew the handles: one per remaining corner.
		const handles = draw
			.getSnapshot()
			.filter((f) => f.properties.selectionPoint === true);
		expect(handles.length).toBe(4);
		expect(draw.getSnapshotFeature(id)?.properties.selected).toBe(true);
	});

	it("refuses a vertex the area cannot lose", () => {
		const { draw } = startedDraw();
		const [loaded] = draw.addFeatures([
			{
				type: "Feature",
				properties: { mode: "polygon" },
				geometry: {
					type: "Polygon",
					coordinates: [
						[
							[4.35, 50.84],
							[4.36, 50.84],
							[4.36, 50.85],
							[4.35, 50.84],
						],
					],
				},
			} as GeoJSONStoreFeatures,
		]);
		draw.selectFeature(loaded!.id!);
		const result = deleteVertex(draw, { featureId: loaded!.id!, index: 1 });
		expect(result).toEqual({
			ok: false,
			message: "An area needs at least 3 corners.",
		});
		expect(
			(
				draw.getSnapshotFeature(loaded!.id!)?.geometry
					.coordinates as number[][][]
			)[0]?.length,
		).toBe(4);
	});

	it("names a shape that is gone", () => {
		const { draw } = startedDraw();
		expect(deleteVertex(draw, { featureId: "nope", index: 0 }).ok).toBe(
			false,
		);
	});
});

describe("a midpoint of the shape open for editing", () => {
	const pointer = (at: VertexPosition, button: "left" | "neither") => {
		const xy = stubAdapter().project(at[0], at[1]);
		return {
			lng: at[0],
			lat: at[1],
			containerX: xy.x,
			containerY: xy.y,
			button,
			heldKeys: [],
			isContextMenu: false,
		};
	};
	const midpointNear = (draw: TerraDraw, at: VertexPosition) =>
		draw
			.getSnapshot()
			.filter((f) => f.properties.midPoint === true)
			.map((f) => f.geometry.coordinates as VertexPosition)
			.sort(
				(a, b) =>
					Math.hypot(a[0] - at[0], a[1] - at[1]) -
					Math.hypot(b[0] - at[0], b[1] - at[1]),
			)[0]!;
	const ringOf = (draw: TerraDraw, id: string | number) =>
		(draw.getSnapshotFeature(id)?.geometry.coordinates as number[][][])[0]!;

	it("inserts a vertex and drags it when a drag starts on it", () => {
		const { draw, select } = startedDraw();
		const id = loadSelected(draw);
		const finishes: (string | undefined)[] = [];
		draw.on("finish", (_id, context) => finishes.push(context?.action));
		// The midpoint of the bottom edge, (4.35, 50.84) to (4.36, 50.84).
		const mid = midpointNear(draw, [4.355, 50.84]);
		const to: VertexPosition = [4.355, 50.835];
		const draggability: boolean[] = [];
		const setDraggability = (enabled: boolean) =>
			draggability.push(enabled);

		select.onDragStart(pointer(mid, "left"), setDraggability);
		select.onDrag(pointer(to, "left"), setDraggability);
		select.onDragEnd(pointer(to, "left"), setDraggability);

		// The map did not pan under the drag.
		expect(draggability).toEqual([false, true]);
		const ring = ringOf(draw, id);
		expect(ring.length).toBe(7);
		expect(ring[1]).toEqual(to);
		// Both steps reach the open save through the finish path.
		expect(finishes).toEqual(["insertMidpoint", "dragCoordinate"]);
	});

	it("still inserts a vertex in place on a click", () => {
		const { draw, select } = startedDraw();
		const id = loadSelected(draw);
		const mid = midpointNear(draw, [4.355, 50.84]);
		select.onClick(pointer(mid, "left"));
		const ring = ringOf(draw, id);
		expect(ring.length).toBe(7);
		expect(ring[1]![0]).toBeCloseTo(mid[0], 6);
		expect(ring[1]![1]).toBeCloseTo(mid[1], 6);
	});
});

describe("a click on the shape open for editing", () => {
	// Corners 200 px apart: every midpoint is 100 px from a corner, farther
	// than the 40 px hit radius, as on the real map at site zoom.
	const wide = {
		type: "Feature",
		properties: { mode: "polygon" },
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[4.35, 50.84],
					[4.37, 50.84],
					[4.37, 50.86],
					[4.35, 50.86],
					[4.35, 50.84],
				],
			],
		},
	};
	const leftClick = (at: VertexPosition) => {
		const xy = stubAdapter().project(at[0], at[1]);
		return {
			lng: at[0],
			lat: at[1],
			containerX: xy.x,
			containerY: xy.y,
			button: "left" as const,
			heldKeys: [],
			isContextMenu: false,
		};
	};
	function loadWide() {
		const { draw, select } = startedDraw();
		const [loaded] = draw.addFeatures([wide as GeoJSONStoreFeatures]);
		draw.selectFeature(loaded!.id!);
		return { draw, select, id: loaded!.id! };
	}

	it("keeps the shape selected and selects the clicked vertex", () => {
		const { draw, select, id } = loadWide();
		// terra-draw handles the click first, then the map's own handler.
		select.onClick(leftClick([4.37, 50.86]));
		expect(draw.getSnapshotFeature(id)?.properties.selected).toBe(true);
		expect(clickVertex(draw, [4.37, 50.86])).toEqual({
			featureId: id,
			index: 2,
			position: [4.37, 50.86],
		});
	});

	it("keeps the shape selected on a stray click off it", () => {
		const { draw, select, id } = loadWide();
		select.onClick(leftClick([4.5, 50.9]));
		expect(draw.getSnapshotFeature(id)?.properties.selected).toBe(true);
		expect(
			draw
				.getSnapshot()
				.filter((f) => f.properties.selectionPoint === true).length,
		).toBe(4);
	});
});

describe("the select mode's key map", () => {
	it("binds no key: no delete, deselect, rotate or scale", () => {
		expect(MAP_SELECT_KEY_EVENTS).toEqual({
			deselect: null,
			delete: null,
			rotate: null,
			scale: null,
		});
		expect(MAP_SELECT_OPTIONS.keyEvents).toBe(MAP_SELECT_KEY_EVENTS);
	});

	it("offers no rotate or scale flag on any shape", () => {
		for (const flags of Object.values(MAP_SELECT_OPTIONS.flags)) {
			const feature = flags.feature as Record<string, unknown>;
			expect(feature.rotateable).toBeUndefined();
			expect(feature.scaleable).toBeUndefined();
		}
	});

	function pressWithControl(
		select: TerraDrawSelectMode,
		key: string,
	): number {
		let prevented = 0;
		const event = {
			key,
			heldKeys: ["Control", key],
			preventDefault: () => {
				prevented++;
			},
		};
		select.onKeyDown(event);
		select.onKeyUp(event);
		return prevented;
	}

	it("terra-draw's defaults swallow Ctrl+R and Ctrl+S (the defect)", () => {
		const { draw, select } = startedDraw({
			...MAP_SELECT_OPTIONS,
			keyEvents: undefined,
		});
		loadSelected(draw);
		expect(pressWithControl(select, "r")).toBeGreaterThan(0);
		expect(pressWithControl(select, "s")).toBeGreaterThan(0);
	});

	it("leaves Ctrl+R and Ctrl+S to the browser, and the shape as it was", () => {
		const { draw, select } = startedDraw();
		const id = loadSelected(draw);
		const before = structuredClone(draw.getSnapshotFeature(id)!.geometry);
		expect(pressWithControl(select, "r")).toBe(0);
		expect(pressWithControl(select, "s")).toBe(0);
		expect(draw.getSnapshotFeature(id)!.geometry).toEqual(before);
		expect(draw.getSnapshotFeature(id)?.properties.selected).toBe(true);
	});
});

describe("the select mode's handle sizes", () => {
	it("are larger than terra-draw's defaults on a mouse", () => {
		const fine = selectHandleStyles(false);
		expect(fine).toBe(FINE_POINTER_HANDLES);
		// terra-draw 1.31.2 draws a vertex at radius 6, a midpoint at 4.
		expect(fine.selectionPointWidth).toBeGreaterThan(6);
		expect(fine.midPointWidth).toBeGreaterThan(4);
	});

	it("are larger again for a finger", () => {
		const fine = selectHandleStyles(false);
		const coarse = selectHandleStyles(true);
		expect(coarse).toBe(COARSE_POINTER_HANDLES);
		expect(coarse.selectionPointWidth).toBeGreaterThan(
			fine.selectionPointWidth,
		);
		expect(coarse.midPointWidth).toBeGreaterThan(fine.midPointWidth);
		// A vertex handle a fingertip can find: at least 24 px across.
		expect(
			2 *
				(coarse.selectionPointWidth +
					coarse.selectionPointOutlineWidth),
		).toBeGreaterThanOrEqual(24);
	});

	it("keep the midpoint smaller than the vertex", () => {
		for (const coarse of [false, true]) {
			const styles = selectHandleStyles(coarse);
			expect(styles.midPointWidth).toBeLessThan(
				styles.selectionPointWidth,
			);
		}
	});

	it("change sizes only, never colours, and keep the hit radius", () => {
		for (const coarse of [false, true]) {
			const options = mapSelectOptions(coarse);
			expect(Object.keys(options.styles).sort()).toEqual([
				"midPointOutlineWidth",
				"midPointWidth",
				"selectionPointOutlineWidth",
				"selectionPointWidth",
			]);
			expect(options.pointerDistance).toBe(SELECT_POINTER_DISTANCE_PX);
			expect(options.keyEvents).toBe(MAP_SELECT_KEY_EVENTS);
		}
	});

	it("reach terra-draw's drawn handles", () => {
		for (const coarse of [false, true]) {
			const expected = selectHandleStyles(coarse);
			const { draw, select } = startedDraw(mapSelectOptions(coarse));
			loadSelected(draw);
			const snapshot = draw.getSnapshot();
			const vertex = snapshot.find(
				(f) => f.properties.selectionPoint === true,
			)!;
			const midpoint = snapshot.find(
				(f) => f.properties.midPoint === true,
			)!;
			expect(select.styleFeature(vertex).pointWidth).toBe(
				expected.selectionPointWidth,
			);
			expect(select.styleFeature(midpoint).pointWidth).toBe(
				expected.midPointWidth,
			);
			// The colour is terra-draw's own, unchanged.
			const { draw: plainDraw, select: plain } = startedDraw();
			loadSelected(plainDraw);
			const plainVertex = plainDraw
				.getSnapshot()
				.find((f) => f.properties.selectionPoint === true)!;
			expect(select.styleFeature(vertex).pointColor).toBe(
				plain.styleFeature(plainVertex).pointColor,
			);
		}
	});
});
