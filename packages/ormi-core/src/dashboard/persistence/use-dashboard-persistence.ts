"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	datasourcesAtom,
	hasChangedAtom,
} from "../atoms";
import { DashboardInterface } from "../dashboard-interface";
import { Widget } from "../../widgets/widget-interface";
import { Datasource } from "../../datasources/datasource-interface";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Hash helper
// ---------------------------------------------------------------------------

async function hashDashboardState(
	layouts: Record<string, any>,
	widgets: Map<string, Widget>,
	datasources: Map<string, Datasource>,
	locked: boolean,
): Promise<string> {
	const stateString = JSON.stringify(
		{
			layouts,
			widgets: Object.fromEntries(widgets),
			datasources: Object.fromEntries(datasources),
			locked,
		},
		(key, value) => {
			if (key === "parent" || key === "_owner" || key === "_store") {
				return undefined;
			}
			if (
				typeof value === "object" &&
				value !== null &&
				!Array.isArray(value)
			) {
				const ordered: any = {};
				Object.keys(value)
					.sort()
					.forEach((k) => {
						ordered[k] = value[k];
					});
				return ordered;
			}
			return value;
		},
	);

	const encoded = new TextEncoder().encode(stateString);
	const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callbacks injected from the page. */
export interface PersistenceOptions {
	onLoad: (apply: (state: DashboardInterface) => void) => Promise<boolean>;
	onSave: (state: DashboardInterface) => Promise<boolean>;
}

/** Values exposed to the shell and engines. */
export interface PersistenceState {
	/** False until onLoad has resolved. The shell renders a spinner while this is false. */
	initialized: boolean;
	/** True when the current state differs from the last loaded/saved hash. */
	hasChanged: boolean;
	/** Persist the current state. No-ops with a toast if there are no changes. */
	save: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages dashboard persistence lifecycle: load on mount, change detection
 * via full-state hash, and save with confirmation feedback.
 * @param options - Load and save callbacks.
 * @returns Persistence state and save action.
 */
export function useDashboardPersistence(
	options: PersistenceOptions,
): PersistenceState {
	const { onLoad, onSave } = options;

	// Atom writers
	const setWidgets = useSetAtom(widgetsAtom);
	const setLayouts = useSetAtom(layoutsAtom);
	const setLocked = useSetAtom(lockedAtom);
	const setDatasources = useSetAtom(datasourcesAtom);
	const setHasChanged = useSetAtom(hasChangedAtom);

	// Atom readers (for hash and save)
	const widgets = useAtomValue(widgetsAtom);
	const layouts = useAtomValue(layoutsAtom);
	const locked = useAtomValue(lockedAtom);
	const datasources = useAtomValue(datasourcesAtom);

	const [initialized, setInitialized] = useState(false);
	const [hasChanged, setHasChangedLocal] = useState(false);

	// Keep a stable ref to the most recent saved/loaded hash
	const initialHashRef = useRef<string>("");

	// Stable refs for latest state used in save (avoids stale closures)
	const widgetsRef = useRef(widgets);
	const layoutsRef = useRef(layouts);
	const lockedRef = useRef(locked);
	const datasourcesRef = useRef(datasources);
	const onSaveRef = useRef(onSave);
	const onLoadRef = useRef(onLoad);

	useEffect(() => {
		widgetsRef.current = widgets;
		layoutsRef.current = layouts;
		lockedRef.current = locked;
		datasourcesRef.current = datasources;
	}, [widgets, layouts, locked, datasources]);

	useEffect(() => {
		onSaveRef.current = onSave;
	}, [onSave]);

	useEffect(() => {
		onLoadRef.current = onLoad;
	}, [onLoad]);

	// Load on mount — onLoadRef keeps a stable closure without requiring the
	// caller to wrap in useCallback.
	useEffect(() => {
		onLoadRef
			.current((loadedState: DashboardInterface) => {
				setLayouts(loadedState.layouts);
				setWidgets(loadedState.widgets);
				setLocked(loadedState.locked);
				setDatasources(loadedState.datasources);
			})
			.then(() => {
				setInitialized(true);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Change detection: recompute SHA-256 hash whenever atoms change after init
	useEffect(() => {
		if (!initialized) return;
		let cancelled = false;
		hashDashboardState(layouts, widgets, datasources, locked).then(
			(currentHash) => {
				if (cancelled) return;
				if (!initialHashRef.current) {
					initialHashRef.current = currentHash;
				}
				const changed = currentHash !== initialHashRef.current;
				setHasChangedLocal(changed);
				setHasChanged(changed);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [initialized, layouts, widgets, datasources, locked, setHasChanged]);

	const save = useCallback(async () => {
		if (!hasChanged) {
			toast("No changes to save");
			return;
		}
		const state: DashboardInterface = {
			layouts: layoutsRef.current,
			widgets: widgetsRef.current,
			datasources: datasourcesRef.current,
			locked: lockedRef.current,
		};
		try {
			const success = await onSaveRef.current(state);
			if (success) {
				initialHashRef.current = await hashDashboardState(
					state.layouts,
					state.widgets,
					state.datasources,
					state.locked,
				);
				setHasChangedLocal(false);
				setHasChanged(false);
			} else {
				toast("Failed to save dashboard");
			}
		} catch (error) {
			console.error("Save error:", error);
			toast("Failed to save dashboard");
		}
	}, [hasChanged, setHasChanged]);

	return { initialized, hasChanged, save };
}
