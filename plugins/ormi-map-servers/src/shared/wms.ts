/**
 * WMS GetCapabilities parsing and GetMap tile templates.
 *
 * Shared by the `geoserver` adapter (its WMS-only fallback) and the generic
 * `ogc-wms` adapter. Pure: the caller fetches, this module reads XML.
 *
 * The layer tree is walked with WMS inheritance applied: a child layer
 * inherits its ancestors' CRS list and, when it declares none, their
 * geographic bounding box. Only layers carrying a `<Name>` are requestable,
 * so only those are returned.
 */

import {
	NotCapabilitiesError,
	child,
	children,
	childText,
	childTexts,
	parseXmlRoot,
	path,
	toNumber,
	type XmlElement,
	type XmlParser,
} from "./xml";

/** A named, requestable layer from a WMS capabilities document. */
export interface WmsLayerInfo {
	/** `<Name>`, the value GetMap takes in `LAYERS`. */
	name: string;
	/** `<Title>`, falling back to the name. */
	title: string;
	/** WGS84 `[west, south, east, north]`, from `EX_GeographicBoundingBox` (1.3.0) or `LatLonBoundingBox` (1.1.1). */
	bounds?: [number, number, number, number];
	/** Whether the layer (or an ancestor) offers EPSG:3857 or EPSG:900913. */
	webMercator: boolean;
	/** The Web Mercator code the server listed, preferring EPSG:3857. */
	mercatorCrs?: "EPSG:3857" | "EPSG:900913";
}

/** Parsed WMS capabilities. */
export interface WmsCapabilities {
	/** `version` attribute of the root element. */
	version: string;
	/** Formats GetMap advertises. */
	formats: string[];
	/** Named layers, in document order. */
	layers: WmsLayerInfo[];
}

const MERCATOR_CODES = ["EPSG:3857", "EPSG:900913"] as const;

function readBounds(
	layer: XmlElement,
): [number, number, number, number] | undefined {
	const ex = child(layer, "EX_GeographicBoundingBox");
	if (ex) {
		const w = toNumber(childText(ex, "westBoundLongitude"));
		const e = toNumber(childText(ex, "eastBoundLongitude"));
		const s = toNumber(childText(ex, "southBoundLatitude"));
		const n = toNumber(childText(ex, "northBoundLatitude"));
		if (
			w !== undefined &&
			s !== undefined &&
			e !== undefined &&
			n !== undefined
		)
			return [w, s, e, n];
	}
	const ll = child(layer, "LatLonBoundingBox");
	if (ll) {
		const w = toNumber(ll.getAttribute("minx"));
		const s = toNumber(ll.getAttribute("miny"));
		const e = toNumber(ll.getAttribute("maxx"));
		const n = toNumber(ll.getAttribute("maxy"));
		if (
			w !== undefined &&
			s !== undefined &&
			e !== undefined &&
			n !== undefined
		)
			return [w, s, e, n];
	}
	return undefined;
}

function walk(
	layer: XmlElement,
	inheritedCrs: ReadonlySet<string>,
	inheritedBounds: [number, number, number, number] | undefined,
	out: WmsLayerInfo[],
): void {
	const crs = new Set(inheritedCrs);
	for (const code of [
		...childTexts(layer, "CRS"),
		...childTexts(layer, "SRS"),
	]) {
		// 1.1.1 servers may pack several codes into one <SRS>, space-separated.
		for (const part of code.split(/\s+/)) crs.add(part.toUpperCase());
	}
	const bounds = readBounds(layer) ?? inheritedBounds;
	const name = childText(layer, "Name");
	if (name) {
		const mercatorCrs = MERCATOR_CODES.find((c) => crs.has(c));
		out.push({
			name,
			title: childText(layer, "Title") ?? name,
			bounds,
			webMercator: mercatorCrs !== undefined,
			mercatorCrs,
		});
	}
	for (const sub of children(layer, "Layer")) walk(sub, crs, bounds, out);
}

/**
 * Parses a WMS 1.3.0 (or 1.1.1) GetCapabilities document.
 *
 * @throws {XmlParseError} when the text is not XML.
 * @throws {NotCapabilitiesError} when it is XML but not WMS capabilities.
 */
export function parseWmsCapabilities(
	text: string,
	parse?: XmlParser,
): WmsCapabilities {
	const root = parseXmlRoot(text, parse);
	if (
		root.localName !== "WMS_Capabilities" &&
		root.localName !== "WMT_MS_Capabilities"
	) {
		throw new NotCapabilitiesError(root.localName ?? "");
	}
	const capability = child(root, "Capability");
	if (!capability) throw new NotCapabilitiesError(root.localName);
	const layers: WmsLayerInfo[] = [];
	for (const top of children(capability, "Layer"))
		walk(top, new Set(), undefined, layers);
	const getMap = path(capability, "Request", "GetMap");
	return {
		version: root.getAttribute("version") ?? "1.3.0",
		formats: getMap ? childTexts(getMap, "Format") : [],
		layers,
	};
}

/** Options for {@link wmsGetMapTemplate}. */
export interface WmsGetMapOptions {
	/** Layer name for `LAYERS`. */
	layer: string;
	/** Image format, e.g. `image/png`. */
	format: string;
	/** WMS version; 1.3.0 uses `CRS`, 1.1.1 uses `SRS`. */
	version: string;
	/** Web Mercator code to request in. */
	crs: string;
	/** Tile size in pixels. */
	tileSize: number;
}

/**
 * GetMap URL template for MapLibre: `{bbox-epsg-3857}` is the placeholder
 * MapLibre fills with each tile's Web Mercator extent. EPSG:3857 is a
 * projected CRS, so WMS 1.3.0 axis order is easting, northing, the same as
 * the placeholder's.
 *
 * Query parameters already on `endpoint` (a MapServer `map=` path, for
 * example) are kept.
 */
export function wmsGetMapTemplate(
	endpoint: string,
	opts: WmsGetMapOptions,
): string {
	const crsKey = opts.version.startsWith("1.1") ? "SRS" : "CRS";
	const params = [
		["SERVICE", "WMS"],
		["VERSION", opts.version],
		["REQUEST", "GetMap"],
		["LAYERS", opts.layer],
		["STYLES", ""],
		["FORMAT", opts.format],
		["TRANSPARENT", "true"],
		[crsKey, opts.crs],
		["WIDTH", String(opts.tileSize)],
		["HEIGHT", String(opts.tileSize)],
	]
		.map(([k, v]) => `${k}=${encodeURIComponent(v ?? "")}`)
		.join("&");
	return `${withQuerySeparator(endpoint)}${params}&BBOX={bbox-epsg-3857}`;
}

/** `endpoint` followed by `?` or `&`, whichever starts the next parameter. */
export function withQuerySeparator(endpoint: string): string {
	if (!endpoint.includes("?")) return `${endpoint}?`;
	return endpoint.endsWith("?") || endpoint.endsWith("&")
		? endpoint
		: `${endpoint}&`;
}

/** Picks `preferred` when the server lists it, else PNG, else the first format listed. */
export function pickFormat(
	available: readonly string[],
	preferred: string,
): string {
	if (available.length === 0 || available.includes(preferred))
		return preferred;
	if (available.includes("image/png")) return "image/png";
	return available.find((f) => f.startsWith("image/")) ?? preferred;
}
