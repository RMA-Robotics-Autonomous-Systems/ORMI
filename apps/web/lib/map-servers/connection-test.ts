import {
	classifyFetchFailure,
	createAuthedFetch,
	isAbortError,
	resolveMapServerAuth,
	type DiscoveryResult,
	type MapLayerEntry,
	type MapLayerProviderDefinition,
	type MapServerSettings,
} from "@workspace/ormi-core/map-layers/model";

import {
	tileProbeUrl,
	type ConnectionTestResult,
	type TileCheck,
} from "./map-server-settings";

/**
 * Discovery and "Test connection" for Settings > Map servers. Browser-direct,
 * like every map request: the server is reached from the operator's network,
 * never proxied.
 */

/**
 * Run an adapter's `discover` with the server's auth applied to every
 * request. An abort is re-thrown; an adapter that throws for something it
 * should have reported is mapped to `unreachable`.
 *
 * @param provider - The adapter.
 * @param settings - Settings with their secrets (owner read or the form).
 * @param signal - Aborted when the operator cancels or closes the dialog.
 * @param fetchImpl - Injected for tests.
 * @returns The discovery outcome.
 */
export async function discoverMapServer(
	provider: MapLayerProviderDefinition,
	settings: MapServerSettings,
	signal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryResult> {
	const resolved = resolveMapServerAuth(settings.auth, provider.auth);
	try {
		return await provider.discover(settings, {
			signal,
			fetch: createAuthedFetch(resolved, settings.url, signal, fetchImpl),
		});
	} catch (err) {
		if (isAbortError(err)) throw err;
		return {
			status: "error",
			reason: "unreachable",
			detail: err instanceof Error ? err.message : undefined,
		};
	}
}

/**
 * Request one tile of `layer` with the server's auth applied (query params
 * and headers) when the tile lies under the server's URL prefix, and report
 * how it went. A tile on another host gets no auth: `createAuthedFetch`
 * scopes it through `authForUrl`, as the map's `transformRequest` does. A rejected request is told apart
 * from a CORS refusal with an opaque probe that carries no auth.
 *
 * @param provider - The adapter.
 * @param settings - Settings with their secrets.
 * @param layer - A Web Mercator layer of the discovered catalogue.
 * @param signal - Abort signal.
 * @param fetchImpl - Injected for tests.
 * @returns The tile check.
 */
export async function checkTile(
	provider: MapLayerProviderDefinition,
	settings: MapServerSettings,
	layer: MapLayerEntry,
	signal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<TileCheck> {
	let template: string | undefined;
	try {
		const source = provider.toSource(layer, settings);
		template = source.tiles?.[0] ?? source.url;
	} catch {
		template = undefined;
	}
	if (!template) return { status: "skipped" };
	const url = tileProbeUrl(template, layer);
	const resolved = resolveMapServerAuth(settings.auth, provider.auth);
	const authed = createAuthedFetch(resolved, settings.url, signal, fetchImpl);
	let res: Response;
	try {
		res = await authed(url);
	} catch (err) {
		if (isAbortError(err)) throw err;
		// `url` is the adapter's own template, before core adds any auth
		// parameter, and the probe sends no headers: it can never carry a
		// credential.
		const reason = await classifyFetchFailure(url, fetchImpl);
		signal.throwIfAborted();
		return { status: "error", reason };
	}
	if (res.status === 401 || res.status === 403) {
		return {
			status: "error",
			reason: "unauthorized",
			httpStatus: res.status,
		};
	}
	if (!res.ok) {
		return { status: "error", reason: "http", httpStatus: res.status };
	}
	return { status: "ok" };
}

/** What "Test connection" produces: the result and, on success, the layers. */
export interface ConnectionTestOutcome {
	result: ConnectionTestResult;
	/** The discovered catalogue, present when discovery succeeded. */
	layers?: MapLayerEntry[];
}

/**
 * "Test connection": discovery, then one tile request of the first Web
 * Mercator layer.
 *
 * @param provider - The adapter.
 * @param settings - Settings with their secrets.
 * @param signal - Abort signal.
 * @param fetchImpl - Injected for tests.
 * @returns The outcome.
 */
export async function testMapServerConnection(
	provider: MapLayerProviderDefinition,
	settings: MapServerSettings,
	signal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<ConnectionTestOutcome> {
	const discovery = await discoverMapServer(
		provider,
		settings,
		signal,
		fetchImpl,
	);
	if (discovery.status === "error") {
		return {
			result: {
				status: "error",
				reason: discovery.reason,
				detail: discovery.detail,
			},
		};
	}
	const layers = discovery.layers;
	const first = layers.find((layer) => layer.webMercator);
	const tile: TileCheck = first
		? await checkTile(provider, settings, first, signal, fetchImpl)
		: { status: "skipped" };
	return {
		layers,
		result: {
			status: "ok",
			layerCount: layers.length,
			notWebMercator: layers.filter((layer) => !layer.webMercator).length,
			tile,
		},
	};
}
