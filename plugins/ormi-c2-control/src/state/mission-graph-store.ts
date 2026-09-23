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
 * @param missionId - The mission whose graph to edit.
 * @param updater - Pure transform from the current graph to the next.
 */
export function editMissionGraph(
	missionId: string,
	updater: (graph: MissionGraph) => MissionGraph,
): void {
	const prev = graphs[missionId];
	if (!prev) return;
	const next = updater(prev.graph);
	if (next === prev.graph) return;
	graphs = {
		...graphs,
		[missionId]: { sig: graphSignature(next), graph: next, dirty: true },
	};
	emit();
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
 * Test-only: reset all module-level state.
 */
export function __resetMissionGraphStore(): void {
	graphs = {};
	listeners.clear();
}
