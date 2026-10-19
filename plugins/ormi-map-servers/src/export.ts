import type { MapLayerProviderDefinition } from "@workspace/ormi-core/map-layers/model";

import { geoserverProvider } from "./adapters/geoserver";
import { ogcWmsProvider } from "./adapters/ogc-wms";
import { titilerProvider } from "./adapters/titiler";
import { xyzProvider } from "./adapters/xyz";

export { geoserverProvider } from "./adapters/geoserver";
export { ogcWmsProvider } from "./adapters/ogc-wms";
export { titilerProvider } from "./adapters/titiler";
export { PUBLIC_OVERLAYS_PRESET, xyzProvider } from "./adapters/xyz";

/** Every adapter this plugin ships, in the order Settings > Add lists them. */
export const mapLayerProviders: readonly MapLayerProviderDefinition[] = [
	geoserverProvider,
	ogcWmsProvider,
	titilerProvider,
	xyzProvider,
];

/** `MAP_LAYER_PROVIDERS` filter: appends this plugin's adapters, skipping ids already registered. */
const MapLayerProvidersExport = (providers: MapLayerProviderDefinition[]) => {
	for (const provider of mapLayerProviders) {
		if (!providers.some((p) => p.id === provider.id))
			providers.push(provider);
	}
	return providers;
};

export default MapLayerProvidersExport;
