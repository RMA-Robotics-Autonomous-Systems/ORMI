"use client";

import { useEffect } from "react";
import { initSync } from "@/lib/sync/sync-init";

async function registerServiceWorker(): Promise<void> {
	if (typeof window === "undefined") return;
	if (!("serviceWorker" in navigator)) return;

	try {
		const registration = await navigator.serviceWorker.register("/sw.js", {
			scope: "/",
		});

		console.info("[ormi-pwa] service worker registered", {
			scope: registration.scope,
		});
	} catch (err: unknown) {
		console.error("[ormi-pwa] failed to register service worker", err);
	}
}

/**
 * SyncProvider — boots the ormi-sync worker on first client render.
 *
 * Mount this once near the root of the component tree (inside ClientProviders).
 * It fires initSync() in a useEffect so it never runs on the server.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		registerServiceWorker();

		initSync().catch((err: unknown) => {
			console.error("ormi-sync: failed to initialise", err);
		});
	}, []);

	return <>{children}</>;
}
