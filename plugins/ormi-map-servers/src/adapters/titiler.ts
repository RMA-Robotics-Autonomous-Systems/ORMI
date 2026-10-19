/**
 * TiTiler adapter: Cloud Optimized GeoTIFFs served as Web Mercator tiles.
 *
 * TiTiler has no catalogue, so the operator lists the COGs. Discovery reads
 * each COG's TileJSON (`/cog/WebMercatorQuad/tilejson.json?url=…`) for its
 * bounds and zoom range. The tile template is built here rather than taken
 * from the TileJSON: TiTiler echoes the request's query string into the
 * `tiles` it returns, which would carry an `access_token` into the stored
 * catalogue.
 *
 * A COG URL is refused when its query names a credential (a presigned
 * `X-Amz-*` URL, a `token`): it is stored in the catalogue `params`. A
 * layer's id is a slug and a hash of the COG URL without its query, never the
 * URL itself, because the id is persisted in every map widget.
 */

import type {
	DiscoveryContext,
	DiscoveryResult,
	MapLayerEntry,
	MapLayerProviderDefinition,
	MapServerAuth,
	MapServerAuthCapability,
	MapServerSettings,
	RasterSourceSpec,
} from "@workspace/ormi-core/map-layers/model";

import {
	checkInsecure,
	fetchText,
	notAServer,
	trimBase,
	type DiscoveryFailure,
} from "../shared/discovery-fetch";
import { authSchema } from "../shared/schema";
import {
	credentialFreeLayerId,
	refuseCredentialQuery,
} from "../shared/url-safety";

/** One COG the operator registered. */
export interface TitilerCog {
	/** Display title. */
	title: string;
	/** URL of the COG, as TiTiler will fetch it. */
	url: string;
	/** TiTiler `rescale`, e.g. `0,255`. */
	rescale?: string;
	/** TiTiler `colormap_name`, e.g. `viridis`. */
	colormap?: string;
}

/** Settings of a TiTiler registration. */
export interface TitilerSettings extends MapServerSettings {
	/** TiTiler base URL. */
	url: string;
	/** COGs to list. */
	cogs: TitilerCog[];
	/** Stored authentication. */
	auth?: MapServerAuth;
}

/** TiTiler deployments are commonly fronted by a bearer token or `access_token`. */
export const TITILER_AUTH: MapServerAuthCapability = {
	kinds: ["none", "bearer", "query-token"],
	queryParam: "access_token",
};

/** Adapter id, part of every TiTiler `serverKey`. */
export const TITILER_ADAPTER_ID = "titiler";

const TILE_MATRIX_SET = "WebMercatorQuad";

/** Query string selecting one COG and its rendering options. */
function cogQuery(params: {
	cog: string;
	rescale?: string;
	colormap?: string;
}): string {
	const parts = [`url=${encodeURIComponent(params.cog)}`];
	if (params.rescale)
		parts.push(`rescale=${encodeURIComponent(params.rescale)}`);
	if (params.colormap)
		parts.push(`colormap_name=${encodeURIComponent(params.colormap)}`);
	return parts.join("&");
}

/** TileJSON URL of one COG. */
export function titilerTileJsonUrl(base: string, cog: TitilerCog): string {
	return `${trimBase(base)}/cog/${TILE_MATRIX_SET}/tilejson.json?${cogQuery({
		cog: cog.url.trim(),
		rescale: cog.rescale?.trim(),
		colormap: cog.colormap?.trim(),
	})}`;
}

/** Zoom levels the stored catalogue accepts (0..32), rounded to a whole level. */
function clampZoom(z: number): number {
	return Math.min(32, Math.max(0, Math.round(z)));
}

interface TileJsonFields {
	bounds?: [number, number, number, number];
	minzoom?: number;
	maxzoom?: number;
}

/** Reads the fields discovery needs from a TileJSON body, or `null` when it is not TileJSON. */
export function readTileJson(text: string): TileJsonFields | null {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return null;
	}
	if (
		!json ||
		typeof json !== "object" ||
		!Array.isArray((json as { tiles?: unknown }).tiles)
	)
		return null;
	const { bounds, minzoom, maxzoom } = json as Record<string, unknown>;
	const out: TileJsonFields = {};
	if (
		Array.isArray(bounds) &&
		bounds.length === 4 &&
		bounds.every((v) => typeof v === "number" && Number.isFinite(v))
	) {
		out.bounds = bounds as [number, number, number, number];
	}
	if (typeof minzoom === "number" && Number.isFinite(minzoom))
		out.minzoom = clampZoom(minzoom);
	if (typeof maxzoom === "number" && Number.isFinite(maxzoom))
		out.maxzoom = clampZoom(maxzoom);
	return out;
}

