"use client";

/**
 * Waypoint highlight — "this one" from the feedback widget to the map.
 *
 * Hovering a station of the route graph or a tick of the Gantt highlights that
 * waypoint on the mission map; clicking pins it until clicked again. A tiny
 * module-level store (same `useSyncExternalStore` contract as the selection
 * store), plugin-internal: no ORMI core change.
 */

import { useSyncExternalStore } from "react";

/** The highlighted waypoint. */
export interface WaypointHighlight {
	missionId: string;
	vehicleId: string;
	/** 0-based waypoint index within the vehicle's task. */
	index: number;
	/** Pinned by a click: survives mouse-leave until clicked again. */
	pinned: boolean;
}

let current: WaypointHighlight | null = null;
const listeners = new Set<() => void>();

function set(next: WaypointHighlight | null): void {
	if (
		next === current ||
		(next &&
			current &&
			next.missionId === current.missionId &&
			next.vehicleId === current.vehicleId &&
			next.index === current.index &&
			next.pinned === current.pinned)
	) {
		return;
	}
	current = next;
	for (const listener of listeners) listener();
}

/** Same waypoint? */
function same(
	a: Omit<WaypointHighlight, "pinned">,
	b: WaypointHighlight | null,
): boolean {
	return (
		b != null &&
		a.missionId === b.missionId &&
		a.vehicleId === b.vehicleId &&
		a.index === b.index
	);
}

/**
 * Hover: highlight a waypoint unless another one is pinned.
 * @param target - The waypoint.
 */
export function hoverWaypoint(target: Omit<WaypointHighlight, "pinned">): void {
	if (current?.pinned) return;
	set({ ...target, pinned: false });
}

/** Hover end: clear an unpinned highlight. */
export function unhoverWaypoint(): void {
	if (current && !current.pinned) set(null);
}

/**
 * Click: pin a waypoint, or unpin it when it is the pinned one.
 * @param target - The waypoint.
 */
export function toggleWaypointPin(
	target: Omit<WaypointHighlight, "pinned">,
): void {
	if (current?.pinned && same(target, current)) set(null);
	else set({ ...target, pinned: true });
}

/** @returns The highlighted waypoint, or null. */
export function getWaypointHighlight(): WaypointHighlight | null {
	return current;
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

/** React hook: the highlighted waypoint. */
export function useWaypointHighlight(): WaypointHighlight | null {
	return useSyncExternalStore(
		subscribe,
		getWaypointHighlight,
		getWaypointHighlight,
	);
}

/** Test-only: reset. */
export function __resetWaypointHighlight(): void {
	current = null;
	listeners.clear();
}
