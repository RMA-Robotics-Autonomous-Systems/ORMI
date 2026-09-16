# Map Widgets — API Keys for Carto and Stadia Basemaps

Two of the basemaps ORMI offers now want an API key from you. If your map has gone grey, watermarked, or blank since going live, this is almost certainly why.

## What changed on the provider side

Carto has started watermarking its tiles unless a key is supplied. It does not refuse the request — the tiles still arrive, they just come back stamped "API KEY REQUIRED" across the whole map, which makes it look like a rendering bug rather than an account issue.

Stadia Maps is stricter, but only away from your own machine. Keyless requests are allowed from localhost, so a dashboard built and tested on a laptop looks perfect, and the same dashboard opened from a deployed server gets nothing. That mismatch has caught a few people out: nothing about the dashboard changed between the two, only where the browser was asking from.

## Where to put your key

Both map widgets — the standard map and the mission map — now have a Basemap API Key field in their settings. It appears directly under the basemap picker, and only when you have picked a basemap that actually needs a key. Choose OpenStreetMap and the field disappears again, so there is nothing to fill in that does not apply.

The key is saved with the widget, not with the server, which means each map can use a different account and you do not need an administrator to redeploy anything to change it.

A free Carto key is available at https://carto.com/basemaps/apikey/ and a free Stadia key at https://docs.stadiamaps.com/authentication/. Both take a couple of minutes and neither requires a paid plan for normal dashboard use.

## Everything else is unaffected

OpenStreetMap, OpenStreetMap Humanitarian, OpenTopoMap, the two ArcGIS layers and the two TopPlus layers need no key and behave exactly as before. Existing dashboards keep the basemap they were set to, and a map already on one of the keyless providers needs no attention at all.
