/**
 * Guards for the map editor's cross-map hazards (pure, testable).
 *
 * THE CORRUPTION THIS PREVENTS — `c2.map.features.update` is a **PUT upsert**:
 * `PUT /maps/{map}/features/{featureId}` writes the feature at that id on that
 * map whether or not one is already there. The map `<Select>` used to clear only
 * `pickedId` when the operator switched maps, leaving `pending` — the in-progress
 * edit, including the `featureId` of a feature belonging to map **A** — fully
 * intact. Confirming that edit then sent A's feature id together with the newly
 * selected map **B**, and the upsert silently created a copy of A's feature
 * inside B. No error, no warning, and nothing on screen to suggest a second map
 * had just acquired a feature.
 *
 * TWO INDEPENDENT DEFENCES, because this writes to a shared database:
 *  1. The widget clears ALL pending edit state on a map change (the fix at the
 *     cause).
 *  2. Every pending edit records the map it was opened against, and the write
 *     path refuses to proceed when that no longer matches — {@link crossMapEdit}.
 *     A guard at the write itself survives a future code path that forgets (1).
 */

/** The fields of a pending save this module needs. */
export interface PendingEditScope {
	/** The map the edit was opened against, when known. */
	mapName?: string;
	/** The id being upserted; absent for a create. */
	featureId?: string;
}

/**
 * Whether a pending edit would write a feature belonging to one map into a
 * different one.
 *
 * Only an EDIT can corrupt: a create has no `featureId`, so the server assigns a
 * fresh one and there is nothing to collide with. An edit whose `mapName` was
 * never recorded is treated as safe — refusing on missing provenance would block
 * legitimate edits opened before this field existed — so this is the second line
 * of defence, not the first.
 *
 * @param pending - The pending edit's recorded scope.
 * @param selectedMap - The map currently selected in the widget.
 * @returns True when confirming the edit would upsert across maps.
 */
export function crossMapEdit(
	pending: PendingEditScope | null | undefined,
	selectedMap: string,
): boolean {
	if (!pending) return false;
	if (!pending.featureId) return false;
	if (!pending.mapName) return false;
	return pending.mapName !== selectedMap;
}

/**
 * The operator-facing message for a refused cross-map write.
 *
 * @param pending - The pending edit's recorded scope.
 * @param selectedMap - The map currently selected.
 * @returns The error text naming both maps.
 */
export function crossMapEditMessage(
	pending: PendingEditScope,
	selectedMap: string,
): string {
	return (
		`This edit belongs to map "${pending.mapName}", but "${selectedMap}" is selected. ` +
		`Saving it would copy the feature into "${selectedMap}" — switch back to "${pending.mapName}" to save, or cancel the edit.`
	);
}
