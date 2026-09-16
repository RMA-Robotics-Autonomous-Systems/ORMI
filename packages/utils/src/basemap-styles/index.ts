/**
 * Registry of ORMI's bundled MapLibre **vector** basemap styles.
 *
 * Deliberately NOT re-exported from `@workspace/utils`' barrel. The styles are
 * ~100 KB of JSON between them, and the barrel is imported by worker
 * entrypoints; pulling them in there would ship the whole catalogue into every
 * worker chunk. Consumers import the dedicated subpath instead:
 *
 * ```ts
 * import { createVectorBasemapStyle } from "@workspace/utils/basemap-style";
 * ```
 *
 * The style *catalogue* (which sentinel maps to which style id) lives in
 * `basemap-providers.ts` and stays barrel-safe — only the style payloads are
 * behind this subpath.
 */
import type { StyleSpecification } from "maplibre-gl";
import type { VectorBasemapStyleId } from "../basemap-providers";
import { createOpenFreeMapLibertyStyle } from "./openfreemap-liberty";
import { createOpenFreeMapPositronStyle } from "./openfreemap-positron";
import { createOpenFreeMapDarkStyle } from "./openfreemap-dark";

export { createOpenFreeMapLibertyStyle } from "./openfreemap-liberty";
export { createOpenFreeMapPositronStyle } from "./openfreemap-positron";
export { createOpenFreeMapDarkStyle } from "./openfreemap-dark";

/**
 * One factory per bundled style id.
 *
 * Every entry returns a FRESH deep copy on each call — MapLibre consumes and
 * normalises the style object it is handed, so two map widgets on one dashboard
 * must never share one.
 */
const VECTOR_BASEMAP_STYLE_FACTORIES: Record<
	VectorBasemapStyleId,
	() => StyleSpecification
> = {
	"openfreemap-liberty": createOpenFreeMapLibertyStyle,
	"openfreemap-positron": createOpenFreeMapPositronStyle,
	"openfreemap-dark": createOpenFreeMapDarkStyle,
};

/**
 * Build a fresh copy of a bundled vector basemap style.
 *
 * @param styleId - A style id from the basemap catalogue, normally obtained
 *   from `vectorBasemapStyleId(mapUrl)`.
 * @returns A deep copy of the style, safe to hand to exactly one MapLibre map.
 */
export function createVectorBasemapStyle(
	styleId: VectorBasemapStyleId,
): StyleSpecification {
	return VECTOR_BASEMAP_STYLE_FACTORIES[styleId]();
}
