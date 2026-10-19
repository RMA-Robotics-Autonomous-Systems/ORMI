"use client";

import { useLayoutEffect, useState } from "react";
import { useAtomValue } from "jotai";

import { appStore } from "../store";
import {
	buildMapServerHeaderRules,
	createScopedTransformRequest,
	type MapTransformRequest,
} from "./compose-transform-request";
import { readMapLayerRefs } from "./map-layers-property";
import { mapServersAtom } from "./map-servers-store";
import { resolveLayerRefs, type ResolvedLayer } from "./resolve-layer-refs";
import {
	toRasterOverlayLayers,
	type RasterOverlayLayer,
} from "./raster-overlay-plan";
import { useMapLayerProviders } from "./use-map-layer-providers";

/** Options of {@link useMapRasterLayers}. */
export interface UseMapRasterLayersOptions {
	/** The map's zoom ceiling (`MAP_MAX_ZOOM`); every source `maxzoom` is clamped to it. */
	maxZoom: number;
}

/** What {@link useMapRasterLayers} returns. */
export interface MapRasterLayers {
	/** Drawable layers (enabled `ok` refs), bottom first: pass to `RasterOverlayLayers` and `MapLayersOverlay`. */
	layers: RasterOverlayLayer[];
	/** Every ref, resolved, for a host that names stale ones itself. */
	resolved: ResolvedLayer[];
	/**
	 * Pass to `<Map transformRequest>`. Identity-stable for the life of the
	 * component; adds a server's auth headers only to requests under that
	 * server's URL prefix. Compose with a widget's own function through
	 * `composeTransformRequest`.
	 */
	transformRequest: MapTransformRequest;
}

const NO_SERVERS = [] as const;

/**
 * Resolve a map widget's `mapLayers` setting against the user's map-server
 * registry (read from `appStore`) and the registered adapters.
 *
 * Until the registry has settled nothing is drawn; the stored refs are only
 * read, never changed.
 *
 * @param refs - The widget's stored `mapLayers` value (any shape is tolerated).
 * @param options - The map's zoom ceiling.
 * @returns The drawable layers and the map's `transformRequest`.
 * @example
 * const raster = useMapRasterLayers(settings.mapLayers, { maxZoom: MAP_MAX_ZOOM });
 * // <Map transformRequest={raster.transformRequest} …>
 * //   <RasterOverlayLayers layers={raster.layers} beforeId={overlayBeforeId} />
 */
export function useMapRasterLayers(
	refs: unknown,
	options: UseMapRasterLayersOptions,
): MapRasterLayers {
	const state = useAtomValue(mapServersAtom, { store: appStore });
	const providers = useMapLayerProviders();
	const servers = state.status === "settled" ? state.servers : NO_SERVERS;

	const resolved = resolveLayerRefs(
		readMapLayerRefs(refs),
		servers,
		providers,
		{
			maxZoom: options.maxZoom,
		},
	);
	const layers = toRasterOverlayLayers(resolved);
	const rules = buildMapServerHeaderRules(resolved, providers);

	// One function for the life of the component; the rules it reads are
	// replaced from a layout effect, never during render. A layout effect runs
	// before the browser paints and before any passive effect, so the
	// `<Source>` children mounting in this commit (react-map-gl adds them in
	// its own effects) already request their tiles under the new rules.
	const [scoped] = useState(() => createScopedTransformRequest(rules));
	const rulesKey = JSON.stringify(rules);
	useLayoutEffect(() => {
		scoped.setRules(JSON.parse(rulesKey));
	}, [scoped, rulesKey]);

	return { layers, resolved, transformRequest: scoped.transformRequest };
}
