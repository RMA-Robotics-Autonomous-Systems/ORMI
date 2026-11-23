import { describe, expect, it } from "bun:test";
import {
	TerraDraw,
	TerraDrawLineStringMode,
	TerraDrawPolygonMode,
	TerraDrawSelectMode,
	type GeoJSONStoreFeatures,
} from "terra-draw";

import { DRAW_FINISH_DISTANCE_PX } from "./map-draw-finish";
import {
	SNAP_TOLERANCE_PX,
	buildSnapTargets,
	createSnapHook,
	type SnapIndicator,
	type SnapPosition,
	type SnapSourceFeature,
} from "./map-snap";
import { mapSelectOptions } from "./map-vertex-edit";

/**
 * The snapping hooks against the real terra-draw 1.31.2 modes: the select
 * mode's vertex drag, a midpoint drag, and the polygon and line draw modes,
 * on a stub adapter with a linear projection (10 px per 0.001 degree).
 */

const PX_PER_DEGREE = 10_000;

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

/** A pointer event at a position, offset by some screen pixels. */
function pointer(at: SnapPosition, dx = 0, dy = 0) {
	const xy = stubAdapter().project(at[0], at[1]);
	const ll = stubAdapter().unproject(xy.x + dx, xy.y + dy);
	return {
		lng: ll.lng,
		lat: ll.lat,
		containerX: xy.x + dx,
		containerY: xy.y + dy,
		button: "left" as const,
		heldKeys: [],
		isContextMenu: false,
	};
}

/** A stored neighbour: a square east of the edited shape. */
const NEIGHBOUR_CORNER: SnapPosition = [4.3712345, 50.8401234];
const neighbour: SnapSourceFeature = {
	properties: { feature_id: "yard", feature_type: "risk" },
	geometry: {
		type: "Polygon",
		coordinates: [
			[
				NEIGHBOUR_CORNER,
				[4.38, 50.8401234],
				[4.38, 50.85],
				[4.3712345, 50.85],
				NEIGHBOUR_CORNER,
			],
		],
	},
};

function harness(enabled = true) {
	const indicators: (SnapIndicator | null)[] = [];
	let on = enabled;
	const deps = {
		enabled: () => on,
		targets: () => buildSnapTargets([neighbour], { hidden: new Set() }),
		tolerancePx: SNAP_TOLERANCE_PX,
		finishDistancePx: DRAW_FINISH_DISTANCE_PX,
		onIndicator: (indicator: SnapIndicator | null) =>
			indicators.push(indicator),
	};
	const drawing = {
		toCustom: createSnapHook({ ...deps, gesture: "drawing" }),
	};
	const select = new TerraDrawSelectMode(
		mapSelectOptions(
			false,
			createSnapHook({ ...deps, gesture: "dragging" }),
		),
	);
	const polygon = new TerraDrawPolygonMode({
		pointerDistance: DRAW_FINISH_DISTANCE_PX,
		snapping: drawing,
	});
	const line = new TerraDrawLineStringMode({
		pointerDistance: DRAW_FINISH_DISTANCE_PX,
		snapping: drawing,
	});
	const draw = new TerraDraw({
		adapter: stubAdapter() as never,
		modes: [line, polygon, select],
	});
	draw.start();
	const finishes: (string | undefined)[] = [];
	draw.on("finish", (_id, context) => finishes.push(context?.action));
	return {
		draw,
		select,
		polygon,
		line,
		indicators,
		finishes,
		setEnabled: (value: boolean) => {
			on = value;
		},
	};
}

/** The edited shape: a square west of the neighbour, its east side 20 px off. */
const square: SnapPosition[] = [
	[4.36, 50.84],
	[4.369, 50.84],
	[4.369, 50.849],
	[4.36, 50.849],
];

function loadSquare(draw: TerraDraw) {
	const [loaded] = draw.addFeatures([
		{
			type: "Feature",
			properties: { mode: "polygon" },
			geometry: {
				type: "Polygon",
				coordinates: [[...square, square[0]!]],
			},
		} as GeoJSONStoreFeatures,
	]);
	expect(loaded?.valid).toBe(true);
	draw.setMode("select");
	draw.selectFeature(loaded!.id!);
	return loaded!.id!;
}

const ringOf = (draw: TerraDraw, id: string | number) =>
	(draw.getSnapshotFeature(id)?.geometry.coordinates as number[][][])[0]!;

function dragVertex(
	select: TerraDrawSelectMode,
	from: SnapPosition,
	to: ReturnType<typeof pointer>,
) {
	const noop = () => {};
	select.onDragStart(pointer(from), noop);
	select.onDrag(to, noop);
	select.onDragEnd(to, noop);
}

