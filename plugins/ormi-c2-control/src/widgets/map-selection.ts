/**
 * Select-first editing on the C2 map: what a click, a key or a request to
 * open another feature does to the feature open for editing.
 *
 * The map used to have armed tools (Pick, Edit, Delete). An operator had to
 * arm Edit before a click opened a shape, and Delete stayed armed after a
 * delete. Now a click selects a feature and opens it for editing at once, a
 * floating card holds Save, Cancel and Delete, and the keys act on what is
 * open. Unsaved changes are never dropped without asking: the geofence covers
 * the whole site, so a click meant for something inside it is common.
 *
 * Pure (no React, no map) so the rules are unit-testable on their own.
 */

import { isVertexDeleteKey } from "./map-vertex-edit";

/** A geometry as the map and terra-draw hold it. */
export interface SnapshotGeometry {
	type: string;
	coordinates: unknown;
}

/** What an edit can change: the shape and its name, type and category. */
export interface EditSnapshot {
	name: string;
	featureType: string;
	category: string;
	geometry: SnapshotGeometry | null | undefined;
}

/**
 * Two coordinates further apart than this (degrees) are different. terra-draw
 * keeps 9 decimals; the C2 stores 7.
 */
const COORDINATE_EPSILON = 1e-9;

function sameCoordinates(a: unknown, b: unknown): boolean {
	if (typeof a === "number" && typeof b === "number") {
		return Math.abs(a - b) <= COORDINATE_EPSILON;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!sameCoordinates(a[i], b[i])) return false;
		}
		return true;
	}
	return a === b;
}

/**
 * Whether two geometries are the same shape.
 * @param a - One geometry.
 * @param b - The other.
 * @returns True when the type and every coordinate match.
 */
export function sameGeometry(
	a: SnapshotGeometry | null | undefined,
	b: SnapshotGeometry | null | undefined,
): boolean {
	if (!a || !b) return a == b;
	return a.type === b.type && sameCoordinates(a.coordinates, b.coordinates);
}

/**
 * Whether the open edit has changes worth saving (and worth asking about
 * before they are dropped).
 *
 * @param current - The edit as it is now.
 * @param original - The feature as it was opened, or undefined for a shape
 *   that was just drawn: a new shape is unsaved by definition.
 * @returns True when Save would write something new.
 */
export function hasUnsavedChanges(
	current: EditSnapshot,
	original: EditSnapshot | undefined,
): boolean {
	if (!original) return true;
	return (
		current.name.trim() !== original.name.trim() ||
		current.featureType !== original.featureType ||
		current.category !== original.category ||
		!sameGeometry(current.geometry, original.geometry)
	);
}

/** What a click (or a request to show a feature) does to the open edit. */
export type SelectionChange =
	/** The click is on the feature already open: terra-draw's to handle. */
	| "stay"
	/** Select the target (or nothing) at once. */
	| "switch"
	/** The open edit has changes: ask before dropping them. */
	| "ask";

/**
 * Decide what selecting `targetId` does while `openId` is open.
 *
 * @param openId - The `feature_id` open for editing, or null.
 * @param hasChanges - Whether the open edit has unsaved changes.
 * @param targetId - The feature clicked, or null for empty map.
 * @returns The change to make.
 */
export function selectionChangeOnClick(
	openId: string | null,
	hasChanges: boolean,
	targetId: string | null,
): SelectionChange {
	if (openId === null) return "switch";
	if (targetId === openId) return "stay";
	return hasChanges ? "ask" : "switch";
}

/** A feature terra-draw reports under the pointer. */
export interface DrawCandidate {
	id?: string | number;
	properties?: Record<string, unknown>;
}

/** What part of the open shape a click reached, if any. */
export type OpenShapeContact =
	/** A vertex handle or a midpoint: terra-draw acts on the click. */
	| "guidance"
	/** The shape itself (a line or point within reach, or inside an area). */
	| "shape";

/**
 * Which part of the shape open in terra-draw a click reached, within
 * terra-draw's own hit radius.
 *
 * A handle or a midpoint wins over anything under it: terra-draw acts on that
 * click (a midpoint click inserts a vertex), so the map must not also treat it
 * as a pick of another feature. The shape itself only matters when the click
 * picked nothing: the inside of an open area still lets a smaller feature in
 * it be picked, and a click just off an open line keeps the line open.
 *
 * @param candidates - terra-draw's features under the pointer, guidance included.
 * @param openDrawId - terra-draw id of the open shape.
 * @returns What was reached, or null.
 */
export function openShapeContact(
	candidates: readonly DrawCandidate[],
	openDrawId: string | number | null,
): OpenShapeContact | null {
	if (openDrawId === null) return null;
	let shape = false;
	for (const candidate of candidates) {
		if (
			candidate.properties?.selectionPointFeatureId === openDrawId ||
			candidate.properties?.midPointFeatureId === openDrawId
		) {
			return "guidance";
		}
		if (candidate.id === openDrawId) shape = true;
	}
	return shape ? "shape" : null;
}

