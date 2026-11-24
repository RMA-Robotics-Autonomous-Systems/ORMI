"use client";

/**
 * Shared mission-assets store — the operator's working copy of a mission's map
 * and assets (waypoints, zones, cues), keyed by `mission_id`.
 *
 * Same shape and discipline as `mission-graph-store.ts`, and kept off the
 * `MissionDraft` for the same reason: everything on the draft rides into
 * `mission_config`, which `InitMission.srv` caps at 10 000 characters. The
 * assets are their own document (`"<mission_id>:assets"`), saved by Save
 * mission with the graph and the mission.
 *
 * A slot also records whether the document is STORED: a mission opened before
 * it had assets gets a fresh slot on the map it is shown on, and Save must
 * write it even though nothing was edited, or the fog finds no map.
 *
 * ⚠ SNAPSHOT DISCIPLINE — per-id snapshots, content-deduped, and
 * `useSyncExternalStore` throughout (AGENTS.md, "React Compiler + external
 * mutable stores").
 */

import { useCallback, useSyncExternalStore } from "react";

import {
	assetsDocId,
	emptyMissionAssets,
	type MissionAssets,
	normalizeMissionAssets,
	readAssetsDocument,
} from "../widgets/mission-assets";
import { missionDocuments } from "../widgets/mission-list";
import {
	clearMissionHistory,
	recordMissionCommand,
} from "./mission-history-store";

/** One mission's working assets. */
interface AssetsSlot {
	sig: string;
	assets: MissionAssets;
	/** {@link assetsSignature} of the assets as last loaded or saved. */
	savedSig: string;
	dirty: boolean;
	/** The document exists in C2DB as last loaded or saved. */
	stored: boolean;
}

/** mission_id → working assets slot. */
let slots: Record<string, AssetsSlot> = {};

/** Subscribers notified on every change. */
const listeners = new Set<() => void>();

/** Notify all subscribers. */
function emit(): void {
	for (const listener of listeners) listener();
}

/** Content signature — the dedup key. */
function assetsSignature(assets: MissionAssets): string {
	return JSON.stringify(assets);
}

/**
 * Load a mission's assets and mark them CLEAN.
 *
 * A no-op when content-identical to a clean stored slot, so a refetch does not
 * churn the map layers. A load that REPLACES assets with different content
 * clears the mission's undo history; a first load leaves it alone.
 *
 * @param missionId - The mission.
 * @param assets - The assets as loaded.
 * @param stored - Whether they came from a stored document (false for a
 *   mission that has none yet).
 */
export function setMissionAssets(
	missionId: string,
	assets: MissionAssets,
	stored: boolean,
): void {
	const normalized = normalizeMissionAssets(assets);
	const sig = assetsSignature(normalized);
	const prev = slots[missionId];
	if (prev && prev.sig === sig && !prev.dirty && prev.stored === stored) {
		return;
	}
	slots = {
		...slots,
		[missionId]: {
			sig,
			assets: normalized,
			savedSig: sig,
			dirty: false,
			stored,
		},
	};
	if (prev && prev.sig !== sig) clearMissionHistory(missionId);
	emit();
}

/**
 * Load a mission's assets off one `c2.missions.list` response: its stored
 * document, or, when it has none yet, no assets on `fallbackMap` (not stored,
 * so the next Save writes it).
 *
 * @param missionId - The mission.
 * @param data - The raw list response.
 * @param fallbackMap - The map a mission without a document is placed on.
 */
export function adoptStoredAssets(
	missionId: string,
	data: unknown,
	fallbackMap: string,
): void {
	const found = missionDocuments(data).find(
		(doc) => doc.mission_id === assetsDocId(missionId),
	);
	const stored = readAssetsDocument(found);
	if (stored) setMissionAssets(missionId, stored, true);
	else setMissionAssets(missionId, emptyMissionAssets(fallbackMap), false);
}

/**
 * Place a mission that has no map yet on `map`. Not an operator edit, but a
 * change to write: an unstored document is written by the next Save anyway,
 * and a STORED one without a map is marked dirty so the next Save fixes it.
 * A no-op once the mission has a map.
 *
 * @param missionId - The mission.
 * @param map - The map it is shown on.
 */
export function placeMissionAssets(missionId: string, map: string): void {
	const prev = slots[missionId];
	if (!prev || prev.assets.map || !map) return;
	const assets = { ...prev.assets, map };
	const sig = assetsSignature(assets);
	// An unstored, untouched document is written by the next Save anyway:
	// placing it is its new baseline. A stored one is now unsaved.
	const savedSig = prev.stored || prev.dirty ? prev.savedSig : sig;
	slots = {
		...slots,
		[missionId]: {
			...prev,
			sig,
			assets,
			savedSig,
			dirty: sig !== savedSig,
		},
	};
	emit();
}