/**
 * Lists the registered COGs. A failure about the server (unauthorized, CORS,
 * unreachable) fails the discovery. A COG the server cannot read is still
 * listed, without bounds, unless every COG fails, which means the URL is not
 * a TiTiler.
 */
export async function discoverTitiler(
	settings: TitilerSettings,
	ctx: DiscoveryContext,
): Promise<DiscoveryResult> {
	const insecure = checkInsecure(settings.url);
	if (insecure) return insecure;
	const urlCredential = refuseCredentialQuery(settings.url, "URL");
	if (urlCredential) return urlCredential;
	const cogs = settings.cogs.filter((c) => c.url.trim().length > 0);
	for (const cog of cogs) {
		const cogCredential = refuseCredentialQuery(
			cog.url,
			`COG URL of ${cog.title.trim() || "a COG"}`,
		);
		if (cogCredential) return cogCredential;
	}
	const layers: MapLayerEntry[] = [];
	const seen = new Set<string>();
	let lastFailure: DiscoveryFailure | undefined;
	let failed = 0;
	for (const cog of cogs) {
		const res = await fetchText(ctx, titilerTileJsonUrl(settings.url, cog));
		let fields: TileJsonFields | null = null;
		if (res.ok) {
			fields = readTileJson(res.text);
			if (!fields) lastFailure = notAServer("No TileJSON at this URL");
		} else {
			if (
				res.failure.reason === "unauthorized" ||
				res.status === undefined
			)
				return res.failure;
			lastFailure = res.failure;
		}
		if (!fields) failed++;
		const cogUrl = cog.url.trim();
		const id = credentialFreeLayerId(cog.title, cogUrl, seen);
		const params: Record<string, string> = { cog: cogUrl };
		if (cog.rescale?.trim()) params.rescale = cog.rescale.trim();
		if (cog.colormap?.trim()) params.colormap = cog.colormap.trim();
		layers.push({
			id,
			title: cog.title.trim() || cogUrl,
			bounds: fields?.bounds,
			minzoom: fields?.minzoom,
			maxzoom: fields?.maxzoom,
			tileSize: 256,
			webMercator: true,
			params,
		});
	}
	if (cogs.length > 0 && failed === cogs.length && lastFailure)
		return lastFailure;
	return { status: "ok", layers };
}

/** Raster source of one COG. Pure, no credentials. */
export function titilerSource(
	layer: MapLayerEntry,
	settings: TitilerSettings,
): RasterSourceSpec {
	const query = cogQuery({
		cog: layer.params.cog ?? "",
		rescale: layer.params.rescale,
		colormap: layer.params.colormap,
	});
	return {
		type: "raster",
		tileSize: layer.tileSize,
		tiles: [
			`${trimBase(settings.url)}/cog/tiles/${TILE_MATRIX_SET}/{z}/{x}/{y}?${query}`,
		],
	};
}

/** The TiTiler adapter definition. */
export const titilerProvider: MapLayerProviderDefinition<TitilerSettings> = {
	id: TITILER_ADAPTER_ID,
	name: "TiTiler",
	schema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				title: "URL",
				description: "TiTiler base URL",
				default: "http://localhost:8000",
			},
			cogs: {
				type: "array",
				title: "COGs",
				default: [],
				items: {
					type: "object",
					properties: {
						title: { type: "string", title: "Title" },
						url: { type: "string", title: "COG URL" },
						rescale: {
							type: "string",
							title: "Rescale",
							description: "Min and max, for example 0,255",
						},
						colormap: {
							type: "string",
							title: "Colormap",
							description: "For example viridis",
						},
					},
					required: ["title", "url"],
				},
			},
			auth: authSchema(TITILER_AUTH),
		},
		required: ["url"],
	},
	data: { url: "http://localhost:8000", cogs: [], auth: { kind: "none" } },
	summaryProps: ["url"],
	auth: TITILER_AUTH,
	discover: discoverTitiler,
	toSource: titilerSource,
};
