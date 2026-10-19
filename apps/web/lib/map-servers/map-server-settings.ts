import {
	MAP_SERVER_AUTH_FIELDS,
	MAP_SERVER_SECRET_FIELDS,
	serverKey,
	parseServerUrl,
	type DiscoveryFailureReason,
	type MapLayerProviderDefinition,
	type MapServerAuth,
	type MapServerSettings,
	type ServerUrlProblem,
} from "@workspace/ormi-core/map-layers/model";

import { findCredentialQueryKeys } from "@/lib/validations/map-server";

/**
 * Pure helpers behind Settings > Map servers. React-free, so they are unit
 * tested on their own and the page stays a thin view over them.
 */

/** Route of the map-server settings page. The one place it is spelled. */
export const MAP_SERVERS_SETTINGS_HREF = "/dashboard/settings/map-servers";

/**
 * The one-line summary of a stored server: the values of the settings keys
 * its adapter declares in `summaryProps`, and nothing else.
 *
 * An allowlist, never a denylist: a key the adapter did not declare is never
 * shown, so a credential cannot reach the row through a field nobody thought
 * to hide. Skips what it cannot honestly show (an absent key, a value that is
 * not a string or a finite number, a blank string, a URL on the reserved
 * `.invalid` TLD) and returns the rest verbatim; truncation is the view's
 * job.
 *
 * @param settings - The stored settings.
 * @param provider - The adapter that owns them.
 * @returns The values to show, in declaration order.
 */
export function resolveMapServerSummary(
	settings: MapServerSettings,
	provider: Pick<MapLayerProviderDefinition, "summaryProps">,
): string[] {
	const keys = provider.summaryProps;
	if (!keys || keys.length === 0) return [];
	const blob = settings as unknown as Record<string, unknown>;
	const values: string[] = [];
	for (const key of keys) {
		const value = blob[key];
		if (typeof value === "number") {
			if (Number.isFinite(value)) values.push(String(value));
			continue;
		}
		if (typeof value !== "string" || value.trim() === "") continue;
		if (isIdentityOnlyUrl(value)) continue;
		values.push(value);
	}
	return values;
}

/**
 * True for a URL on the reserved `.invalid` TLD, which never resolves: a
 * preset whose layers live on unrelated hosts (Public overlays) names itself
 * with one for identity only, and it reads as noise in a summary.
 */
function isIdentityOnlyUrl(value: string): boolean {
	const parsed = parseServerUrl(value);
	if (!parsed.ok) return false;
	const host = parsed.url.hostname.toLowerCase();
	return host === "invalid" || host.endsWith(".invalid");
}

/**
 * Layer count of a catalogue snapshot in words.
 *
 * @param catalog - The snapshot, `null` before the first discovery.
 * @returns E.g. "12 layers", "1 layer", or "No layers listed".
 */
export function formatLayerCount(catalog: readonly unknown[] | null): string {
	if (!catalog) return "No layers listed";
	return catalog.length === 1 ? "1 layer" : `${catalog.length} layers`;
}

const URL_PROBLEM: Record<ServerUrlProblem, string> = {
	invalid: "URL: not a valid address.",
	protocol: "URL: only http and https are supported.",
	userinfo: "URL: put credentials in Authentication, not in the URL.",
};

/**
 * What is wrong with a server URL before anything is sent, if anything.
 * Blank is left to the form's own required check.
 *
 * @param url - The URL as typed.
 * @returns A message, or `undefined` when the URL is usable or blank.
 */
export function describeServerUrlProblem(
	url: string | undefined,
): string | undefined {
	if (!url || url.trim() === "") return undefined;
	const parsed = parseServerUrl(url);
	return parsed.ok ? undefined : URL_PROBLEM[parsed.problem];
}

