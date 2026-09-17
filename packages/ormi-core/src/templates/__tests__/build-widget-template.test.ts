/**
 * Tests for widget template construction.
 *
 * Critical: a WidgetDefinition is shared by the registry. Writing an
 * instance's settings onto it hands the template author's configuration to
 * every widget of that type created afterwards, for the rest of the session.
 */

import { describe, test, expect } from "bun:test";
import { buildWidgetTemplate } from "../build-widget-template";
import type { WidgetDefinition } from "../../widgets/widget-interface";

/** Minimal registry definition standing in for a plugin-provided widget. */
function makeDefinition(): WidgetDefinition {
	return {
		id: "gauge",
		name: "Gauge",
		description: "A gauge",
		schema: { type: "object", properties: { topic: { type: "object" } } },
		uischema: { type: "VerticalLayout" } as any,
		data: { topic: undefined, unit: "m/s" },
		Component: (() => null) as any,
	};
}

describe("buildWidgetTemplate", () => {
	test("does not write the instance settings back onto the definition", () => {
		const definition = makeDefinition();
		const defaults = definition.data;

		buildWidgetTemplate(definition, {
			topic: { datasource_id: "ros", name: "/speed" },
			unit: "km/h",
		});

		expect(definition.data).toBe(defaults);
		expect(definition.data).toEqual({ topic: undefined, unit: "m/s" });
	});

	test("a second widget of the same type still gets the definition defaults", () => {
		const definition = makeDefinition();

		buildWidgetTemplate(definition, { unit: "km/h" });

		const second = buildWidgetTemplate(definition, undefined);

		expect(second.widget.settings).toEqual({
			topic: undefined,
			unit: "m/s",
		});
	});

	test("copies the settings so the template does not alias the live widget", () => {
		const definition = makeDefinition();
		const settings: Record<string, unknown> = { unit: "km/h" };

		const template = buildWidgetTemplate(definition, settings);

		settings.unit = "mph";

		expect(template.widget.settings).toEqual({ unit: "km/h" });
	});

	test("builds a widget template from the definition identity", () => {
		const definition = makeDefinition();

		const template = buildWidgetTemplate(definition, { unit: "km/h" });

		expect(template).toEqual({
			name: "Gauge",
			type: "widget",
			widget: {
				widget_id: "gauge",
				box_id: "",
				title: "Gauge",
				settings: { unit: "km/h" },
			},
			public: false,
			tags: [],
			yours: true,
		});
	});

	test("falls back to the definition defaults when no settings are given", () => {
		const definition = makeDefinition();

		const template = buildWidgetTemplate(definition);

		expect(template.widget.settings).toEqual({
			topic: undefined,
			unit: "m/s",
		});
		expect(template.widget.settings).not.toBe(definition.data);
	});
});
