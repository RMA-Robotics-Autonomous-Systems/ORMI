/**
 * The shell hears the datasource gate registering.
 *
 * `DashboardShell` resolves `WIDGETS_LIST` during its own render and is the
 * PARENT of `GlobalDataSourcesProvider`, which registers the datasource gate
 * (`filter_widgets_list_based_on_datasources`, pattern 8) in an effect once it
 * has initialized. That effect re-renders only the provider, so the shell kept
 * the ungated list — every widget of every plugin, C2 and Tello panels on a
 * Foxglove-only workspace — until some unrelated atom change re-rendered it.
 *
 * The repo has no DOM test environment, so this drives the shell's own
 * subscription (`subscribeFilterHooks` over `DASHBOARD_REGISTRY_FILTER_HOOKS`,
 * exactly what `usePluginFiltersRevision` hands `useSyncExternalStore`) through
 * the provider's registration sequence against a real `PluginsManager`.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
	Plugin,
	PluginsHooks,
	PluginsManager,
	combinedFilterRevision,
	subscribeFilterHooks,
} from "@workspace/ormi-plugins";

import { DASHBOARD_REGISTRY_FILTER_HOOKS } from "../registry-filter-hooks";

/** Just enough of a widget definition for the gate. */
interface TestWidget {
	id: string;
	requires?: string;
}

/** Just enough of a configured datasource for the gate. */
interface TestDatasource {
	datasource_id: string;
}

/**
 * The plugin side, registered in constructors as real plugins do: two widget
 * lists and a pattern-8 filter that hides the C2 widget without a C2 source.
 *
 * @returns A manager seeded with the plugins.
 */
function managerWithPlugins(): PluginsManager {
	const std = new Plugin({ name: "std", description: "", version: "1" });
	std.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "std-widgets",
		priority: 10,
		filter: (widgets: TestWidget[]) => [...widgets, { id: "plot" }],
	});

	const c2 = new Plugin({ name: "c2", description: "", version: "1" });
	c2.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "c2-widgets",
		priority: 10,
		filter: (widgets: TestWidget[]) => [
			...widgets,
			{ id: "mission-browser", requires: "c2" },
		],
	});
	c2.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
		id: "c2-gate",
		priority: 10,
		filter: (widgets: TestWidget[], datasources: TestDatasource[]) =>
			widgets.filter(
				(w) =>
					!w.requires ||
					datasources.some((d) => d.datasource_id === w.requires),
			),
	});

	return new PluginsManager(
		new Map<string, Plugin>([
			["std", std],
			["c2", c2],
		]),
	);
}

/**
 * What `GlobalDataSourcesProvider`'s two effects register once initialized,
 * with the same ids, hooks, priorities and gate logic.
 *
 * @param manager - The manager.
 * @param datasources - The workspace's configured datasources.
 * @returns Cleanup, as the effects return it.
 */
function registerProviderFilters(
	manager: PluginsManager,
	datasources: TestDatasource[],
): () => void {
	manager.addFilter(PluginsHooks.AVAILABLE_DATASOURCES, {
		id: "available_datasources",
		priority: 10,
		filter: () => datasources,
	});
	manager.addFilter(PluginsHooks.WIDGETS_LIST, {
		id: "filter_widgets_list_based_on_datasources",
		priority: Number.MAX_SAFE_INTEGER,
		filter: (widgets: TestWidget[]) => {
			const available = manager.applyFilter<TestDatasource[]>(
				PluginsHooks.AVAILABLE_DATASOURCES,
				[],
			);
			if (available.length === 0) return [];
			return manager.applyFilter<TestWidget[]>(
				PluginsHooks.WIDGET_LIST_WITH_DATASOURCE,
				widgets,
				available,
			);
		},
	});
	return () => {
		manager.removeFilter("available_datasources");
		manager.removeFilter("filter_widgets_list_based_on_datasources");
	};
}

/**
 * The shell's registry read, as its render performs it.
 *
 * @param manager - The manager.
 * @returns The widget ids the picker would offer.
 */
function shellWidgetIds(manager: PluginsManager): string[] {
	return manager
		.applyFilter<TestWidget[]>(PluginsHooks.WIDGETS_LIST, [])
		.map((w) => w.id);
}

describe("DashboardShell registry subscription", () => {
	let manager: PluginsManager;
	let renders: number;
	let unsubscribe: () => void;

	/** Mimic `useSyncExternalStore`: re-render when the snapshot moves. */
	let snapshot: number;
	const onStoreChange = () => {
		const next = combinedFilterRevision(
			manager,
			DASHBOARD_REGISTRY_FILTER_HOOKS,
		);
		if (next !== snapshot) {
			snapshot = next;
			renders += 1;
		}
	};

	beforeEach(() => {
		manager = managerWithPlugins();
		renders = 0;
		snapshot = combinedFilterRevision(
			manager,
			DASHBOARD_REGISTRY_FILTER_HOOKS,
		);
		unsubscribe = subscribeFilterHooks(
			manager,
			DASHBOARD_REGISTRY_FILTER_HOOKS,
			onStoreChange,
		);
	});

	test("the first render, before the gate exists, sees every widget", () => {
		expect(shellWidgetIds(manager)).toEqual(["plot", "mission-browser"]);
		unsubscribe();
	});

	test("the gate registering re-renders the shell into the gated list", () => {
		registerProviderFilters(manager, [{ datasource_id: "foxglove" }]);

		expect(renders).toBeGreaterThan(0);
		expect(shellWidgetIds(manager)).toEqual(["plot"]);
		unsubscribe();
	});

	test("no datasource: the re-render reads the gate's empty list", () => {
		registerProviderFilters(manager, []);

		expect(renders).toBeGreaterThan(0);
		expect(shellWidgetIds(manager)).toEqual([]);
		unsubscribe();
	});

	test("the datasource list changing re-registers the gate and is heard", () => {
		const cleanup = registerProviderFilters(manager, [
			{ datasource_id: "foxglove" },
		]);
		const before = renders;

		cleanup();
		registerProviderFilters(manager, [
			{ datasource_id: "foxglove" },
			{ datasource_id: "c2" },
		]);

		expect(renders).toBeGreaterThan(before);
		expect(shellWidgetIds(manager)).toEqual(["plot", "mission-browser"]);
		unsubscribe();
	});

	test("unrelated registrations do not re-render the shell", () => {
		manager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: "some-datasource-topics",
			priority: 10,
			filter: (topics: unknown[]) => topics,
		});

		expect(renders).toBe(0);
		unsubscribe();
	});

	test("every hook the gate reads is watched", () => {
		expect(DASHBOARD_REGISTRY_FILTER_HOOKS).toEqual(
			expect.arrayContaining([
				PluginsHooks.WIDGETS_LIST,
				PluginsHooks.AVAILABLE_DATASOURCES,
				PluginsHooks.WIDGET_LIST_WITH_DATASOURCE,
			]),
		);
		unsubscribe();
	});
});