/**
 * Whether an edit's URL names another server than the stored record: its
 * `serverKey` differs. A URL that cannot be parsed is reported by
 * {@link describeServerUrlProblem} instead and counts as unchanged here.
 *
 * Stored secrets belong to the server they were typed for, so an identity
 * change keeps none of them (the API refuses a re-keying edit without the
 * secret), and every map that shows the old server's layers lists them as
 * missing.
 *
 * @param adapterId - The record's adapter.
 * @param url - The URL in the form.
 * @param storedKey - The record's `serverKey`.
 * @returns True when the URL re-keys the record.
 */
export function changesServerIdentity(
	adapterId: string,
	url: string | undefined,
	storedKey: string,
): boolean {
	if (!url || !parseServerUrl(url).ok) return false;
	return serverKey(adapterId, url) !== storedKey;
}

/** Shown in the edit dialog when the URL re-keys the record. */
export const SERVER_IDENTITY_CHANGE_MESSAGE =
	"Maps using this server's layers show them as missing.";

/**
 * What is wrong with the settings' URLs before anything is sent: a query key
 * that names a credential, in the server URL or any other URL-like setting
 * (an XYZ template, a COG URL).
 *
 * @param settings - The form's settings.
 * @returns A message, or `undefined` when no URL carries a credential.
 */
export function describeCredentialInUrls(
	settings: MapServerSettings,
): string | undefined {
	const keys = findCredentialQueryKeys(settings);
	if (keys.length === 0) return undefined;
	return `URL query carries a credential (${keys.join(", ")}). Put it in Authentication.`;
}

/**
 * Deep copy of plain JSON settings, so a form never aliases a stored record
 * or an adapter's shared `data`.
 *
 * @param settings - JSON settings.
 * @returns An independent copy.
 */
export function copySettings<S extends MapServerSettings>(settings: S): S {
	return JSON.parse(JSON.stringify(settings)) as S;
}

/**
 * Settings for the edit form: a copy with every secret leaf under `auth` set
 * to `""`. The operator sees a blank masked field; sending it blank keeps the
 * stored secret.
 *
 * @param settings - The stored settings (secrets included, owner read).
 * @returns A copy without secret values.
 */
export function blankSecrets<S extends MapServerSettings>(settings: S): S {
	const copy = copySettings(settings);
	const auth = copy.auth as Record<string, unknown> | undefined;
	if (!auth) return copy;
	for (const field of MAP_SERVER_SECRET_FIELDS) {
		if (field in auth) auth[field] = "";
	}
	return copy;
}

/**
 * The auth with only the fields its kind carries. A form that switched kinds
 * can leave the previous kind's fields behind, and the API refuses unknown
 * auth fields.
 *
 * @param auth - The auth in the form.
 * @returns A copy holding its kind's fields only, `undefined` when absent or of an unknown kind.
 */
export function cleanAuth(
	auth: MapServerAuth | undefined,
): MapServerAuth | undefined {
	if (!auth) return undefined;
	const shape = (
		MAP_SERVER_AUTH_FIELDS as Partial<
			Record<string, { fields: readonly string[] }>
		>
	)[auth.kind];
	if (!shape) return undefined;
	const source = auth as unknown as Record<string, unknown>;
	const clean: Record<string, unknown> = { kind: auth.kind };
	for (const field of shape.fields) {
		if (source[field] !== undefined) clean[field] = source[field];
	}
	return clean as unknown as MapServerAuth;
}

/**
 * Settings as the API is sent them: a copy with the auth cleaned.
 *
 * @param settings - The form's settings.
 * @returns A copy safe to send.
 */
export function settingsForSave<S extends MapServerSettings>(settings: S): S {
	const copy = copySettings(settings);
	const auth = cleanAuth(copy.auth);
	if (auth) copy.auth = auth;
	else delete copy.auth;
	return copy;
}

const SECRET_LABEL: Record<(typeof MAP_SERVER_SECRET_FIELDS)[number], string> =
	{
		password: "Password",
		token: "Token",
		value: "Header value",
	};

