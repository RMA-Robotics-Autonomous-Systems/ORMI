"use client";

/**
 * Shared findings store — every `payload_msgs/msg/Finding` the fleet has
 * reported this session, keyed by `uid`.
 *
 * ## Append-only is the contract, not a policy this store invented
 *
 * `Finding.msg`: *"APPEND-ONLY BY CONTRACT. Never retract a finding: an
 * operator may already have acted on it. A superseded finding gets
 * `superseded_by`, not a deletion."* So {@link recordFinding} inserts, and the
 * only thing a later message for a known uid may do is **add** a supersession
 * (and only while the record does not already carry one). Nothing here ever
 * rewrites a stored finding's position, confidence or essence, and nothing ever
 * removes one.
 *
 * Supersession arriving as a repeat of an existing uid is how the wire
 * expresses it — `/payload/item` is latched (`transient_local`), so the fog
 * republishes an item once it has been replaced.
 *
 * ## Why not `useLocalDataSource`
 *
 * Core's `LocalDataSourcesProvider` keeps **one value per topic per ~30 Hz
 * drain tick**, which is right for a value being observed and wrong for a
 * stream being accumulated — a burst of findings would arrive as whichever one
 * happened to be last in the tick, and the loss would be invisible: the map
 * would be short by exactly the findings nobody ever saw. The ingest therefore
 * goes through the datasource subscription registry with `lossless: true` on
 * the topic (the consumer's declaration, per AGENTS.md "Losslessness is the
 * consumer's declaration"), the same route `ormi-foxglove`'s transform manager
 * takes.
 *
 * Losslessness is a *request*, though, and only a datasource that coalesces
 * reads it — so this store counts what it received and what it could not use,
 * and the map renders those counts. Hiding them would put the map back in the
 * position of being quietly short.
 *
 * ## Snapshot discipline
 *
 * `useSyncExternalStore` over identity-stable, change-fresh snapshots: the
 * findings array and the stats object are each rebuilt **once, inside the
 * mutation that changed them**, and the getters return those references
 * verbatim. Never a `useMemo` keyed on a version counter — the React Compiler
 * strips the dead read and freezes the memo on its first result (AGENTS.md,
 * "React Compiler + external mutable stores").
 */

import { useSyncExternalStore } from "react";

import type { Finding } from "../widgets/findings";

/** uid → finding. Insert-only; a value is replaced only to add supersession. */
let byUid: Record<string, Finding> = {};

/** Stable snapshot of {@link byUid}'s values, rebuilt only on a real change. */
let snapshot: Finding[] = [];

/** What the ingest has seen. Rendered by the map — never hidden. */
export interface FindingsStats {
	/** Messages delivered to the ingest, across every findings topic. */
	received: number;
	/** Distinct findings held. */
	stored: number;
	/**
	 * Messages the ingest could NOT use: no `uid`, or no usable geographic
	 * position. These are dropped on the floor, so they are counted and shown.
	 */
	dropped: number;
	/** Messages for a uid already held that changed nothing (latched repeats). */
	repeats: number;
	/** Supersessions folded into an already-stored finding. */
	supersessions: number;
}

/** Stable stats snapshot, rebuilt only when a counter actually moved. */
let stats: FindingsStats = {
	received: 0,
	stored: 0,
	dropped: 0,
	repeats: 0,
	supersessions: 0,
};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/** Replace the stats object (a new identity is the change signal). */
function bumpStats(patch: Partial<FindingsStats>): void {
	stats = { ...stats, ...patch };
}

/**
 * Record one parsed finding.
 *
 * Insert on a new uid. On a known uid the record is left exactly as it is,
 * except for the one additive change the contract allows: a `superseded_by`
 * that the stored copy does not yet carry is folded in, because a supersession
 * is new information about a finding and not a rewrite of it.
 *
 * @param finding - A parsed finding (see `parseFinding`).
 */
export function recordFinding(finding: Finding): void {
	const existing = byUid[finding.uid];

	if (!existing) {
		byUid = { ...byUid, [finding.uid]: finding };
		snapshot = Object.values(byUid);
		bumpStats({ received: stats.received + 1, stored: snapshot.length });
		emit();
		return;
	}

	// Additive: the record keeps every field it was stored with and gains a
	// supersession, or the mission a raw contact lacked (the fog republishes
	// its robots' contacts stamped with the mission that has them leased).
	// Nothing else on the incoming copy is adopted — a republish with a moved
	// position is not something this store honours, because an operator may
	// have acted on where it said it was.
	const superseded = Boolean(finding.supersededBy && !existing.supersededBy);
	const attributed = Boolean(finding.mission_id && !existing.mission_id);
	if (superseded || attributed) {
		byUid = {
			...byUid,
			[finding.uid]: {
				...existing,
				...(superseded ? { supersededBy: finding.supersededBy } : {}),
				...(attributed ? { mission_id: finding.mission_id } : {}),
			},
		};
		snapshot = Object.values(byUid);
		bumpStats({
			received: stats.received + 1,
			supersessions: stats.supersessions + (superseded ? 1 : 0),
		});
		emit();
		return;
	}

	bumpStats({ received: stats.received + 1, repeats: stats.repeats + 1 });
	emit();
}

/**
 * Count a message the ingest could not turn into a finding.
 *
 * Kept as its own entry point rather than folded into `recordFinding` so the
 * counter cannot be forgotten at a call site: a dropped message is the one
 * thing about this pipeline an operator cannot infer from the map.
 */
export function recordDroppedFinding(): void {
	bumpStats({ received: stats.received + 1, dropped: stats.dropped + 1 });
	emit();
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
 * Current findings (the `useSyncExternalStore` getSnapshot arg).
 *
 * Returns the stored array reference VERBATIM — identity-stable while nothing
 * changed, fresh only after a real insert or supersession. Treat as read-only,
 * and NEVER rebuild it here.
 *
 * @returns Every finding held.
 */
export function getFindingsSnapshot(): Finding[] {
	return snapshot;
}

/**
 * Current ingest counters.
 * @returns The stats object (identity-stable while unchanged).
 */
export function getFindingsStats(): FindingsStats {
	return stats;
}

/**
 * React hook: every finding held, re-rendering on change.
 * @returns The findings.
 */
export function useFindings(): Finding[] {
	return useSyncExternalStore(
		subscribe,
		getFindingsSnapshot,
		getFindingsSnapshot,
	);
}

/**
 * React hook: the ingest counters, re-rendering on change.
 * @returns The stats.
 */
export function useFindingsStats(): FindingsStats {
	return useSyncExternalStore(subscribe, getFindingsStats, getFindingsStats);
}

/**
 * Test-only: reset all module-level state. Not used in production code — a
 * finding is never deleted at runtime, which is the whole point of the store.
 */
export function __resetFindingsStore(): void {
	byUid = {};
	snapshot = [];
	stats = {
		received: 0,
		stored: 0,
		dropped: 0,
		repeats: 0,
		supersessions: 0,
	};
	listeners.clear();
}
