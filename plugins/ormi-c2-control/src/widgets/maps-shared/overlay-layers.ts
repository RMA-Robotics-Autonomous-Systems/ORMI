/**
 * Open-source raster **overlay** layers for the C2 mission map (F6).
 *
 * These are transparent XYZ tile layers that stack ON TOP of the chosen raster
 * base map and UNDER the C2 feature / draw / live-overlay layers. Unlike the
 * base map (a single mutually-exclusive choice), overlays are independently
 * toggleable — several can be active at once.
 *
 * All entries are free and require no API key. The CyclOSM source rotates over
 * three subdomains: MapLibre GL (unlike Leaflet) does not expand a `{s}`
 * placeholder, so the subdomains are pre-expanded into the `tiles` array and
 * MapLibre round-robins across them.
 *
 * Relevance for mission planning:
 *  - openseamap     — maritime: buoys, beacons, harbours, navigation marks.
 *  - openrailwaymap — rail infrastructure, stations, level crossings.
 *  - waymarked-hiking — marked foot/route networks for ground movement.
 *  - cyclosm        — cycling + detailed road/path emphasis.
 */

/** A single toggleable raster overlay definition. */
export interface OverlayLayerDef {
	/** Stable id (used as MapLibre source/layer id suffix and config value). */
	id: string;
	/** Human-readable label for the toggle panel / config dropdown. */
	title: string;
	/** XYZ tile URL template(s); multiple entries are load-balanced by MapLibre. */
	tiles: string[];
}

/** CyclOSM rotates over a/b/c subdomains (pre-expanded — no `{s}` in MapLibre). */
const CYCLOSM_TILES = ["a", "b", "c"].map(
	(s) => `https://${s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`,
);

/** Catalog of available open-source overlays, in display order. */
export const MAP_OVERLAYS: readonly OverlayLayerDef[] = [
	{
		id: "openseamap",
		title: "OpenSeaMap (seamarks)",
		tiles: ["https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"],
	},
	{
		id: "openrailwaymap",
		title: "OpenRailwayMap",
		tiles: ["https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"],
	},
	{
		id: "waymarked-hiking",
		title: "Waymarked Trails (hiking)",
		tiles: ["https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"],
	},
	{
		id: "cyclosm",
		title: "CyclOSM",
		tiles: CYCLOSM_TILES,
	},
] as const;

/** Resolve an overlay definition by id. */
export function overlayById(id: string): OverlayLayerDef | undefined {
	return MAP_OVERLAYS.find((o) => o.id === id);
}

/** Filter a (possibly persisted) id list down to known overlays, in catalog order. */
export function resolveOverlays(ids: readonly string[]): OverlayLayerDef[] {
	const set = new Set(ids);
	return MAP_OVERLAYS.filter((o) => set.has(o.id));
}
