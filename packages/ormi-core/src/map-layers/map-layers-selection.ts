/**
 * What the `mapLayersSelect` control shows, and the edits it makes. Pure,
 * React-free, so the behaviour the dialog depends on is unit-tested without a
 * DOM.
 *
 * Edits operate on the **raw** stored array: an item this build does not
 * recognise is carried through every edit untouched, the same way a stale ref
 * is kept exactly as saved until the operator removes it.
 */

import type { MapLayerEntry, MapLayerRef, MapServerRecord } from "./model";
import type { MapLayerProviderDefinition } from "./provider-definition";
import { resolveLayerRefs, type ResolvedLayer } from "./resolve-layer-refs";
import { isMapLayerRef, readMapLayerRefs } from "./map-layers-property";
import { mapLayerHealthKey, type MapLayerHealth } from "./map-servers-store";

/** One catalogue layer as a row of the control. */
export interface MapLayerSelectRow {
	/** The catalogue entry. */
	entry: MapLayerEntry;
	/** The stored ref, when the operator has touched this layer. */
	ref?: MapLayerRef;
	/** `false` for a layer not available in Web Mercator. */
	selectable: boolean;
	/** Health observed by a map drawing it this session. */
	health?: MapLayerHealth;
}

/** One registered server as a group of the control. */
export interface MapLayerSelectGroup {
	/** The stored record. */
	server: MapServerRecord;
	/** Display name of its type, the adapter id when the adapter is absent. */
	typeName: string;
	/** Whether this build has the server's adapter. */
	adapterAvailable: boolean;
	/** Catalogue rows, in catalogue order. Empty when the adapter is absent. */
	rows: MapLayerSelectRow[];
}

/** A stored ref the registry cannot place. */
export type StaleMapLayerRef = Extract<
	ResolvedLayer,
	{ kind: "missing-server" | "missing-layer" | "adapter-unavailable" }
>;

/** The control's view of a settled registry. */
export interface MapLayerSelectView {
	/** One group per server, in registry order. */
	groups: MapLayerSelectGroup[];
	/** Refs that resolve to nothing, kept as saved, in registry order. */
	stale: StaleMapLayerRef[];
}

/** Identity of a ref within one widget's selection. */
function refKey(serverKey: string, layerId: string): string {
	return mapLayerHealthKey(serverKey, layerId);
}

/**
 * Build the control's view of a settled registry.
 *
 * @param servers - Stored records, in registry order.
 * @param value - The stored property value (any shape).
 * @param providers - Registered adapters.
 * @param health - Per-layer health, keyed by `mapLayerHealthKey`.
 * @returns Groups and stale refs.
 */
export function buildMapLayerSelectView(
	servers: readonly MapServerRecord[],
	value: unknown,
	providers: readonly MapLayerProviderDefinition[],
	health: ReadonlyMap<string, MapLayerHealth> = new Map(),
): MapLayerSelectView {
	const refs = readMapLayerRefs(value);
	const refByKey = new Map<string, MapLayerRef>();
	for (const ref of refs) {
		const key = refKey(ref.serverKey, ref.layerId);
		if (!refByKey.has(key)) refByKey.set(key, ref);
	}
	const providerById = new Map(providers.map((p) => [p.id, p]));

	const seenServers = new Set<string>();
	const rowKeys = new Set<string>();
	const groups: MapLayerSelectGroup[] = [];
	for (const server of servers) {
		if (seenServers.has(server.serverKey)) continue;
		seenServers.add(server.serverKey);
		const provider = providerById.get(server.adapterId);
		const rows: MapLayerSelectRow[] = [];
		if (provider) {
			for (const entry of server.catalog ?? []) {
				const key = refKey(server.serverKey, entry.id);
				if (rowKeys.has(key)) continue;
				rowKeys.add(key);
				const ref = refByKey.get(key);
				const rowHealth = health.get(key);
				rows.push({
					entry,
					...(ref ? { ref } : {}),
					selectable: entry.webMercator,
					...(rowHealth ? { health: rowHealth } : {}),
				});
			}
		}
		groups.push({
			server,
			typeName: provider?.name ?? server.adapterId,
			adapterAvailable: !!provider,
			rows,
		});
	}

	// The resolver is the one classification of a ref; the depth is
	// irrelevant here, only the kind is read.
	const resolved = resolveLayerRefs(refs, servers, providers, {
		maxZoom: Number.MAX_SAFE_INTEGER,
	});
	const staleKeys = new Set<string>();
	const stale: StaleMapLayerRef[] = [];
	for (const item of resolved) {
		if (
			item.kind !== "missing-server" &&
			item.kind !== "missing-layer" &&
			item.kind !== "adapter-unavailable"
		) {
			continue;
		}
		const key = refKey(item.ref.serverKey, item.ref.layerId);
		// A layer that has a row is edited there, never listed twice.
		if (rowKeys.has(key) || staleKeys.has(key)) continue;
		staleKeys.add(key);
		stale.push(item);
	}

	return { groups, stale };
}

