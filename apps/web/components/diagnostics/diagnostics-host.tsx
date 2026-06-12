"use client";

/**
 * Always-mounted host for the diagnostics overlay.
 *
 * Cost while closed: one window keydown listener. Ctrl+Shift+D toggles the
 * panel, which is `next/dynamic`-imported (ssr: false) so its code is not in
 * the initial bundle. While open, the host flips `metrics.heavy` on and runs
 * the heavy-tier app collectors; both are torn down on close and on unmount.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { metrics } from "@workspace/utils";
import { startAppCollectors } from "./app-collectors";

const DiagnosticsPanel = dynamic(() => import("./diagnostics-panel"), {
	ssr: false,
});

/**
 * Mount once near the root (next to `DevlogDialog` in `ClientProviders`).
 */
export function DiagnosticsHost() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	useEffect(() => {
		if (!open) return;
		metrics.heavy = true;
		const stopCollectors = startAppCollectors();
		return () => {
			stopCollectors();
			metrics.heavy = false;
		};
	}, [open]);

	return <>{open && <DiagnosticsPanel onClose={() => setOpen(false)} />}</>;
}
