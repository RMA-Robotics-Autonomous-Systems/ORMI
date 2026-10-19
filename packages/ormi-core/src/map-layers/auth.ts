import type { JsonSchema, JsonSchema7 } from "@jsonforms/core";

import { isUnderServerPrefix, serverUrlPrefix } from "./server-key";

/**
 * Map-server authentication: the stored shape, the schema fragment adapters
 * embed in their settings schema, and the one place a stored auth becomes
 * wire material. Pure, React-free.
 */

/** Authentication kinds a map server may use. */
export type MapServerAuthKind =
	"none" | "basic" | "bearer" | "query-token" | "header";

/** Stored authentication of one map server. */
export type MapServerAuth =
	| { kind: "none" }
	| { kind: "basic"; username: string; password: string }
	| { kind: "bearer"; token: string }
	| {
			kind: "query-token";
			token: string;
			/**
			 * Query parameter name, used only when the adapter does not fix one
			 * (`MapServerAuthCapability.queryParam`), as the `xyz` adapter does not.
			 */
			param?: string;
	  }
	| { kind: "header"; name: string; value: string };

/** Auth kinds an adapter's server type supports. Declared by each adapter. */
export interface MapServerAuthCapability {
	/** Supported kinds; `"none"` first, which is the default. */
	kinds: readonly MapServerAuthKind[];
	/** Parameter name for `"query-token"`, e.g. `"authkey"`, `"access_token"`. */
	queryParam?: string;
}

/** Wire material for one server's requests. */
export interface ResolvedMapServerAuth {
	query?: Record<string, string>;
	headers?: Record<string, string>;
}

/** Fields one auth kind stores under `auth`, besides `kind`. */
export interface MapServerAuthKindFields {
	/** Every field the kind stores, the secret one included. */
	fields: readonly string[];
	/** The field holding the secret, when the kind has one. */
	secret?: string;
}

/**
 * The single source of per-kind auth fields: the schema branches, the secret
 * paths, the merge of an edit and the redaction are all derived from it, so
 * a new kind (or a renamed field) cannot leave one of them behind.
 */
export const MAP_SERVER_AUTH_FIELDS = {
	none: { fields: [] },
	basic: { fields: ["username", "password"], secret: "password" },
	bearer: { fields: ["token"], secret: "token" },
	"query-token": { fields: ["token", "param"], secret: "token" },
	header: { fields: ["name", "value"], secret: "value" },
} as const satisfies Record<MapServerAuthKind, MapServerAuthKindFields>;

/** A secret field name under `auth`. */
export type MapServerSecretField = {
	[K in MapServerAuthKind]: (typeof MAP_SERVER_AUTH_FIELDS)[K] extends {
		secret: infer S extends string;
	}
		? S
		: never;
}[MapServerAuthKind];

/**
 * Field names under `auth` that hold a secret, for every kind, derived from
 * {@link MAP_SERVER_AUTH_FIELDS}. Never shown in a summary, never logged,
 * never in a `MapLayerRef`, a catalogue entry or a `serverKey`. Kept here so
 * an adapter cannot forget one.
 */
export const MAP_SERVER_SECRET_FIELDS: readonly MapServerSecretField[] =
	Object.freeze([
		...new Set(
			Object.values(MAP_SERVER_AUTH_FIELDS).flatMap(
				(kind: MapServerAuthKindFields) =>
					kind.secret ? [kind.secret as MapServerSecretField] : [],
			),
		),
	]);

/** Settings paths of every secret leaf, dot-separated from the settings root. */
export const MAP_SERVER_SECRET_PATHS: readonly string[] =
	MAP_SERVER_SECRET_FIELDS.map((field) => `auth.${field}`);

/** True when `field` (a key under `auth`) holds a secret. */
export function isMapServerSecretField(
	field: string,
): field is MapServerSecretField {
	return (MAP_SERVER_SECRET_FIELDS as readonly string[]).includes(field);
}

/**
 * A secret leaf: a string the form renders as a password field. `writeOnly`
 * is a standard JSON Schema keyword, so AJV accepts it without an unknown
 * keyword or format warning; renderers and the settings page read it to mask
 * the input and show "Unchanged" on edit.
 */
function secretString(title: string): JsonSchema7 {
	return { type: "string", title, writeOnly: true } as JsonSchema7;
}

const KIND_TITLES: Record<MapServerAuthKind, string> = {
	none: "None",
	basic: "Username and password",
	bearer: "Bearer token",
	"query-token": "Token in URL",
	header: "Custom header",
};

