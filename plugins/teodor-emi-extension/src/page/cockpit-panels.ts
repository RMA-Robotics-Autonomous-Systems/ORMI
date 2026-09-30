/**
 * Keep the cockpit's panels resolvable past the datasource gate.
 *
 * `GlobalDataSourcesProvider` registers a `WIDGETS_LIST` filter at
 * `Number.MAX_SAFE_INTEGER` that returns `[]` while no datasource is configured,
 * and the cockpit starts with none. The shell re-reads `WIDGETS_LIST` as soon as
 * that gate registers, so without this every placed panel turns into an
 * unsupported tile on first open, the standard map included.
 *
 * The map is not this plugin's widget, so its definition cannot be rebuilt
 * here. It is taken from the list itself instead: `capture` runs just before
 * the gate and keeps the definitions this page needs, `restore` runs after it
 * and appends whichever of those the gate removed. Both run in one synchronous
 * `applyFilter` pass, so the capture is always that pass's own. A widget the
 * gate let through is left exactly as it is, and no id is ever duplicated.
 *
 * Pure over lists, so it is unit-tested without a renderer.
 */

import type { WidgetDefinition } from "@workspace/ormi-core/widgets";

import { emiWidgetDefinitions } from "../widgets/definitions";
import { cockpitWidgetIds } from "./default-cockpit";

/** Filter id of the pre-gate capture. */
export const COCKPIT_CAPTURE_FILTER_ID = "teodor-emi-cockpit-capture";
/** Filter id of the post-gate restore. */
export const COCKPIT_RESTORE_FILTER_ID = "teodor-emi-cockpit-restore";

/** Just below the datasource gate. */
export const COCKPIT_CAPTURE_PRIORITY = Number.MAX_SAFE_INTEGER - 1;
/** After the datasource gate. */
export const COCKPIT_RESTORE_PRIORITY = Infinity;

/** The page's three `WIDGETS_LIST` filters, sharing one pass's capture. */
export interface CockpitPanelFilters {
	/** Adds every EMI panel (registered at priority 10, under `EMI_WIDGETS_FILTER_ID`). */
	contribute: (widgets: WidgetDefinition[]) => WidgetDefinition[];
	/** Records this page's panels as the list stands just before the gate. */
	capture: (widgets: WidgetDefinition[]) => WidgetDefinition[];
	/** Appends the recorded panels the gate removed. */
	restore: (widgets: WidgetDefinition[]) => WidgetDefinition[];
}

/**
 * Build the page's filters.
 *
 * Kept past the gate are every EMI panel (so the rail offers them all on this
 * page) and every widget the shipped cockpit places. The EMI ids are learnt
 * from the definitions `contribute` builds in the same pass, so no factory is
 * called outside the shell's render. The lists are mutated and returned, which
 * is the `WIDGETS_LIST` filter contract.
 *
 * @returns The three filters.
 */
export function createCockpitPanelFilters(): CockpitPanelFilters {
	const kept = new Set<string>(cockpitWidgetIds());
	let captured: WidgetDefinition[] = [];

	return {
		contribute: (widgets) => {
			for (const definition of emiWidgetDefinitions()) {
				kept.add(definition.id);
				widgets.push(definition);
			}
			return widgets;
		},
		capture: (widgets) => {
			captured = widgets.filter((widget) => kept.has(widget.id));
			return widgets;
		},
		restore: (widgets) => {
			const present = new Set(widgets.map((widget) => widget.id));
			for (const definition of captured) {
				if (present.has(definition.id)) continue;
				widgets.push(definition);
				present.add(definition.id);
			}
			captured = [];
			return widgets;
		},
	};
}
