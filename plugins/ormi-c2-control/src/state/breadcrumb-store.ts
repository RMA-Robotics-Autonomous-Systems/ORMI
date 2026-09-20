"use client";

/**
 * Per-robot breadcrumb store — "where it has been", for the current session.
 *
 * A tiny module-level store mapping `agent_id → [lng, lat][]`, fed by the mission
 * map from each robot's live localization and decimated by
 * {@link classifyBreadcrumbFix} (~0.5 m spacing, capped). Module-level rather
 * than component state so the trail survives the map widget being re-mounted (a
 * layout change, a tab switch) for as long as the page lives; it is NOT
 * persisted, by operator decision (no track backfill).
 *
 * Same `useSyncExternalStore` contract as the other stores here: the snapshot is
 * the `trails` record, replaced immutably only when a trail actually grew, so a
 * fix closer than the spacing notifies nobody.
 *
 * ⚠ PUBLISHING IS THROTTLED. A robot at speed passes the 0.5 m spacing several
 * times a second, and each accepted fix used to copy the whole trail (up to
 * {@link BREADCRUMB_MAX_POINTS} points), rebuild the FeatureCollection for every
 * robot and hand it to MapLibre. Fixes are now appended in place to a working
 * trail the store owns, and a snapshot is published at most once per
 * {@link BREADCRUMB_PUBLISH_INTERVAL_MS} (leading edge, then trailing), copying
 * only the trails that grew — an unchanged robot keeps its trail's identity, so
 * a consumer can reuse whatever it built from it.
 */

import { useSyncExternalStore } from "react";

import {
	BREADCRUMB_MAX_POINTS,
	classifyBreadcrumbFix,
} from "../widgets/robot-track";

/** Minimum time between two published snapshots. */
export const BREADCRUMB_PUBLISH_INTERVAL_MS = 1000;

/** agent_id → trail, oldest first: the PUBLISHED snapshot (never mutated). */
let trails: Record<string, [number, number][]> = {};

/** agent_id → working trail, appended in place between publishes. */
let working: Record<string, [number, number][]> = {};

/** Agents whose working trail changed since the last publish. */
const changed = new Set<string>();

/** Pending trailing-edge publish, if one is scheduled. */
let publishTimer: ReturnType<typeof setTimeout> | null = null;

/** When the last snapshot was published (ms since epoch). */
let lastPublishAt = Number.NEGATIVE_INFINITY;

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Copy the changed working trails into a fresh snapshot and notify. */
function publish(): void {
	if (publishTimer !== null) {
		clearTimeout(publishTimer);
		publishTimer = null;
	}
	lastPublishAt = Date.now();
	if (changed.size === 0) return;
	const next = { ...trails };
	for (const agentId of changed) {
		const trail = working[agentId];
		if (trail) next[agentId] = trail.slice();
	}
	changed.clear();
	trails = next;
	for (const listener of listeners) listener();
}

/** Publish now if the interval has elapsed, otherwise once it has. */
function schedulePublish(): void {
	if (publishTimer !== null) return;
	const wait = lastPublishAt + BREADCRUMB_PUBLISH_INTERVAL_MS - Date.now();
	if (wait <= 0) {
		publish();
		return;
	}
	publishTimer = setTimeout(publish, wait);
}

/**
 * Record a localization fix for a robot.
 *
 * @param agentId - The robot's agent id.
 * @param lngLat - The fix, `[lng, lat]`.
 */
export function recordBreadcrumb(
	agentId: string,
	lngLat: [number, number],
): void {
	const trail = working[agentId] ?? [];
	const fix = classifyBreadcrumbFix(trail, lngLat);
	if (fix === "drop") return;
	if (fix === "restart") {
		working = { ...working, [agentId]: [lngLat] };
	} else {
		trail.push(lngLat);
		if (trail.length > BREADCRUMB_MAX_POINTS) {
			trail.splice(0, trail.length - BREADCRUMB_MAX_POINTS);
		}
		if (working[agentId] !== trail) {
			working = { ...working, [agentId]: trail };
		}
	}
	changed.add(agentId);
	schedulePublish();
}

/**
 * Every robot's trail, outside React. Reference-stable while unchanged.
 * @returns agent_id → trail.
 */
export function getBreadcrumbs(): Record<string, [number, number][]> {
	return trails;
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

/**
 * React hook: every robot's trail, re-rendering when one grows (at most once per
 * {@link BREADCRUMB_PUBLISH_INTERVAL_MS}).
 * @returns agent_id → trail.
 */
export function useBreadcrumbs(): Record<string, [number, number][]> {
	return useSyncExternalStore(subscribe, getBreadcrumbs, getBreadcrumbs);
}

/** Test-only: publish any pending fixes now, as the trailing timer would. */
export function __flushBreadcrumbs(): void {
	publish();
}

/** Test-only: reset all module-level state. */
export function __resetBreadcrumbStore(): void {
	if (publishTimer !== null) clearTimeout(publishTimer);
	publishTimer = null;
	lastPublishAt = Number.NEGATIVE_INFINITY;
	trails = {};
	working = {};
	changed.clear();
	listeners.clear();
}
