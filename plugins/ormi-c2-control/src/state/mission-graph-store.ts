"use client";

/**
 * Shared mission-graph store — the operator's working copy of a mission's
 * behaviour graph, keyed by `mission_id`.
 *
 * Same shape and the same discipline as `mission-draft-store.ts`, and separate
 * from it on purpose: the graph must NEVER become a field on a `MissionDraft`.
 * Everything on the draft rides into `mission_config` (`cleanMissionConfig`
 * prunes empty optional blocks but does not strip unknown fields), and
 * `InitMission.srv` caps that string at 10 000 characters — so a graph on the
 * draft is a mission that silently stops submitting once the operator authors
 * anything interesting. The graph is persisted as its own document and the
 * mission carries only a `graph_ref`.
 *
 * ⚠ SNAPSHOT DISCIPLINE — per-id snapshots, content-deduped so an identical
 * reload does not churn the editor's memos, and `useSyncExternalStore`
 * throughout. Never a `useMemo` keyed on a version counter: the React Compiler
 * strips the dead read and freezes the memo on its first result (AGENTS.md,
 * "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import { normalizeGraph, type MissionGraph } from "../widgets/mission-graph";

/** One mission's working graph: its content signature, the graph, dirty flag. */
interface GraphSlot {
	sig: string;
	graph: MissionGraph;
	dirty: boolean;
}

/** mission_id → working graph slot. */
let graphs: Record<string, GraphSlot> = {};

/**
 * Undo / redo, per mission: the graphs before (`past`) and after (`future`)
 * the current one. `gesture` is the key of the last edit, so the many edits
 * of one gesture (a drag moves a node on every pointer move) are ONE step.
 */
interface GraphHistory {
	past: MissionGraph[];
	future: MissionGraph[];
	gesture?: string;
}

/** How many steps back an operator can go. */
const HISTORY_LIMIT = 100;

/** mission_id → its history. Cleared by a load. */
let histories: Record<string, GraphHistory> = {};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/** Content signature — the dedup key, so an identical reload is a no-op. */
function graphSignature(graph: MissionGraph): string {
	return JSON.stringify(graph);
}

/**
 * Load a mission's graph and mark it CLEAN.
 *
 * A pure no-op when the incoming graph is content-identical to an
 * already-clean stored one, so a refetch does not churn the canvas (xyflow
 * re-lays nothing out, but every derived memo would recompute and a selected
 * node would be re-resolved).
 *
 * @param missionId - The mission the graph belongs to.
 * @param graph - The graph as loaded.
 */
export function setMissionGraph(missionId: string, graph: MissionGraph): void {
	const normalized = normalizeGraph(graph);
	const sig = graphSignature(normalized);
	const prev = graphs[missionId];
	if (prev && prev.sig === sig && !prev.dirty) return;
	graphs = {
		...graphs,
		[missionId]: { sig, graph: normalized, dirty: false },
	};
	// A loaded graph is a new starting point: nothing to undo into.
	histories = { ...histories, [missionId]: { past: [], future: [] } };
	emit();
}

/**
 * Apply an operator edit and mark the graph DIRTY.
 *
 * A no-op when no slot exists: an edit can only land on a loaded graph, which
 * is the same null-guard `editMissionDraft` uses. Also a no-op when the
 * updater hands back the same graph (a refused wire): nothing changed, so
 * nothing is unsaved.
 *
 * Every edit is a step {@link undoMissionGraph} can take back, except that
 * consecutive edits of one `gesture` (e.g. `"move:3"`, every position change
 * of one drag) are one step.
 *
 * @param missionId - The mission whose graph to edit.
 * @param updater - Pure transform from the current graph to the next.
 * @param gesture - Key shared by the edits of one gesture, if any.
 */
export function editMissionGraph(
	missionId: string,
	updater: (graph: MissionGraph) => MissionGraph,
	gesture?: string,
): void {
	const prev = graphs[missionId];
	if (!prev) return;
	const next = updater(prev.graph);
	if (next === prev.graph) return;
	const history = histories[missionId] ?? { past: [], future: [] };
	const sameGesture = gesture !== undefined && history.gesture === gesture;
	histories = {
		...histories,
		[missionId]: {
			past: sameGesture
				? history.past
				: [...history.past, prev.graph].slice(-HISTORY_LIMIT),
			future: [],
			gesture,
		},
	};
	graphs = {
		...graphs,
		[missionId]: { sig: graphSignature(next), graph: next, dirty: true },
	};
	emit();
}

/**
 * Take back the last edit (a whole gesture). The graph is then unsaved.
 * @param missionId - The mission.
 * @returns Whether there was one.
 */
export function undoMissionGraph(missionId: string): boolean {
	const prev = graphs[missionId];
	const history = histories[missionId];
	const back = history?.past[history.past.length - 1];
	if (!prev || !history || !back) return false;
	histories = {
		...histories,
		[missionId]: {
			past: history.past.slice(0, -1),
			future: [prev.graph, ...history.future],
		},
	};
	graphs = {
		...graphs,
		[missionId]: { sig: graphSignature(back), graph: back, dirty: true },
	};
	emit();
	return true;
}

