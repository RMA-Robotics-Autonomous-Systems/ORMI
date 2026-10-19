/**
 * Registry-level invariants of every map-server adapter registered on
 * `PluginsHooks.MAP_LAYER_PROVIDERS`, collected the way the app collects
 * them: instantiate every plugin in the generated registry, build a real
 * `PluginsManager`, apply the filter.
 *
 * - The settings form is valid on open: `schema` + `data` pass JSON Forms'
 *   own AJV (`createAjv`), so Settings > Add does not open on errors.
 * - `summaryProps` is an allowlist an author could get wrong: every key must
 *   exist in `data`, and none may be `auth` or look like a credential. The
 *   name heuristic is correct here, as a test, and nowhere at runtime.
 * - `auth.kinds` is non-empty and starts with `"none"`, the default.
 * - Every preset's settings are valid against the adapter's schema.
 */

import { describe, expect, test } from "bun:test";
import { createAjv } from "@jsonforms/core";

import type { MapLayerProviderDefinition } from "@workspace/ormi-core/map-layers/model";

/** Settings keys that must never be shown in a summary. */
const SECRET_LIKE_KEY = /token|secret|password|key|credential/i;

async function collectProviders(): Promise<MapLayerProviderDefinition[]> {
	const pluginsModule = await import("@workspace/ormi-plugins");
	const { PluginsManager, PluginsHooks } = pluginsModule;
	type Plugin = InstanceType<typeof pluginsModule.Plugin>;

	const registry = (await import("../ormi-plugins")).default;
	const plugins = new Map<string, Plugin>();
	for (const pluginPromise of Object.values(registry)) {
		const loaded = (await pluginPromise) as unknown as {
			default: new () => Plugin & { name: string };
		};
		const instance = new loaded.default();
		plugins.set(instance.name, instance);
	}
	const manager = new PluginsManager(plugins);
	return manager.applyFilter<MapLayerProviderDefinition[]>(
		PluginsHooks.MAP_LAYER_PROVIDERS,
		[],
	);
}

/** Validate a copy (AJV `useDefaults` writes into the data it checks). */
function validate(
	provider: MapLayerProviderDefinition,
	settings: unknown,
): string[] {
	const ajv = createAjv();
	const check = ajv.compile(provider.schema as object);
	const ok = check(JSON.parse(JSON.stringify(settings)));
	if (ok) return [];
	return (check.errors ?? []).map(
		(error) => `${error.instancePath || "/"} ${error.message ?? ""}`,
	);
}

const providers = await collectProviders();

describe("MAP_LAYER_PROVIDERS", () => {
	test("at least one adapter is registered, ids unique", () => {
		expect(providers.length).toBeGreaterThan(0);
		const ids = providers.map((provider) => provider.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	for (const provider of providers) {
		describe(provider.id, () => {
			test("settings are valid on open", () => {
				expect(validate(provider, provider.data)).toEqual([]);
			});

			test("summaryProps keys exist in data and are never secret", () => {
				const data = provider.data as unknown as Record<
					string,
					unknown
				>;
				for (const key of provider.summaryProps ?? []) {
					expect(key).not.toBe("auth");
					expect(SECRET_LIKE_KEY.test(key)).toBe(false);
					expect(
						Object.prototype.hasOwnProperty.call(data, key),
					).toBe(true);
				}
			});

			test('auth kinds are non-empty and start with "none"', () => {
				expect(provider.auth.kinds.length).toBeGreaterThan(0);
				expect(provider.auth.kinds[0]).toBe("none");
			});

			for (const preset of provider.presets ?? []) {
				test(`preset ${preset.id} is valid against the schema`, () => {
					expect(validate(provider, preset.settings)).toEqual([]);
				});
			}
		});
	}
});
