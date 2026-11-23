# End-to-end tests (Playwright)

Real-browser tests that drive a **running** ORMI server. They complement the
unit tests where a unit test cannot see the failure: the real MapLibre map, the
real terra-draw, real pointer events.

## Running

```sh
cd apps/web
bun run test:e2e                     # all specs
bun run test:e2e e2e/c2              # one folder
bun run test:e2e --headed            # watch it
```

The suite never starts, stops or rebuilds a server. Start one first; a
production standalone build on `:3000` is the default target.

**Testing plugin source changes needs the root build.** `apps/web` bundles each
plugin from its compiled `dist/`, so after changing plugin code run
`bun run build` at the repository root and restart the server before running
the suite. An `apps/web`-only build serves the old plugin code.

Specs are `*.e2e.ts`. `bun test` collects `*.test.*` and `*.spec.*` only, so
neither `bun test` nor turbo's `test` task runs them.

Playwright is pinned to `1.65.0`, whose Chromium build (1254) is the one in
`~/.cache/ms-playwright`. On a machine without it, run
`bunx playwright install chromium` once.

## Environment

| Variable            | Default                 | Meaning                                                                                                                                                     |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORMI_E2E_BASE_URL` | `http://localhost:3000` | The server under test.                                                                                                                                      |
| `ORMI_E2E_USERNAME` | unset                   | An **existing** ORMI user to sign in as, once, in the global setup. Unset runs signed out, which the C2 page does not mind. The suite never creates a user. |

## What is faked

- **The C2.** `c2/fake-c2.ts` is an in-memory Mission Control (maps, features,
  missions, vehicles, planner) routed with `page.route` on two hosts under
  `.invalid`, which never resolve. The datasource carries a fake token. A request
  to a C2 path the fake does not implement is answered 501 and fails the spec by
  name. No request ever reaches a real C2, or a robot linked to one.
- **A refused request.** `fake.failNext(method, path, { status, message })`
  answers the next matching request with an error (500 by default) and
  leaves the store unchanged; the request is still recorded. Later matching
  requests are served normally.
- **The basemap.** A raster template on a `.invalid` host, answered with a blank
  tile. Any other request leaving the machine is aborted and fails the spec.

## What is seeded

The C2 page keeps its arrangement and datasources in local storage. Each test
runs in a fresh browser context and writes, before the page loads: the mission
map in one panel (with the Assets panel beside it when a spec passes
`{ assets: true }`), the fake C2 datasource, and the newest devlog id (so the
"What's new" dialog does not open over the page). `c2/c2-page.ts` mirrors the
page's storage key; if the page bumps it, the specs fail on a missing map rather
than passing on the default layout.

## Reaching the map

The specs read and drive the map through its MapLibre instance (`project`,
`queryRenderedFeatures`), never pixel guesses. The plugin exposes no handle for
it: `c2/c2-page.ts` walks React DOM's fiber from the `.maplibregl-map` container
to react-map-gl's `MapContext` provider, and fails with a message naming what it
did not find if a React upgrade moves that.
