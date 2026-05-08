/**
 * connectivity.ts — Online/offline detection with debounce.
 *
 * Listens to `window.online`/`window.offline` events and triggers a replay
 * on the SyncClient when connectivity is restored. A 2-second debounce
 * prevents spurious replays during flapping connections.
 *
 * Usage: call `initConnectivity(client)` once at app startup (client side only).
 */

import type { SyncClient } from "./sync-client.js";

const RECONNECT_DEBOUNCE_MS = 2000;

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Register connectivity listeners on the given SyncClient.
 * Safe to call only in browser environments (uses `window`).
 *
 * @param client - The initialised SyncClient instance.
 * @returns A cleanup function that removes the event listeners.
 */
export function initConnectivity(client: SyncClient): () => void {
	const handleOnline = () => {
		if (_debounceTimer !== null) {
			clearTimeout(_debounceTimer);
		}
		_debounceTimer = setTimeout(() => {
			client.triggerReplay();
			_debounceTimer = null;
		}, RECONNECT_DEBOUNCE_MS);
	};

	const handleOffline = () => {
		if (_debounceTimer !== null) {
			clearTimeout(_debounceTimer);
			_debounceTimer = null;
		}
	};

	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);

	return () => {
		window.removeEventListener("online", handleOnline);
		window.removeEventListener("offline", handleOffline);
		if (_debounceTimer !== null) {
			clearTimeout(_debounceTimer);
			_debounceTimer = null;
		}
	};
}