/**
 * Operator-facing name of why a stale ref cannot be drawn.
 *
 * @param item - The stale ref.
 * @returns A short fact naming the missing piece.
 */
export function describeStaleMapLayerRef(item: StaleMapLayerRef): string {
	switch (item.kind) {
		case "missing-server":
			return `Server not registered (${item.ref.serverKey})`;
		case "missing-layer":
			return `Layer not on ${item.server.title}`;
		case "adapter-unavailable":
			return `Server type not available (${item.adapterId})`;
	}
}

/** Whether a raw item is the ref of `serverKey` / `layerId`. */
function matches(item: unknown, serverKey: string, layerId: string): boolean {
	return (
		isMapLayerRef(item) &&
		item.serverKey === serverKey &&
		item.layerId === layerId
	);
}

/** The stored value as a raw array, never mutated. */
function rawItems(value: unknown): unknown[] {
	return Array.isArray(value) ? [...value] : [];
}

/**
 * Switch a layer on or off.
 *
 * The first switch-on of a layer never touched appends
 * `{ enabled: true, opacity: 1 }`. Switching off keeps the ref and its
 * opacity. Switching off a layer that has no ref changes nothing.
 *
 * @param value - The stored property value.
 * @param serverKey - The layer's server.
 * @param layerId - The layer.
 * @param enabled - The new state.
 * @returns The next array.
 */
export function setMapLayerEnabled(
	value: unknown,
	serverKey: string,
	layerId: string,
	enabled: boolean,
): unknown[] {
	const items = rawItems(value);
	let found = false;
	const next = items.map((item) => {
		if (!matches(item, serverKey, layerId)) return item;
		found = true;
		return { ...(item as MapLayerRef), enabled };
	});
	if (!found && enabled) {
		next.push({ serverKey, layerId, enabled: true, opacity: 1 });
	}
	return next;
}

/**
 * Set a touched layer's opacity, clamped to 0..1. A layer with no ref is left
 * alone: the slider is only enabled while the layer is on.
 *
 * @param value - The stored property value.
 * @param serverKey - The layer's server.
 * @param layerId - The layer.
 * @param opacity - The new opacity.
 * @returns The next array.
 */
export function setMapLayerOpacity(
	value: unknown,
	serverKey: string,
	layerId: string,
	opacity: number,
): unknown[] {
	const clamped = Number.isFinite(opacity)
		? Math.min(1, Math.max(0, opacity))
		: 1;
	return rawItems(value).map((item) =>
		matches(item, serverKey, layerId)
			? { ...(item as MapLayerRef), opacity: clamped }
			: item,
	);
}

/**
 * Remove a layer's ref (the stale group's Remove).
 *
 * @param value - The stored property value.
 * @param serverKey - The layer's server.
 * @param layerId - The layer.
 * @returns The next array.
 */
export function removeMapLayerRef(
	value: unknown,
	serverKey: string,
	layerId: string,
): unknown[] {
	return rawItems(value).filter((item) => !matches(item, serverKey, layerId));
}

/** Number of catalogue layers above which a group gets a filter input. */
export const MAP_LAYER_FILTER_THRESHOLD = 12;

/**
 * Filter a group's rows by a case-insensitive match on title or id.
 *
 * @param rows - The group's rows.
 * @param query - The filter text.
 * @returns The matching rows; all of them for an empty query.
 */
export function filterMapLayerRows(
	rows: readonly MapLayerSelectRow[],
	query: string,
): MapLayerSelectRow[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [...rows];
	return rows.filter(
		(row) =>
			row.entry.title.toLowerCase().includes(needle) ||
			row.entry.id.toLowerCase().includes(needle),
	);
}
