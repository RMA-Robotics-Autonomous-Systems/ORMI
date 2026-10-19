"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";

import { mapErrorMessage } from "./map-error";
import { setMapLayerHealth } from "./map-servers-store";
import {
	applyRasterLayerOrder,
	type BeforeIdCandidate,
} from "./raster-layer-order";
import {
	createTileHealthTracker,
	planRasterOverlay,
	type RasterOverlayLayer,
	type TileHealthChange,
} from "./raster-overlay-plan";

/** Props for {@link RasterOverlayLayers}. */
export interface RasterOverlayLayersProps {
	/** Drawable layers, bottom first: `useMapRasterLayers().layers`. */
	layers: readonly RasterOverlayLayer[];
	/**
	 * Layer ids to stack the overlay under, preferred first, resolved against
	 * the **live** map style on every style change: the first one the map
	 * currently contains wins, and with none present the stack is appended.
	 * Bare ids are safe here (e.g. `[ORMI_STYLE_ANCHORS.overlay,
	 * "c2-features-fill"]`); nothing is ever placed before a layer the map
	 * does not have.
	 */
	beforeIds?: readonly BeforeIdCandidate[];
	/**
	 * A single candidate, tried after {@link beforeIds}. Kept for callers
	 * with one anchor; also resolved against the live style.
	 */
	beforeId?: string;
}

/** Report a health change on the shared store, logging without query strings. */
function applyHealthChange(change: TileHealthChange, error?: unknown): void {
	if (change.kind === "unchanged") return;
	if (change.kind === "not-responding") {
		setMapLayerHealth(change.healthKey, "not-responding");
		console.warn(
			`Map layer "${change.layer.title}" (${change.layer.serverTitle}) is not responding${
				error === undefined ? "" : `: ${mapErrorMessage(error)}`
			}`,
		);
		return;
	}
	setMapLayerHealth(change.healthKey, undefined);
}

/**
 * The map's server raster layers, as declarative react-map-gl children: each
 * a `<Source>` (carrying `bounds` and the clamped `maxzoom`) with one raster
 * `<Layer>`. No layer `maxzoom` (that would hide the layer, not cap it).
 *
 * Placement is done against the live style, not through `<Layer beforeId>`:
 * the layers are added with no `beforeId` and then moved, bottom to top, to
 * sit directly under the first of `beforeIds` / `beforeId` the map contains,
 * after every render and on every `styledata` (a basemap swap, a later
 * `addLayer` of the anchor). A `beforeId` naming a layer the live map does
 * not contain is never passed to MapLibre.
 *
 * Children re-add themselves on a style event and never touch the style
 * object, so imperative layers (terra-draw) survive and a basemap swap
 * re-applies the stack by itself. Must render inside `<Map>`.
 *
 * Also watches tile errors per source: a layer that keeps failing is marked
 * "Not responding" for the config dialog. Logged messages never carry a
 * query string.
 *
 * @param props - Component props.
 * @returns React element.
 */
export function RasterOverlayLayers({
	layers,
	beforeIds,
	beforeId,
}: RasterOverlayLayersProps) {
	const { current: mapRef } = useMap();
	const map = mapRef?.getMap();

	const layersRef = useRef<readonly RasterOverlayLayer[]>(layers);
	const candidatesRef = useRef<readonly BeforeIdCandidate[]>([]);
	const candidatesKey = JSON.stringify([...(beforeIds ?? []), beforeId]);

	// Refs synced and the stack placed before paint, after the `<Layer>`
	// children have added themselves during this render.
	useLayoutEffect(() => {
		layersRef.current = layers;
		candidatesRef.current = JSON.parse(
			candidatesKey,
		) as BeforeIdCandidate[];
		if (!map) return;
		applyRasterLayerOrder(
			map,
			layers.map((layer) => layer.id),
			candidatesRef.current,
		);
	}, [map, layers, candidatesKey]);

	useEffect(() => {
		if (!map) return undefined;
		const tracker = createTileHealthTracker(() => layersRef.current);
		const onError = (event: { sourceId?: string; error?: unknown }) => {
			applyHealthChange(tracker.onError(event.sourceId), event.error);
		};
		const onData = (event: {
			dataType?: string;
			sourceId?: string;
			tile?: unknown;
		}) => {
			if (event.dataType !== "source" || !event.tile) return;
			applyHealthChange(tracker.onTileLoaded(event.sourceId));
		};
		// A new style, a re-added source or layer, an anchor appearing: place
		// whatever exists now. Idempotent, so the `styledata` a move itself
		// causes ends in no move.
		const onStyleData = () => {
			applyRasterLayerOrder(
				map,
				layersRef.current.map((layer) => layer.id),
				candidatesRef.current,
			);
		};
		map.on("error", onError);
		map.on("data", onData);
		map.on("styledata", onStyleData);
		return () => {
			map.off("error", onError);
			map.off("data", onData);
			map.off("styledata", onStyleData);
		};
	}, [map]);

	return (
		<>
			{planRasterOverlay(layers, undefined).map(({ layer, key }) => (
				<Source key={key} id={layer.id} {...layer.source}>
					<Layer
						id={layer.id}
						type="raster"
						paint={{ "raster-opacity": layer.opacity }}
					/>
				</Source>
			))}
		</>
	);
}
