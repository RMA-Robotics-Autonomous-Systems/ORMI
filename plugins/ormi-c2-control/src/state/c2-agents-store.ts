"use client";

/**
 * C2 agents store — shared `agent_id → namespace name` map.
 *
 * A tiny module-level store mapping an agent's UUID `agent_id` to its friendly
 * namespace name (e.g. "Themis_Fr"), so display widgets show the operator the
 * robot's name rather than a raw UUID. Kept SEPARATE from the catalog store
 * (`c2-catalog-store.ts`, missions + features) because agents/vehicles are an
 * independent concern with a different source.
 *
 * SOURCE — the namespace is fed primarily from the `/multi_robot/edge/agent_profile`
 * ROS topic (`std_msgs/msg/String`, a JSON-string `data` field carrying the full
 * profile with top-level `agent_id` + `namespace`, republished ~2s). The
 * `:5000/Vehicles` REST roster strips `namespace` (mongoose strict schema), so it
 * is only a best-effort secondary source — correct if the schema is ever loosened.
 *
 * FALLBACK — an empty/missing namespace (e.g. the `AUTONOMY_TOPIC_PREFIX` env var
 * is unset or blank, so the C2 side publishes no usable namespace) resolves to
 * `shortId(id)`, exactly like the catalog store. Blank/whitespace-only names are
 * rejected on publish and never overwrite a prior good name.
 *
 * ACCEPTED DEGRADATION — names only appear once a widget that subscribes to the
 * agent_profile source has fed the store; until then (and for agents that have
 * not yet republished their profile) consumers see `shortId(id)`. This is by
 * design: there is no central, always-on fetch of namespaces.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the catalog store and the transform store
 * (`packages/ormi-core/src/transforms/transform-atoms.ts`).
 *
 * ⚠ CRITICAL — each hook resolves a SINGLE id to its name STRING (a primitive),
 * and its `getSnapshot` returns that primitive, NOT the underlying map object.
 * A primitive snapshot is naturally reference-stable while unchanged and fresh
 * after a change, so `useSyncExternalStore` neither loops nor goes stale. The
 * per-id getSnapshot is built with `useCallback` keyed on the id so it closes
 * over the right id while staying stable across renders.
 *
 * ⚠ Do NOT replace this with a `useMemo` keyed on a version counter that reads
 * the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import { shortId } from "./c2-catalog-store";

/** agent_id → operator-facing namespace name. */
let agentNames: Record<string, string> = {};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/**
 * Merge a list of `{ id, name }` rows into the name map, returning a NEW map
 * only when at least one name actually changed (so identical re-publishes — the
 * agent_profile topic republishes every ~2s — are no-ops).
 *
 * Names are trimmed; entries whose name is non-string, empty, or whitespace-only
 * are skipped (they keep any prior name).
 */
function mergeNames(
	current: Record<string, string>,
	rows: { id: string; name?: string | null }[],
): Record<string, string> {
	let next: Record<string, string> | null = null;
	for (const row of rows) {
		const id = row.id;
		if (!id) continue;
		const name = typeof row.name === "string" ? row.name.trim() : "";
		if (name === "") continue;
		if (current[id] === name) continue;
		if (!next) next = { ...current };
		next[id] = name;
	}
	return next ?? current;
}

/**
 * Publish agent namespace names (from the `/multi_robot/edge/agent_profile`
 * topic, or best-effort from the vehicle roster).
 *
 * Merges into the agent map. A no-op (no listener notification) when every
 * resolved name is already present and unchanged — the agent_profile topic
 * republishes every ~2s, so identical publishes MUST NOT churn consumers.
 * Blank/whitespace-only/non-string names are skipped and never clear a prior
 * good name.
 *
 * @param rows - Rows carrying `agent_id` and an optional namespace `name`.
 */
export function publishAgentNames(
	rows: { agent_id: string; name?: string | null }[],
): void {
	const next = mergeNames(
		agentNames,
		rows.map((r) => ({ id: r.agent_id, name: r.name })),
	);
	if (next === agentNames) return;
	agentNames = next;
	emit();
}

/**
 * Resolve an agent id to its namespace name outside React.
 *
 * @param id - The agent id.
 * @returns The known namespace name, or `shortId(id)` when none is known, or ""
 *   for empty input.
 */
export function getAgentName(id: string | null | undefined): string {
	if (!id) return "";
	return agentNames[id] ?? shortId(id);
}

/**
 * Subscribe to agent-name changes (the `useSyncExternalStore` subscribe arg).
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
 * React hook: the namespace name for an agent id, re-rendering on change.
 *
 * The snapshot is the resolved name STRING (a primitive) for `id`, not the map
 * object — identity-stable while unchanged, fresh after a publish. Falls back to
 * `shortId(id)` until a namespace is known.
 *
 * @param id - The agent id (or null/undefined → "").
 * @returns The agent's namespace name or a shortened id.
 */
export function useAgentName(id: string | null | undefined): string {
	const getName = useCallback(() => getAgentName(id), [id]);
	return useSyncExternalStore(subscribe, getName, getName);
}