/** Schema of each non-secret field, by name. A secret field is always {@link secretString}. */
function plainField(
	kind: MapServerAuthKind,
	field: string,
	cap: MapServerAuthCapability,
): JsonSchema7 | undefined {
	switch (field) {
		case "username":
			return { type: "string", title: "Username" };
		case "name":
			return { type: "string", title: "Header name", minLength: 1 };
		case "param":
			// Asked for only when the adapter fixes no parameter name.
			if (kind === "query-token" && cap.queryParam) return undefined;
			return { type: "string", title: "Parameter name", minLength: 1 };
		default:
			return { type: "string", title: field };
	}
}

/** Title of a kind's secret field. */
function secretTitle(
	kind: MapServerAuthKind,
	cap: MapServerAuthCapability,
): string {
	switch (kind) {
		case "basic":
			return "Password";
		case "header":
			return "Header value";
		case "query-token":
			return cap.queryParam ? `Token (${cap.queryParam})` : "Token";
		default:
			return "Token";
	}
}

function kindBranch(
	kind: MapServerAuthKind,
	cap: MapServerAuthCapability,
): JsonSchema7 {
	const spec: MapServerAuthKindFields = MAP_SERVER_AUTH_FIELDS[kind];
	const properties: Record<string, JsonSchema7> = {
		kind: { const: kind, default: kind },
	};
	const required = ["kind"];
	for (const field of spec.fields) {
		const prop =
			field === spec.secret
				? secretString(secretTitle(kind, cap))
				: plainField(kind, field, cap);
		if (!prop) continue;
		properties[field] = prop;
		required.push(field);
	}
	return { title: KIND_TITLES[kind], type: "object", properties, required };
}

/** Declared kinds, de-duplicated, `"none"` always present and first. */
function declaredKinds(cap: MapServerAuthCapability): MapServerAuthKind[] {
	const kinds: MapServerAuthKind[] = ["none"];
	for (const kind of cap.kinds) {
		if (!kinds.includes(kind)) kinds.push(kind);
	}
	return kinds;
}

/**
 * Schema fragment for an adapter's `auth` settings property: a `oneOf` over
 * the declared kinds, with every secret leaf marked `writeOnly`. Static (the
 * choices come from the adapter, not from live state), so a `oneOf` is legal
 * here. Defaults to `{ kind: "none" }`, so the settings are valid on open.
 */
export function mapServerAuthProperty(
	cap: MapServerAuthCapability,
): JsonSchema {
	return {
		title: "Authentication",
		type: "object",
		default: { kind: "none" },
		oneOf: declaredKinds(cap).map((kind) => kindBranch(kind, cap)),
	};
}

