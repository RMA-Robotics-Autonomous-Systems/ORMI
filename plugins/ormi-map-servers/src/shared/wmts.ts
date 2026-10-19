/**
 * WMTS 1.0.0 GetCapabilities parsing, as GeoServer's GeoWebCache serves it.
 *
 * A layer is usable on a MapLibre map when it links a Web Mercator tile
 * matrix set whose matrices are the standard quadtree levels, named
 * `<set>:<z>` from level 0 (`EPSG:900913:0`, `EPSG:900913:1`, ...): that is
 * what lets the REST tile URL be a plain `{z}/{y}/{x}` template. A layer that
 * links only other sets is reported as not Web Mercator.
 */

import {
	NotCapabilitiesError,
	child,
	children,
	childText,
	childTexts,
	parseXmlRoot,
	toNumber,
	type XmlElement,
	type XmlParser,
} from "./xml";

/** A Web Mercator tile matrix set a layer can be drawn from. */
export interface WmtsMercatorLink {
	/** Tile matrix set identifier, e.g. `EPSG:900913`. */
	matrixSet: string;
	/** Shallowest level the layer publishes. */
	minzoom: number;
	/** Deepest level the layer publishes. */
	maxzoom: number;
	/** Tile size in pixels. */
	tileSize: 256 | 512;
}

/** One layer from a WMTS capabilities document. */
export interface WmtsLayerInfo {
	/** `ows:Identifier`, e.g. `spain:atlas_road_aidedex_v1`. */
	id: string;
	/** `ows:Title`, falling back to the identifier. */
	title: string;
	/** WGS84 `[west, south, east, north]` from `ows:WGS84BoundingBox`. */
	bounds?: [number, number, number, number];
	/** Tile formats the layer offers. */
	formats: string[];
	/** Default style identifier, when one is marked. */
	style?: string;
	/** The Web Mercator set to draw from, absent when the layer links none. */
	mercator?: WmtsMercatorLink;
}

interface MatrixSetInfo {
	id: string;
	mercator: boolean;
	/** Level of each matrix id, only when every id is `<set>:<z>`. */
	levels: Map<string, number> | null;
	tileSize: number | undefined;
}

const MERCATOR_SET_IDS = new Set([
	"EPSG:900913",
	"EPSG:3857",
	"GOOGLEMAPSCOMPATIBLE",
	"WEBMERCATORQUAD",
]);

function isMercatorSet(set: XmlElement, id: string): boolean {
	if (MERCATOR_SET_IDS.has(id.toUpperCase())) return true;
	const wellKnown = childText(set, "WellKnownScaleSet") ?? "";
	if (/GoogleMapsCompatible/i.test(wellKnown)) return true;
	const crs = childText(set, "SupportedCRS") ?? "";
	return /(?:EPSG:+(?:[\d.]*:)?)(3857|900913)$/i.test(crs);
}

function readMatrixSet(set: XmlElement): MatrixSetInfo | undefined {
	const id = childText(set, "Identifier");
	if (!id) return undefined;
	const matrices = children(set, "TileMatrix");
	const levels = new Map<string, number>();
	let tileSize: number | undefined;
	let quadtree = matrices.length > 0;
	for (const m of matrices) {
		const mid = childText(m, "Identifier") ?? "";
		const match = mid.startsWith(`${id}:`)
			? /^\d+$/.exec(mid.slice(id.length + 1))
			: null;
		if (!match) {
			quadtree = false;
			break;
		}
		levels.set(mid, Number(match[0]));
		tileSize ??= toNumber(childText(m, "TileWidth"));
	}
	return {
		id,
		mercator: isMercatorSet(set, id),
		levels: quadtree ? levels : null,
		tileSize,
	};
}

function readBounds(
	layer: XmlElement,
): [number, number, number, number] | undefined {
	const box = child(layer, "WGS84BoundingBox");
	if (!box) return undefined;
	const lower = (childText(box, "LowerCorner") ?? "")
		.split(/\s+/)
		.map(Number);
	const upper = (childText(box, "UpperCorner") ?? "")
		.split(/\s+/)
		.map(Number);
	const [w, s] = lower;
	const [e, n] = upper;
	if (
		[w, s, e, n].every((v) => typeof v === "number" && Number.isFinite(v))
	) {
		return [w as number, s as number, e as number, n as number];
	}
	return undefined;
}

function readMercatorLink(
	layer: XmlElement,
	sets: ReadonlyMap<string, MatrixSetInfo>,
): WmtsMercatorLink | undefined {
	const candidates: WmtsMercatorLink[] = [];
	for (const link of children(layer, "TileMatrixSetLink")) {
		const setId = childText(link, "TileMatrixSet");
		const set = setId ? sets.get(setId) : undefined;
		if (!set || !set.mercator || !set.levels || set.levels.size === 0)
			continue;
		const tileSize =
			set.tileSize === 512
				? 512
				: set.tileSize === 256 || set.tileSize === undefined
					? 256
					: null;
		if (tileSize === null) continue;
		const limits = child(link, "TileMatrixSetLimits");
		const limited = limits
			? children(limits, "TileMatrixLimits")
					.map((l) =>
						set.levels?.get(childText(l, "TileMatrix") ?? ""),
					)
					.filter((z): z is number => z !== undefined)
			: [];
		const zooms = limited.length > 0 ? limited : [...set.levels.values()];
		candidates.push({
			matrixSet: set.id,
			minzoom: Math.min(...zooms),
			maxzoom: Math.max(...zooms),
			tileSize,
		});
	}
	// GeoServer names its Web Mercator gridset EPSG:900913; prefer it, then any other.
	return (
		candidates.find((c) => c.matrixSet === "EPSG:900913") ?? candidates[0]
	);
}

/**
 * Parses a WMTS 1.0.0 GetCapabilities document into its layers.
 *
 * @throws {XmlParseError} when the text is not XML.
 * @throws {NotCapabilitiesError} when it is XML but not WMTS capabilities.
 */
export function parseWmtsCapabilities(
	text: string,
	parse?: XmlParser,
): WmtsLayerInfo[] {
	const root = parseXmlRoot(text, parse);
	if (root.localName !== "Capabilities")
		throw new NotCapabilitiesError(root.localName ?? "");
	const contents = child(root, "Contents");
	if (!contents) throw new NotCapabilitiesError(root.localName);
	const sets = new Map<string, MatrixSetInfo>();
	for (const set of children(contents, "TileMatrixSet")) {
		const info = readMatrixSet(set);
		if (info) sets.set(info.id, info);
	}
	const layers: WmtsLayerInfo[] = [];
	for (const layer of children(contents, "Layer")) {
		const id = childText(layer, "Identifier");
		if (!id) continue;
		const defaultStyle = children(layer, "Style").find(
			(s) => s.getAttribute("isDefault") === "true",
		);
		layers.push({
			id,
			title: childText(layer, "Title") ?? id,
			bounds: readBounds(layer),
			formats: childTexts(layer, "Format"),
			style: defaultStyle
				? childText(defaultStyle, "Identifier")
				: undefined,
			mercator: readMercatorLink(layer, sets),
		});
	}
	return layers;
}
