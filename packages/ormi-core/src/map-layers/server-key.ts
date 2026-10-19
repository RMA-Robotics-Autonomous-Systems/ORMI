/**
 * Map-server identity and URL scoping. Pure, React-free.
 *
 * A `serverKey` is identity the way `datasource-identity.ts` is: a template or
 * a copied workspace resolves its `MapLayerRef`s against another user's
 * registration of the same server. It is persisted in widget settings, so it
 * must never carry a credential, which is why a URL with userinfo is refused
 * rather than stripped: stripping would hide that the operator typed a secret
 * into a field that is not treated as one.
 */

/** Why a server URL is refused. */
export type ServerUrlProblem = "invalid" | "protocol" | "userinfo";

/** Result of {@link parseServerUrl}. */
export type ParsedServerUrl =
	{ ok: true; url: URL } | { ok: false; problem: ServerUrlProblem };

/** Error thrown by {@link serverKey} and {@link serverUrlPrefix} on a refused URL. */
export class MapServerUrlError extends Error {
	readonly problem: ServerUrlProblem;

	constructor(problem: ServerUrlProblem) {
		super(`Map server URL refused: ${problem}`);
		this.name = "MapServerUrlError";
		this.problem = problem;
	}
}

/**
 * Parses a map-server base URL: `http:` or `https:`, absolute, no userinfo.
 * Never throws.
 */
export function parseServerUrl(raw: string): ParsedServerUrl {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return { ok: false, problem: "invalid" };
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return { ok: false, problem: "protocol" };
	}
	if (url.username !== "" || url.password !== "") {
		return { ok: false, problem: "userinfo" };
	}
	return { ok: true, url };
}

/** True when `raw` parses as a URL that carries a username or password. */
export function hasUserinfo(raw: string): boolean {
	const parsed = parseServerUrl(raw);
	return !parsed.ok && parsed.problem === "userinfo";
}

function prefixOf(url: URL): string {
	// URL already lower-cases the host and drops a default port. The path is
	// case-sensitive on most servers, so it is kept as typed.
	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * `origin + pathname` of a server URL, with no trailing slash, no query and no
 * fragment. This is the prefix `transformRequest` scopes auth headers to.
 *
 * @throws {MapServerUrlError} when the URL is invalid, not http(s), or carries userinfo.
 */
export function serverUrlPrefix(raw: string): string {
	const parsed = parseServerUrl(raw);
	if (!parsed.ok) throw new MapServerUrlError(parsed.problem);
	return prefixOf(parsed.url);
}

/**
 * Canonical server identity: `${adapterId}:${origin}${pathname}`, with a
 * lower-case host, no trailing slash, no query, no fragment and no userinfo.
 *
 * @throws {MapServerUrlError} when the URL is invalid, not http(s), or carries userinfo.
 */
export function serverKey(adapterId: string, url: string): string {
	return `${adapterId}:${serverUrlPrefix(url)}`;
}

/**
 * True when `requestUrl` is the server at `prefix` or lies under it.
 *
 * A path-segment match, not a string prefix: `http://h/geoserver` does not
 * cover `http://h/geoserver2/...`. A request URL that cannot be parsed never
 * matches, so a credential is never attached to something we cannot place.
 *
 * @param requestUrl - URL MapLibre is about to fetch.
 * @param prefix - A value from {@link serverUrlPrefix}.
 */
export function isUnderServerPrefix(
	requestUrl: string,
	prefix: string,
): boolean {
	let url: URL;
	try {
		url = new URL(requestUrl);
	} catch {
		return false;
	}
	const target = `${url.origin}${url.pathname}`;
	return target === prefix || target.startsWith(`${prefix}/`);
}