/** How an edit of the assets is recorded for Undo. */
export interface MissionAssetsEditOptions {
	/** The step's name for Undo ("Import Gate"). Defaults to "Edit assets". */
	label?: string;
	/** Key shared by the edits of one gesture. */
	gesture?: string;
	/** `false` applies without recording a step. Defaults to `true`. */
	record?: boolean;
}

/**
 * Apply an operator edit. The assets are then unsaved unless the edit
 * brought them back to what was last saved. A no-op without a slot, or when
 * the updater hands back the same object.
 *
 * The edit is a step of the mission's undo history (`mission-undo.ts`).
 *
 * @param missionId - The mission.
 * @param updater - Pure transform.
 * @param options - How the edit is recorded.
 */
export function editMissionAssets(
	missionId: string,
	updater: (assets: MissionAssets) => MissionAssets,
	options: MissionAssetsEditOptions = {},
): void {
	const prev = slots[missionId];
	if (!prev) return;
	const next = updater(prev.assets);
	if (next === prev.assets) return;
	const sig = assetsSignature(next);
	slots = {
		...slots,
		[missionId]: {
			...prev,
			sig,
			assets: next,
			dirty: sig !== prev.savedSig,
		},
	};
	if (options.record !== false) {
		recordMissionCommand(missionId, {
			label: options.label ?? "Edit assets",
			gesture: options.gesture,
			before: { assets: prev.assets },
			after: { assets: next },
		});
	}
	emit();
}

/**
 * Put the assets back as they were at a step of the undo history. Records
 * nothing. Unsaved unless they are the assets last saved.
 *
 * @param missionId - The mission.
 * @param assets - The assets to restore (a snapshot from a step).
 */
export function restoreMissionAssets(
	missionId: string,
	assets: MissionAssets,
): void {
	const prev = slots[missionId];
	if (!prev || prev.assets === assets) return;
	const sig = assetsSignature(assets);
	slots = {
		...slots,
		[missionId]: { ...prev, sig, assets, dirty: sig !== prev.savedSig },
	};
	emit();
}

/**
 * Mark a mission's assets saved, but only while they still equal what was
 * written (an edit made during the save stays dirty).
 *
 * @param missionId - The mission.
 * @param savedSignature - {@link missionAssetsSignature} of what was written.
 * @returns `"committed"`, `"kept-dirty"`, or `"absent"`.
 */
export function commitSavedAssets(
	missionId: string,
	savedSignature: string,
): "committed" | "kept-dirty" | "absent" {
	const prev = slots[missionId];
	if (!prev) return "absent";
	if (prev.sig !== savedSignature) {
		slots = {
			...slots,
			[missionId]: { ...prev, savedSig: savedSignature, stored: true },
		};
		emit();
		return "kept-dirty";
	}
	slots = {
		...slots,
		[missionId]: {
			...prev,
			savedSig: savedSignature,
			dirty: false,
			stored: true,
		},
	};
	emit();
	return "committed";
}

/** Stable signature of assets, for {@link commitSavedAssets}. */
export function missionAssetsSignature(assets: MissionAssets): string {
	return assetsSignature(normalizeMissionAssets(assets));
}

/**
 * A mission's working assets outside React. Treat as read-only.
 * @param id - The mission id.
 */
export function getMissionAssets(
	id: string | null | undefined,
): MissionAssets | null {
	if (!id) return null;
	return slots[id]?.assets ?? null;
}

/** Whether a slot exists (the load-coordination guard). */
export function hasMissionAssets(id: string | null | undefined): boolean {
	if (!id) return false;
	return slots[id] !== undefined;
}

/** Whether a mission's assets have unsaved edits. */
export function isMissionAssetsDirty(id: string | null | undefined): boolean {
	if (!id) return false;
	return slots[id]?.dirty ?? false;
}

/** Whether a mission's assets document exists in C2DB. */
export function isMissionAssetsStored(id: string | null | undefined): boolean {
	if (!id) return false;
	return slots[id]?.stored ?? false;
}

/**
 * Subscribe to store changes.
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
 * React hook: a mission's working assets (reference-stable while unchanged).
 * @param missionId - The mission id.
 */
export function useMissionAssets(
	missionId: string | null | undefined,
): MissionAssets | null {
	const get = useCallback(() => getMissionAssets(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * React hook: whether a mission's assets have unsaved edits.
 * @param missionId - The mission id.
 */
export function useMissionAssetsDirty(
	missionId: string | null | undefined,
): boolean {
	const get = useCallback(() => isMissionAssetsDirty(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/** Test-only: reset all module-level state. */
export function __resetMissionAssetsStore(): void {
	slots = {};
	listeners.clear();
}