/**
 * Secret fields that must be typed before a save: blank secrets of the
 * chosen auth kind, unless the server already stores one for the same kind
 * (an edit that leaves it blank keeps it).
 *
 * @param auth - The auth in the form.
 * @param stored - The stored auth on an edit, `undefined` on an add.
 * @returns Field labels, empty when nothing is missing.
 */
export function missingSecretFields(
	auth: MapServerAuth | undefined,
	stored?: MapServerAuth,
): string[] {
	if (!auth || auth.kind === "none") return [];
	const keeps = stored?.kind === auth.kind;
	const draft = auth as unknown as Record<string, unknown>;
	const previous = (stored ?? {}) as Record<string, unknown>;
	const missing: string[] = [];
	for (const field of MAP_SERVER_SECRET_FIELDS) {
		if (!(field in draft)) continue;
		const value = draft[field];
		if (typeof value === "string" && value !== "") continue;
		if (keeps && typeof previous[field] === "string" && previous[field])
			continue;
		missing.push(SECRET_LABEL[field]);
	}
	return missing;
}

/** Headline per discovery failure reason. */
export const DISCOVERY_FAILURE_MESSAGE: Record<DiscoveryFailureReason, string> =
	{
		unreachable: "Server unreachable.",
		"blocked-insecure":
			"Blocked on this HTTPS page unless insecure content is allowed for this site.",
		cors: "The server answered, but its CORS settings do not allow this site.",
		unauthorized: "Credentials refused.",
		"not-a-server": "No map server at this address.",
	};

/** Outcome of the one tile request "Test connection" makes. */
export type TileCheck =
	| { status: "ok" }
	/** No layer to try: none listed, or none in Web Mercator. */
	| { status: "skipped" }
	| {
			status: "error";
			reason: "unreachable" | "cors" | "unauthorized" | "http";
			/** HTTP status for `"http"` and `"unauthorized"`. */
			httpStatus?: number;
	  };

/** Outcome of "Test connection" (and of a refresh, without the tile check). */
export type ConnectionTestResult =
	| {
			status: "ok";
			/** Every layer discovered. */
			layerCount: number;
			/** Of those, how many are not available in Web Mercator. */
			notWebMercator: number;
			tile: TileCheck;
	  }
	| { status: "error"; reason: DiscoveryFailureReason; detail?: string };

/** A {@link ConnectionTestResult} in words. */
export interface ConnectionTestMessage {
	/** `success`, `warning` (works, with a caveat) or `error`. */
	tone: "success" | "warning" | "error";
	/** One line per fact, first one is the headline. */
	lines: string[];
}

function tileLine(tile: TileCheck): string | undefined {
	switch (tile.status) {
		case "ok":
			return "Tile request succeeded.";
		case "skipped":
			return undefined;
		case "error":
			switch (tile.reason) {
				case "unauthorized":
					return "Tile request: credentials refused.";
				case "cors":
					return "Tile request: CORS settings do not allow this site.";
				case "unreachable":
					return "Tile request: no answer.";
				case "http":
					return `Tile request failed (HTTP ${tile.httpStatus ?? "error"}).`;
			}
	}
}

/**
 * Describe a discovery failure: the headline for its reason, then the
 * adapter's detail when it adds something.
 *
 * @param reason - The failure reason.
 * @param detail - The adapter's detail, if any.
 * @returns The lines to show.
 */
export function describeDiscoveryFailure(
	reason: DiscoveryFailureReason,
	detail?: string,
): string[] {
	const headline = DISCOVERY_FAILURE_MESSAGE[reason];
	const lines = [headline];
	const extra = detail?.trim().replace(/\.$/, "");
	if (extra && extra !== headline.replace(/\.$/, "")) lines.push(`${extra}.`);
	return lines;
}

