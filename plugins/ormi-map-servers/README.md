# ormi-map-servers

Raster map-server adapters for ORMI's map-layer registry. An operator registers a server once, on
**Settings > Map servers**, and switches its layers on in any map widget's configuration dialog.
Core (`packages/ormi-core/src/map-layers`) owns the contract and the registry; this plugin ships
the server types, registered on `PluginsHooks.MAP_LAYER_PROVIDERS` from the plugin constructor.

Discovery and tiles are fetched by the browser, directly from the server. Nothing goes through the
ORMI server, so a URL means what it means on the operator's machine (`http://localhost:8095` is
their GeoServer, not the ORMI container).

## Adapters

| Id          | Name      | Settings                                                                                  | Auth                                                                 |
| ----------- | --------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `geoserver` | GeoServer | `url`, `workspaces: string[]`, `format`, `preferWms`, `auth`                              | none, basic, URL token (`authkey`)                                   |
| `ogc-wms`   | OGC WMS   | `url` (the service endpoint), `format`, `auth`                                            | none, basic                                                          |
| `titiler`   | TiTiler   | `url`, `cogs: { title, url, rescale?, colormap? }[]`, `auth`                              | none, bearer, URL token (`access_token`)                             |
| `xyz`       | XYZ tiles | `url`, `layers: { title, template, minzoom?, maxzoom?, bounds?, attribution? }[]`, `auth` | none, URL token (parameter name stored with the auth), custom header |

Every adapter's `summaryProps` is `["url"]`. `auth` is the schema fragment core builds
(`mapServerAuthProperty`), so secret fields are marked by core, never by the adapter.

### GeoServer

Reads two documents, both anonymous on a stock GeoServer, and never the REST API (which needs an
admin account):

1. `{url}/gwc/service/wmts?REQUEST=GetCapabilities`. A layer linking the `EPSG:900913` gridset
   (or another Web Mercator quadtree set) is drawn from cached tiles:
   `{url}/gwc/service/wmts/rest/{layer}/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/png`.
   `TileRow` is `{y}` and `TileCol` is `{x}`; swapped, GeoServer answers 400. Bounds come from
   `WGS84BoundingBox`, `maxzoom` from the deepest published matrix (30 on a stock gridset; core
   clamps it to the map's ceiling).
2. `{url}/ows?service=WMS&version=1.3.0&request=GetCapabilities`. A layer GeoWebCache does not
   cache, or every layer with `preferWms`, is drawn through GetMap in EPSG:3857, 256 px,
   transparent, with MapLibre's `{bbox-epsg-3857}` placeholder.

Either document alone is enough. `workspaces` keeps layers whose name starts with one of the
listed `ws:` prefixes (case-insensitive), which is how the demo layers (`nurc:*`, `sf:*`,
`topp:*`, `tiger:*`) are left out. Empty lists everything.

### OGC WMS

The URL is the service endpoint, used for GetMap as well; the `OnlineResource` a server
advertises is ignored (behind a proxy it is often an internal host, and auth headers are only
sent under the registered URL). Query parameters on the endpoint, such as MapServer's `map=`, are
kept.

### TiTiler

TiTiler has no catalogue, so the operator lists the COGs. Discovery reads each COG's
`/cog/WebMercatorQuad/tilejson.json?url=…` for bounds and zooms. Tiles come from
`/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=…`, built here rather than copied from the TileJSON,
which echoes the request's `access_token`.

### XYZ

Discovery echoes the configured layers after checking each template has `{z}`, `{x}` and `{y}`.
`{a-c}` expands to one template per subdomain (MapLibre does not expand Leaflet's `{s}`). The
`url` is the registration's identity and the scope of header auth; a relative template is resolved
against it.

The **Public overlays** preset (`public-overlays`) is C2's four keyless overlays: OpenSeaMap,
OpenRailwayMap, Waymarked Trails (hiking) and CyclOSM. Added, it is an ordinary stored server. Its
URL, `https://public-overlays.invalid`, is identity only: the layers live on four unrelated hosts
and the `.invalid` TLD never resolves.

## Discovery failures

| Reason             | When                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| `blocked-insecure` | Before any request: an `http:` URL that is not loopback, from an `https:` page.  |
| `unauthorized`     | The server answered 401 or 403.                                                  |
| `cors`             | `fetch` rejected, but an opaque `no-cors` probe (no auth) got an answer.         |
| `unreachable`      | `fetch` rejected and the probe did too, or the server answered 5xx.              |
| `not-a-server`     | Any other answer that is not the expected document (404, HTML, bad XML or JSON). |

An abort is re-thrown, never reported as a failure.

## Writing another adapter

Implement `MapLayerProviderDefinition` from `@workspace/ormi-core/map-layers/model`:

- `data` must satisfy every `schema.required` (valid on open).
- `discover` fetches only through `ctx.fetch`, which applies the stored auth, and reports expected
  failures as a `DiscoveryResult` error rather than throwing.
- `toSource` is pure and synchronous and never carries a credential: core appends auth query
  parameters, sets `bounds` and clamps `maxzoom`.
- `params` on a catalogue entry is adapter-private and never holds a credential.
- Import runtime values only from the `map-layers/model` subpath, never a React barrel.

## Tests

`bun test src`. XML is parsed with the browser's `DOMParser` in the app and with `@xmldom/xmldom`
under Bun (the repo has no DOM test environment). The capabilities fixtures in
`src/__tests__/fixtures` were captured from GeoServer 2.27.1 and trimmed to six layers (the three
aidedex layers and three demo layers) and four zoom levels per gridset.
