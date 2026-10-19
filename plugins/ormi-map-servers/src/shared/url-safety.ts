/**
 * Keeps credentials out of the URLs an operator types and out of the layer
 * ids every map widget persists.
 *
 * A server URL, an XYZ template and a COG URL all end up somewhere other than
 * the stored auth: the URL in a `serverKey`, a template or COG URL in the
 * catalogue `params` every map reads. A credential typed into one of them is a
 * credential in plain settings, so a query key that names one is refused, and
 * the operator is pointed at the Authentication field, which core scopes to
 * the server and keeps secret.
 *
 * `apps/web/lib/validations/map-server.ts` holds the same pattern for the API
 * envelope, which cannot import a plugin. Change both together.
 */

import type { DiscoveryFailure } from "./discovery-fetch";
import { notAServer } from "./discovery-fetch";

/** A query parameter name that names a credential. */
export const CREDENTIAL_QUERY_KEY =
	/pass(word)?|secret|token|authkey|api[-_]?key|key|signature|credential|x-amz-/i;

function safeDecode(text: string): string {
	try {
		return decodeURIComponent(text.replace(/\+/g, " "));
	} catch {
		return text;
	}
}

/**
 * Query parameter names of `url` that look like a credential.
 *
 * String-based, so it reads tile templates (`{z}/{x}/{y}?key=…`) and
 * relative templates that `URL` cannot parse.
 *
 * @param url - A URL or tile template.
 * @returns The offending names, in order, empty when there are none.
 */
export function credentialQueryKeys(url: string): string[] {
	const beforeHash = url.split("#", 1)[0] ?? "";
	const queryAt = beforeHash.indexOf("?");
	if (queryAt < 0) return [];
	return beforeHash
		.slice(queryAt + 1)
		.split("&")
		.filter((pair) => pair !== "")
		.map((pair) => {
			const eq = pair.indexOf("=");
			return safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
		})
		.filter((name) => CREDENTIAL_QUERY_KEY.test(name));
}

/**
 * The `not-a-server` failure for a URL whose query carries a credential, or
 * `undefined` when it carries none.
 *
 * @param url - The URL or template as typed.
 * @param label - What the URL is, for the detail ("URL", "Template", …).
 */
export function refuseCredentialQuery(
	url: string,
	label: string,
): DiscoveryFailure | undefined {
	const keys = credentialQueryKeys(url);
	if (keys.length === 0) return undefined;
	return notAServer(
		`${label} carries a credential (${keys.join(", ")}). Put it in the Authentication field instead`,
	);
}

/** `url` without its query string and fragment. */
export function withoutQuery(url: string): string {
	return url.trim().split(/[?#]/, 1)[0] ?? "";
}

/** FNV-1a 32-bit of `text`, base 36, seven characters. */
export function shortHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36).padStart(7, "0");
}

/** Lower-case ASCII slug of `title`, at most 48 characters. */
export function slugify(title: string): string {
	return title
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/, "");
}

/**
 * A layer id that can be persisted in widget settings: the title's slug and a
 * short hash of `url` with its query string removed, so nothing a query
 * carries (a token the operator should have put in Authentication) reaches a
 * `MapLayerRef`. Stable for the same title and URL; renaming the layer
 * changes it.
 *
 * @param title - The layer's title as configured.
 * @param url - The template or COG URL as configured.
 * @param seen - Ids already used in this catalogue; the result is added to it.
 * @returns A unique id, `-2`, `-3`… appended on a collision.
 */
export function credentialFreeLayerId(
	title: string,
	url: string,
	seen: Set<string>,
): string {
	const base = `${slugify(title) || "layer"}-${shortHash(withoutQuery(url))}`;
	let id = base;
	for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
	seen.add(id);
	return id;
}
