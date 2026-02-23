/**
 * Tests for dashboard/state/actions.ts
 *
 * All functions are pure (no React, no atoms) so they can be tested
 * without any React renderer, context, or mocking infrastructure.
 *
 * Coverage focus:
 * - Return value immutability (input maps are never mutated)
 * - Correct state transitions for each action
 * - Edge cases: missing keys, empty maps, unknown IDs
 */

import { describe, test, expect } from "bun:test";
import {
	addWidget,
	removeWidget,
	updateWidget,
	addDatasource,
	removeDatasource,
	updateDatasource,
	updateLayouts,
	toggleLock,
} from "../state/actions";
import type { Widget, WidgetDefinition } from "../../widgets/widget-interface";
import type {
	Datasource,
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../../datasources/datasource-interface";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeWidgetDef = (
	overrides: Partial<WidgetDefinition> = {},
): WidgetDefinition =>
	({
		id: "test-widget",
		name: "Test Widget",
		schema: {},
		uischema: {},
		data: {},
		Component: () => null,
		...overrides,
	}) as unknown as WidgetDefinition;

const makeWidget = (overrides: Partial<Widget> = {}): Widget => ({
	box_id: "component_0_1000",
	widget_id: "test-widget",
	title: "Test Widget",
	settings: {},
	...overrides,
});

const makeDatasourceDef = (
	overrides: Partial<DatasourceDefinition> = {},
): DatasourceDefinition =>
	({
		id: "test-ds",
		name: "Test DS",
		data: { host: "localhost" },
		schema: {},
		...overrides,
	}) as unknown as DatasourceDefinition;

// ---------------------------------------------------------------------------
// toggleLock
// ---------------------------------------------------------------------------

