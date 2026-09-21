/**
 * Registry-level invariant: no shipped datasource puts a credential on the
 * allowlist that the known-datasource rows render.
 *
 * `DatasourceDefinition.summaryProps` is an allowlist declared by the plugin
 * that owns the schema, precisely because a name heuristic over a settings blob
 * **fails open** — it works by luck until somebody names a field `pw`, `c2Auth`
 * or `missionControlToken` next to a `missionControlUrl`, and then it leaks
 * silently instead of erroring loudly. That is why the renderer carries no such
 * heuristic and must never gain one.
 *
 * As a *test*, the same heuristic fails **closed**: it cannot leak anything, it
 * only refuses a declaration an author should not have written. So it is
 * correct here and nowhere else. Do not "fix" it by moving it into
 * `resolveDatasourceSummary`.
 *
 * Definitions are collected the way `definition-defaults.test.tsx` collects
 * them: instantiate every plugin in the generated registry, build a real
 * `PluginsManager`, and apply `DATASOURCES_LIST` inside a React render, because
 * definition factories may call hooks.
 */

import { test, expect, mock } from "bun:test";
import React from "react";

/**
 * Names that must never appear on an allowlist of displayable settings keys.
 *
 * Deliberately broad: a false positive here is an author renaming one field,
 * while a false negative is a credential on an operator's screen.
 */
const CREDENTIAL_NAME =
	/token|secret|password|passwd|credential|apikey|api_key|\bkey\b|auth|bearer/i;

/** Minimal shape this invariant needs from a datasource definition. */
interface CheckableDatasource {
	id?: string;
	summaryProps?: string[];
	data?: Record<string, unknown>;
}

/**
 * Collect every datasource definition registered through the plugin hooks.
 * @returns Datasource definitions, in registration order.
 */
async function collectDatasources(): Promise<CheckableDatasource[]> {
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

	await mock.module("@workspace/ormi-plugins", () => ({
		...pluginsModule,
		usePluginsManager: () => manager,
	}));

	const { renderToStaticMarkup } = await import("react-dom/server");

	let collected: CheckableDatasource[] = [];
	const Probe: React.FC = () => {
		collected = manager.applyFilter<CheckableDatasource[]>(
			PluginsHooks.DATASOURCES_LIST,
			[],
		);
		return null;
	};
	renderToStaticMarkup(React.createElement(Probe));

	return collected;
}

test("no shipped datasource declares a credential-looking key as displayable", async () => {
	const datasources = await collectDatasources();

	expect(datasources.length).toBeGreaterThan(0);
	// Otherwise the whole assertion passes on an empty registry, which is
	// exactly what a build that stopped emitting definitions looks like.
	expect(
		datasources.some(
			(definition) => (definition.summaryProps ?? []).length > 0,
		),
	).toBe(true);

	const violations = datasources.flatMap((definition) =>
		(definition.summaryProps ?? [])
			.filter((property) => CREDENTIAL_NAME.test(property))
			.map(
				(property) =>
					`${definition.id ?? "<unknown datasource>"}.summaryProps lists "${property}", which reads as a credential and must never be rendered`,
			),
	);

	expect(violations).toEqual([]);
});

test("every declared summary key exists in the definition's own data", async () => {
	const datasources = await collectDatasources();

	const violations = datasources.flatMap((definition) =>
		(definition.summaryProps ?? [])
			.filter(
				(property) =>
					!Object.prototype.hasOwnProperty.call(
						definition.data ?? {},
						property,
					),
			)
			.map(
				(property) =>
					`${definition.id ?? "<unknown datasource>"}.summaryProps lists "${property}", which is absent from its own data — the row would show nothing`,
			),
	);

	expect(violations).toEqual([]);
});
