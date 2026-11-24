/**
 * One mission's undo / redo history, as pure data.
 *
 * A mission is three working copies (the draft, the behaviour graph and the
 * map's assets, each in its own store), and an operator edit can touch more
 * than one of them: importing an asset and allocating an agent are different
 * panels, but one Ctrl+Z must take back whichever came last, from either
 * panel. So the history is kept per MISSION, not per store, and a command
 * records the parts it changed as SNAPSHOTS: before and after, per part. The
 * parts are immutable values (every store replaces its slot object on an
 * edit), so a snapshot is a reference and costs nothing.
 *
 * No React and no store here: `mission-history-store.ts` holds the histories,
 * and `mission-undo.ts` applies a step to the three stores.
 */

/** The parts of a mission a command can change. */
export type MissionDocPart = "draft" | "graph" | "assets";

/** Each part's value, per part. Untyped here: the stores own the types. */
export type MissionDocParts = Partial<Record<MissionDocPart, unknown>>;

/** One undoable step. */
export interface MissionCommand {
	/** What it did, in operator words ("Add node", "Import Gate"). */
	label: string;
	/**
	 * Key shared by the edits of one gesture (every position change of one
	 * drag, every keystroke of one rename): consecutive edits with the same
	 * key are ONE step.
	 */
	gesture?: string;
	/** Each changed part as it was before. */
	before: MissionDocParts;
	/** Each changed part as it is after. */
	after: MissionDocParts;
}

/** A mission's steps: the ones to undo, newest last, and the ones to redo, next first. */
export interface MissionHistory {
	past: readonly MissionCommand[];
	future: readonly MissionCommand[];
}

/** How many steps back an operator can go. */
export const MISSION_HISTORY_LIMIT = 100;

/** A history with nothing in it. */
export const EMPTY_MISSION_HISTORY: MissionHistory = Object.freeze({
	past: Object.freeze([]) as readonly MissionCommand[],
	future: Object.freeze([]) as readonly MissionCommand[],
});

/**
 * Fold a later command into an earlier one: the earlier `before` wins for a
 * part both changed (that is where the step starts), the later `after` wins
 * (that is where it ends), and a part only the later one changed joins with
 * its own `before`.
 */
function fold(
	earlier: MissionCommand,
	later: Pick<MissionCommand, "before" | "after">,
): MissionCommand {
	return {
		...earlier,
		before: { ...later.before, ...earlier.before },
		after: { ...earlier.after, ...later.after },
	};
}

/**
 * Record a command. A new edit drops what could be redone. A command with
 * the same `gesture` as the last one is folded into it, so the whole gesture
 * is one step.
 *
 * @param history - The mission's history.
 * @param command - The step just applied.
 * @param limit - How many steps to keep.
 * @returns The new history.
 */
export function pushCommand(
	history: MissionHistory,
	command: MissionCommand,
	limit: number = MISSION_HISTORY_LIMIT,
): MissionHistory {
	const last = history.past[history.past.length - 1];
	if (
		last &&
		command.gesture !== undefined &&
		last.gesture === command.gesture &&
		history.future.length === 0
	) {
		return {
			past: [...history.past.slice(0, -1), fold(last, command)],
			future: [],
		};
	}
	return { past: [...history.past, command].slice(-limit), future: [] };
}

/**
 * Fold a DERIVED change into the last step: a write that follows from the
 * step itself (the graph editor re-deriving the draft's allocation from the
 * graph just edited) belongs to it, so one Undo takes both back and the
 * re-derivation then finds nothing to write.
 *
 * @param history - The mission's history.
 * @param before - Each part the derivation changed, as it was.
 * @param after - Each part as it is now.
 * @returns The new history, or the same one when there is no step to amend.
 */
export function amendLastCommand(
	history: MissionHistory,
	before: MissionDocParts,
	after: MissionDocParts,
): MissionHistory {
	const last = history.past[history.past.length - 1];
	if (!last) return history;
	return {
		past: [...history.past.slice(0, -1), fold(last, { before, after })],
		future: history.future,
	};
}

/**
 * Take one step back.
 * @param history - The mission's history.
 * @returns The step to apply (its `before`) and the new history, or null.
 */
export function undoStep(
	history: MissionHistory,
): { command: MissionCommand; history: MissionHistory } | null {
	const command = history.past[history.past.length - 1];
	if (!command) return null;
	return {
		command,
		history: {
			past: history.past.slice(0, -1),
			future: [command, ...history.future],
		},
	};
}

/**
 * Do again the step last taken back.
 * @param history - The mission's history.
 * @returns The step to apply (its `after`) and the new history, or null.
 */
export function redoStep(
	history: MissionHistory,
): { command: MissionCommand; history: MissionHistory } | null {
	const command = history.future[0];
	if (!command) return null;
	return {
		command,
		history: {
			past: [...history.past, command],
			future: history.future.slice(1),
		},
	};
}
