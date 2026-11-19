/**
 * What a terra-draw `finish` event does to the map's pending save.
 *
 * terra-draw emits `finish` for two different things: a NEW shape completed by
 * a draw mode (`action: "draw"`), and an EDIT completed by the select mode (a
 * vertex dragged, a vertex deleted, a midpoint inserted, the whole feature
 * moved). The map used to treat every `finish` as a new drawing: the first
 * drag of an opened feature replaced the edit's pending save (its
 * `featureId`, name and type) with an empty "new feature", and Save then
 * created a duplicate while the original stayed.
 *
 * Pure (no React, no map) so the rule is unit-testable on its own.
 */

/** The second argument terra-draw passes to `finish` listeners. */
export interface DrawFinishContext {
	mode?: string;
	action?: string;
}

/** How a `finish` event affects the pending save. */
export type DrawFinishKind = "create" | "update" | "ignore";

/**
 * Classify a `finish` event.
 *
 * - `create`: a draw mode completed a new shape.
 * - `update`: an edit completed while a pending save is open; the open save
 *   keeps its identity and takes the new geometry.
 * - `ignore`: an edit completed with nothing open (nothing to update).
 *
 * A missing context (an older terra-draw) counts as a draw, which is what the
 * map did before the context existed.
 *
 * @param context - terra-draw's finish context.
 * @param hasOpenPending - Whether a pending save is open.
 * @returns The kind of change.
 */
export function classifyDrawFinish(
	context: DrawFinishContext | undefined,
	hasOpenPending: boolean,
): DrawFinishKind {
	const isDraw =
		context === undefined ||
		(context.action === undefined && context.mode !== "select") ||
		context.action === "draw";
	if (isDraw) return "create";
	return hasOpenPending ? "update" : "ignore";
}

/**
 * The next pending save after a `finish` event.
 *
 * @param prev - The pending save open now, or null.
 * @param drawnFeature - The feature terra-draw finished (live geometry).
 * @param context - terra-draw's finish context.
 * @param createPending - Builds the pending save for a new shape.
 * @returns The pending save to keep.
 */
export function nextPendingOnFinish<F, P extends { feature: F }>(
	prev: P | null,
	drawnFeature: F,
	context: DrawFinishContext | undefined,
	createPending: (feature: F) => P,
): P | null {
	switch (classifyDrawFinish(context, prev !== null)) {
		case "create":
			return createPending(drawnFeature);
		case "update":
			return prev === null ? null : { ...prev, feature: drawnFeature };
		case "ignore":
			return prev;
	}
}
