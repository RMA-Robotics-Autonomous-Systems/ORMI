import type {
	RemoteCallDefinition,
	RemoteCallHandle,
	RemoteCallResult,
	RemoteCallStatus,
	RemoteCallOptions,
} from "@workspace/ormi-core/datasources";

import { C2ControlSettings } from "../types/c2-types";
import { findC2CallSpec } from "./remote-calls";

/**
 * The C2 transport boundary (D7): the **only** place `fetch` to the C2 backends
 * lives. Widgets never fetch — they go through `useRemoteCall`, which routes to
 * the datasource's `${id}-execute-remote-call` filter, which calls this.
 */

/**
 * Execute a C2 remote call as a REST round-trip and return a `RemoteCallHandle`.
 * @param settings - The C2 datasource settings (REST base URLs).
 * @param def - The remote-call definition being invoked.
 * @param request - The request payload (shape per the call's `requestSchema`).
 * @param options - Optional timeout / behavior flags.
 * @returns A handle whose `result` resolves with the REST outcome.
 */
export function executeC2Call(
	settings: C2ControlSettings,
	def: RemoteCallDefinition,
	request: Record<string, unknown> | undefined,
	options?: RemoteCallOptions,
): RemoteCallHandle {
	const spec = findC2CallSpec(def.name);
	const controller = new AbortController();
	const start = Date.now();

	let currentStatus: RemoteCallStatus = "executing";
	const statusCallbacks = new Set<(status: RemoteCallStatus) => void>();
	const setStatus = (s: RemoteCallStatus) => {
		currentStatus = s;
		statusCallbacks.forEach((cb) => cb(s));
	};

	const result: Promise<RemoteCallResult> = (async () => {
		if (!spec) {
			setStatus("failed");
			return {
				success: false,
				error: `Unknown C2 remote call: ${def.name}`,
				duration: Date.now() - start,
				status: "failed",
			};
		}

		const timeoutMs = options?.timeout ?? 0;
		const timeoutId =
			timeoutMs > 0
				? setTimeout(() => controller.abort(), timeoutMs)
				: undefined;

		try {
			const { url, init } = spec.build(settings, request ?? {});
			const res = await fetch(url, {
				...init,
				signal: controller.signal,
			});

			// Tolerate empty / non-JSON bodies (some C2 routes return a plain string).
			const text = await res.text();
			let data: unknown = text;
			try {
				data = text ? JSON.parse(text) : null;
			} catch {
				/* keep raw text */
			}

			const status: RemoteCallStatus = res.ok ? "succeeded" : "failed";
			setStatus(status);
			return {
				success: res.ok,
				data,
				error: res.ok
					? undefined
					: `HTTP ${res.status}: ${text || res.statusText}`,
				duration: Date.now() - start,
				status,
			};
		} catch (err) {
			const aborted = controller.signal.aborted;
			const status: RemoteCallStatus = aborted ? "canceled" : "failed";
			setStatus(status);
			return {
				success: false,
				error: aborted
					? `Aborted${timeoutMs ? ` (timeout ${timeoutMs}ms)` : ""}`
					: err instanceof Error
						? err.message
						: String(err),
				duration: Date.now() - start,
				status,
			};
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
		}
	})();

	return {
		id: def.name,
		status: currentStatus,
		result,
		onStatusChange: (cb) => {
			statusCallbacks.add(cb);
			return () => statusCallbacks.delete(cb);
		},
		cancel: async () => {
			controller.abort();
			return true;
		},
	};
}
