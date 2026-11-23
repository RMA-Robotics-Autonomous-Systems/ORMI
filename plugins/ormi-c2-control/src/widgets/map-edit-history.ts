/**
 * Undo and Redo for the shape open for editing on the C2 map.
 *
 * The history covers the GEOMETRY of the open edit only: a vertex or the
 * whole shape dragged, a vertex deleted, a vertex inserted from a midpoint.
 * Name, type and category are form fields with their own text undo. The
 * history lives on the open edit itself, so it starts empty when a feature
 * opens and is gone when the edit ends (Save, Cancel, another feature).
 *
 * Why the app keeps it rather than terra-draw 1.31.2: terra-draw's own
 * undo/redo comes in two levels. The mode level covers a line or polygon
 * while it is being DRAWN (not select-mode edits). The session level records
 * every API create, update and delete in the whole terra-draw session: the
 * feature the map adds to open an edit is itself an undoable create, and
 * the map's own restores (`updateFeatureGeometry`) would be recorded as new
 * edits. Scoping that to one edit needs bookkeeping against its internals;
 * a stack of geometries per edit does not.
 *
 * Pure (no React, no map) so the rules are unit-testable on their own.
 */

import { type SnapshotGeometry, sameGeometry } from "./map-selection";

/** Most geometry steps kept per edit; the oldest is dropped beyond it. */
export const EDIT_HISTORY_LIMIT = 100;

/** The geometry steps of one edit, either side of the shape as it is now. */
export interface GeometryHistory<G extends SnapshotGeometry> {
	/** Earlier geometries, oldest first. Undo restores the last one. */
	past: readonly G[];
	/** Geometries undone, nearest first. Redo restores the first one. */
	future: readonly G[];
}

/** A history with nothing to undo or redo. */
export function emptyHistory<G extends SnapshotGeometry>(): GeometryHistory<G> {
	return { past: [], future: [] };
}

/**
 * The history after the shape changed from `before` to `after`. A change
 * that leaves the shape where it was is not a step. A new step drops what
 * was undone, as in any editor.
 *
 * One gesture can reach the map as two changes: a drag that starts on a
 * midpoint inserts the vertex (one change) and then moves it (another).
 * `continuesLastStep` folds the second into the first, so one Undo takes
 * the whole gesture back.
 *
 * @param history - The history so far, or undefined for none yet.
 * @param before - The geometry before the change.
 * @param after - The geometry after it.
 * @param options - `continuesLastStep`: this change completes the gesture
 *   of the last step recorded.
 * @returns The new history (the same object when nothing changed).
 */
export function recordGeometry<G extends SnapshotGeometry>(
	history: GeometryHistory<G> | undefined,
	before: G,
	after: G,
	options: { continuesLastStep?: boolean } = {},
): GeometryHistory<G> {
	const current = history ?? emptyHistory<G>();
	if (sameGeometry(before, after)) return current;
	if (options.continuesLastStep && current.past.length > 0) {
		return { past: current.past, future: [] };
	}
	const past = [...current.past, before];
	if (past.length > EDIT_HISTORY_LIMIT) past.shift();
	return { past, future: [] };
}

/** A step taken: the geometry to show and the history after it. */
export interface HistoryStep<G extends SnapshotGeometry> {
	geometry: G;
	history: GeometryHistory<G>;
}

/**
 * Whether Undo has a step to take.
 * @param history - The history, or undefined for none.
 * @returns True when an earlier geometry is kept.
 */
export function canUndo(
	history: GeometryHistory<SnapshotGeometry> | undefined,
): boolean {
	return (history?.past.length ?? 0) > 0;
}

/**
 * Whether Redo has a step to take.
 * @param history - The history, or undefined for none.
 * @returns True when an undone geometry is kept.
 */
export function canRedo(
	history: GeometryHistory<SnapshotGeometry> | undefined,
): boolean {
	return (history?.future.length ?? 0) > 0;
}

/**
 * Step back one geometry.
 * @param history - The history.
 * @param current - The geometry shown now, which Redo will restore.
 * @returns The step, or null when there is nothing to undo.
 */
export function undoGeometry<G extends SnapshotGeometry>(
	history: GeometryHistory<G> | undefined,
	current: G,
): HistoryStep<G> | null {
	if (!history || history.past.length === 0) return null;
	const geometry = history.past[history.past.length - 1]!;
	return {
		geometry,
		history: {
			past: history.past.slice(0, -1),
			future: [current, ...history.future],
		},
	};
}

/**
 * Step forward one geometry.
 * @param history - The history.
 * @param current - The geometry shown now, which Undo will restore.
 * @returns The step, or null when there is nothing to redo.
 */
export function redoGeometry<G extends SnapshotGeometry>(
	history: GeometryHistory<G> | undefined,
	current: G,
): HistoryStep<G> | null {
	if (!history || history.future.length === 0) return null;
	const [geometry, ...future] = history.future;
	return {
		geometry: geometry!,
		history: { past: [...history.past, current], future },
	};
}
