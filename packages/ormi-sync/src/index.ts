/**
 * @packageDocumentation
 * ormi-sync — Offline-first sync layer for ORMI.
 *
 * Public API:
 *  - `SyncClient`       Browser-side worker controller
 *  - `withOffline`      Proxy factory — zero-impact API wrapper for offline support
 *  - `setSyncClient`    Inject the SyncClient singleton into the proxy layer
 *  - `initConnectivity` Register online/offline listeners with debounce
 *  - `syncEventBus`     EventTarget for cross-component TempId resolution events
 *  - `emitTempIdResolved`
 *  - `useTempIdResolution` React hook — resolves a TempId to its real ID
 *  - Type exports: `ApiResult`, `ApiSuccess`, `ApiError`, `Action`, `SyncConfig`,
 *                  `ActionDescriptor`, `TempId`, `isTempId`, `makeTempId`,
 *                  `LocalQuery`, `WorkerInMessage`, `WorkerOutMessage`
 */

export { SyncClient } from "./client/sync-client.js";
export { syncEventBus, emitTempIdResolved } from "./client/sync-event-bus.js";
export { withOffline, setSyncClient } from "./proxy/with-offline.js";
export { initConnectivity } from "./client/connectivity.js";

// React hook ----------------------------------------------------------------

import { useState, useEffect } from "react";
import { syncEventBus } from "./client/sync-event-bus.js";

/**
 * Resolves a TempId to its permanent server-assigned ID.
 *
 * Returns the original `id` until the worker broadcasts TEMP_ID_RESOLVED for
 * it, at which point the hook re-renders with the real ID.
 *
 * @param id - The (possibly temporary) record ID.
 * @returns The current best-known ID for the record.
 */
export function useTempIdResolution(id: string | number): string | number {
	const [resolved, setResolved] = useState<string | number>(id);

	useEffect(() => {
		setResolved(id);

		const handler = (e: Event) => {
			const ev = e as Event & { tempId: string; realId: string | number };
			if (ev.tempId === String(id)) {
				setResolved(ev.realId);
			}
		};

		syncEventBus.addEventListener("tempIdResolved", handler);
		return () => {
			syncEventBus.removeEventListener("tempIdResolved", handler);
		};
	}, [id]);

	return resolved;
}

// Type re-exports -----------------------------------------------------------

export type {
	ApiResult,
	ApiSuccess,
	ApiError,
	Action,
	SyncConfig,
	ActionDescriptor,
	TempId,
	LocalQuery,
	WorkerInMessage,
	WorkerOutMessage,
} from "./types.js";

export { isTempId, makeTempId } from "./types.js";
