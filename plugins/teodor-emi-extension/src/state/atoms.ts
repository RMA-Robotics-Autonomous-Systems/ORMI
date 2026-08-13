"use client";

/**
 * Cross-widget state for the cockpit.
 *
 * The parameter rail drives every panel and hovering one time view moves the
 * playhead on the others, so this state cannot live inside any one widget. The
 * obvious mechanism — a plugin provider above the tree — does not exist:
 * `PLUGIN_PROVIDER_BEFORE_CHILDREN` is declared and commented out in
 * `plugins-provider.tsx`, and reviving it is a core change.
 *
 * Jotai atoms on the single shared store do the job with no wrapper, which also
 * means an EMI widget dropped on an ordinary dashboard still answers the rail.
 *
 * **Every read and write targets `appStore` explicitly.** `AGENTS.md` records
 * why: a write that lands in a store the `<Provider>` does not bind is invisible
 * to `useAtomValue`, which then reports empty state rather than failing.
 */

import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { appStore } from "@workspace/ormi-core";
import { PROPOSED_PARAMS, type EmiParams } from "../detector/params";

/** The tuning parameters — everything that changes what the detector decides. */
export const emiParamsAtom = atom<EmiParams>(PROPOSED_PARAMS);

/** Where the shared playhead is, and what it is pointing at. */
export interface EmiCursor {
	/** Seconds from run start. */
	t: number;
	/** Index into the current replay's `geoNew`, or -1. */
	det: number;
	/** Target id under the cursor, or -1. */
	target: number;
}

/** Playhead shared by every time-domain panel. Null when nothing is hovered. */
export const emiCursorAtom = atom<EmiCursor | null>(null);

/** The visible time window, shared so the panels stay aligned. */
export interface EmiView {
	t0: number;
	t1: number;
}

/** Visible window; null means "the whole run". */
export const emiViewAtom = atom<EmiView | null>(null);

/**
 * Detections the operator has picked out by hand, for export.
 *
 * Held as **stable keys, not indices.** An index into `geoNew` means nothing
 * across a parameter change — moving the threshold rebuilds the list and every
 * index now points at a different detection — so a selection stored that way
 * would silently export the wrong marks the moment anyone touched the rail.
 * `coil:iPeak` is the coil and the sample it peaked on, both properties of the
 * recording rather than of the tuning: a detection that survives a parameter
 * change keeps its key, and one that does not simply stops matching and is
 * dropped from the export, which is the honest outcome.
 */
export const emiSelectionAtom = atom<ReadonlySet<string>>(
	new Set<string>() as ReadonlySet<string>,
);

/**
 * The key a detection is remembered by.
 *
 * @param d - Anything carrying a coil id and a peak sample index.
 * @returns The stable key.
 */
export const detectionKey = (d: { coil: number; iPeak: number }): string =>
	`${d.coil}:${d.iPeak}`;

/**
 * The key a target — a barycentre — is remembered by.
 *
 * A target is its own exportable object, not a shorthand for the detections it
 * averages, so it needs a key of its own. The `t:` prefix keeps the two kinds in
 * one set without a chance of collision: a detection key is always
 * `<digits>:<digits>`.
 *
 * Weaker than a detection key, and deliberately so. A target id is a position in
 * the associator's output, which the next parameter change renumbers — so a
 * selected barycentre is a pick on the *current* association, and the export
 * reports any key it can no longer match rather than pretending otherwise.
 *
 * @param id - The target's id within the current replay.
 * @returns The stable-for-this-association key.
 */
export const targetKey = (id: number): string => `t:${id}`;

/**
 * Datasource the cockpit reads.
 *
 * Null lets discovery choose; pinning matters when a live robot and a recording
 * of it are configured at once, which is the case the comparison exists for.
 */
export const emiSourceIdAtom = atom<string | null>(null);

/** Purely visual choices — nothing here changes a detection. */
export interface EmiDisplay {
	/** Log y-axis on the signal stack. Four decades of dynamic range want it. */
	logScale: boolean;
	/** Draw the unfiltered trace behind the filtered one. */
	showUnfiltered: boolean;
	/** Draw the detections the robot recorded on the day. */
	showRecorded: boolean;
	/** Draw the detections this replay produces. */
	showReplayed: boolean;
	/** Draw the cross-coil links between peaks on different coils. */
	showLinks: boolean;
}

/** Display defaults: everything on, log scale, as the source tool opens. */
export const emiDisplayAtom = atom<EmiDisplay>({
	logScale: true,
	showUnfiltered: true,
	showRecorded: true,
	showReplayed: true,
	showLinks: true,
});

/** Read the tuning parameters. */
export const useEmiParams = (): EmiParams =>
	useAtomValue(emiParamsAtom, { store: appStore });

/** Read and write the tuning parameters. */
export const useEmiParamsState = () =>
	useAtom(emiParamsAtom, { store: appStore });

/** Read the shared playhead. */
export const useEmiCursor = (): EmiCursor | null =>
	useAtomValue(emiCursorAtom, { store: appStore });

/** Move the shared playhead. */
export const useSetEmiCursor = () =>
	useSetAtom(emiCursorAtom, { store: appStore });

/** Read the shared visible window. */
export const useEmiView = (): EmiView | null =>
	useAtomValue(emiViewAtom, { store: appStore });

/** Set the shared visible window. */
export const useSetEmiView = () => useSetAtom(emiViewAtom, { store: appStore });

/** Read the display choices. */
export const useEmiDisplay = (): EmiDisplay =>
	useAtomValue(emiDisplayAtom, { store: appStore });

/** Read and write the display choices. */
export const useEmiDisplayState = () =>
	useAtom(emiDisplayAtom, { store: appStore });

/** Read the pinned datasource id. */
export const useEmiSourceId = (): string | null =>
	useAtomValue(emiSourceIdAtom, { store: appStore });

/** Read and write the pinned datasource id. */
export const useEmiSourceIdState = () =>
	useAtom(emiSourceIdAtom, { store: appStore });

/** Read the hand-picked detections. */
export const useEmiSelection = (): ReadonlySet<string> =>
	useAtomValue(emiSelectionAtom, { store: appStore });

/** Replace the hand-picked detections. */
export const useSetEmiSelection = () =>
	useSetAtom(emiSelectionAtom, { store: appStore });

/**
 * Add or remove keys from the selection.
 *
 * Written as a whole-set replacement rather than a mutation: every consumer
 * subscribes to the atom by identity, and a `Set` mutated in place is the same
 * object, so nothing would re-render.
 *
 * @param keys - Keys to flip.
 */
export function toggleEmiSelection(keys: readonly string[]): void {
	const current = appStore.get(emiSelectionAtom);
	const next = new Set(current);
	// All-or-nothing on a group, for the rare caller that passes more than one
	// key: a partly-selected group should complete, not invert into a different
	// partial set. A single mark — which is what every pick is now — reduces to
	// a plain toggle.
	const addAll = keys.some((k) => !next.has(k));
	for (const k of keys) {
		if (addAll) next.add(k);
		else next.delete(k);
	}
	appStore.set(emiSelectionAtom, next);
}

/** Forget every hand-picked detection. */
export const clearEmiSelection = (): void =>
	appStore.set(emiSelectionAtom, new Set<string>());

/** Non-React read of the parameters, for canvas draw loops. */
export const readEmiParams = (): EmiParams => appStore.get(emiParamsAtom);

/** Non-React write of the playhead, for pointer handlers outside React state. */
export const writeEmiCursor = (cursor: EmiCursor | null): void =>
	appStore.set(emiCursorAtom, cursor);
