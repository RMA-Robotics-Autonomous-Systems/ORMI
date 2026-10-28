"use client";

import { PluginsHooks, usePluginFilter } from "@workspace/ormi-plugins";

import type { MapLayerProviderDefinition } from "./provider-definition";

/** The hooks {@link useMapLayerProviders} reads, as a module-level array. */
const MAP_LAYER_PROVIDER_HOOKS = [PluginsHooks.MAP_LAYER_PROVIDERS] as const;
const noProviders = (): MapLayerProviderDefinition[] => [];

/**
 * The registered map-server adapters, re-read whenever a plugin adds or
 * removes one (a filter registered after this component's first render is
 * otherwise invisible to it).
 *
 * Read through `usePluginFilter`, whose read is keyed on the registration
 * revision: the React Compiler memoises a bare `applyFilter` on the manager
 * alone, so a re-render would hand back the first result. Malformed entries
 * (no `id`) are dropped.
 *
 * @returns The adapters, first registration of an id wins.
 */
export function useMapLayerProviders(): MapLayerProviderDefinition[] {
	const definitions = usePluginFilter(
		PluginsHooks.MAP_LAYER_PROVIDERS,
		noProviders,
		MAP_LAYER_PROVIDER_HOOKS,
	);
	const seen = new Set<string>();
	const providers: MapLayerProviderDefinition[] = [];
	for (const definition of definitions) {
		if (!definition?.id || seen.has(definition.id)) continue;
		seen.add(definition.id);
		providers.push(definition);
	}
	return providers;
}
