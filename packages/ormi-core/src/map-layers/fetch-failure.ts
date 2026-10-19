/**
 * Shared fetch-failure helpers for discovery and "Test connection". Pure,
 * React-free.
 */

/**
 * True when `error` is an abort (the operator cancelled, the dialog closed).
 * An abort is re-thrown by callers, never reported as a failure.
 *
 * @param error - Anything a `fetch` rejected with.
 * @returns Whether it is an `AbortError`.
 */
export function isAbortError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { name?: unknown }).name === "AbortError"
	);
}

/**
 * Tell a CORS refusal apart from an unreachable server, after a real request
 * to `url` rejected.
 *
 * Sends one opaque probe (`mode: "no-cors"`, `credentials: "omit"`, no
 * headers): it resolves whenever the server answers at all, so an answer
 * means the earlier request was refused by CORS, and a rejection means
 * nothing answered. Pass the URL **before** auth was applied: the probe must
 * never carry a credential.
 *
 * @param url - The pre-auth URL that failed.
 * @param fetchImpl - Injected for tests; defaults to the global `fetch`.
 * @returns `"cors"` when the server answered the probe, else `"unreachable"`.
 */
export async function classifyFetchFailure(
	url: string,
	fetchImpl: typeof fetch = fetch,
): Promise<"cors" | "unreachable"> {
	try {
		await fetchImpl(url, { mode: "no-cors", credentials: "omit" });
		return "cors";
	} catch {
		return "unreachable";
	}
}
