/**
 * The cockpit panels, as one list.
 *
 * Its own module rather than a section of `export.tsx` because the **page**
 * registers these, and `export.tsx` imports the page. Keeping the list here
 * lets both reach it without a cycle.
 *
 * @see `page/emi-mission-page.tsx` for why registration is page-scoped.
 */

import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { EmiCoilSignalStackDefinition } from "./emi-coil-signal-stack";
import { EmiMotionChartDefinition } from "./emi-motion-chart";
import { EmiCoilArrayDefinition } from "./emi-coil-array";
import { EmiParamsRailDefinition } from "./emi-params-rail";
import { EmiThresholdSweepDefinition } from "./emi-threshold-sweep";
import { EmiLagScatterDefinition } from "./emi-lag-scatter";
import { EmiRunOverlayDefinition } from "./emi-run-overlay";
import { EmiTablesDefinition } from "./emi-tables";
import { EmiMissionControlDefinition } from "./emi-mission-control";
import { EmiExportDefinition } from "./emi-export";

/** Filter id the cockpit page registers these under. */
export const EMI_WIDGETS_FILTER_ID = "teodor-emi-cockpit-widgets";

/**
 * Every EMI panel, freshly built.
 *
 * Called on each `WIDGETS_LIST` pass rather than memoised: definition factories
 * may call hooks, and the dashboard shell depends on them running exactly once
 * per render.
 *
 * The cast is the same widening every plugin does — `WidgetDefinition<T>` is
 * generic in its props and the registry's element type is invariant in them.
 *
 * @returns The definitions, widened to the registry's element type.
 */
export const emiWidgetDefinitions = (): WidgetDefinition[] =>
	[
		EmiCoilSignalStackDefinition(),
		EmiMotionChartDefinition(),
		EmiCoilArrayDefinition(),
		EmiParamsRailDefinition(),
		EmiThresholdSweepDefinition(),
		EmiLagScatterDefinition(),
		EmiRunOverlayDefinition(),
		EmiTablesDefinition(),
		EmiMissionControlDefinition(),
		EmiExportDefinition(),
	] as unknown as WidgetDefinition[];