/**
 * Do again what {@link undoMissionGraph} took back.
 * @param missionId - The mission.
 * @returns Whether there was one.
 */
export function redoMissionGraph(missionId: string): boolean {
	const prev = graphs[missionId];
	const history = histories[missionId];
	const again = history?.future[0];
	if (!prev || !history || !again) return false;
	histories = {
		...histories,
		[missionId]: {
			past: [...history.past, prev.graph].slice(-HISTORY_LIMIT),
			future: history.future.slice(1),
		},
	};
	graphs = {
		...graphs,
		[missionId]: { sig: graphSignature(again), graph: again, dirty: true },
	};
	emit();
	return true;
}

/** Whether {@link undoMissionGraph} has something to take back. */
export function canUndoMissionGraph(id: string | null | undefined): boolean {
	return !!id && (histories[id]?.past.length ?? 0) > 0;
}

/** Whether {@link redoMissionGraph} has something to do again. */
export function canRedoMissionGraph(id: string | null | undefined): boolean {
	return !!id && (histories[id]?.future.length ?? 0) > 0;
}

/**
 * Mark a mission's graph as saved, but ONLY while it still equals what was
 * written.
 *
 * Same race the mission draft has: the save awaits a round trip, and an edit
 * made during it must not have its dirty flag cleared underneath the operator.
 *
 * @param missionId - The mission whose graph was saved.
 * @param savedSignature - {@link graphSignature} of what was written.
 * @returns `"committed"`, `"kept-dirty"` (a concurrent edit was preserved), or
 *   `"absent"`.
 */
export function commitSavedGraph(
	missionId: string,
	savedSignature: string,
): "committed" | "kept-dirty" | "absent" {
	const prev = graphs[missionId];
	if (!prev) return "absent";
	if (prev.sig !== savedSignature) return "kept-dirty";
	graphs = { ...graphs, [missionId]: { ...prev, dirty: false } };
	emit();
	return "committed";
}

/** Stable signature of a graph, for {@link commitSavedGraph}. */
export function missionGraphSignature(graph: MissionGraph): string {
	return graphSignature(normalizeGraph(graph));
}

/**
 * Read a mission's working graph outside React. Treat as read-only.
 * @param id - The mission id.
 * @returns The graph, or null when none is loaded.
 */
export function getMissionGraph(
	id: string | null | undefined,
): MissionGraph | null {
	if (!id) return null;
	return graphs[id]?.graph ?? null;
}

/**
 * Whether a graph slot exists — the load-coordination guard, so two editors on
 * the same mission do not both fetch and clobber each other.
 * @param id - The mission id.
 * @returns True when a slot exists.
 */
export function hasMissionGraph(id: string | null | undefined): boolean {
	if (!id) return false;
	return graphs[id] !== undefined;
}

/**
 * Whether a mission's graph has unsaved edits.
 * @param id - The mission id.
 * @returns True when the slot exists and is dirty.
 */
export function isMissionGraphDirty(id: string | null | undefined): boolean {
	if (!id) return false;
	return graphs[id]?.dirty ?? false;
}

/**
 * Subscribe to store changes (the `useSyncExternalStore` subscribe arg).
 * @param listener - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * React hook: a mission's working graph, re-rendering on change.
 *
 * The snapshot is the stored graph OBJECT — reference-stable while unchanged
 * (the store dedups identical loads on a content signature) and fresh after a
 * real edit.
 *
 * @param missionId - The mission id.
 * @returns The graph, or null.
 */
export function useMissionGraph(
	missionId: string | null | undefined,
): MissionGraph | null {
	const get = useCallback(() => getMissionGraph(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: whether a mission's graph has unsaved edits. A boolean primitive,
 * so the snapshot is naturally stable while unchanged.
 *
 * @param missionId - The mission id.
 * @returns True when dirty.
 */
export function useMissionGraphDirty(
	missionId: string | null | undefined,
): boolean {
	const get = useCallback(() => isMissionGraphDirty(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: whether undo / redo have something to do, as primitives.
 * @param missionId - The mission id.
 * @returns `[canUndo, canRedo]`.
 */
export function useMissionGraphHistory(
	missionId: string | null | undefined,
): [boolean, boolean] {
	const getUndo = useCallback(
		() => canUndoMissionGraph(missionId),
		[missionId],
	);
	const getRedo = useCallback(
		() => canRedoMissionGraph(missionId),
		[missionId],
	);
	return [
		useSyncExternalStore(subscribe, getUndo, getUndo),
		useSyncExternalStore(subscribe, getRedo, getRedo),
	];
}

/**
 * Test-only: reset all module-level state.
 */
export function __resetMissionGraphStore(): void {
	graphs = {};
	histories = {};
	listeners.clear();
}