describe("toggleLock", () => {
	test("false → true", () => {
		expect(toggleLock(false)).toBe(true);
	});

	test("true → false", () => {
		expect(toggleLock(true)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// updateLayouts
// ---------------------------------------------------------------------------

describe("updateLayouts", () => {
	test("returns the next layouts object", () => {
		const current = { grid: { x: 0 } };
		const next = { grid: { x: 1 }, flex: {} };
		expect(updateLayouts(current, next)).toBe(next);
	});

	test("does not mutate the current layouts", () => {
		const current = { grid: {} };
		const frozen = Object.freeze({ ...current });
		const next = { flex: {} };
		expect(() => updateLayouts(frozen as any, next)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// addWidget
// ---------------------------------------------------------------------------

describe("addWidget", () => {
	test("adds a widget with a new unique box_id", () => {
		const widgets = new Map<string, Widget>();
		const def = makeWidgetDef();
		const result = addWidget(widgets, def, { value: 42 });

		expect(result.size).toBe(1);
		const [widget] = result.values();
		expect(widget!.widget_id).toBe("test-widget");
		expect(widget!.settings).toEqual({ value: 42 });
		expect(widget!.box_id).toMatch(/^component_/);
	});

	test("uses titleProp from settings as title when set", () => {
		const def = makeWidgetDef({ titleProp: "label" });
		const result = addWidget(new Map(), def, { label: "My Label" });
		const [widget] = result.values();
		expect(widget!.title).toBe("My Label");
	});

	test("falls back to widget name when titleProp absent", () => {
		const def = makeWidgetDef({ name: "Fallback Widget" });
		const result = addWidget(new Map(), def, {});
		const [widget] = result.values();
		expect(widget!.title).toBe("Fallback Widget");
	});

	test("does not mutate the input map", () => {
		const widgets = new Map<string, Widget>();
		addWidget(widgets, makeWidgetDef(), {});
		expect(widgets.size).toBe(0);
	});

	test("each call generates a distinct box_id", () => {
		const def = makeWidgetDef();
		let widgets = new Map<string, Widget>();
		widgets = addWidget(widgets, def, {});
		widgets = addWidget(widgets, def, {});
		expect(widgets.size).toBe(2);
		const ids = Array.from(widgets.keys());
		expect(ids[0]).not.toBe(ids[1]);
	});

	test("settings are shallow-copied (no shared reference)", () => {
		const settings = { x: 1 };
		const result = addWidget(new Map(), makeWidgetDef(), settings);
		const [widget] = result.values();
		settings.x = 999;
		expect(widget!.settings.x).toBe(1);
	});

	test("handles null settings without throwing", () => {
		expect(() => addWidget(new Map(), makeWidgetDef(), null)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// removeWidget
// ---------------------------------------------------------------------------

describe("removeWidget", () => {
	test("removes the specified widget", () => {
		const widgets = new Map([["box_1", makeWidget({ box_id: "box_1" })]]);
		const result = removeWidget(widgets, "box_1");
		expect(result.size).toBe(0);
	});

	test("does not mutate the input map", () => {
		const widgets = new Map([["box_1", makeWidget({ box_id: "box_1" })]]);
		removeWidget(widgets, "box_1");
		expect(widgets.size).toBe(1);
	});

	test("is a no-op for an unknown box_id", () => {
		const widgets = new Map([["box_1", makeWidget({ box_id: "box_1" })]]);
		const result = removeWidget(widgets, "unknown");
		expect(result.size).toBe(1);
	});

	test("leaves other widgets intact", () => {
		const w1 = makeWidget({ box_id: "box_1" });
		const w2 = makeWidget({ box_id: "box_2" });
		const widgets = new Map([
			["box_1", w1],
			["box_2", w2],
		]);
		const result = removeWidget(widgets, "box_1");
		expect(result.has("box_2")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// updateWidget
// ---------------------------------------------------------------------------

describe("updateWidget", () => {
	const getDefinition = (widgetId: string): WidgetDefinition =>
		makeWidgetDef({ id: widgetId, titleProp: "title" });

	test("updates settings for the given box_id", () => {
		const widget = makeWidget({
			box_id: "box_1",
			widget_id: "test-widget",
		});
		const widgets = new Map([["box_1", widget]]);
		const result = updateWidget(
			widgets,
			"box_1",
			{ title: "New", x: 5 },
			getDefinition,
		);
		expect(result.get("box_1")!.settings).toEqual({ title: "New", x: 5 });
	});

	test("updates title via titleProp", () => {
		const widget = makeWidget({
			box_id: "box_1",
			widget_id: "test-widget",
			title: "Old",
		});
		const widgets = new Map([["box_1", widget]]);
		const result = updateWidget(
			widgets,
			"box_1",
			{ title: "New Title" },
			getDefinition,
		);
		expect(result.get("box_1")!.title).toBe("New Title");
	});

	test("preserves title when titleProp not in settings", () => {
		const getDefNoTitle = () => makeWidgetDef({ titleProp: undefined });
		const widget = makeWidget({ box_id: "box_1", title: "Keep Me" });
		const widgets = new Map([["box_1", widget]]);
		const result = updateWidget(widgets, "box_1", { x: 1 }, getDefNoTitle);
		expect(result.get("box_1")!.title).toBe("Keep Me");
	});

	test("is a no-op for unknown box_id", () => {
		const widgets = new Map([["box_1", makeWidget({ box_id: "box_1" })]]);
		const result = updateWidget(
			widgets,
			"unknown",
			{ x: 9 },
			getDefinition,
		);
		expect(result.get("box_1")!.settings).toEqual({});
	});

	test("does not mutate the input map", () => {
		const widget = makeWidget({ box_id: "box_1" });
		const widgets = new Map([["box_1", widget]]);
		updateWidget(widgets, "box_1", { x: 1 }, getDefinition);
		expect(widgets.get("box_1")!.settings).toEqual({});
	});

	test("settings are shallow-copied", () => {
		const widget = makeWidget({
			box_id: "box_1",
			widget_id: "test-widget",
		});
		const widgets = new Map([["box_1", widget]]);
		const settings = { title: "A" };
		const result = updateWidget(widgets, "box_1", settings, getDefinition);
		settings.title = "Z";
		expect(result.get("box_1")!.settings.title).toBe("A");
	});
});

// ---------------------------------------------------------------------------
// addDatasource
// ---------------------------------------------------------------------------

describe("addDatasource", () => {
	const available = [makeDatasourceDef()];

	test("adds a new datasource", () => {
		const result = addDatasource(new Map(), "test-ds", available);
		expect(result.size).toBe(1);
	});

	test("uses provided settings", () => {
		const settings = { id: "", title: "My DS", host: "example.com" } as any;
		const result = addDatasource(new Map(), "test-ds", available, settings);
		const [ds] = result.values();
		expect(ds!.title).toBe("My DS");
	});

	test("falls back to definition defaults when settings omitted", () => {
		const result = addDatasource(new Map(), "test-ds", available);
		const [ds] = result.values();
		expect(ds!.title).toBe("New Datasource");
	});

	test("injects a unique id into settings", () => {
		const result = addDatasource(new Map(), "test-ds", available);
		const [key, ds] = Array.from(result.entries())[0]!;
		expect(ds!.settings.id).toBe(key);
	});

	test("throws when datasource definition not found", () => {
		expect(() => addDatasource(new Map(), "unknown-ds", available)).toThrow(
			"Datasource unknown-ds not found",
		);
	});

	test("does not mutate the input map", () => {
		const datasources = new Map<string, Datasource>();
		addDatasource(datasources, "test-ds", available);
		expect(datasources.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// removeDatasource
// ---------------------------------------------------------------------------

describe("removeDatasource", () => {
	const makeDs = (id: string): Datasource =>
		({
			datasource_id: "test-ds",
			title: "DS",
			settings: { id, title: "DS" },
		}) as Datasource;

	test("removes the specified datasource", () => {
		const datasources = new Map([["ds_1", makeDs("ds_1")]]);
		const result = removeDatasource(datasources, "ds_1");
		expect(result.size).toBe(0);
	});

	test("is a no-op for unknown id", () => {
		const datasources = new Map([["ds_1", makeDs("ds_1")]]);
		const result = removeDatasource(datasources, "unknown");
		expect(result.size).toBe(1);
	});

	test("does not mutate the input map", () => {
		const datasources = new Map([["ds_1", makeDs("ds_1")]]);
		removeDatasource(datasources, "ds_1");
		expect(datasources.size).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// updateDatasource
// ---------------------------------------------------------------------------

describe("updateDatasource", () => {
	const makeDs = (id: string): Datasource =>
		({
			datasource_id: "test-ds",
			title: "Old Title",
			settings: { id, title: "Old Title" } as DatasourceProviderSettings,
		}) as Datasource;

	test("updates settings and title", () => {
		const datasources = new Map([["ds_1", makeDs("ds_1")]]);
		const newSettings = {
			id: "ds_1",
			title: "New Title",
		} as DatasourceProviderSettings;
		const result = updateDatasource(datasources, newSettings);
		const ds = result.get("ds_1")!;
		expect(ds.title).toBe("New Title");
		expect(ds.settings.title).toBe("New Title");
	});

	test("is a no-op for unknown id", () => {
		const datasources = new Map([["ds_1", makeDs("ds_1")]]);
		const result = updateDatasource(datasources, {
			id: "unknown",
			title: "X",
		} as any);
		expect(result.get("ds_1")!.title).toBe("Old Title");
	});

	test("does not mutate the input map", () => {
		const ds = makeDs("ds_1");
		const datasources = new Map([["ds_1", ds]]);
		updateDatasource(datasources, { id: "ds_1", title: "Changed" } as any);
		expect(datasources.get("ds_1")!.title).toBe("Old Title");
	});
});
