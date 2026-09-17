/**
 * Registry-level invariant: a widget/datasource configuration dialog must be
 * valid the moment it opens.
 *
 * `WidgetCard` feeds `definition.schema` and `definition.data` straight into
 * JsonForms, whose AJV instance reports `schema.required` properties that are
 * absent from the initial data as errors — before the operator has touched
 * anything — and `handleAdd` then refuses to add the widget. So every required
 * property must be satisfiable from the definition alone: either a concrete
 * value in `data`, or a `default` on the schema property (which AJV fills in).
 *
 * Definitions are collected the way the dashboard collects them: instantiate
 * every plugin in the generated registry, build a real `PluginsManager`, and
 * apply the `WIDGETS_LIST` / `DATASOURCES_LIST` filters. The filters run inside
 * a React render because definition factories may call hooks
 * (e.g. `usePluginsManager`).
 *
 * Not covered: page-scoped widgets, which register from their own page rather
 * than from the plugin constructor and are therefore not in `WIDGETS_LIST` here.
 */

import { test, expect, mock } from "bun:test";
import React from "react";

/** Minimal shape this invariant needs from a widget/datasource definition. */
interface CheckableDefinition {
	id?: string;
	schema?: {
		required?: string[];
		properties?: Record<string, { default?: unknown } | undefined>;
	};
	data?: Record<string, unknown>;
}

/**
 * Collect every definition registered through the plugin hooks.
 * @returns Widget and datasource definitions, in registration order.
 */
async function collectDefinitions(): Promise<CheckableDefinition[]> {
	const pluginsModule = await import("@workspace/ormi-plugins");
	const { PluginsManager, PluginsHooks } = pluginsModule;
	type Plugin = InstanceType<typeof pluginsModule.Plugin>;

	const registry = (await import("../ormi-plugins")).default;

	// `Plugin.name` is protected, so the registry values are walked untyped —
	// exactly as `PluginsProvider` does when it builds the real manager.
	const plugins = new Map<string, Plugin>();
	for (const pluginPromise of Object.values(registry)) {
		const loaded = (await pluginPromise) as unknown as {
			default: new () => Plugin & { name: string };
		};
		const instance = new loaded.default();
		plugins.set(instance.name, instance);
	}

	const manager = new PluginsManager(plugins);

	// Definition factories that call `usePluginsManager()` need a manager in
	// context; the real provider builds one in an effect, which never runs
	// under `renderToStaticMarkup`, so hand them this one directly.
	await mock.module("@workspace/ormi-plugins", () => ({
		...pluginsModule,
		usePluginsManager: () => manager,
	}));

	const { renderToStaticMarkup } = await import("react-dom/server");

	let collected: CheckableDefinition[] = [];
	const Probe: React.FC = () => {
		collected = [
			...manager.applyFilter<CheckableDefinition[]>(
				PluginsHooks.WIDGETS_LIST,
				[],
			),
			...manager.applyFilter<CheckableDefinition[]>(
				PluginsHooks.DATASOURCES_LIST,
				[],
			),
		];
		return null;
	};
	renderToStaticMarkup(React.createElement(Probe));

	return collected;
}

/**
 * List the required properties a definition cannot satisfy on its own.
 * @param definition - Widget or datasource definition to inspect.
 * @returns Offending property names, empty when the definition is valid on open.
 */
function unsatisfiedRequired(definition: CheckableDefinition): string[] {
	const required = definition.schema?.required ?? [];
	const properties = definition.schema?.properties ?? {};
	const data = definition.data ?? {};

	return required.filter((property) => {
		const hasDataValue =
			Object.prototype.hasOwnProperty.call(data, property) &&
			data[property] !== undefined;
		const hasSchemaDefault =
			properties[property] !== undefined &&
			Object.prototype.hasOwnProperty.call(
				properties[property],
				"default",
			);
		return !hasDataValue && !hasSchemaDefault;
	});
}

test("every registered definition opens valid: required properties have a default", async () => {
	const definitions = await collectDefinitions();

	expect(definitions.length).toBeGreaterThan(0);

	const violations = definitions.flatMap((definition) =>
		unsatisfiedRequired(definition).map(
			(property) =>
				`${definition.id ?? "<unknown definition>"}.${property} is in schema.required but has no value in data and no default in schema`,
		),
	);

	expect(violations).toEqual([]);
});
