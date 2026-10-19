/**
 * Schema helper for a map widget's raster layer selection.
 *
 * The property is a plain array of `MapLayerRef` carrying a
 * {@link MAP_LAYERS_SELECT_KEYWORD} marker. Core's `mapLayersSelect` JSON
 * Forms renderer turns every marked control into the per-server layer list,
 * read from the live registry **when the dialog renders**. The list of
 * servers and layers is never baked into the schema: it belongs to the user,
 * changes at runtime, and validation must not depend on it (a ref to a
 * removed server stays valid and is named by the renderer instead).
 *
 * The marker is a custom keyword rather than `format`: JSON Forms' AJV runs
 * with `strict: false`, which ignores an unknown keyword silently but warns on
 * every compile for an unknown format. Same convention as
 * `datasourceSelectProperty` in `@workspace/utils`.
 *
 * Plain TypeScript: no React, no maplibre.
 */

import type { MapLayerRef } from "./model";

/** JSON Schema keyword marking an array property as a map-layer selection. */
export const MAP_LAYERS_SELECT_KEYWORD = "mapLayersSelect";

/** Content of the {@link MAP_LAYERS_SELECT_KEYWORD} marker. Reserved for options. */
export type MapLayersSelectMarker = Record<string, never>;

/** Options for {@link mapLayersProperty}. */
export interface MapLayersPropertyOptions {
	/** Property title shown above the layer list. */
	title: string;
	/** Optional property description. */
	description?: string;
}

/** Item schema of a {@link mapLayersProperty} array: the `MapLayerRef` shape. */
export interface MapLayerRefSchema {
	type: "object";
	properties: {
		serverKey: { type: "string" };
		layerId: { type: "string" };
		enabled: { type: "boolean" };
		opacity: { type: "number"; minimum: number; maximum: number };
	};
	required: string[];
}

/**
 * Build the item schema. A fresh object per call, so a definition that
 * mutates its own schema never reaches another's.
 *
 * @returns The `MapLayerRef` item schema.
 */
function mapLayerRefSchema(): MapLayerRefSchema {
	return {
		type: "object",
		properties: {
			serverKey: { type: "string" },
			layerId: { type: "string" },
			enabled: { type: "boolean" },
			opacity: { type: "number", minimum: 0, maximum: 1 },
		},
		required: ["serverKey", "layerId", "enabled", "opacity"],
	};
}

/** The schema {@link mapLayersProperty} returns. */
export interface MapLayersPropertySchema {
	type: "array";
	title: string;
	description?: string;
	items: MapLayerRefSchema;
	[MAP_LAYERS_SELECT_KEYWORD]: MapLayersSelectMarker;
}

/**
 * Build the schema of a settings property holding the map's raster layer
 * selection (`MapLayerRef[]`). Put `[]` for it in the definition's `data` and
 * keep it out of `required`, so the dialog is valid on open.
 *
 * @param options - Title and optional description.
 * @returns An array property schema carrying the marker.
 * @example
 * properties: { mapLayers: mapLayersProperty({ title: "Map layers" }) },
 * data: { mapLayers: [] },
 */
export function mapLayersProperty(
	options: MapLayersPropertyOptions,
): MapLayersPropertySchema {
	return {
		type: "array",
		title: options.title,
		...(options.description ? { description: options.description } : {}),
		items: mapLayerRefSchema(),
		[MAP_LAYERS_SELECT_KEYWORD]: {},
	};
}

/**
 * True when a (resolved) property schema carries the map-layers marker.
 *
 * @param schema - Any value; typically a resolved JSON Forms control schema.
 * @returns Whether the marker is present.
 */
export function hasMapLayersSelectMarker(schema: unknown): boolean {
	if (!schema || typeof schema !== "object") return false;
	const raw = (schema as Record<string, unknown>)[MAP_LAYERS_SELECT_KEYWORD];
	return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

/**
 * Read a stored value as a list of well-formed refs. Anything that is not an
 * array reads as empty; malformed items are dropped from the view only (the
 * renderer never writes until the operator acts).
 *
 * @param value - The stored property value.
 * @returns The well-formed refs, in stored order.
 */
export function readMapLayerRefs(value: unknown): MapLayerRef[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isMapLayerRef);
}

/**
 * Type guard for one stored ref.
 *
 * @param value - Any value.
 * @returns Whether it has the `MapLayerRef` shape.
 */
export function isMapLayerRef(value: unknown): value is MapLayerRef {
	if (!value || typeof value !== "object") return false;
	const ref = value as Record<string, unknown>;
	return (
		typeof ref.serverKey === "string" &&
		typeof ref.layerId === "string" &&
		typeof ref.enabled === "boolean" &&
		typeof ref.opacity === "number" &&
		Number.isFinite(ref.opacity)
	);
}
