/**
 * `transformRequest` for map widgets: header auth scoped to the map servers a
 * map uses, and composition with a widget's own function.
 *
 * Pure and React-free (maplibre-gl is imported for types only), so the
 * scoping that keeps a credential off the basemap is unit-tested directly.
 */

import type {
	RequestParameters,
	RequestTransformFunction,
	ResourceType,
} from "maplibre-gl";

import { resolveMapServerAuth } from "./auth";
import type { MapLayerProviderDefinition } from "./provider-definition";
import type { ResolvedLayer } from "./resolve-layer-refs";
import { isUnderServerPrefix, serverUrlPrefix } from "./server-key";

/** MapLibre's `transformRequest` signature. */
export type MapTransformRequest = RequestTransformFunction;

/** Headers to add to every request under one server's URL prefix. */
export interface MapServerHeaderRule {
	/** `origin + pathname` of the server, from `serverUrlPrefix`. */
	prefix: string;
	/** Headers to send, from `resolveMapServerAuth`. */
	headers: Record<string, string>;
}

/**
 * The header rules of the servers a map currently draws from: one per server
 * with at least one enabled `ok` layer and header auth. Servers with no
 * headers, disabled and stale refs contribute nothing.
 *
 * @param resolved - The map's resolved refs.
 * @param providers - Registered adapters (they declare the auth kinds).
 * @returns Rules, one per server prefix, in registry order.
 */
export function buildMapServerHeaderRules(
	resolved: readonly ResolvedLayer[],
	providers: readonly MapLayerProviderDefinition[],
): MapServerHeaderRule[] {
	const providerById = new Map(providers.map((p) => [p.id, p]));
	const rules: MapServerHeaderRule[] = [];
	const seen = new Set<string>();
	for (const item of resolved) {
		if (item.kind !== "ok" || !item.ref.enabled) continue;
		const { server } = item;
		if (seen.has(server.serverKey)) continue;
		seen.add(server.serverKey);
		const provider = providerById.get(server.adapterId);
		if (!provider) continue;
		const { headers } = resolveMapServerAuth(
			server.settings.auth,
			provider.auth,
		);
		if (!headers || Object.keys(headers).length === 0) continue;
		let prefix: string;
		try {
			prefix = serverUrlPrefix(server.settings.url);
		} catch {
			// A URL that cannot be placed never receives a credential.
			continue;
		}
		rules.push({ prefix, headers: { ...headers } });
	}
	return rules;
}

/** An identity-stable `transformRequest` and the setter of its rules. */
export interface ScopedTransformRequest {
	/** Pass to `<Map transformRequest>`. Its identity never changes. */
	transformRequest: MapTransformRequest;
	/** Replace the rules the function reads. Call from an effect, never during render. */
	setRules: (rules: readonly MapServerHeaderRule[]) => void;
}

/**
 * Build a `transformRequest` that adds a server's headers **only** to
 * requests under that server's URL prefix, so a credential never rides along
 * to a basemap or another host. The function reads its rules at call time, so
 * an auth change applies to the next request without remounting the map
 * (react-map-gl passes `transformRequest` to MapLibre once, at construction).
 *
 * @param initial - Rules in force until the first {@link ScopedTransformRequest.setRules}.
 * @returns The function and its setter.
 */
export function createScopedTransformRequest(
	initial: readonly MapServerHeaderRule[] = [],
): ScopedTransformRequest {
	let rules: readonly MapServerHeaderRule[] = initial;
	const transformRequest: MapTransformRequest = (url) => {
		for (const rule of rules) {
			if (isUnderServerPrefix(url, rule.prefix)) {
				return { url, headers: { ...rule.headers } };
			}
		}
		return undefined;
	};
	return {
		transformRequest,
		setRules: (next) => {
			rules = next;
		},
	};
}

/** Read a `headers` value as a plain record. */
function headerRecord(headers: unknown): Record<string, string> {
	if (!headers || typeof headers !== "object") return {};
	if (typeof Headers !== "undefined" && headers instanceof Headers) {
		const out: Record<string, string> = {};
		headers.forEach((value, name) => {
			out[name] = value;
		});
		return out;
	}
	if (Array.isArray(headers)) {
		return Object.fromEntries(
			headers.filter(
				(pair): pair is [string, string] =>
					Array.isArray(pair) && pair.length === 2,
			),
		);
	}
	return { ...(headers as Record<string, string>) };
}

/**
 * Compose two `transformRequest` functions: `a` runs first, `b` sees the URL
 * `a` produced. Parameters are merged, `b` winning on conflict, headers merged
 * key by key. Either may be omitted.
 *
 * @param a - Runs first, e.g. a widget's own function.
 * @param b - Runs second, e.g. `useMapRasterLayers().transformRequest`.
 * @returns The composed function.
 */
export function composeTransformRequest(
	a: MapTransformRequest | undefined,
	b: MapTransformRequest | undefined,
): MapTransformRequest {
	return (url: string, resourceType?: ResourceType) => {
		const first = a?.(url, resourceType);
		const nextUrl = first?.url ?? url;
		const second = b?.(nextUrl, resourceType);
		if (!first && !second) return undefined;
		const headers = {
			...headerRecord(first?.headers),
			...headerRecord(second?.headers),
		};
		const merged: RequestParameters = {
			...first,
			...second,
			url: second?.url ?? nextUrl,
		};
		if (Object.keys(headers).length > 0) merged.headers = headers;
		else delete merged.headers;
		return merged;
	};
}
