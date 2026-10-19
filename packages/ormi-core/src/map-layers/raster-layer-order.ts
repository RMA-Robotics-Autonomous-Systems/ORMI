/**
 * Ordering of a map's server raster layers against the **live** map style.
 * Pure, React-free; maplibre-gl is never imported at runtime.
 *
 * The layers are mounted by react-map-gl `<Layer>` children with no
 * `beforeId`, and placed here instead, because a `beforeId` computed from the
 * style object a widget is about to hand MapLibre is wrong for the style the
 * map still has: switching a raster basemap to a vector one renders the
 * children with the vector style's anchor while the live map is still raster,
 * so react-map-gl's `moveLayer(id, anchor)` names a layer that does not exist
 * yet, and the following `setStyle` diff loses the overlay until a reload.
 * Placement here only ever names a layer `getLayer` has just found.
 */

/** The part of a MapLibre map the ordering reads and writes. */
export interface LayerOrderMap {
	/** Live layer ids, bottom first (`Map.getLayersOrder`). */
	getLayersOrder(): string[];
	/** Move `id` to sit directly under `beforeId` (`Map.moveLayer`). */
	moveLayer(id: string, beforeId?: string): unknown;
}

/** One move the ordering makes. */
export interface RasterLayerMove {
	/** The layer moved. */
	id: string;
	/** The layer it is moved directly under. */
	beforeId: string;
}

/** A `beforeId` candidate as a widget passes it; empty entries are skipped. */
export type BeforeIdCandidate = string | null | undefined;

/**
 * The first candidate the live style contains, never one of the overlay's own
 * layers. `undefined` when none is present: the stack then stays where
 * MapLibre appended it.
 *
 * @param order - Live layer ids.
 * @param candidates - Preferred first.
 * @param own - The overlay's own layer ids.
 * @returns The anchor to stack under, if any.
 */
export function resolveLiveBeforeId(
	order: readonly string[],
	candidates: readonly BeforeIdCandidate[],
	own: readonly string[] = [],
): string | undefined {
	const present = new Set(order);
	const mine = new Set(own);
	for (const candidate of candidates) {
		if (candidate && present.has(candidate) && !mine.has(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

/**
 * The moves that put `ids` (bottom first) directly under the first live
 * candidate, in order, as one contiguous stack. Layers not yet in the live
 * style are skipped (their `<Layer>` has not been added; the next
 * `styledata` places them). With no live candidate, only the relative order
 * of the present layers is fixed, under the topmost of them. Every `beforeId`
 * returned is in `order` at the moment the move is made, so a move never
 * names a layer that does not exist. Already-ordered input yields `[]`.
 *
 * @param order - Live layer ids, bottom first.
 * @param ids - The overlay's layer ids, bottom first.
 * @param candidates - `beforeId` candidates, preferred first.
 * @returns The moves, in the order to apply them.
 */
export function planRasterLayerMoves(
	order: readonly string[],
	ids: readonly string[],
	candidates: readonly BeforeIdCandidate[],
): RasterLayerMove[] {
	const working = [...order];
	const present = new Set(working);
	const live = ids.filter((id) => present.has(id));
	const anchor = resolveLiveBeforeId(working, candidates, ids);
	const moves: RasterLayerMove[] = [];

	for (let i = live.length - 1; i >= 0; i--) {
		const id = live[i]!;
		const target = i === live.length - 1 ? anchor : live[i + 1];
		if (!target) continue;
		const at = working.indexOf(id);
		if (working[at + 1] === target) continue;
		working.splice(at, 1);
		working.splice(working.indexOf(target), 0, id);
		moves.push({ id, beforeId: target });
	}
	return moves;
}

/**
 * Apply {@link planRasterLayerMoves} to a live map. Tolerates a map between
 * styles: a failed read or move is skipped (the next `styledata` retries),
 * never thrown into React.
 *
 * @param map - The live map.
 * @param ids - The overlay's layer ids, bottom first.
 * @param candidates - `beforeId` candidates, preferred first.
 * @returns The moves made.
 */
export function applyRasterLayerOrder(
	map: LayerOrderMap,
	ids: readonly string[],
	candidates: readonly BeforeIdCandidate[],
): RasterLayerMove[] {
	if (ids.length === 0) return [];
	let order: string[];
	try {
		order = map.getLayersOrder();
	} catch {
		return [];
	}
	const moves = planRasterLayerMoves(order, ids, candidates);
	const made: RasterLayerMove[] = [];
	for (const move of moves) {
		try {
			map.moveLayer(move.id, move.beforeId);
			made.push(move);
		} catch {
			return made;
		}
	}
	return made;
}
