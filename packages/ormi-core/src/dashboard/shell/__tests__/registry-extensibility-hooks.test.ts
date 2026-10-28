/**
 * The shell watches the hooks its `extensibilityHook` calls apply.
 *
 * `DashboardShell` runs each definition's `extensibilityHook` during its own
 * render, and the standard map's hook applies `"std-widgets-map-type"` (owned
 * by `ormi-std-widgets`) to build its marker-type enum. A map type registered
 * after the shell's first render must re-render it.
 */

import { describe, test, expect } from "bun:test";
import {
	PluginsManager,
	combinedFilterRevision,
	subscribeFilterHooks,
} from "@workspace/ormi-plugins";

import { DASHBOARD_REGISTRY_FILTER_HOOKS } from "../registry-filter-hooks";

describe("DashboardShell extensibility-hook subscription", () => {
	test("a map type registered later re-renders the shell", () => {
		const manager = new PluginsManager(new Map());
		const before = combinedFilterRevision(
			manager,
			DASHBOARD_REGISTRY_FILTER_HOOKS,
		);
		let changes = 0;
		const unsubscribe = subscribeFilterHooks(
			manager,
			DASHBOARD_REGISTRY_FILTER_HOOKS,
			() => {
				changes += 1;
			},
		);

		manager.addFilter("std-widgets-map-type", {
			id: "late-map-type",
			priority: 10,
			filter: (types: string[]) => [...types, "emi"],
		});
		unsubscribe();

		expect(changes).toBe(1);
		expect(
			combinedFilterRevision(manager, DASHBOARD_REGISTRY_FILTER_HOOKS),
		).toBeGreaterThan(before);
	});
});
