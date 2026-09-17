/**
 * Tests for the single named dashboard-type default and its resolver. The
 * default used to be duplicated as a `"GRID"` literal across the creation
 * dialog, the workspace API and the dashboard page; these tests pin the one
 * place it now lives.
 */

import { describe, test, expect } from "bun:test";
import {
	DASHBOARD_TYPE_IDS,
	DEFAULT_DASHBOARD_TYPE,
	resolveDashboardType,
} from "../types";

describe("DEFAULT_DASHBOARD_TYPE", () => {
	test("is FLEX", () => {
		expect(DEFAULT_DASHBOARD_TYPE).toBe("FLEX");
	});

	test("is a shipped engine id", () => {
		expect(DASHBOARD_TYPE_IDS).toContain(DEFAULT_DASHBOARD_TYPE);
	});

	test("is the first entry, so pickers open on it", () => {
		expect(DASHBOARD_TYPE_IDS[0]).toBe(DEFAULT_DASHBOARD_TYPE);
	});
});

describe("resolveDashboardType", () => {
	test("keeps a persisted type — existing workspaces are unaffected", () => {
		expect(resolveDashboardType("GRID")).toBe("GRID");
		expect(resolveDashboardType("FLEX")).toBe("FLEX");
	});

	test("keeps an id this module does not know: engines come from plugins", () => {
		expect(resolveDashboardType("PLUGIN_ENGINE")).toBe("PLUGIN_ENGINE");
	});

	test("falls back to the default when nothing is persisted", () => {
		expect(resolveDashboardType(undefined)).toBe(DEFAULT_DASHBOARD_TYPE);
		expect(resolveDashboardType(null)).toBe(DEFAULT_DASHBOARD_TYPE);
		expect(resolveDashboardType("")).toBe(DEFAULT_DASHBOARD_TYPE);
	});
});