describe("a dragged vertex", () => {
	it("lands exactly on another feature's vertex in reach", () => {
		const { draw, select, finishes, indicators } = harness();
		const id = loadSquare(draw);
		// Corner 1 dragged to 4 px off the neighbour's corner.
		dragVertex(select, square[1]!, pointer(NEIGHBOUR_CORNER, 3, -2.5));
		expect(ringOf(draw, id)[1]).toEqual(NEIGHBOUR_CORNER);
		// One drag, one finish: one Undo step.
		expect(finishes).toEqual(["dragCoordinate"]);
		expect(indicators.at(-1)).toEqual({
			kind: "vertex",
			position: NEIGHBOUR_CORNER,
		});
	});

	it("keeps the raw position with snapping off", () => {
		const { draw, select, setEnabled } = harness();
		setEnabled(false);
		const id = loadSquare(draw);
		const to = pointer(NEIGHBOUR_CORNER, 3, -2.5);
		dragVertex(select, square[1]!, to);
		const landed = ringOf(draw, id)[1]!;
		expect(landed).not.toEqual(NEIGHBOUR_CORNER);
		expect(landed[0]).toBeCloseTo(to.lng, 9);
		expect(landed[1]).toBeCloseTo(to.lat, 9);
	});

	it("dragged out of a midpoint, lands on another feature's edge", () => {
		const { draw, select } = harness();
		const id = loadSquare(draw);
		// The east edge's midpoint, (4.369, 50.8445), dragged to 5 px west
		// of the neighbour's west edge (x = 4.3712345).
		const mid: SnapPosition = [4.369, 50.8445];
		const to = pointer([4.3712345, 50.8445], -5, 0);
		dragVertex(select, mid, to);
		const ring = ringOf(draw, id);
		expect(ring).toHaveLength(6);
		expect(ring[2]![0]).toBeCloseTo(4.3712345, 9);
		expect(ring[2]![1]).toBeCloseTo(50.8445, 9);
	});

	it("is not pulled onto its own old position or a neighbour of its own", () => {
		const { draw, select } = harness();
		const id = loadSquare(draw);
		// 5 px east of corner 1's start: no other feature in reach.
		const to = pointer(square[1]!, 5, 0);
		dragVertex(select, square[1]!, to);
		expect(ringOf(draw, id)[1]![0]).toBeCloseTo(to.lng, 9);
	});
});

function click(
	mode: TerraDrawPolygonMode | TerraDrawLineStringMode,
	event: ReturnType<typeof pointer>,
) {
	mode.onMouseMove(event);
	mode.onClick(event);
}

describe("drawing a polygon", () => {
	it("places a corner exactly on another feature's vertex", () => {
		const { draw, polygon, finishes } = harness();
		draw.setMode("polygon");
		click(polygon, pointer([4.36, 50.84]));
		click(polygon, pointer(NEIGHBOUR_CORNER, -4, 3));
		click(polygon, pointer([4.37, 50.85]));
		click(polygon, pointer([4.36, 50.84], 2, 2));
		expect(finishes).toEqual(["draw"]);
		const [shape] = draw
			.getSnapshot()
			.filter((f) => f.geometry.type === "Polygon");
		const ring = (shape!.geometry.coordinates as number[][][])[0]!;
		expect(ring).toHaveLength(4);
		expect(ring[1]).toEqual(NEIGHBOUR_CORNER);
	});

	it("still closes on its first corner when that corner sits on another feature", () => {
		const { draw, polygon, finishes, indicators } = harness();
		draw.setMode("polygon");
		// The first corner snapped onto the neighbour's corner.
		click(polygon, pointer(NEIGHBOUR_CORNER, 3, 3));
		click(polygon, pointer([4.38, 50.835]));
		click(polygon, pointer([4.375, 50.83]));
		// Back on the first corner, inside the finish distance and inside
		// the snap tolerance of the neighbour's corner.
		const closing = pointer(NEIGHBOUR_CORNER, -3, 4);
		polygon.onMouseMove(closing);
		expect(indicators.at(-1)).toBeNull();
		polygon.onClick(closing);
		expect(finishes).toEqual(["draw"]);
		const shapes = draw
			.getSnapshot()
			.filter((f) => f.geometry.type === "Polygon");
		expect(shapes).toHaveLength(1);
		const ring = (shapes[0]!.geometry.coordinates as number[][][])[0]!;
		expect(ring).toHaveLength(4);
		expect(ring[0]).toEqual(NEIGHBOUR_CORNER);
		expect(ring[3]).toEqual(NEIGHBOUR_CORNER);
	});

	it("still closes on its first corner with another feature's edge under it", () => {
		const { draw, polygon, finishes } = harness();
		draw.setMode("polygon");
		const first: SnapPosition = [4.3712345, 50.845];
		click(polygon, pointer(first));
		click(polygon, pointer([4.365, 50.84]));
		click(polygon, pointer([4.365, 50.85]));
		click(polygon, pointer(first, -2, 3));
		expect(finishes).toEqual(["draw"]);
	});
});

describe("drawing a line", () => {
	it("still finishes on its last point", () => {
		const { draw, line, finishes } = harness();
		draw.setMode("linestring");
		click(line, pointer([4.36, 50.845]));
		click(line, pointer(NEIGHBOUR_CORNER, 2, -2));
		click(line, pointer(NEIGHBOUR_CORNER, -3, 2));
		expect(finishes).toEqual(["draw"]);
		const [shape] = draw
			.getSnapshot()
			.filter((f) => f.geometry.type === "LineString");
		const path = shape!.geometry.coordinates as number[][];
		expect(path).toHaveLength(2);
		expect(path[1]).toEqual(NEIGHBOUR_CORNER);
	});
});