function base64Utf8(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/**
 * Pure. The one place a stored auth becomes wire material.
 *
 * Returns `{}` (nothing to send) for no auth, for `"none"`, for a kind the
 * adapter does not declare (refused, never sent), and for an auth whose
 * secret or name is empty. `"query-token"` uses the adapter's `queryParam`
 * when declared, otherwise the auth's own `param`.
 */
export function resolveMapServerAuth(
	auth: MapServerAuth | undefined,
	cap: MapServerAuthCapability,
): ResolvedMapServerAuth {
	if (!auth || auth.kind === "none") return {};
	if (!cap.kinds.includes(auth.kind)) return {};
	switch (auth.kind) {
		case "basic":
			if (!auth.username && !auth.password) return {};
			return {
				headers: {
					Authorization: `Basic ${base64Utf8(`${auth.username}:${auth.password}`)}`,
				},
			};
		case "bearer":
			if (!auth.token) return {};
			return { headers: { Authorization: `Bearer ${auth.token}` } };
		case "query-token": {
			const param = cap.queryParam || auth.param;
			if (!param || !auth.token) return {};
			return { query: { [param]: auth.token } };
		}
		case "header":
			if (!auth.name.trim() || !auth.value) return {};
			return { headers: { [auth.name.trim()]: auth.value } };
	}
	return {};
}

function safeDecode(text: string): string {
	try {
		return decodeURIComponent(text.replace(/\+/g, " "));
	} catch {
		return text;
	}
}

/**
 * Appends `query` to `url` as query parameters, replacing any parameter of
 * the same name.
 *
 * String-based on purpose: it works on tile templates (`{z}/{x}/{y}`,
 * `{bbox-epsg-3857}`), whose braces `URL` would percent-encode and so break
 * MapLibre's substitution. Existing parameters are kept verbatim, the fragment
 * is kept, and only the appended names and values are encoded.
 */
export function applyQueryParams(
	url: string,
	query: Record<string, string> | undefined,
): string {
	const entries = Object.entries(query ?? {});
	if (entries.length === 0) return url;

	const hashAt = url.indexOf("#");
	const hash = hashAt >= 0 ? url.slice(hashAt) : "";
	const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
	const queryAt = beforeHash.indexOf("?");
	const base = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
	const existing = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "";

	const names = new Set(entries.map(([name]) => name));
	const kept = existing
		.split("&")
		.filter((pair) => pair !== "")
		.filter((pair) => {
			const eq = pair.indexOf("=");
			const name = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
			return !names.has(name);
		});
	const added = entries.map(
		([name, value]) =>
			`${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
	);
	return `${base}?${[...kept, ...added].join("&")}${hash}`;
}

/**
 * The one auth-scoping rule: a server's wire material applies to `url` only
 * when `url` is that server, or lies under it (`isUnderServerPrefix` against
 * `serverUrlPrefix(serverUrl)`). Everything else (a basemap, a redirect
 * target an adapter followed, a URL a capabilities document pointed at on
 * another host) gets `{}`, so neither a query token nor a header leaves the
 * server it was issued for.
 *
 * Works on tile templates too: placeholders (`{z}`, `{bbox-epsg-3857}`) sit
 * in the path or query after the prefix, and `URL` parsing percent-encodes
 * them there without moving the origin or the leading path. A template whose
 * placeholder sits in the host (`{s}.tile…`) cannot be placed and gets `{}`.
 * A server URL that is refused (`serverUrlPrefix` throws) gets `{}` too.
 *
 * @param url - The URL or tile template about to be requested.
 * @param serverUrl - The server's stored base URL.
 * @param resolved - From {@link resolveMapServerAuth}.
 * @returns `resolved` when `url` is under the server, otherwise `{}`.
 */
export function authForUrl(
	url: string,
	serverUrl: string,
	resolved: ResolvedMapServerAuth,
): ResolvedMapServerAuth {
	if (!resolved.query && !resolved.headers) return {};
	let prefix: string;
	try {
		prefix = serverUrlPrefix(serverUrl);
	} catch {
		return {};
	}
	return isUnderServerPrefix(url, prefix) ? resolved : {};
}

/**
 * Builds a `DiscoveryContext.fetch`: applies the server's query params to the
 * URL and its headers to the request, **only** for URLs under the server
 * (see {@link authForUrl}). The adapter never sees the credential.
 *
 * @param resolved - From {@link resolveMapServerAuth}.
 * @param serverUrl - The server's stored base URL; auth is scoped to it.
 * @param signal - Passed to every request.
 * @param fetchImpl - Injected for tests; defaults to the global `fetch`.
 * @returns A `fetch(url)` for the adapter.
 */
export function createAuthedFetch(
	resolved: ResolvedMapServerAuth,
	serverUrl: string,
	signal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): (url: string) => Promise<Response> {
	return (url) => {
		const scoped = authForUrl(url, serverUrl, resolved);
		const init: RequestInit = { signal };
		if (scoped.headers) init.headers = { ...scoped.headers };
		return fetchImpl(applyQueryParams(url, scoped.query), init);
	};
}

/**
 * Keeps stored secrets an edit did not resend: a `PUT` that omits a secret
 * (or sends it empty) keeps the stored one, as long as the auth kind is
 * unchanged. A changed kind keeps nothing from the old auth.
 */
export function mergeMapServerAuthSecrets(
	incoming: MapServerAuth | undefined,
	stored: MapServerAuth | undefined,
): MapServerAuth | undefined {
	if (!incoming || !stored || incoming.kind !== stored.kind) return incoming;
	const merged: Record<string, unknown> = { ...incoming };
	const previous = stored as Record<string, unknown>;
	for (const field of MAP_SERVER_SECRET_FIELDS) {
		if (!(field in previous)) continue;
		const next = merged[field];
		if (next === undefined || next === "") merged[field] = previous[field];
	}
	return merged as MapServerAuth;
}

/**
 * A copy of `auth` with every secret leaf removed, for any read that is not
 * the owner's own (and for logging, which should prefer not logging at all).
 */
export function redactMapServerAuth(
	auth: MapServerAuth | undefined,
): MapServerAuth | undefined {
	if (!auth) return auth;
	const copy: Record<string, unknown> = { ...auth };
	for (const field of MAP_SERVER_SECRET_FIELDS) delete copy[field];
	return copy as MapServerAuth;
}
