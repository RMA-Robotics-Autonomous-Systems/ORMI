import { describe, expect, it } from "bun:test";
import {
	TerraDraw,
	TerraDrawLineStringMode,
	TerraDrawPolygonMode,
	TerraDrawSelectMode,
	type GeoJSONStoreFeatures,
} from "terra-draw";

import {
	MAP_SELECT_KEY_EVENTS,
	SELECT_POINTER_DISTANCE_PX,
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

const EDITABLE = {
	feature: {
		draggable: true,
		coordinates: { midpoints: true, draggable: true, deletable: true },
	},
};

function startedDraw(keyEvents?: typeof MAP_SELECT_KEY_EVENTS) {
	const select = new TerraDrawSelectMode({
		pointerDistance: SELECT_POINTER_DISTANCE_PX,
		keyEvents,
		flags: { linestring: EDITABLE, polygon: EDITABLE },
	});
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
		const { draw, select } = startedDraw();
		const id = loadSelected(draw);
		select.onKeyUp(keyUp("Delete"));
		expect(draw.hasFeature(id)).toBe(false);
	});

	it("keeps the shape on Delete with the map's key bindings", () => {
		const { draw, select } = startedDraw(MAP_SELECT_KEY_EVENTS);
		const id = loadSelected(draw);
		select.onKeyUp(keyUp("Delete"));
		select.onKeyUp(keyUp("Backspace"));
		expect(draw.hasFeature(id)).toBe(true);
	});

	it("finds the clicked vertex handle and deletes that vertex only", () => {
		const { draw } = startedDraw(MAP_SELECT_KEY_EVENTS);
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
		const { draw } = startedDraw(MAP_SELECT_KEY_EVENTS);
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
		const { draw } = startedDraw(MAP_SELECT_KEY_EVENTS);
		expect(deleteVertex(draw, { featureId: "nope", index: 0 }).ok).toBe(
			false,
		);
	});
});
