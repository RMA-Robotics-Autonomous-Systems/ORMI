"use client";

/**
 * C2 agents store — shared per-agent roster keyed by `agent_id`.
 *
 * A tiny module-level store mapping an agent's UUID `agent_id` to an
 * {@link AgentRecord} carrying its friendly namespace name (e.g. "Themis_Fr"),
 * its `namespace` (the `AUTONOMY_TOPIC_PREFIX`, used to build per-agent
 * namespaced topics), and the datasource `source` the profile arrived on (so
 * per-agent topic subscriptions can be issued against the right datasource).
 * Display widgets show the operator the robot's name rather than a raw UUID, and
 * the map can subscribe to each agent's `{namespace}/edge/multi_robot/localization`
 * stream. Kept SEPARATE from the catalog store (`c2-catalog-store.ts`, missions
 * + features) because agents/vehicles are an independent concern.
 *
 * SOURCE — fed primarily from the `/multi_robot/edge/agent_profile` ROS topic
 * (`std_msgs/msg/String`, a JSON-string `data` field carrying the full profile
 * with top-level `agent_id` + `namespace`, republished ~2s). The `:5000/Vehicles`
 * REST roster strips `namespace` (mongoose strict schema), so it is only a
 * best-effort secondary source (and never carries a datasource `source`).
 *
 * FALLBACK — an empty/missing namespace (e.g. the `AUTONOMY_TOPIC_PREFIX` env var
 * is unset or blank) resolves to `shortId(id)`, exactly like the catalog store.
 * Blank/whitespace-only names are rejected on publish and never overwrite a
 * prior good name.
 *
 * ACCEPTED DEGRADATION — records only appear once a widget that subscribes to the
 * agent_profile source has fed the store; until then consumers see `shortId(id)`
 * and the agent has no namespace/source (so no per-agent localization marker).
 * This is by design: there is no central, always-on fetch of profiles.
 *
 * Read through `useSyncExternalStore` with an identity-stable, change-fresh
 * snapshot — same contract as the catalog store and the transform store
 * (`packages/ormi-core/src/transforms/transform-atoms.ts`).
 *
 * ⚠ CRITICAL — TWO snapshot shapes, two stability rules:
 *
 *  1. The per-id NAME hooks ({@link useAgentName}) resolve a SINGLE id to its
 *     name STRING (a primitive); `getSnapshot` returns that primitive, NOT the
 *     underlying map. A primitive snapshot is naturally reference-stable while
 *     unchanged and fresh after a change, so `useSyncExternalStore` neither loops
 *     nor goes stale. The per-id getSnapshot is built with `useCallback` keyed on
 *     the id so it closes over the right id while staying stable across renders.
 *
 *  2. The ROSTER hook ({@link useAgents}) returns an OBJECT (an `AgentRecord[]`),
 *     governed by the map-editing-store object-snapshot rule
 *     (`state/map-editing-store.ts` header): `getAgentsSnapshot` MUST return a
 *     referentially-STABLE array that only changes identity when the roster
 *     actually changed. The merge therefore rebuilds `rosterSnapshot` ONCE per
 *     real change and `getAgentsSnapshot` returns that stored reference VERBATIM.
 *     Calling `Object.values()` inside `getSnapshot` would return a fresh array
 *     every call and loop `useSyncExternalStore` forever.
 *
 * ⚠ Do NOT replace any of this with a `useMemo` keyed on a version counter that
 * reads the module store: the React Compiler (enabled in the web app) strips the
 * no-op version read and freezes the memo on its first result (the trap
 * documented in AGENTS.md "React Compiler + external mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import type { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

import { shortId } from "./c2-catalog-store";

/** One agent's roster record: name + namespace + the datasource it arrived on. */
export interface AgentRecord {
	/** The agent's UUID. */
	agent_id: string;
	/** Operator-facing namespace name (falls back to `shortId` for display). */
	name: string;
	/** The `AUTONOMY_TOPIC_PREFIX` namespace, or null when unknown/blank. */
	namespace: string | null;
	/** The datasource the profile arrived on, or null (e.g. REST roster). */
	source: DatasourceProviderSettings | null;
}

/** A row fed into {@link publishAgentProfiles}. */
export interface AgentProfileRow {
	agent_id: string;
	namespace?: string | null;
	name?: string | null;
	source?: DatasourceProviderSettings | null;
}

/** agent_id → record. */
let agents: Record<string, AgentRecord> = {};

/**
 * Stable roster snapshot, rebuilt ONCE inside {@link mergeProfiles} whenever the
 * `agents` map actually changed. `getAgentsSnapshot` returns this reference
 * verbatim — see the header object-snapshot rule.
 */
let rosterSnapshot: AgentRecord[] = [];

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/** Trim a candidate to a non-empty string, else undefined. */
function trimmed(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const t = v.trim();
	return t === "" ? undefined : t;
}

