"use client";

import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import {
	datasourcesAtom,
	layoutsAtom,
	lockedAtom,
	useDashboardShell,
	widgetsAtom,
} from "@workspace/ormi-core/dashboard";

/** Quiet time after the last change before the workspace is written, in ms. */
export const WORKSPACE_AUTOSAVE_MS = 1000;

/** Props for {@link WorkspaceAutosave}. */
interface WorkspaceAutosaveProps {
	/**
	 * True once the workspace has actually been loaded from the server.
	 *
	 * The shell clears its skeleton whether the load succeeded or not, and a
	 * failed load leaves an empty dashboard on screen. Saving from there would
	 * overwrite the stored workspace with that empty state on the operator's
	 * first click, so nothing is written until a load has succeeded. The same
	 * gate keeps a draft workspace (no server row yet) from failing a save on
	 * every edit.
	 */
	enabled: boolean;
}

/**
 * Saves the workspace by itself, a moment after the dashboard stops changing.
 *
 * Renders nothing. It uses the shell's own bookkeeping: `hasChanged` is a hash
 * of layouts + widgets + datasources + lock state against what was last loaded
 * or written, and `save()` is the call the navbar button makes, so an autosave
 * and a manual save are the same write.
 *
 * The timer is keyed on the state itself and not only on `hasChanged`, which
 * makes it a debounce: a burst of edits is written once, after it ends. It
 * also means a save that failed is tried again on the next edit, where a timer
 * keyed on `hasChanged` alone would never re-arm (the flag stays true). The
 * navbar button stays as the manual retry.
 *
 * A change still waiting on its timer is written when the page is left, so
 * navigating away within the quiet time does not drop it.
 *
 * @param props - Component props.
 * @returns Nothing.
 */
export function WorkspaceAutosave({ enabled }: WorkspaceAutosaveProps) {
	const { hasChanged, save } = useDashboardShell();
	const widgets = useAtomValue(widgetsAtom);
	const layouts = useAtomValue(layoutsAtom);
	const datasources = useAtomValue(datasourcesAtom);
	const locked = useAtomValue(lockedAtom);

	// The save to run if the page is left while a timer is pending.
	const pendingRef = useRef<(() => Promise<void>) | null>(null);

	useEffect(() => {
		if (!enabled || !hasChanged) return;
		pendingRef.current = save;
		const timer = setTimeout(() => {
			pendingRef.current = null;
			void save();
		}, WORKSPACE_AUTOSAVE_MS);
		return () => clearTimeout(timer);
	}, [enabled, hasChanged, save, widgets, layouts, datasources, locked]);

	useEffect(
		() => () => {
			const pending = pendingRef.current;
			pendingRef.current = null;
			if (pending) void pending();
		},
		[],
	);

	return null;
}
