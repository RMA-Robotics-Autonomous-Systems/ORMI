/**
 * Pure planning for the raster overlay a map draws: which resolved layers are
 * drawn, in which order, each inserted before which layer, and how tile
 * errors turn into a per-layer health. No React, no react-map-gl runtime.
 */

import type { RasterSourceSpec } from "./provider-definition";
import type { ResolvedLayer } from "./resolve-layer-refs";
import { mapLayerHealthKey } from "./map-servers-store";

/** One raster layer a map draws. */
export interface RasterOverlayLayer {
	/** MapLibre layer id, also the source id (separate namespaces). */
	id: string;
	/** Final raster source: auth query params, `bounds`, clamped `maxzoom`. */
	source: RasterSourceSpec;
	/** 0..1. */
	opacity: number;
	/** Layer title from the catalogue. */
	title: string;
	/** Title of the server the layer comes from. */
	serverTitle: string;
	/** The layer's server identity. */
	serverKey: string;
	/** The adapter-scoped layer id. */
	layerId: string;
	/** WGS84 extent `[west, south, east, north]`, when the catalogue has one. */
	bounds?: [number, number, number, number];
}

/**
 * The layers a map draws: enabled `ok` refs only, in registry order. Disabled
 * and stale refs draw nothing (the dialog names them).
 *
 * @param resolved - Output of `resolveLayerRefs`.
 * @returns The drawable layers, bottom first.
 */
export function toRasterOverlayLayers(
	resolved: readonly ResolvedLayer[],
): RasterOverlayLayer[] {
	const layers: RasterOverlayLayer[] = [];
	const seen = new Set<string>();
	for (const item of resolved) {
		if (item.kind !== "ok" || !item.ref.enabled) continue;
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		const bounds = item.source.bounds ?? item.entry.bounds;
		layers.push({
			id: item.id,
			source: item.source,
			opacity: Math.min(1, Math.max(0, item.ref.opacity)),
			title: item.entry.title || item.entry.id,
			serverTitle: item.server.title,
			serverKey: item.ref.serverKey,
			layerId: item.ref.layerId,
			...(bounds
				? {
						bounds: [
							bounds[0],
							bounds[1],
							bounds[2],
							bounds[3],
						] as [number, number, number, number],
					}
				: {}),
		});
	}
	return layers;
}

/** One layer as mounted. */
export interface PlannedRasterLayer {
	/** The layer. */
	layer: RasterOverlayLayer;
	/** The layer it is inserted before: the next layer up, or the caller's anchor. */
	beforeId: string | undefined;
	/** React key: changes whenever the source spec does, so a source MapLibre cannot update in place is rebuilt. */
	key: string;
}

/**
 * Plan the mount: each layer's `beforeId` is the id of the layer drawn above
 * it, the topmost one's is the caller's `beforeId`. Returned **topmost
 * first**, the order the children must mount in: react-map-gl adds a layer
 * while rendering it, and MapLibre refuses a `beforeId` naming a layer that
 * does not exist yet.
 *
 * @param layers - Drawable layers, bottom first.
 * @param beforeId - The caller's anchor, from `resolveAnchor(…) ?? fallback`, or `undefined` to append.
 * @returns The planned layers, topmost first.
 */
export function planRasterOverlay(
	layers: readonly RasterOverlayLayer[],
	beforeId: string | undefined,
): PlannedRasterLayer[] {
	const planned: PlannedRasterLayer[] = [];
	for (let i = layers.length - 1; i >= 0; i--) {
		const layer = layers[i]!;
		const above = layers[i + 1];
		planned.push({
			layer,
			beforeId: above ? above.id : beforeId,
			key: `${layer.id}:${JSON.stringify(layer.source)}`,
		});
	}
	return planned;
}

/**
 * Remove query strings from every URL in a message. MapLibre's tile-error
 * messages carry the tile URL, and a query token rides in it.
 *
 * @param text - Any message.
 * @returns The message with `?…` removed from each URL.
 */
export function stripQueryStrings(text: string): string {
	return text.replace(
		/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)\?[^\s#"'<>]*/gi,
		"$1",
	);
}

/** Consecutive tile errors after which a layer reads as not responding. */
export const TILE_ERROR_THRESHOLD = 3;

/** What a tile event changed for a layer. */
export type TileHealthChange =
	| { kind: "unchanged" }
	| { kind: "not-responding"; healthKey: string; layer: RasterOverlayLayer }
	| { kind: "recovered"; healthKey: string; layer: RasterOverlayLayer };

/**
 * Track consecutive tile errors per source. A layer is not responding after
 * {@link TILE_ERROR_THRESHOLD} errors with no tile loaded in between, and
 * recovers on the next tile that loads.
 *
 * @param getLayers - Reads the layers the map currently draws.
 * @returns Handlers for the map's `error` and tile `data` events.
 */
export function createTileHealthTracker(
	getLayers: () => readonly RasterOverlayLayer[],
) {
	const errors = new Map<string, number>();
	const find = (sourceId: string | undefined) =>
		sourceId
			? getLayers().find((layer) => layer.id === sourceId)
			: undefined;

	return {
		/**
		 * A tile of `sourceId` failed.
		 * @param sourceId - The event's source id.
		 * @returns The change, if the threshold was crossed.
		 */
		onError(sourceId: string | undefined): TileHealthChange {
			const layer = find(sourceId);
			if (!layer) return { kind: "unchanged" };
			const count = (errors.get(layer.id) ?? 0) + 1;
			errors.set(layer.id, count);
			if (count !== TILE_ERROR_THRESHOLD) return { kind: "unchanged" };
			return {
				kind: "not-responding",
				healthKey: mapLayerHealthKey(layer.serverKey, layer.layerId),
				layer,
			};
		},
		/**
		 * A tile of `sourceId` loaded.
		 * @param sourceId - The event's source id.
		 * @returns The change, if the layer had been reported.
		 */
		onTileLoaded(sourceId: string | undefined): TileHealthChange {
			const layer = find(sourceId);
			if (!layer) return { kind: "unchanged" };
			const count = errors.get(layer.id) ?? 0;
			errors.delete(layer.id);
			if (count < TILE_ERROR_THRESHOLD) return { kind: "unchanged" };
			return {
				kind: "recovered",
				healthKey: mapLayerHealthKey(layer.serverKey, layer.layerId),
				layer,
			};
		},
	};
}