/**
 * Merge profile rows into the agents map, returning a NEW map only when at least
 * one field actually changed (so the ~2 Hz agent_profile republish is a no-op).
 *
 * Per-field merge semantics:
 *  - `name` — trimmed; blank/whitespace/non-string never clears a prior good
 *    name. Resolves as `namespace || existing name` (so a usable namespace wins,
 *    else keep what we had).
 *  - `namespace` — trimmed to a non-empty string or null; a blank namespace does
 *    not clear a previously known one.
 *  - `source` — compared BY `source?.id` (NEVER by object reference) so an
 *    identical republish carrying a fresh settings object is still a no-op. A
 *    null/undefined source does not clear a previously known one.
 */
function mergeProfiles(
	current: Record<string, AgentRecord>,
	rows: AgentProfileRow[],
): Record<string, AgentRecord> {
	let next: Record<string, AgentRecord> | null = null;

	for (const row of rows) {
		const id = row.agent_id;
		if (!id) continue;

		const prev: AgentRecord | undefined = current[id];

		const ns = trimmed(row.namespace);
		const rawName = trimmed(row.name);
		// name resolves as namespace || prior good name || raw name candidate.
		const resolvedName = ns ?? prev?.name ?? rawName;

		const nextNamespace = ns ?? prev?.namespace ?? null;
		const nextName = resolvedName ?? prev?.name ?? "";
		const nextSource =
			row.source !== undefined && row.source !== null
				? row.source
				: (prev?.source ?? null);

		// No-op detection — compare source by id, everything else by value.
		const sameName = prev?.name === nextName;
		const sameNamespace = (prev?.namespace ?? null) === nextNamespace;
		const sameSource =
			(prev?.source?.id ?? null) === (nextSource?.id ?? null);
		if (prev && sameName && sameNamespace && sameSource) continue;

		if (!next) next = { ...current };
		next[id] = {
			agent_id: id,
			name: nextName,
			namespace: nextNamespace,
			source: nextSource,
		};
	}

	if (!next) return current;

	// The map actually changed — rebuild the stable roster snapshot ONCE.
	rosterSnapshot = Object.values(next).sort((a, b) =>
		a.agent_id.localeCompare(b.agent_id),
	);
	return next;
}

/**
 * Publish per-agent profiles (from the `/multi_robot/edge/agent_profile` topic,
 * or best-effort from the vehicle roster).
 *
 * Merges into the agents map. A no-op (no listener notification, no new roster
 * snapshot) when every field is already present and unchanged — the agent_profile
 * topic republishes every ~2s, so identical publishes MUST NOT churn consumers.
 * `source` is compared by `source?.id`, not by object reference. Blank names and
 * blank namespaces never clear a prior good value.
 *
 * @param rows - Rows carrying `agent_id`, optional `namespace`, `name`, `source`.
 */
export function publishAgentProfiles(rows: AgentProfileRow[]): void {
	const next = mergeProfiles(agents, rows);
	if (next === agents) return;
	agents = next;
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
	const record = agents[id];
	return record && record.name !== "" ? record.name : shortId(id);
}

/**
 * Resolve an agent id to its full {@link AgentRecord} outside React.
 *
 * @param id - The agent id.
 * @returns The record, or undefined when none is known.
 */
export function getAgentRecord(
	id: string | null | undefined,
): AgentRecord | undefined {
	if (!id) return undefined;
	return agents[id];
}

/**
 * Current roster snapshot (the `useSyncExternalStore` getSnapshot arg).
 *
 * Returns the stored `AgentRecord[]` reference VERBATIM — identity-stable while
 * the roster is unchanged, fresh only after a real merge. Sorted by `agent_id`.
 * Treat the result as read-only. NEVER rebuild the array here (see header).
 *
 * @returns The current roster.
 */
export function getAgentsSnapshot(): AgentRecord[] {
	return rosterSnapshot;
}

/**
 * Subscribe to agent-store changes (the `useSyncExternalStore` subscribe arg).
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

/**
 * React hook: the full {@link AgentRecord} for an agent id, re-rendering on
 * change.
 *
 * The snapshot is the record OBJECT for `id` — referentially stable while
 * unchanged because the merge only replaces a record when one of its fields
 * actually changed (and rebuilds nothing else), so `useSyncExternalStore` reads
 * the same reference until that agent's record changes. Returns undefined until
 * the agent is known.
 *
 * @param id - The agent id (or null/undefined → undefined).
 * @returns The agent's record, or undefined.
 */
export function useAgentRecord(
	id: string | null | undefined,
): AgentRecord | undefined {
	const get = useCallback(() => getAgentRecord(id), [id]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: the full agent roster (array), re-rendering on change.
 *
 * Returns an OBJECT (array) snapshot governed by the map-editing-store
 * object-snapshot rule: the same reference across identical re-publishes, a new
 * reference only when the roster actually changes. Sorted by `agent_id`.
 *
 * @returns The current {@link AgentRecord} roster.
 */
export function useAgents(): AgentRecord[] {
	return useSyncExternalStore(
		subscribe,
		getAgentsSnapshot,
		getAgentsSnapshot,
	);
}
