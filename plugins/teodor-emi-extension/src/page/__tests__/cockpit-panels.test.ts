/**
 * The cockpit's panels survive the datasource gate.
 *
 * The cockpit starts with no datasource, and core's gate on `WIDGETS_LIST` at
 * `Number.MAX_SAFE_INTEGER` returns `[]` then. The shell re-reads the list as
 * soon as the gate registers, so anything the page places and the gate removes
 * would turn into an unsupported tile on first open, the borrowed standard map
 * included. These run the page's filters through a real `PluginsManager` in the
 * order the priorities give them.
 */

import { describe, expect, it } from "bun:test";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { PluginsHooks, PluginsManager } from "@workspace/ormi-plugins";

import { emiWidgetDefinitions } from "../../widgets/definitions";
import {
	COCKPIT_CAPTURE_PRIORITY,
	COCKPIT_RESTORE_PRIORITY,
	createCockpitPanelFilters,
} from "../cockpit-panels";
import { cockpitWidgetIds, defaultCockpit } from "../default-cockpit";

/** Core's gate priority, which the two bracketing filters must straddle. */
const GATE_PRIORITY = Number.MAX_SAFE_INTEGER;

/** A foreign widget, as another plugin would contribute it. */
const foreign = (id: string) => ({ id }) as WidgetDefinition;

/**
 * A manager carrying the page's filters, another plugin's widgets and a gate.
 *
 * @param gate - What the gate does with the list.
 * @returns The manager.
 */
function managerWith(
	gate: (widgets: WidgetDefinition[]) => WidgetDefinition[],
): PluginsManager {
	const manager = new PluginsManager(new Map());
	const filters = createCockpitPanelFilters();
	manager.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "std",
		priority: 10,
		filter: (w: WidgetDefinition[]) => [
			...w,
			foreign("map-box-viewer"),
			foreign("plot"),
		],
	});
	manager.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "emi",
		priority: 10,
		filter: filters.contribute,
	});
	manager.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "capture",
		priority: COCKPIT_CAPTURE_PRIORITY,
		filter: filters.capture,
	});
	manager.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "gate",
		priority: GATE_PRIORITY,
		filter: gate,
	});
	manager.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "restore",
		priority: COCKPIT_RESTORE_PRIORITY,
		filter: filters.restore,
	});
	return manager;
}

/** Resolve the list the shell would read. */
const ids = (manager: PluginsManager) =>
	manager
		.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGETS_LIST, [])
		.map((w) => w.id);

describe("cockpit panel filters", () => {
	it("straddle the gate", () => {
		expect(COCKPIT_CAPTURE_PRIORITY).toBeLessThan(GATE_PRIORITY);
		expect(COCKPIT_RESTORE_PRIORITY).toBeGreaterThan(GATE_PRIORITY);
	});

	it("put back every EMI panel and the borrowed map when the gate empties the list", () => {
		const resolved = ids(managerWith(() => []));
		const emiIds = emiWidgetDefinitions().map((w) => w.id);

		expect(resolved.sort()).toEqual(
			[...new Set([...emiIds, "map-box-viewer"])].sort(),
		);
		// A widget this page does not place stays gated.
		expect(resolved).not.toContain("plot");
	});

	it("cover every widget the default cockpit places", () => {
		const resolved = new Set(ids(managerWith(() => [])));
		const placed = [...defaultCockpit().widgets.values()].map(
			(w) => w.widget_id,
		);
		for (const id of placed) expect(resolved.has(id)).toBe(true);
		expect(new Set(placed)).toEqual(new Set(cockpitWidgetIds()));
	});

	it("add nothing, and duplicate nothing, when the gate lets everything through", () => {
		const resolved = ids(managerWith((w) => w));
		expect(new Set(resolved).size).toBe(resolved.length);
		expect(resolved).toContain("plot");
	});

	it("keep what the gate let through in its place", () => {
		const resolved = ids(
			managerWith((w) => w.filter((d) => d.id === "map-box-viewer")),
		);
		expect(resolved[0]).toBe("map-box-viewer");
		expect(new Set(resolved).size).toBe(resolved.length);
	});

	it("use each pass's own capture", () => {
		let empty = true;
		const manager = managerWith((w) => (empty ? [] : w));
		ids(manager);
		empty = false;
		const second = ids(manager);
		expect(new Set(second).size).toBe(second.length);
	});
});