/**
 * "Test connection" in words: the layer count, how many are not in Web
 * Mercator, how the tile request went, or why the server could not be read.
 *
 * @param result - The test outcome.
 * @returns Tone and lines.
 */
export function describeConnectionTest(
	result: ConnectionTestResult,
): ConnectionTestMessage {
	if (result.status === "error") {
		return {
			tone: "error",
			lines: describeDiscoveryFailure(result.reason, result.detail),
		};
	}
	const lines: string[] = [];
	if (result.layerCount === 0) lines.push("Connected. No layers found.");
	else
		lines.push(
			`Connected. ${result.layerCount} ${result.layerCount === 1 ? "layer" : "layers"} found.`,
		);
	if (result.notWebMercator > 0) {
		lines.push(
			result.notWebMercator === result.layerCount
				? "None available in Web Mercator."
				: `${result.notWebMercator} not available in Web Mercator.`,
		);
	}
	const tile = tileLine(result.tile);
	if (tile) lines.push(tile);
	const usable = result.layerCount - result.notWebMercator;
	const tone =
		result.tile.status === "error" || usable === 0 ? "warning" : "success";
	return { tone, lines };
}

/**
 * Whether an `ApiResult` error is a 409 (the server is already registered).
 *
 * @param details - The error's `details`.
 * @returns True for a conflict.
 */
export function isConflict(details: unknown): boolean {
	return (
		typeof details === "object" &&
		details !== null &&
		(details as { status?: unknown }).status === 409
	);
}

/** Message for a 409 on create or on a URL change. */
export const ALREADY_REGISTERED_MESSAGE =
	"This server is already registered. Edit the existing entry instead.";

/**
 * Slippy-map tile at `zoom` containing a WGS84 point.
 *
 * @returns `{ z, x, y }`.
 */
export function tileAt(
	lng: number,
	lat: number,
	zoom: number,
): { z: number; x: number; y: number } {
	const z = Math.max(0, Math.min(30, Math.round(zoom)));
	const n = 2 ** z;
	const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
	const rad = (clampedLat * Math.PI) / 180;
	const x = Math.floor(((lng + 180) / 360) * n);
	const y = Math.floor(
		((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
	);
	return {
		z,
		x: Math.max(0, Math.min(n - 1, x)),
		y: Math.max(0, Math.min(n - 1, y)),
	};
}

/** EPSG:3857 bbox of a tile, `minx,miny,maxx,maxy`. */
function tileBbox3857(z: number, x: number, y: number): string {
	const half = 20037508.342789244;
	const size = (2 * half) / 2 ** z;
	const minx = -half + x * size;
	const maxy = half - y * size;
	return [minx, maxy - size, minx + size, maxy].join(",");
}

/**
 * A concrete URL for one tile of a template: the tile at the centre of the
 * layer's bounds (or of the world) at its shallowest zoom, with `{z}`, `{x}`,
 * `{y}`, `{quadkey}` and `{bbox-epsg-3857}` substituted.
 *
 * @param template - A MapLibre tile template.
 * @param layer - The layer's bounds and minimum zoom.
 * @returns The URL to request.
 */
export function tileProbeUrl(
	template: string,
	layer: { bounds?: [number, number, number, number]; minzoom?: number },
): string {
	const [w, s, e, n] = layer.bounds ?? [-180, -85, 180, 85];
	const { z, x, y } = tileAt((w + e) / 2, (s + n) / 2, layer.minzoom ?? 0);
	let quadkey = "";
	for (let i = z; i > 0; i--) {
		const mask = 1 << (i - 1);
		quadkey += String((x & mask ? 1 : 0) + (y & mask ? 2 : 0));
	}
	return template
		.replace(/\{z\}/g, String(z))
		.replace(/\{x\}/g, String(x))
		.replace(/\{y\}/g, String(y))
		.replace(/\{quadkey\}/g, quadkey)
		.replace(/\{bbox-epsg-3857\}/g, tileBbox3857(z, x, y));
}
