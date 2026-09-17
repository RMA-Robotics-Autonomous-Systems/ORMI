/**
 * Tests for isDatasourceConfigured — the pure predicate the datasource card
 * pulses on. A silent regression here either nags an operator forever or never
 * asks them to configure anything, and neither is visible in a type check.
 */

import { describe, test, expect } from "bun:test";
import {
	isDatasourceConfigured,
	NEW_DATASOURCE_TITLE,
} from "../datasource-configured";
import { addDatasource } from "../../dashboard/state/actions";
import type {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";

/** Settings shape of the fixture definition below. */
interface FixtureSettings extends DatasourceProviderSettings {
	url: string;
	reconnectTimeout: number;
	topics: string[];
}

/** A definition shaped like the ones the shipped plugins register. */
const definition = {
	id: "fixture",
	name: "Fixture",
	description: "Fixture datasource",
	schema: { type: "object" },
	data: {
		id: "",
		title: "",
		enable: true,
		url: "ws://localhost:9090",
		reconnectTimeout: 2,
		topics: ["/tf", "/tf_static"],
	},
	Provider: () => null,
} as unknown as DatasourceDefinition<FixtureSettings>;

/** Settings a freshly added instance carries. */
const pristine = (): FixtureSettings => ({
	...definition.data,
	id: "datasource_1234",
	title: NEW_DATASOURCE_TITLE,
});

describe("isDatasourceConfigured", () => {
	test("a freshly added instance is not configured", () => {
		expect(isDatasourceConfigured(pristine(), definition)).toBe(false);
	});

	test("missing settings are not configured", () => {
		expect(isDatasourceConfigured(undefined, definition)).toBe(false);
	});

	test("the per-instance id is ignored", () => {
		expect(
			isDatasourceConfigured(
				{ ...pristine(), id: "datasource_completely_different" },
				definition,
			),
		).toBe(false);
	});

	test("changing the url alone configures it, without a rename", () => {
		expect(
			isDatasourceConfigured(
				{ ...pristine(), url: "ws://robot.local:9090" },
				definition,
			),
		).toBe(true);
	});

	test("renaming alone configures it, without touching the url", () => {
		expect(
			isDatasourceConfigured(
				{ ...pristine(), title: "EMI robot" },
				definition,
			),
		).toBe(true);
	});

	test("a changed array value is detected", () => {
		expect(
			isDatasourceConfigured(
				{ ...pristine(), topics: ["/tf"] },
				definition,
			),
		).toBe(true);
	});

	test("an equal-but-not-identical array is still pristine", () => {
		expect(
			isDatasourceConfigured(
				{ ...pristine(), topics: ["/tf", "/tf_static"] },
				definition,
			),
		).toBe(false);
	});

	test("a key the definition no longer carries counts as configured", () => {
		expect(
			isDatasourceConfigured(
				{ ...pristine(), legacyOption: true } as FixtureSettings,
				definition,
			),
		).toBe(true);
	});

	test("a key the settings blob predates counts as configured", () => {
		const withoutField = pristine() as Partial<FixtureSettings>;
		delete withoutField.reconnectTimeout;
		expect(
			isDatasourceConfigured(withoutField as FixtureSettings, definition),
		).toBe(true);
	});

	test("the definition object is never mutated", () => {
		const snapshot = JSON.stringify(definition.data);
		isDatasourceConfigured(
			{ ...pristine(), title: "EMI robot", url: "ws://x:1" },
			definition,
		);
		expect(JSON.stringify(definition.data)).toBe(snapshot);
	});

	test("the add action produces settings this predicate reads as pristine", () => {
		const added = addDatasource(new Map(), "fixture", [
			definition as unknown as DatasourceDefinition,
		]);
		const instance = [...added.values()][0]!;

		expect(
			isDatasourceConfigured(
				instance.settings,
				definition as unknown as DatasourceDefinition,
			),
		).toBe(false);
	});

	test("a template-seeded instance reads as configured", () => {
		const added = addDatasource(
			new Map(),
			"fixture",
			[definition as unknown as DatasourceDefinition],
			{
				...definition.data,
				id: "",
				title: "Saved robot",
				url: "ws://robot.local:9090",
			} as DatasourceProviderSettings,
		);
		const instance = [...added.values()][0]!;

		expect(
			isDatasourceConfigured(
				instance.settings,
				definition as unknown as DatasourceDefinition,
			),
		).toBe(true);
	});
});
