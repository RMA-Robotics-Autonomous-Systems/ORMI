/**
 * RainViewer live weather-radar overlay helpers for the C2 mission map (F6).
 *
 * RainViewer is the one weather-tile provider that needs **no API key and no
 * registration**. Unlike the static `MAP_OVERLAYS` entries it is a two-step,
 * time-stamped source: fetch the frame index, then build a tile template per
 * frame. Animating across the frames (past → nowcast) and re-fetching the index
 * every ~10 min is what makes the layer "live".
 *
 * Tile URL order (from the RainViewer API docs):
 *   {host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png
 * Radar tiles only go up to zoom 7 — the source must declare `maxzoom: 7` and
 * let MapLibre overzoom above it, or the layer blanks at the map's z14.
 */

/** Overlay id used in the config `overlays` list and the Layers toggle panel. */
export const RAINVIEWER_OVERLAY_ID = "rainviewer-radar";

/** Public, key-free frame index endpoint. */
export const RAINVIEWER_INDEX_URL =
	"https://api.rainviewer.com/public/weather-maps.json";

/** RainViewer radar tiles top out at zoom 7; MapLibre overzooms above this. */
export const RAINVIEWER_MAXZOOM = 7;

/** A single radar frame (a point in time + its tile path). */
export interface RainviewerFrame {
	/** Unix seconds for the frame. */
	time: number;
	/** Tile path prefix, e.g. `/v2/radar/1609401600`. */
	path: string;
}

/** Parsed frame index: tile host + ordered frames (past then nowcast). */
export interface RainviewerFrames {
	host: string;
	/** Past frames followed by nowcast frames, in chronological order. */
	frames: RainviewerFrame[];
	/** Count of leading `frames` that are observed past (the rest are nowcast). */
	pastCount: number;
}

/** Tile rendering options (sensible mission defaults applied by the builder). */
export interface RainviewerTileOptions {
	/** Tile size in px. */
	size?: 256 | 512;
	/** Color scheme id (0–8). 2 = Universal Blue. */
	color?: number;
	/** 1 = smooth the radar data. */
	smooth?: 0 | 1;
	/** 1 = render snow in a distinct color. */
	snow?: 0 | 1;
}

function isFrame(value: unknown): value is RainviewerFrame {
	return (
		value != null &&
		typeof value === "object" &&
		typeof (value as { time?: unknown }).time === "number" &&
		typeof (value as { path?: unknown }).path === "string"
	);
}

/**
 * Parse the `weather-maps.json` payload into a host + ordered frame list.
 * Returns `null` when the payload is unusable (no host or no frames) so callers
 * can degrade silently — the overlay simply doesn't paint.
 *
 * @param json - The decoded JSON body from {@link RAINVIEWER_INDEX_URL}.
 * @returns Parsed frames or `null`.
 */
export function parseWeatherMaps(json: unknown): RainviewerFrames | null {
	if (json == null || typeof json !== "object") return null;
	const host = (json as { host?: unknown }).host;
	if (typeof host !== "string" || host.length === 0) return null;

	const radar = (json as { radar?: unknown }).radar;
	const past = Array.isArray((radar as { past?: unknown })?.past)
		? ((radar as { past: unknown[] }).past.filter(
				isFrame,
			) as RainviewerFrame[])
		: [];
	const nowcast = Array.isArray((radar as { nowcast?: unknown })?.nowcast)
		? ((radar as { nowcast: unknown[] }).nowcast.filter(
				isFrame,
			) as RainviewerFrame[])
		: [];

	const frames = [...past, ...nowcast];
	if (frames.length === 0) return null;
	return { host, frames, pastCount: past.length };
}

/**
 * Build the XYZ tile template for one RainViewer frame.
 *
 * @param host - Tile host from the frame index.
 * @param path - Frame tile path prefix.
 * @param opts - Optional size/color/smooth/snow overrides.
 * @returns A `{z}/{x}/{y}` tile URL template.
 */
export function buildRainviewerTileUrl(
	host: string,
	path: string,
	opts: RainviewerTileOptions = {},
): string {
	const size = opts.size ?? 256;
	const color = opts.color ?? 2;
	const smooth = opts.smooth ?? 1;
	const snow = opts.snow ?? 1;
	return `${host}${path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`;
}
