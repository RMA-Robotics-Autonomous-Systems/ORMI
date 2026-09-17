/**
 * Tests for the launcher button's attention signal.
 *
 * What is pinned here is when the button pulses and — more importantly — when
 * it does not: the predicate is read by a component the repo cannot render in a
 * test, so a regression in either direction is invisible until an operator
 * either misses the only next step or learns to ignore a console that never
 * stops moving.
 */

import { describe, test, expect } from "bun:test";

import { shouldCallAttention } from "../launcher-attention";

describe("shouldCallAttention", () => {
	test("pulses on a connected but empty dashboard", () => {
		expect(
			shouldCallAttention({ datasourceCount: 1, widgetCount: 0 }),
		).toBe(true);
	});

	test("stops as soon as one widget exists", () => {
		expect(
			shouldCallAttention({ datasourceCount: 1, widgetCount: 1 }),
		).toBe(false);
	});

	test("stays silent on a populated dashboard", () => {
		expect(
			shouldCallAttention({ datasourceCount: 3, widgetCount: 12 }),
		).toBe(false);
	});

	// The navbar's Datasources button owns this step and is already pulsing;
	// a second control competing for the same attention points at neither.
	test("stays silent while no datasource is configured", () => {
		expect(
			shouldCallAttention({ datasourceCount: 0, widgetCount: 0 }),
		).toBe(false);
	});

	// A workspace can hold widgets whose datasource was removed. The dashboard
	// is not empty, so this button is not the next step either.
	test("stays silent with widgets but no datasource", () => {
		expect(
			shouldCallAttention({ datasourceCount: 0, widgetCount: 4 }),
		).toBe(false);
	});
});
