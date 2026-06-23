import { describe, test, expect, mock, beforeEach } from "bun:test";

// save() writes through the workspace API. Replace that module so the import
// stays Node-safe and we can observe exactly what save() sends.
const patchMock = mock(async (_id: number, _body: unknown) => ({
	ok: true as const,
	data: undefined,
}));

mock.module("../workspace-api", () => ({
	workspaceApi: { patch: patchMock },
}));

// Import after the module mock is registered.
const { dashboardApi, toDashboardState } = await import("../dashboard-api");

const emptyLayouts = { lg: [], md: [], sm: [], xs: [], xxs: [] };

describe("toDashboardState", () => {
	test("null content yields default empty dashboard", () => {
		const state = toDashboardState(null);

		expect(state.layouts).toEqual(emptyLayouts);
		expect(state.widgets).toBeInstanceOf(Map);
		expect(state.widgets.size).toBe(0);
		expect(state.datasources).toBeInstanceOf(Map);
		expect(state.datasources.size).toBe(0);
		expect(state.locked).toBe(false);
		expect(state.compactType).toBeNull();
		expect(state.forceReload).toBe(false);
	});

	test("undefined content yields default empty dashboard", () => {
		const state = toDashboardState(undefined);

		expect(state.layouts).toEqual(emptyLayouts);
		expect(state.widgets.size).toBe(0);
		expect(state.datasources.size).toBe(0);
	});

	test("plain-object widgets/datasources (serialized shape) become Maps", () => {
		const state = toDashboardState({
			layouts: emptyLayouts,
			widgets: { w1: { type: "map" } },
			datasources: { d1: { type: "foxglove" } },
		});

		expect(state.widgets).toBeInstanceOf(Map);
		expect(state.widgets.get("w1")).toEqual({ type: "map" });
		expect(state.datasources).toBeInstanceOf(Map);
		expect(state.datasources.get("d1")).toEqual({ type: "foxglove" });
	});

	test("Map widgets/datasources pass through unchanged", () => {
		const widgets = new Map([["w1", { type: "map" }]]);
		const datasources = new Map([["d1", { type: "foxglove" }]]);

		const state = toDashboardState({
			layouts: emptyLayouts,
			widgets,
			datasources,
		});

		expect(state.widgets).toBe(widgets);
		expect(state.datasources).toBe(datasources);
	});

	test("missing widgets/datasources keys yield empty Maps", () => {
		const state = toDashboardState({ layouts: emptyLayouts });

		expect(state.widgets).toBeInstanceOf(Map);
		expect(state.widgets.size).toBe(0);
		expect(state.datasources).toBeInstanceOf(Map);
		expect(state.datasources.size).toBe(0);
	});

	test("locked/compactType default to false/null and forceReload is always reset", () => {
		const defaulted = toDashboardState({
			layouts: emptyLayouts,
			widgets: {},
			datasources: {},
		});
		expect(defaulted.locked).toBe(false);
		expect(defaulted.compactType).toBeNull();
		expect(defaulted.forceReload).toBe(false);

		const explicit = toDashboardState({
			layouts: emptyLayouts,
			widgets: {},
			datasources: {},
			locked: true,
			compactType: "vertical",
			forceReload: true,
		});
		expect(explicit.locked).toBe(true);
		expect(explicit.compactType).toBe("vertical");
		expect(explicit.forceReload).toBe(false);
	});
});

describe("dashboardApi.save", () => {
	beforeEach(() => {
		patchMock.mockClear();
	});

	test("imported dashboard (plain-object widgets/datasources) saves without throwing", async () => {
		// Shape an exported file carries after JSON.parse — plain objects, NOT Maps.
		// Regression: Object.fromEntries() used to throw "is not iterable" here.
		const result = await dashboardApi.save("1", {
			layouts: emptyLayouts,
			widgets: { w1: { type: "map" } } as unknown as Map<string, unknown>,
			datasources: {
				d1: { type: "foxglove" },
			} as unknown as Map<string, unknown>,
		});

		expect(result.ok).toBe(true);
		expect(patchMock).toHaveBeenCalledTimes(1);
		const [id, body] = patchMock.mock.calls[0] as [
			number,
			{ content: { widgets: unknown; datasources: unknown } },
		];
		expect(id).toBe(1);
		expect(body.content.widgets).toEqual({ w1: { type: "map" } });
		expect(body.content.datasources).toEqual({ d1: { type: "foxglove" } });
	});

	test("normal save (real Maps) still serializes to plain objects", async () => {
		const result = await dashboardApi.save("1", {
			layouts: emptyLayouts,
			widgets: new Map([["w1", { type: "map" }]]),
			datasources: new Map(),
		});

		expect(result.ok).toBe(true);
		const [, body] = patchMock.mock.calls[0] as [
			number,
			{ content: { widgets: unknown; datasources: unknown } },
		];
		expect(body.content.widgets).toEqual({ w1: { type: "map" } });
		expect(body.content.datasources).toEqual({});
	});

	test("missing datasources (undefined) does not throw", async () => {
		const result = await dashboardApi.save("1", {
			layouts: emptyLayouts,
			widgets: new Map(),
			datasources: undefined as unknown as Map<string, unknown>,
		});

		expect(result.ok).toBe(true);
		const [, body] = patchMock.mock.calls[0] as [
			number,
			{ content: { datasources: unknown } },
		];
		expect(body.content.datasources).toEqual({});
	});

	test("invalid workspace id is rejected before any network call", async () => {
		const result = await dashboardApi.save("not-a-number", {
			layouts: emptyLayouts,
			widgets: new Map(),
			datasources: new Map(),
		});

		expect(result.ok).toBe(false);
		expect(patchMock).not.toHaveBeenCalled();
	});
});
