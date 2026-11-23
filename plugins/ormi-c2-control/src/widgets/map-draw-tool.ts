/**
 * The one-shot Draw tool on the C2 map: what arms and disarms it, what the
 * hint chip says while it is armed, and when the chip's Finish button may
 * complete the shape.
 *
 * Draw used to stay armed after a shape: the next click on the map started a
 * second shape, which an operator who only meant to draw one did not expect.
 * Now Draw authors exactly one shape and the map returns to select by itself,
 * with the new shape open exactly like a clicked stored feature.
 *
 * The finish gestures are terra-draw 1.31.2's own (read from its mode
 * sources), so the hints describe what the library really does:
 * - point: a click places the point and finishes;
 * - linestring: a click adds a point; a click on the last point (which a
 *   double-click is) or Enter finishes; it needs two points;
 * - polygon: a click adds a corner; a click on the first or the last corner
 *   (which a double-click is) or Enter finishes; it needs three corners;
 * - rectangle: the default `click-move` interaction: a click on one corner,
 *   then a click on the opposite corner. A drag does not draw one.
 *
 * Pure (no React, no map) so the rules are unit-testable on their own.
 */

import type { DrawShape } from "./mission-editor-helpers";

/**
 * The active tool. `select` is the resting state: a click selects a feature
 * and opens it for editing at once. `draw` authors one new shape.
 */
export type MapTool = "select" | "draw";

/** What can happen to the Draw tool. */
export type DrawToolEvent =
	/** The Draw button. Arming asks first about unsaved changes (the caller). */
	| "toggle"
	/** Escape while armed, with or without a shape half drawn. */
	| "escape"
	/** terra-draw finished a NEW shape. */
	| "finish-new"
	/** terra-draw finished an edit of an open shape (select mode). */
	| "finish-edit";

/**
 * The tool after an event.
 *
 * @param tool - The tool now.
 * @param event - What happened.
 * @returns The next tool.
 */
export function nextMapTool(tool: MapTool, event: DrawToolEvent): MapTool {
	switch (event) {
		case "toggle":
			return tool === "draw" ? "select" : "draw";
		case "escape":
		case "finish-new":
			return "select";
		case "finish-edit":
			return tool;
	}
}

/**
 * The hint chip's next step while Draw is armed. One sentence per shape, the
 * shape's real finish gesture included.
 *
 * @param shape - The shape Draw authors.
 * @returns The text.
 */
export function drawHint(shape: DrawShape): string {
	switch (shape) {
		case "point":
			return "Click to place the point.";
		case "line":
			return "Click to add points. Double-click or click the last point to finish.";
		case "polygon":
			return "Click to add corners. Double-click or click the first corner to finish.";
		case "rectangle":
			return "Click one corner, then the opposite corner.";
	}
}

/**
 * Whether the shape takes a Finish button. A point and a rectangle finish on
 * a click of their own; a line and a polygon finish on a double-click, which
 * is unreliable on touch.
 *
 * @param shape - The shape Draw authors.
 * @returns True for a line or a polygon.
 */
export function takesFinishButton(shape: DrawShape): boolean {
	return shape === "line" || shape === "polygon";
}

/** The least points a shape needs before Finish may complete it. */
const MIN_POINTS: Partial<Record<DrawShape, number>> = {
	line: 2,
	polygon: 3,
};

/**
 * Whether Finish may complete the shape in progress.
 *
 * @param shape - The shape Draw authors.
 * @param placed - Points placed so far ({@link placedDrawPoints}).
 * @returns True when the shape has enough points.
 */
export function canFinishDrawing(shape: DrawShape, placed: number): boolean {
	const min = MIN_POINTS[shape];
	return min !== undefined && placed >= min;
}

/** A feature as terra-draw's snapshot holds it, mid-draw. */
export interface DrawingFeature {
	geometry?: { type?: string; coordinates?: unknown };
	properties?: Record<string, unknown>;
}

/**
 * Points the operator has placed on a shape terra-draw is drawing, or null
 * when the feature is not a shape in progress (a finished shape, a guidance
 * point, anything else).
 *
 * terra-draw keeps a live point under the pointer on a line in progress
 * (`createLine` starts it at two coordinates for one click), so a line has
 * one point fewer than coordinates. A polygon records the count itself, in
 * `committedCoordinateCount`. A rectangle in progress has its first corner.
 *
 * @param feature - A feature from terra-draw's snapshot.
 * @returns The count, or null.
 */
export function placedDrawPoints(
	feature: DrawingFeature | undefined,
): number | null {
	const props = feature?.properties;
	if (!props || props.currentlyDrawing !== true) return null;
	const coordinates = feature?.geometry?.coordinates;
	switch (props.mode) {
		case "linestring":
			return Array.isArray(coordinates)
				? Math.max(0, coordinates.length - 1)
				: null;
		case "polygon":
			return typeof props.committedCoordinateCount === "number"
				? props.committedCoordinateCount
				: null;
		case "rectangle":
			return 1;
		default:
			return null;
	}
}

/**
 * What Escape (or Delete with no vertex selected) does to a shape just drawn
 * and not saved yet. An unnamed shape is most often one drawn by accident and
 * goes at once; a name is the operator's typing, so it asks first.
 *
 * @param name - The name typed so far.
 * @returns `discard` at once, or `ask` first.
 */
export function newShapeDiscard(name: string): "discard" | "ask" {
	return name.trim().length > 0 ? "ask" : "discard";
}

/** The key press while Draw is armed, and where focus was. */
export interface DrawKeyEvent {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	/** Focus is inside an open list or menu, which answers Escape itself. */
	inPopup?: boolean;
}

/**
 * The action a key asks for while Draw is armed. The caller has already
 * ruled out typing in a field and an open dialog. Only Escape is the map's:
 * it disarms, which also discards a shape half drawn (terra-draw drops it
 * when its mode stops). Enter is terra-draw's own finish key and is left to
 * it.
 *
 * @param event - The key and its context.
 * @returns `disarm`, or null when the key is not for the map.
 */
export function drawKeyAction(event: DrawKeyEvent): "disarm" | null {
	if (event.inPopup) return null;
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	return event.key === "Escape" ? "disarm" : null;
}
