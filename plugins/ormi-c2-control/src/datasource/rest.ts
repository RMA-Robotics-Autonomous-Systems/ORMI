import type {
	RemoteCallDefinition,
	RemoteCallHandle,
	RemoteCallResult,
	RemoteCallStatus,
	RemoteCallOptions,
} from "@workspace/ormi-core/datasources";

import { C2ControlSettings } from "../types/c2-types";
import { applyC2Auth, findC2CallSpec } from "./remote-calls";
import { interpretC2Response } from "./response";

/**
 * The C2 transport boundary: the **only** place `fetch` to the C2 backends
 * lives. Widgets never fetch — they go through `useRemoteCall`, which routes to
 * the datasource's `${id}-execute-remote-call` filter, which calls this.
 *
 * Three cross-cutting concerns live here rather than at the 20+ call sites:
 *
 *  1. **Timeouts.** Every call is bounded. `options.timeout` wins when a caller
 *     passes one (`0` still means "no timeout", explicitly); otherwise the
 *     catalog's per-call `timeoutMs` applies. Before this, `timeoutMs` defaulted
 *     to `0` and no call site passed options, so a black-holed backend left
 *     `useAsyncAction`'s latch engaged and every button in the widget disabled
 *     for as long as the socket hung.
 *  2. **Auth.** The optional bearer token is attached to every `:5001`
 *     (`command`-scope) call and to every `:5000` mutation; `:5000` GETs stay
 *     bare (see {@link applyC2Auth}).
 *  3. **Both backend generations.** Success/failure and the error message are
 *     decided by {@link interpretC2Response}, which reads plain-text bodies with
 *     HTTP 200 (today's C2) and structured JSON bodies with proper 4xx (the C2
 *     backend in flight) identically. See `response.ts` for the matrix.
 */

/** Fallback when a call somehow carries no catalog timeout. */
const FALLBACK_TIMEOUT_MS = 15_000;

/**
 * Execute a C2 remote call as a REST round-trip and return a `RemoteCallHandle`.
 * @param settings - The C2 datasource settings (REST base URLs + optional token).
 * @param def - The remote-call definition being invoked.
 * @param request - The request payload (shape per the call's `requestSchema`).
 * @param options - Optional timeout / behavior flags. `timeout` overrides the
 *   catalog default; pass `0` to disable the timeout deliberately.
 * @returns A handle whose `result` resolves with the REST outcome. `cancel()`
 *   aborts the in-flight request; only non-command calls are advertised
 *   `cancelable`, because aborting a command does not un-send it.
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
	/** Set when OUR timer fired, to tell a timeout apart from an operator cancel. */
	let timedOut = false;

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

		// Per-call default from the catalog; an explicit `options.timeout` (0
		// included) still wins, so a caller can opt out deliberately.
		const timeoutMs =
			options?.timeout ?? spec.timeoutMs ?? FALLBACK_TIMEOUT_MS;
		const timeoutId =
			timeoutMs > 0
				? setTimeout(() => {
						timedOut = true;
						controller.abort();
					}, timeoutMs)
				: undefined;

		// Pre-flight: refuse a request the backend is certain to reject, naming
		// the actual field (the server's code alone does not say which one).
		const refusal = spec.validate?.(request ?? {}) ?? null;
		if (refusal) {
			if (timeoutId) clearTimeout(timeoutId);
			setStatus("failed");
			return {
				success: false,
				error: refusal,
				duration: Date.now() - start,
				status: "failed",
			};
		}

		try {
			const { url, init } = spec.build(settings, request ?? {});
			const res = await fetch(url, {
				...init,
				headers: applyC2Auth(
					settings,
					spec.scope,
					init.method,
					(init.headers as Record<string, string> | undefined) ?? {},
				),
				signal: controller.signal,
			});

			// Tolerate empty / non-JSON bodies (today's C2 returns plain strings
			// from several routes; the new one returns JSON everywhere).
			const text = await res.text();
			let data: unknown = text;
			try {
				data = text ? JSON.parse(text) : null;
			} catch {
				/* keep raw text */
			}

			const outcome = interpretC2Response(
				res.status,
				res.statusText,
				text,
				data,
				spec.scope,
			);
			const status: RemoteCallStatus = outcome.success
				? "succeeded"
				: "failed";
			setStatus(status);
			return {
				success: outcome.success,
				data,
				error: outcome.error,
				duration: Date.now() - start,
				status,
			};
		} catch (err) {
			const aborted = controller.signal.aborted;
			// A timeout is a FAILURE the operator must see, not a silent cancel:
			// "nothing happened for 15 s" is the single most common way this
			// system misleads, so it gets an explicit message.
			const status: RemoteCallStatus =
				aborted && !timedOut ? "canceled" : "failed";
			setStatus(status);
			const detail = timedOut
				? `Timed out after ${timeoutMs} ms — the C2 did not respond (${def.name}).`
				: aborted
					? "Canceled."
					: err instanceof Error
						? err.message
						: String(err);
			return {
				success: false,
				// A command POST that timed out, was aborted or lost its
				// response (a network drop, a CORS block on the reply) may
				// already have been applied: "failed" would invite a blind
				// retry, "canceled" would promise nothing happened. Say what
				// is actually known, and where to look.
				error:
					spec.scope === "command"
						? `Outcome unknown — the C2 may have applied it; check mission feedback before retrying. (${detail})`
						: detail,
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
