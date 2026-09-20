/**
 * This page's own panel contribution, kept separate so it can be tested.
 *
 * The merge below is the whole of the fix described at the top of
 * `mission-control-page.tsx`, and it is a pure function over a list — so it is
 * unit-tested rather than reasoned about, and the test does not need a React
 * renderer or the dashboard barrel.
 */

import type { WidgetDefinition } from "@workspace/ormi-core/widgets";

import { widgetsExport } from "../export";

/** Filter id for this page's own panel contribution. */
export const PAGE_WIDGETS_FILTER_ID = "c2-control-page-widgets";

/**
 * Add any of this plugin's panels that the list is missing.
 *
 * Registered at `Infinity` priority, i.e. after `GlobalDataSourcesProvider`'s
 * gate at `Number.MAX_SAFE_INTEGER`, which returns `[]` when no datasource is
 * configured. Anything that survived the gate is left exactly as it is and only
 * the missing panels are appended, so this is a no-op on a page that already has
 * a C2 datasource and can never duplicate an id.
 *
 * The list is mutated and returned, which is the `WIDGETS_LIST` filter contract.
 *
 * @param widgets - The list as the gate left it.
 * @returns The same list, with this plugin's panels guaranteed present.
 */
export function ensurePagePanels(
	widgets: WidgetDefinition[],
): WidgetDefinition[] {
	const present = new Set(widgets.map((widget) => widget.id));
	for (const definition of widgetsExport([])) {
		if (!present.has(definition.id)) widgets.push(definition);
	}
	return widgets;
}
