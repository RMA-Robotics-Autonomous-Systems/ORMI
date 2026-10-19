/**
 * XYZ tile adapter: plain `{z}/{x}/{y}` templates, no capabilities document.
 *
 * Discovery echoes the configured layers back as the catalogue, after
 * checking each template can be drawn and carries no credential in its
 * query. A layer's id is its title's slug and a hash of its template without
 * the query (`credentialFreeLayerId`), never the template itself, because
 * the id is persisted in every map widget that shows the layer. The server `url` is the registration's
 * identity (it feeds `serverKey`) and the prefix auth headers are scoped to:
 * a header is only sent to templates under it. A template that is not
 * absolute is resolved against it.
 *
 * MapLibre does not expand Leaflet's `{s}`. A `{a-c}` range in a template is
 * expanded here into one template per letter, which MapLibre round-robins.
 */

import type {
	DiscoveryResult,
	MapLayerEntry,
	MapLayerProviderDefinition,
	MapServerAuth,
	MapServerAuthCapability,
	MapServerPreset,
	MapServerSettings,
	RasterSourceSpec,
} from "@workspace/ormi-core/map-layers/model";

import { checkInsecure, notAServer, trimBase } from "../shared/discovery-fetch";
import { authSchema } from "../shared/schema";
import {
	credentialFreeLayerId,
	refuseCredentialQuery,
} from "../shared/url-safety";

/** One XYZ layer the operator registered. */
export interface XyzLayer {
	/** Display title. */
	title: string;
	/** Tile URL template with `{z}`, `{x}` and `{y}`; `{a-c}` expands to subdomains. */
	template: string;
	/** Shallowest zoom the source publishes. */
	minzoom?: number;
	/** Deepest zoom the source publishes. */
	maxzoom?: number;
	/** WGS84 `[west, south, east, north]`. */
	bounds?: [number, number, number, number];
	/** Attribution shown on the map. */
	attribution?: string;
}

/** Settings of an XYZ registration. */
export interface XyzSettings extends MapServerSettings {
	/** Base URL: the registration's identity and the scope of auth headers. */
	url: string;
	/** Layers to list. */
	layers: XyzLayer[];
	/** Stored authentication. */
	auth?: MapServerAuth;
}

/**
 * XYZ servers take a URL token (its parameter name stored with the auth,
 * since it differs per vendor) or a custom header.
 */
export const XYZ_AUTH: MapServerAuthCapability = {
	kinds: ["none", "query-token", "header"],
};

/** Adapter id, part of every XYZ `serverKey`. */
export const XYZ_ADAPTER_ID = "xyz";

/** Expands a `{a-c}` style range into one template per character. */
export function expandSubdomains(template: string): string[] {
	const match = /\{([a-z0-9])-([a-z0-9])\}/i.exec(template);
	if (!match || match[1] === undefined || match[2] === undefined)
		return [template];
	const from = match[1].charCodeAt(0);
	const to = match[2].charCodeAt(0);
	if (to < from) return [template];
	const out: string[] = [];
	for (let c = from; c <= to; c++)
		out.push(template.replace(match[0], String.fromCharCode(c)));
	return out;
}

/** `template` made absolute against `base` when it is not already. */
export function resolveTemplate(base: string, template: string): string {
	const t = template.trim();
	if (/^https?:\/\//i.test(t)) return t;
	return `${trimBase(base)}/${t.replace(/^\/+/, "")}`;
}

/** True when the template carries every placeholder MapLibre needs. */
export function isDrawableTemplate(template: string): boolean {
	return ["{z}", "{x}", "{y}"].every((p) => template.includes(p));
}

/**
 * The attribution as plain text: tags dropped, a stray `<` removed. The
 * catalogue refuses markup (MapLibre renders an attribution as HTML).
 */
export function plainAttribution(text: string | undefined): string {
	return (text ?? "")
		.replace(/<[^<>]*>/g, "")
		.replace(/</g, "")
		.trim();
}

/** Echoes the configured layers as the catalogue. */
export async function discoverXyz(
	settings: XyzSettings,
): Promise<DiscoveryResult> {
	const urlCredential = refuseCredentialQuery(settings.url, "URL");
	if (urlCredential) return urlCredential;
	const layers: MapLayerEntry[] = [];
	const seen = new Set<string>();
	for (const layer of settings.layers) {
		const template = resolveTemplate(settings.url, layer.template);
		const templateCredential = refuseCredentialQuery(
			layer.template,
			`Template of ${layer.title.trim() || "a layer"}`,
		);
		if (templateCredential) return templateCredential;
		if (!isDrawableTemplate(template)) {
			return notAServer(
				`Template needs {z}, {x} and {y}: ${layer.title || template}`,
			);
		}
		const insecure = checkInsecure(template.replace(/\{[^}]*\}/g, "0"));
		if (insecure) return insecure;
		const id = credentialFreeLayerId(layer.title, layer.template, seen);
		const params: Record<string, string> = {
			template: layer.template.trim(),
		};
		const attribution = plainAttribution(layer.attribution);
		if (attribution) params.attribution = attribution;
		layers.push({
			id,
			title: layer.title.trim() || template,
			bounds: layer.bounds,
			minzoom: layer.minzoom,
			maxzoom: layer.maxzoom,
			tileSize: 256,
			webMercator: true,
			params,
		});
	}
	return { status: "ok", layers };
}

