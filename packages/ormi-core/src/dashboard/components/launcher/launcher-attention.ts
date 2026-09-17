/**
 * Whether the dashboard's add button should call attention to itself.
 *
 * Pure and React-free so it can be tested directly: the launcher itself is a
 * DOM surface and the repo carries no DOM render harness. A predicate like this
 * fails silently in both directions — a button that never stops pulsing is as
 * invisible to an operator as one that never starts — so it is exported and
 * pinned by tests rather than inlined into the component.
 */

/** Dashboard state the attention decision is taken from. */
export interface LauncherAttentionInput {
	/** Datasources configured in this workspace (`datasourcesAtom.size`). */
	datasourceCount: number;
	/** Widgets currently on this dashboard (`widgetsAtom.size`). */
	widgetCount: number;
}

/**
 * Decide whether the launcher button should draw the eye.
 *
 * True in exactly one situation: the workspace has something to offer — at
 * least one datasource, so there are topics to put on the dashboard — and
 * nothing has been put on it yet. That is the one moment where the operator's
 * next step is this button and nothing on screen says so.
 *
 * The two silences are the point.
 *
 * **No datasource is not this button's step.** The navbar's `Datasources`
 * button already pulses while none is configured, and two controls competing
 * for attention point at neither — the operator has to work out which one the
 * product means, which is worse than an unmarked button.
 *
 * **One widget ends it.** The signal is about an empty dashboard, not about
 * the button being useful; a console that never stops moving is one operators
 * learn to ignore, and the attention it spends is then gone when something
 * actually needs it.
 *
 * @param input - Current dashboard counts.
 * @returns True when the button should call attention to itself.
 */
export function shouldCallAttention({
	datasourceCount,
	widgetCount,
}: LauncherAttentionInput): boolean {
	return datasourceCount > 0 && widgetCount === 0;
}
