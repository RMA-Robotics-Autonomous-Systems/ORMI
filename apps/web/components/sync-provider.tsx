"use client";

import { useEffect } from "react";
import { env } from "@/config/env.js";
import { initSync } from "@/lib/sync/sync-init";

const OFFLINE_CACHE_KEYS = ["ormi-static-v1", "ormi-runtime-v1"];

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

async function cleanupOfflineArtifacts(): Promise<void> {
	if (typeof window === "undefined") return;

	if ("serviceWorker" in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations();

		await Promise.all(
			registrations.map(async (registration) => {
				const scriptUrl =
					registration.active?.scriptURL ??
					registration.waiting?.scriptURL ??
					registration.installing?.scriptURL ??
					"";

				if (!scriptUrl.includes("/sw.js")) return;

				const unregistered = await registration.unregister();
				if (unregistered) {
					console.info("[ormi-pwa] service worker unregistered", {
						scope: registration.scope,
					});
				}
			}),
		);
	}

	if ("caches" in window) {
		const cacheNames = await caches.keys();
		await Promise.all(
			cacheNames
				.filter((cacheName) => OFFLINE_CACHE_KEYS.includes(cacheName))
				.map((cacheName) => caches.delete(cacheName)),
		);
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
		if (!env.NEXT_PUBLIC_ENABLE_OFFLINE_MODE) {
			cleanupOfflineArtifacts().catch((err: unknown) => {
				console.error(
					"[ormi-pwa] failed to clean up offline artifacts",
					err,
				);
			});
			return;
		}

		registerServiceWorker();

		initSync().catch((err: unknown) => {
			console.error("ormi-sync: failed to initialise", err);
		});
	}, []);

	return <>{children}</>;
}
