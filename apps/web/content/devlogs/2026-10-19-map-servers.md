# Your Map Servers, in Every Map

Putting a GeoTIFF or another raster on a map used to mean pasting a tile URL into each map widget by hand, getting the format right, and doing it again in the next workspace. Now you register a map server once and switch its layers on in any map.

## Register a server once

Open **Settings > Map servers** from your user menu and add a server. Four types are supported:

- **GeoServer**: give it the address (for example `http://localhost:8095/geoserver`) and, if you like, the workspaces to list. It finds every published layer by itself.
- **WMS**: any other WMS server, such as MapServer or QGIS Server.
- **TiTiler**: list the Cloud Optimized GeoTIFFs you want to serve through it.
- **XYZ tiles**: any tile URL with `{z}`, `{x}` and `{y}`.

**Test connection** tells you how many layers it found and fetches one tile to check the map can really draw it. **Refresh** picks up layers added on the server later. If a server needs a login, choose the kind it uses under **Authentication**: a username and password, a token, or a header, depending on the server type. Secrets are hidden as you type them.

The four public overlays the Mission Control map had (sea marks, railways, hiking and cycling routes) are now a ready-made **Public overlays** server you can add in one click.

Your servers belong to your account, so they are available in every workspace, on the Mission Control page, the EMI cockpit and the bag analyzer.

## Switch layers on in any map

Open a map's settings: the **Map layers** section lists every layer of every server you registered, each with a switch and an opacity slider. Opacity is remembered when you switch a layer off. The bag analyzer has the same list on its page.

Small layers are easy to lose on a big map, so each map now shows the layers it draws in a short list, with a button that centres the map on that layer.

Layers stay put when you change the basemap, and they sit under the street names on vector basemaps.

## When something is missing

If a server is removed, or a layer disappears from it, the map's settings name it under **Not available** and keep it as saved until you remove it. A layer whose tiles stop loading is marked **Not responding**.

## What changed

The old **Custom Layers** setting on the map widget and the overlay list on the Mission Control map are gone. Layers saved there are not carried over: register the server once and switch them back on.

A newly added map widget now opens with a basemap instead of a blank map.
