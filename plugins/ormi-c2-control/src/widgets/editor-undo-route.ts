/**
 * Which history an Undo or a Redo takes a step in.
 *
 * Two histories are LOCAL to the map: the open edit's geometry steps
 * (`map-edit-history.ts`) and the selected group's unsaved move
 * (`map-group-move.ts`). They are inner scopes: while one is active and has
 * a step to take, it takes it. When it has none, the press falls through to
 * the mission's history (`state/mission-undo.ts`), so Ctrl+Z never goes dead
 * on the map while the mission has something to take back.
 *
 * The mission's history is frozen, never cleared, while the plan is approved
 * (view only): nothing is taken back over a dispatched plan, and everything
 * is still there when the operator takes Author back.
 */

/** A history Undo / Redo can step in. */
export type UndoScope = "edit" | "group" | "mission";

/** Whether a history can step back and forward. */
export interface HistorySides {
	canUndo: boolean;
	canRedo: boolean;
}

/** What the routing reads. */
export interface UndoRouteState {
	/** The open edit's geometry history, while a shape is open. */
	edit?: HistorySides | null;
	/** The selected group's move history, while a group is selected. */
	group?: HistorySides | null;
	/** The open mission's history, in a mission. */
	mission?: HistorySides | null;
	/** View only (the plan is approved, or View chosen): the mission's history is frozen. */
	frozen?: boolean;
}

/**
 * The history a press takes a step in.
 *
 * @param direction - Undo or Redo.
 * @param state - The histories in reach.
 * @returns The scope to step, or null when none has a step.
 */
export function routeUndo(
	direction: "undo" | "redo",
	state: UndoRouteState,
): UndoScope | null {
	const can = (sides: HistorySides | null | undefined) =>
		sides != null && (direction === "undo" ? sides.canUndo : sides.canRedo);
	if (can(state.edit)) return "edit";
	if (can(state.group)) return "group";
	if (!state.frozen && can(state.mission)) return "mission";
	return null;
}
