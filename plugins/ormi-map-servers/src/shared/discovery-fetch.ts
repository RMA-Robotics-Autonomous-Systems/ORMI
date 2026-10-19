/**
 * Discovery fetches, and how their failures read to an operator.
 *
 * Discovery runs in the browser against the operator's own network, so a
 * failure has a small number of honest explanations and each maps to one
 * `DiscoveryResult` reason:
 *
 * - `blocked-insecure`: decided before any request. An `http:` server that is
 *   not loopback, from an `https:` page, is blockable mixed content.
 * - `unauthorized`: the server answered 401 or 403.
 * - `cors` / `unreachable`: `fetch` rejected. The browser hides which, so a
 *   second, opaque (`no-cors`) request tells them apart: if it resolves, the
 *   server is there and only the CORS headers are missing. The probe is
 *   core's `classifyFetchFailure`, a plain `fetch` rather than the context's,
 *   so it carries no auth and can never leak a credential.
 * - `not-a-server`: an answer that is not the document asked for (404, HTML,
 *   malformed XML, JSON without the expected fields).
 */

import {
	classifyFetchFailure,
	isAbortError,
	type DiscoveryContext,
	type DiscoveryResult,
} from "@workspace/ormi-core/map-layers/model";

/** A discovery failure, the error branch of `DiscoveryResult`. */
export type DiscoveryFailure = Extract<DiscoveryResult, { status: "error" }>;

/** Result of {@link fetchText}. */
export type FetchTextResult =
	| { ok: true; text: string }
	| { ok: false; failure: DiscoveryFailure; status?: number };

const LOOPBACK_HOSTS = new Set(["localhost", "[::1]", "::1"]);

/** True for `localhost`, `*.localhost`, `127.0.0.0/8` and `[::1]`, which browsers treat as trustworthy. */
export function isLoopbackHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost")) return true;
	return /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** Protocol of the page discovery runs on, `undefined` outside a browser. */
function currentPageProtocol(): string | undefined {
	return (globalThis as { location?: { protocol?: string } }).location
		?.protocol;
}

/**
 * The mixed-content pre-check: a failure when `url` is `http:` on a host that
 * is not loopback and the page is `https:`, otherwise `undefined`.
 *
 * @param pageProtocol - Defaults to the current page's protocol.
 */
export function checkInsecure(
	url: string,
	pageProtocol: string | undefined = currentPageProtocol(),
): DiscoveryFailure | undefined {
	if (pageProtocol !== "https:") return undefined;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	if (parsed.protocol !== "http:" || isLoopbackHost(parsed.hostname))
		return undefined;
	return {
		status: "error",
		reason: "blocked-insecure",
		detail: "Blocked on this HTTPS page unless insecure content is allowed for this site",
	};
}

const NETWORK_FAILURE_DETAIL: Record<"cors" | "unreachable", string> = {
	cors: "The server answered, but its CORS headers do not allow this site",
	unreachable: "No answer from the server",
};

/** Maps a rejected `fetch` to `cors` or `unreachable` with core's opaque probe. */
async function classifyNetworkError(
	url: string,
	signal: AbortSignal,
): Promise<DiscoveryFailure> {
	const reason = await classifyFetchFailure(url);
	// The probe is not tied to the signal; a cancel during it still cancels.
	signal.throwIfAborted();
	return { status: "error", reason, detail: NETWORK_FAILURE_DETAIL[reason] };
}

/**
 * Fetches `url` through the context (auth applied) and returns its body, or
 * the failure in operator terms. An abort is re-thrown, never reported as a
 * failure: the operator cancelled, nothing is wrong with the server.
 *
 * @param probeUrl - URL for the opaque CORS probe; defaults to `url`. Pass
 *   the same URL without any auth parameter the caller added itself.
 */
export async function fetchText(
	ctx: DiscoveryContext,
	url: string,
	probeUrl: string = url,
): Promise<FetchTextResult> {
	let res: Response;
	try {
		res = await ctx.fetch(url);
	} catch (err) {
		if (isAbortError(err)) throw err;
		return {
			ok: false,
			failure: await classifyNetworkError(probeUrl, ctx.signal),
		};
	}
	if (res.status === 401 || res.status === 403) {
		return {
			ok: false,
			status: res.status,
			failure: {
				status: "error",
				reason: "unauthorized",
				detail: `HTTP ${res.status}`,
			},
		};
	}
	if (!res.ok) {
		return {
			ok: false,
			status: res.status,
			failure: {
				status: "error",
				reason: res.status >= 500 ? "unreachable" : "not-a-server",
				detail: `HTTP ${res.status}`,
			},
		};
	}
	try {
		return { ok: true, text: await res.text() };
	} catch (err) {
		if (isAbortError(err)) throw err;
		return {
			ok: false,
			failure: {
				status: "error",
				reason: "unreachable",
				detail: "The answer was cut off",
			},
		};
	}
}

/** The `not-a-server` failure for a document that could not be read. */
export function notAServer(detail: string): DiscoveryFailure {
	return { status: "error", reason: "not-a-server", detail };
}

/** `base` without trailing slashes, so a path can be appended. */
export function trimBase(url: string): string {
	return url.trim().replace(/\/+$/, "");
}