/** What a history key asks for. */
export type HistoryKeyAction = "undo" | "redo";

/**
 * The history action of a key press: Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z
 * and Ctrl+Y redo. Alt never counts (AltGr reports Ctrl+Alt on Windows).
 *
 * @param event - The key and its modifiers.
 * @returns The action, or null when the key is not a history key.
 */
export function historyKeyAction(event: {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}): HistoryKeyAction | null {
	if (event.altKey || !(event.ctrlKey || event.metaKey)) return null;
	const key = event.key.toLowerCase();
	if (key === "z") return event.shiftKey ? "redo" : "undo";
	if (key === "y" && event.ctrlKey && !event.shiftKey) return "redo";
	return null;
}

/** What a key does to the open edit. */
export type EditKeyAction =
	| "delete-vertex"
	| "ask-delete-feature"
	| "save"
	| "cancel"
	| "undo"
	| "redo";

/** The key press, and where focus was. */
export interface EditKeyEvent {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	/** Focus is on a button, link or other control that answers Enter. */
	onControl?: boolean;
	/** Focus is inside an open list or menu, which answers Escape itself. */
	inPopup?: boolean;
}

/**
 * The action a key asks for while a feature is open for editing. The caller
 * has already ruled out typing in a field and an open dialog.
 *
 * - Delete / Backspace: remove the selected vertex; with none selected, ask
 *   to delete the whole feature.
 * - Enter: save, when there are changes.
 * - Escape: cancel (discard the changes and deselect).
 * - Ctrl/Cmd+Z: undo a geometry step; Ctrl/Cmd+Shift+Z or Ctrl+Y: redo one
 *   (`historyKeyAction`). With nothing to undo or redo the key is left to
 *   the browser.
 *
 * @param event - The key and its context.
 * @param state - Whether a vertex is selected, whether there are changes,
 *   and whether the geometry history has a step either way.
 * @returns The action, or null when the key is not for the edit.
 */
export function editKeyAction(
	event: EditKeyEvent,
	state: {
		vertexSelected: boolean;
		hasChanges: boolean;
		canUndo?: boolean;
		canRedo?: boolean;
	},
): EditKeyAction | null {
	if (event.inPopup) return null;
	const history = historyKeyAction(event);
	if (history === "undo") return state.canUndo ? "undo" : null;
	if (history === "redo") return state.canRedo ? "redo" : null;
	if (isVertexDeleteKey(event)) {
		return state.vertexSelected ? "delete-vertex" : "ask-delete-feature";
	}
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (event.key === "Escape") return "cancel";
	if (event.key === "Enter" && !event.shiftKey) {
		if (event.onControl) return null;
		return state.hasChanges ? "save" : null;
	}
	return null;
}

/**
 * The toolbar's state label while a feature is open.
 * @param name - The feature's name as stored, possibly empty.
 * @param fallback - What to call it without a name (its type).
 * @returns E.g. "Editing Gravel yard".
 */
export function editingLabel(name: string, fallback: string): string {
	const trimmed = name.trim();
	return `Editing ${trimmed.length > 0 ? trimmed : fallback}`;
}

/** What the map is doing, for the toolbar's one state indicator. */
export type MapActivity =
	/** Nothing open and nothing armed. */
	| { kind: "idle" }
	/** A stored feature open for editing. */
	| { kind: "editing"; name: string; typeLabel: string }
	/** A shape Draw just finished, not saved yet. */
	| { kind: "new"; typeLabel: string }
	/** Draw armed, authoring a shape of this type. */
	| { kind: "drawing"; typeLabel: string }
	/** Several features selected (`map-multi-select.ts`). */
	| { kind: "group"; count: number }
	/** Move armed on the selected group; `count` are the ones that move. */
	| { kind: "moving"; count: number };

/**
 * The toolbar's state indicator: one label for whatever the map is doing,
 * so the state never needs a second control to read.
 *
 * @param activity - What the map is doing.
 * @returns "" (idle), "Editing Gravel yard", "New zone", "Drawing zone",
 *   "3 selected" or "Moving 3 features".
 */
export function mapStateLabel(activity: MapActivity): string {
	switch (activity.kind) {
		case "idle":
			return "";
		case "editing":
			return editingLabel(activity.name, activity.typeLabel);
		case "new":
			return `New ${activity.typeLabel.toLowerCase()}`;
		case "drawing":
			return `Drawing ${activity.typeLabel.toLowerCase()}`;
		case "group":
			return `${activity.count} selected`;
		case "moving":
			return `Moving ${activity.count} feature${activity.count === 1 ? "" : "s"}`;
	}
}
