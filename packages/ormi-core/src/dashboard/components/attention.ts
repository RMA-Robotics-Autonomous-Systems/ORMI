/**
 * The one "next step" cue the dashboard chrome uses, and when the save button
 * shows it.
 *
 * Pure and React-free (a class string and a predicate) so the navbar, both
 * layout engines and the launcher share one spelling instead of three, and so
 * the predicate can be pinned by tests: a cue that never stops is as invisible
 * to an operator as one that never starts.
 */

/**
 * How a control looks while it is the operator's next step: the launcher
 * while the dashboard is empty, the navbar's `Datasources` button while none
 * is configured, the save button while there are unsaved changes.
 *
 * Two halves, and the static one is the signal. Full opacity (the launcher's
 * idle state is 70%) and a primary ring mark the control whatever the motion
 * setting is. The halo-and-swell over the shared `pulse-bg` / `pulse-scale`
 * keyframes (`packages/ui/src/styles/globals.css`, whose halo is a relative
 * colour over `--primary`, so it follows every preset) only ever adds to it,
 * and `motion-safe:` drops it under `prefers-reduced-motion: reduce`, leaving
 * the ring still pointing the way. A signal that exists only as movement is
 * no signal at all for those operators.
 *
 * This is the motion floor's one sanctioned loop (AGENTS.md, "Motion is the
 * UI's own state"): it runs only while the structural state it reports holds,
 * it stops the moment the step is taken, it is `motion-safe` gated, and it
 * has a static half. It is never an inline `style`: that cannot be themed and
 * cannot be turned off.
 *
 * The ring sits outside the control rather than changing its fill, so the
 * label and icon keep their contrast, and `pulse-scale` peaks at 1.05, so the
 * hit target never moves far enough to be missed by a click already on its
 * way.
 */
export const ATTENTION_CLASS =
	"opacity-100 ring-2 ring-primary/60 ring-offset-2 ring-offset-background motion-safe:animate-[pulse-bg_0.7s_infinite,pulse-scale_0.7s_infinite]";

/** Dashboard state the save cue is decided from. */
export interface SaveAttentionInput {
	/** Unsaved changes exist (`hasChangedAtom`). */
	hasChanged: boolean;
	/** Datasources configured in this workspace (`datasourcesAtom.size`). */
	datasourceCount: number;
	/** Widgets currently on this dashboard (`widgetsAtom.size`). */
	widgetCount: number;
}

/**
 * Whether the save button is the operator's next step.
 *
 * Only the next required step is cued. The navbar's `Datasources` button owns
 * the first one (no datasource configured) and the launcher the second (a
 * datasource but an empty dashboard); saving is the last, so it stays quiet
 * until there is a datasource and at least one widget to persist, and stops
 * the moment the changes are saved.
 * @param input - Current dashboard state.
 * @returns True when the save button should carry {@link ATTENTION_CLASS}.
 */
export function shouldSaveCallAttention({
	hasChanged,
	datasourceCount,
	widgetCount,
}: SaveAttentionInput): boolean {
	return hasChanged && datasourceCount > 0 && widgetCount > 0;
}
