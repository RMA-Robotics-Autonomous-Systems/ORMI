"use client";

/**
 * Latest Nav2 global plan per robot, with the time it ARRIVED on this page.
 *
 * The map drew the last `autonomy_trajectory` it had received for as long as the
 * subscription lived, so a finished robot kept a plan on screen. Recording the
 * arrival time lets the map drop a plan once it is older than
 * {@link TRAJECTORY_MAX_AGE_MS} (the bridge republishes at 1 Hz while it has a
 * goal). Arrival time on purpose — not the message stamp, which may be sim time.
 */

import { useSyncExternalStore } from "react";

/** Past this age a plan is no longer drawn. */
export const TRAJECTORY_MAX_AGE_MS = 5_000;

/** One robot's latest plan. */
export interface TrajectoryEntry {
	line: [number, number][];
	receivedAt: number;
}

let entries: Record<string, TrajectoryEntry> = {};
const listeners = new Set<() => void>();

/**
 * Record a newly arrived plan.
 * @param agentId - The robot.
 * @param line - The plan, `[lng, lat]`.
 * @param now - Arrival time in ms.
 */
export function recordTrajectory(
	agentId: string,
	line: [number, number][],
	now: number = Date.now(),
): void {
	entries = { ...entries, [agentId]: { line, receivedAt: now } };
	for (const listener of listeners) listener();
}

/**
 * The plans still worth drawing: fresh, and of the given robots.
 * @param all - Every robot's latest plan.
 * @param agentIds - The robots to draw.
 * @param now - The current time in ms.
 * @param maxAgeMs - The age limit.
 * @returns agentId → plan, for the fresh ones.
 */
export function freshTrajectories(
	all: Record<string, TrajectoryEntry>,
	agentIds: readonly string[],
	now: number,
	maxAgeMs: number = TRAJECTORY_MAX_AGE_MS,
): [string, [number, number][]][] {
	const out: [string, [number, number][]][] = [];
	for (const id of agentIds) {
		const e = all[id];
		if (e && now - e.receivedAt <= maxAgeMs) out.push([id, e.line]);
	}
	return out;
}

/** @returns Every robot's latest plan. */
export function getTrajectories(): Record<string, TrajectoryEntry> {
	return entries;
}

/**
 * Subscribe to changes.
 * @param listener - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** React hook: every robot's latest plan. */
export function useTrajectories(): Record<string, TrajectoryEntry> {
	return useSyncExternalStore(subscribe, getTrajectories, getTrajectories);
}

/** Test-only: reset. */
export function __resetTrajectoryStore(): void {
	entries = {};
	listeners.clear();
}