/** Raster source of one XYZ layer. Pure, no credentials. */
export function xyzSource(
	layer: MapLayerEntry,
	settings: XyzSettings,
): RasterSourceSpec {
	const source: RasterSourceSpec = {
		type: "raster",
		tileSize: layer.tileSize,
		tiles: expandSubdomains(
			resolveTemplate(settings.url, layer.params.template ?? ""),
		),
	};
	if (layer.params.attribution) source.attribution = layer.params.attribution;
	return source;
}

/**
 * C2's four public overlays, as a ready-made XYZ server. Free, keyless.
 *
 * Its `url` is identity only (discovery fetches nothing and no auth is
 * stored): the four layers live on four unrelated hosts, so there is no real
 * base to name. The `.invalid` TLD is reserved never to resolve, so nothing
 * can ever be sent to it.
 */
export const PUBLIC_OVERLAYS_PRESET: MapServerPreset = {
	id: "public-overlays",
	title: "Public overlays",
	settings: {
		url: "https://public-overlays.invalid",
		auth: { kind: "none" },
		layers: [
			{
				title: "OpenSeaMap (seamarks)",
				template:
					"https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
				maxzoom: 18,
				attribution: "© OpenSeaMap contributors",
			},
			{
				title: "OpenRailwayMap",
				template:
					"https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
				maxzoom: 19,
				attribution: "© OpenRailwayMap, © OpenStreetMap contributors",
			},
			{
				title: "Waymarked Trails (hiking)",
				template:
					"https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",
				maxzoom: 18,
				attribution:
					"© waymarkedtrails.org, © OpenStreetMap contributors",
			},
			{
				title: "CyclOSM",
				template:
					"https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
				maxzoom: 20,
				attribution: "© CyclOSM, © OpenStreetMap contributors",
			},
		],
	} as XyzSettings,
};

/** The XYZ adapter definition. */
export const xyzProvider: MapLayerProviderDefinition<XyzSettings> = {
	id: XYZ_ADAPTER_ID,
	name: "XYZ tiles",
	schema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				title: "URL",
				description:
					"Base URL of the tile server. Auth headers are only sent under it.",
				default: "",
			},
			layers: {
				type: "array",
				title: "Layers",
				default: [],
				items: {
					type: "object",
					properties: {
						title: { type: "string", title: "Title" },
						template: {
							type: "string",
							title: "Tile URL template",
							description:
								"With {z}, {x} and {y}. {a-c} expands to subdomains.",
						},
						minzoom: {
							type: "integer",
							title: "Min zoom",
							minimum: 0,
							maximum: 30,
						},
						maxzoom: {
							type: "integer",
							title: "Max zoom",
							minimum: 0,
							maximum: 30,
						},
						bounds: {
							type: "array",
							title: "Bounds",
							description: "West, south, east, north in degrees",
							items: { type: "number" },
							minItems: 4,
							maxItems: 4,
						},
						attribution: { type: "string", title: "Attribution" },
					},
					required: ["title", "template"],
				},
			},
			auth: authSchema(XYZ_AUTH),
		},
		required: ["url"],
	},
	data: { url: "", layers: [], auth: { kind: "none" } },
	summaryProps: ["url"],
	auth: XYZ_AUTH,
	discover: discoverXyz,
	toSource: xyzSource,
	presets: [PUBLIC_OVERLAYS_PRESET],
};
