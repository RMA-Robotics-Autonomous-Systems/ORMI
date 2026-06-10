/**
 * Tests for deriveHealth — the pure mapping from raw DatasourceStatus to the
 * widget-facing DatasourceHealth used to gate widget UI.
 */

import { describe, test, expect } from "bun:test";
import { deriveHealth, type DatasourceStatus } from "../datasource-interface";

describe("deriveHealth", () => {
	test("'ready' → online", () => {
		expect(deriveHealth("ready")).toBe("online");
	});

	test("'connecting' → connecting", () => {
		expect(deriveHealth("connecting")).toBe("connecting");
	});

	test("'disposed' → offline", () => {
		expect(deriveHealth("disposed")).toBe("offline");
	});

	test("'error' → offline (currently unreachable, still mapped)", () => {
		expect(deriveHealth("error")).toBe("offline");
	});

	test("undefined / missing → connecting", () => {
		expect(deriveHealth(undefined)).toBe("connecting");
	});

	test("maps every raw status to a valid health", () => {
		const statuses: DatasourceStatus[] = [
			"connecting",
			"ready",
			"error",
			"disposed",
		];
		const valid = new Set(["connecting", "online", "offline"]);
		for (const status of statuses) {
			expect(valid.has(deriveHealth(status))).toBe(true);
		}
	});
});
