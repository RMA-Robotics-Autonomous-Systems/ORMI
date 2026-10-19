"use client";

import {
	PluginsHooks,
	usePluginFiltersRevision,
	usePluginsManager,
	type PluginsManager,
} from "@workspace/ormi-plugins";

import type { MapLayerProviderDefinition } from "./provider-definition";

/** The hooks {@link useMapLayerProviders} reads, as a module-level array. */
const MAP_LAYER_PROVIDER_HOOKS = [PluginsHooks.MAP_LAYER_PROVIDERS] as const;

/**
 * The registered map-server adapters, re-read whenever a plugin adds or
 * removes one (a filter registered after this component's first render is
 * otherwise invisible to it).
 *
 * The filter is applied during render on a fresh accumulator, which the React
 * Compiler leaves unmemoised, so the re-render the subscription drives is
 * enough. Malformed entries (no `id`) are dropped.
 *
 * @returns The adapters, first registration of an id wins.
 */
export function useMapLayerProviders(): MapLayerProviderDefinition[] {
	const manager = usePluginsManager() as PluginsManager;
	usePluginFiltersRevision(MAP_LAYER_PROVIDER_HOOKS);
	const definitions = manager.applyFilter<MapLayerProviderDefinition[]>(
		PluginsHooks.MAP_LAYER_PROVIDERS,
		[],
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
