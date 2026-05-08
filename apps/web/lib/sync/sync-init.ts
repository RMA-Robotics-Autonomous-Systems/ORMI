"use client";

import {
	SyncClient,
	setSyncClient,
	initConnectivity,
} from "@workspace/ormi-sync";

/**
 * Singleton SyncClient instance for the web app.
 *
 * Lazily initialised on first call to `getSyncClient()`.
 * Safe to import anywhere on the client — returns null on SSR.
 */
let _client: SyncClient | null = null;
let _initPromise: Promise<SyncClient> | null = null;

/**
 * Initialise the SyncClient and connectivity listeners.
 * Idempotent — safe to call multiple times (returns the same promise).
 *
 * Call this once at app startup, e.g. in a `<SyncProvider>` component
 * or a top-level `useEffect`.
 */
export async function initSync(): Promise<SyncClient> {
	if (_client) return _client;
	if (_initPromise) return _initPromise;

	_initPromise = (async () => {
		// new Worker(new URL(...)) must be a literal at the call site so
		// Turbopack can statically detect and bundle the worker chunk.
		const workerName = "ormi-sync";
		const worker = new Worker(
			new URL("./sync-worker-entry.ts", import.meta.url),
			{ type: "module", name: workerName },
		);

		console.info("[ormi-sync] worker created", { name: workerName });

		const client = await SyncClient.init(worker);

		setSyncClient(client);
		initConnectivity(client);

		_client = client;
		return client;
	})();

	return _initPromise;
}

/**
 * Returns the initialised SyncClient, or null if not yet initialised.
 * Prefer `initSync()` at startup; use this only for non-critical reads.
 */
export function getSyncClient(): SyncClient | null {
	return _client;
}
