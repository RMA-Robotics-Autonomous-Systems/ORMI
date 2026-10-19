import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

import MapLayerProvidersExport from "./export";

/** Map-server adapters: GeoServer, OGC WMS, TiTiler and XYZ (with the public-overlays preset). */
class MapServersPlugin extends Plugin {
	constructor() {
		super();

		this.name = "Map Servers";
		this.description =
			"Raster map-server adapters for the map-layer registry: GeoServer, OGC WMS, TiTiler and XYZ.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.MAP_LAYER_PROVIDERS, {
			id: "map-servers-providers",
			priority: 10,
			filter: MapLayerProvidersExport,
		});
	}
}

export default MapServersPlugin;
