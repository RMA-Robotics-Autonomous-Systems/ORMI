# ORMI Engineering Rules

## Purpose

Provide a clear, repeatable workflow for implementing features in the ORMI React/Next.js app while enforcing repo conventions, avoiding anti-patterns, and producing production-grade tests and documentation.

## Repo Outline (monorepo rules and project file systems)

### Monorepo rules

- apps/: product surfaces and runtime entrypoints.
- packages/: shared libraries and internal core capabilities; stable APIs.
- plugins/: feature extensions that plug into the core; keep scope isolated.
- Prefer changes in packages or plugins instead of apps when logic is reusable.
- Treat core as immutable unless explicitly approved; update docs if core changes.

### Project file systems (top-level map)

```
apps/
    web/                 Next.js app router, UI, and server integration
packages/
    ormi-core/           Core library
    ormi-jsonforms/      JSON forms integration
    ormi-plugins/        Plugin infrastructure
    ui/                  Shared UI components
    utils/               Shared utilities
plugins/
    ormi-*               Plugin implementations, ormi prefix used for included plugins
ormi-doc/                Internal architecture knowledge system (LikeC4 + markdown); local-only, not shipped
```

## Required Inputs

Split into two tiers. Start with must-haves; request nice-to-haves only if ambiguity blocks progress.

### Must-have before starting

- Feature goal and success criteria.
- Target area (core vs plugin) and expected impact.
- Data contracts: inputs, outputs, formats, constraints, and validation rules.

### Request if ambiguous or missing

- User story and UX expectations.
- Data flow and logic flow (diagram or step list). If missing, request it and propose a solution.
- External dependencies, integrations, or API constraints.
- Non-functional requirements: performance, security, accessibility, and rollout constraints.

If documentation is incomplete or missing, request it explicitly before implementation.

## Error Handling Rule

> **When the user provides an error message: do NOT fix it directly. Instead, explain the likely cause and propose a solution for the user to apply.**

This is a behavioral override — agents default to fixing immediately. This rule takes priority.

## Core Immutability Rule

**Core (`packages/ormi-core`) is treated as immutable.** Exceptions require:

1. Explicit user approval.
2. A listed impact analysis of all affected areas.
3. Updated documentation in [apps/web/content/docs](apps/web/content/docs).

All other sections reference this rule. Do not modify core without satisfying all three conditions above.

## Placement Rules

- Detect whether the change belongs in packages or plugins based on intent and scope.
- Packages: internal logic and shared core capabilities.
- Plugins: features that extend the core.
- Core is immutable — see [Core Immutability Rule](#core-immutability-rule).
- No legacy support: if a breaking change is required, get explicit user approval, list all impacted code areas, and update them.

## Conventions and Guardrails

- Follow React/Next.js conventions for file structure, naming, and component patterns.
- Prefer idiomatic app router patterns for data fetching and rendering boundaries.
- Avoid anti-patterns: implicit shared mutable state, side effects in render, heavy logic inside components, and overly broad context providers.
- Keep public APIs typed and stable; add JSDoc for exported or shared modules.
- Respect existing repo formats, linting, and TypeScript configs.
- Datasource subscribe idempotency: Datasource `-subscribe`/`-advertise` actions must be idempotent under re-flush — re-issuing subscribe for an already-subscribed topic must dedupe via refcount, and the action must tolerate an unsubscribe for an in-flight subscribe (the subscription registry re-issues subscribe on reconnect).
- Definitions valid on open: every property a definition lists in `schema.required` must be satisfiable from the definition alone — a value in `data`, or a `default` on the schema property. `WidgetCard` feeds `schema` + `data` straight into JsonForms/AJV and refuses to add while errors are present, so a required property with neither makes the config dialog fail validation before the operator touches anything. A `TopicSelect` binding (`type: "object"`) can never carry an honest default — the datasource does not exist at definition time — so **topics stay out of `required`** and the widget renders a "select a topic" body instead; array-valued properties (`topics`, `series`, `values`) take `[]` in `data`. Enforced repo-wide by `apps/web/__tests__/definition-defaults.test.tsx`, which walks `WIDGETS_LIST` + `DATASOURCES_LIST`.
- Widget offline gating: Single-topic data-display widgets gate their body with `DatasourceGate` (`@workspace/ui`) so an offline datasource shows a clear offline card, not a misleading empty/zero value. Multi-topic widgets degrade per-series via `getTopicHealth`; control/publisher and last-known-value widgets do not blank on offline.
- Control-widget keyboard guard: any control that publishes from a **global** key listener is guarded by default — `useDigitalTrigger` refuses a bound key while the operator is typing (`input`/`textarea`/`select`/`contenteditable`, matched along `event.composedPath()` so a shadow-retargeted target is still caught) or while a modal is open (`[role="dialog"][data-state="open"]`, an ARIA contract Radix sets itself, rather than the `aria-hidden`/`inert` it puts on _background_ content, which a window listener has no element to test against). The guard lives in one place, `packages/ui/src/lib/input-guards.ts` — never re-implement it locally, that is how the defect returns. `shouldHandleKeyboardEvent` can only narrow further; re-admitting a rejected press takes the explicit `allowKeyboardWhileTyping` opt-out, which nothing that reaches a robot may set. **Keyup is deliberately un-guarded**: symmetry is kept by _state_ (a release is honoured only for a press the keydown path started), because re-testing the guard on release would strand a control active — and a robot moving — the moment focus enters a text field while a key is held.
- Page-scoped widgets: a plugin whose widgets only mean anything on its own page registers them from **that page** (an effect that `addFilter`s `WIDGETS_LIST` and `removeFilter`s on unmount), not from the plugin constructor. `WIDGETS_LIST` is global, so a constructor-time filter offers every panel to every workspace in the app, where each resolves no source and renders an offline card. The page must hold `DashboardShell`'s `loading` until the filter is in place — the shell reads `WIDGETS_LIST` during **render**, so an ungated first render resolves an empty registry and a restored layout comes back as "widget not found" tiles. Widgets that are genuinely useful anywhere (and gate themselves on a datasource type per pattern 8) still register from the constructor.
- Registry-before-READY: a datasource provider must call `getDatasourceSubscriptionRegistry(pluginsManager)` **before** it fires `DATASOURCE_READY`. The registry learns which datasources are ready from its own `DATASOURCE_READY` listener, registered in its constructor — a READY fired before the registry existed is one it never hears, and `subscribe` for an unknown-ready datasource parks the intent waiting for a READY that has already happened. The wire then stays idle forever: the datasource connects, enumerates its topics, and delivers nothing. Never rely on a _consumer_ to build the registry first — a consumer that needs a resolved topic list is guaranteed to be later than `init`, which is what fires READY. The call is memoised per manager, so building it eagerly in the provider costs nothing.
- Worker entrypoint imports: a `*.worker.ts` may import **runtime values** only from worker-safe subpaths — `@workspace/ormi-core/datasources/worker`, `@workspace/utils/<subpath>` — never from a barrel that re-exports React components. `@workspace/ormi-core/datasources` re-exports `global-datasource-provider`, which reaches the dashboard barrel, which imports `react-grid-layout/css/styles.css`; the stylesheet then lands in the worker's chunk list and the chunk loader `importScripts()` it, which cannot execute CSS. The worker dies before `init` — every panel reads offline and no load guard can fire, because they all live downstream of a worker that runs. **This is invisible in dev** (source aliases, no CSS chunk split) and fatal only in a production build, so it survives every local check. `import type` from any barrel is fine — it is erased. To verify: `grep '^import' <plugin>/dist/**/*.worker.js` must show no React-barrel specifier.
- HTTPS + `ws://` robots — the main-thread fallback is intentional: production serves the dashboard over HTTPS while robots expose plain `ws://` endpoints. The browser's site-level insecure-content exception applies to the document only, **not to web workers**, so a worker WebSocket to a `ws://` robot is impossible in this deployment. The foxglove plugin's insecure-URL → main-thread routing is deliberate; do not "fix" it by forcing the worker path. Performance work for `ws://` datasources must optimize the main-thread path instead (e.g. coalesce-to-latest per topic before decode/dispatch); the worker path remains for `wss://` / HTTP-served deployments.
- Main-thread decode budgeting: coalesce-to-latest-before-decode only relieves topics faster than the drain rate; expensive payloads (e.g. PointCloud2) additionally require a per-topic decode-rate cap (coalesce to LATEST above the ceiling, never drop the newest) and a per-tick decode time budget that yields the event loop, so a heavy burst cannot starve the main-thread fanout/render loop. Shed frames stay visible via the produced-vs-delivered drop ratio — never hide them.
- Single shared Jotai store: the app has exactly one Jotai store, `appStore` (`packages/ormi-core/src/store.ts`). The React tree is wrapped in `<Provider store={appStore}>`, and every atom writer that runs **outside** React — transforms (`processTFMessage`), remote calls (`setRemoteCalls`), and any future subsystem — must target `appStore`. Never call `getDefaultStore()` or `createStore()` for app state: a write that lands in a store the `<Provider>` does not bind is invisible to `useAtomValue`, which then silently reports empty/stale state (this stranded both the remote-call explorer and the rostainer buttons — writes went to the default store while the tree read from a separate transform store). Hooks reading these atoms pin the store explicitly: `useAtomValue(atom, { store: appStore })`.
- React Compiler + external mutable stores: the web app builds with `reactCompiler: true`, which infers memo dependencies from the callback **body** and drops no-op reads. Never key a `useMemo` on a version counter while the body reads a module-level store (`void version; …, [version]`) — the compiler strips the dead read and freezes the memo on its first result (this stranded every TF widget on stale data in production while the store was fully populated). Hooks over external mutable state must use `useSyncExternalStore` with an identity-stable, change-fresh snapshot, and derived memos must consume that snapshot as a real dependency (reference: `packages/ormi-core/src/transforms/transform-hooks.tsx`).
- Basemap style anchors: ORMI's bundled vector basemap styles (`packages/utils/src/basemap-styles/`) carry four no-op anchor layers over an empty GeoJSON source — `ormi-anchor-imagery` (above the background, below the basemap geometry), `ormi-anchor-overlay` (above the geometry, below the label stack: COG/TiTiler layers, raster overlays, radar), `ormi-anchor-graticule` (directly above it: the coordinate grid) and `ormi-anchor-top` (last layer: anything that must clear the labels). Insert through `insertLayersAt` / `ORMI_STYLE_ANCHORS` (`packages/utils/src/style-layers.ts`), never at a computed index. Two hard rules. **(1) A `beforeId` always comes from `resolveAnchor(style, anchor)`, never a bare anchor constant** — MapLibre `addLayer` THROWS when `beforeId` names a layer the style does not contain, and raster basemaps carry no anchors at all, so a hardcoded anchor blanks the map for every operator who never enabled the feature. `resolveAnchor` returns `undefined` (= append, the pre-anchor behaviour) when the anchor is absent, which is exactly what keeps raster and vector one code path. **(2) A bundled style is only ever obtained from its factory**, which returns a `structuredClone` of a frozen module-level literal; MapLibre consumes and normalises the object it is handed, so two map widgets on one dashboard sharing one style object is an intermittent, unreproducible bug. The style's vector source also keeps its TileJSON `url` and never an inlined `tiles` array — the concrete tile path is date-versioned and rotates weekly, so an inline path passes review and breaks in the field. The catalogue that maps a persisted `mapUrl` to all this lives in `basemap-providers.ts` (absent `kind` means raster); the style payloads are **not** barrel-exported, per the worker-import rule — consumers import `@workspace/utils/basemap-style`. **3D buildings are the basemap's job wherever the basemap can do it.** Every bundled vector style carries a hidden `fill-extrusion` under the id exported as `ORMI_BUILDINGS_3D_LAYER` (`style-layers.ts`, beside the anchors, because it is a property of the styles — never re-declare the literal in a widget, or a rename upstream leaves two toggles silently doing nothing, which only `basemap-styles.test.ts` catches). On vector, showing it costs no fetch, no MapTiler key, real per-building heights, and it follows the view; the layer is `minzoom: 14`, so a toggle that can be ticked below z14 must say so (the C2 map appends "(zoom 14+)" when the basemap is the source) — a control that reads as on and draws nothing, with no explanation, is the same defect as a signal that animates without saying what is wrong. **How the flip is applied is not a style question but a lifecycle one.** A style object the operator's toggle changes makes react-map-gl call `map.setStyle(next, { diff: true })`, and MapLibre diffs the _serialized current style_ — which enumerates every source and layer added **imperatively** — against the new spec, emitting a remove for everything the spec does not contain. react-map-gl's own `<Source>`/`<Layer>` children re-add themselves on the style event; a third-party library that registered its layers once and listens for no style event does not. On the C2 mission map that is terra-draw (`td-point`, `td-linestring`, `td-polygon`…): a 3D toggle rebuilt into the style would delete the authoring tool mid-edit, and the adapter's next `setData` throws on the missing source. So a map that hosts imperative layers keeps its style object stable and flips visibility in place through `setLayerVisibility` (`style-layers.ts`), re-applying on `styledata` because a basemap swap reinstates the layer as shipped; a map that hosts none (the std map) may flip inside the style. The same hazard is why an operator changing the basemap on the C2 map still loses the draw layers — pre-existing, and not to be made routine by adding more style-rebuilding toggles. A raster basemap has no vector geometry, so the same toggle must bring its own footprints — a MapTiler source (std map) or Overpass polygons (C2 mission map) — and the two paths are **mutually exclusive**: a widget that runs both extrudes the same city twice, in two heights and two greys, so the fetch path stands down when `isVectorBasemap(mapUrl)`. Where a fetch feeds something other than the display — C2's Overpass read also imports `risk` features into a mission — that consumer is unaffected by the basemap and keeps fetching.
- Tailwind sources are the one stylesheet's job: the app has exactly one Tailwind entry, `packages/ui/src/styles/globals.css` (imported by `apps/web/app/layout.tsx`), and Tailwind v4 only generates a class it has seen in a scanned file. Automatic detection covers the build's own directory (`apps/web`) and nothing else, so **every plugin is reached only through that file's `@source` globs, which resolve relative to the stylesheet**, not the repo root — `plugins/` is `../../../../plugins` from there. The globs said `../../../plugins`, which is `packages/plugins` and does not exist: for as long as that stood, a plugin class was emitted only when some file under `packages/*/src` happened to use it too, and roughly a fifth of every plugin's classes (`gap-x-3`, `bg-info`, `text-[11px]`, `w-11`, tinted `bg-destructive/10` banners…) silently did nothing. It fails with no error and no warning, and it looks like a plugin that ignored the spacing and theme rules, so it is diagnosed as N styling bugs instead of one path. Verify a class against the served CSS, not the source. Relatedly, `--color-*` variables are declared under `@theme inline` and are **not emitted at runtime** — inline styles and SVG attributes read the raw token, `var(--destructive)`, never `var(--color-destructive)`, which resolves to nothing and paints black.
- Docker image packaging: `Dockerfile.ormi_core` is multi-stage and the shipped stage carries **only** Next's standalone output plus an isolated Prisma CLI — never the workspace `node_modules` (~2.3 GB) or the build toolchain. Three constraints hold it together. **(1)** `apps/web/next.config.mjs` must keep `output: "standalone"` **and** `outputFileTracingRoot` at the workspace root; without that root, tracing stops at `apps/web` and the shipped server cannot resolve the symlinked `@workspace/*` and `ormi-*` packages. **(2)** `.next/static` is **not** traced and must be copied explicitly — a build that only copies `standalone` serves pages with no assets. `apps/web`'s `start:standalone` script does the same copy so a local `bun run start` runs the same server the image does; `next start` does not support standalone output and warns. **(3)** The shipped stage runs the server with **`bun apps/web/server.js`, never `node`**. `apps/web/lib/mdx/render.ts` and the docs page render markdown through `Bun.markdown.render`, so under Node every `/docs` page and the devlog ("What's new") API throw `ReferenceError: Bun is not defined` and return 500 — the app still boots and the dashboard still works, so this passes any smoke test that only checks `/`. Node stays in the image for the Prisma CLI. **(4)** The build stage needs **Bun ≥ 1.4**. Bun 1.2.x resolves the React Compiler's babel plugin relative to next's own bundle instead of the project root, and every `reactCompiler: true` build fails with `Cannot find module '../../node_modules/babel-plugin-react-compiler'`. Root `package.json` still declares `packageManager: bun@1.2.17`; that pin is stale and must not be used to choose the Bun version anywhere. The Dockerfile and `.github/workflows/ci.yml` pin the same explicit version and must be bumped together. The navbar's build stamp rides the same path: `.dockerignore` excludes `.git`, so the image cannot derive it and CI passes `APP_VERSION` as a build argument; it is listed in `turbo.json`'s `build.env` because otherwise turbo replays a cached build and bakes in a stale stamp. Turbopack also emits ~98 MB of server source maps in production builds — the build stage deletes them, and anything that restores them ships debug artefacts to the field, where watchtower pulls make image size deployment latency.
- Multi-arch image publishing: **`linux/arm64` is a production target — ORMI runs on Jetson Orin arm64 robots** — so it is never dropped to shorten the pipeline. The `Deploy` workflow builds `linux/amd64` and `linux/arm64` **natively and in parallel**, one runner per platform (`ubuntu-latest` / `ubuntu-24.04-arm`, free while the repo is public), each pushing by digest, with a final `merge` job assembling the manifest list. Never collapse this back into one job with `docker/setup-qemu-action` and a `platforms: linux/amd64,linux/arm64` build — emulating arm64 on an x86 runner took ~29 minutes of a ~34-minute pipeline. Two properties are load-bearing. **(1)** `:latest` is only written by the `merge` job, so watchtower — which polls that tag every 30s in the field — can never pull a half-published manifest. **(2)** Build cache goes to the registry (`:buildcache-<platform>`), not `type=gha`: the dependency layer alone is ~2.3 GB and would evict everything else from the 10 GB Actions cache. Prisma and sharp resolve their native engines per platform at install time, which is another reason the build must be native rather than emulated.
- Development-only plugins: a plugin that exists to fabricate data (synthetic sources, benchmarking fixtures, demo generators) declares `"ormi_plugin_dev_only": true` next to `"ormi_plugin": true` in its `package.json`, and is then absent from the generated registry whenever `plugin-init` runs with `--production` — which `apps/web`'s `build` script does, while `dev`/`test`/`typecheck` do not. **Gate at registry generation, never at hook registration.** `apps/web/ormi-plugins.ts` is the only module that imports plugin packages, so an omitted entry is unreachable from the module graph and Next emits none of its chunks; a `NODE_ENV` check around `this.addFilter(DATASOURCES_LIST, …)` only hides the entry from the "Add new datasource" list — the `import()` survives, `index.ts` still evaluates `export.ts`, and the whole plugin (workers included) still ships. Verify the way the worker-import rule is verified, against real build output: `grep -rl '<datasource-id>' apps/web/.next/static apps/web/.next/server` must return nothing after `bun run build`. `ORMI_DEV_PLUGINS=1` re-includes them; it is build-time by construction (no runtime flag can restore a chunk that was never emitted), exists so a benchmark can run against a production build — the only build worth profiling — and is therefore listed in `turbo.json`'s `build.env`, or turbo replays a cached build with the wrong registry. Apply the marker only to fixtures: a plugin that presents _recorded real_ data (bag replay, offline analysis) is an operator tool and ships. Be conservative, because a production deployment **cannot currently render a saved workspace that references a gated datasource** — `GlobalDataSourcesProvider` resolves each configured datasource through `getDatasourceDef` during render, which throws for an unknown id under no error boundary. That is core-owned and waits on the unsupported-configuration state.
- Commit messages: do **not** add `Co-Authored-By` trailers or any other agent/tool attribution (no "Generated with", no co-author lines) to commits. Keep the message to the change itself.
- Rolling TODO: keep a bare-minimum `TODO.md` at the repo root as a rolling worklog — what's in flight and what's next, terse, newest first — so work can resume after a pause. Update it as work starts and finishes; it points at the detailed plan docs rather than duplicating them.
- Topic-routing slot markers: a `TopicSelect` on a topic the widget **publishes to** must declare `direction: "publish"` in its `options`. `dataRequirements` cannot tell a publisher from a subscriber — `btn`, `toggle`, `cycle` and both cmd-vel controls declare `accepts: ["number","boolean"]`/`["Movement"]` on the topic they command — so without the marker, "what displays this topic?" answers "a control that publishes to it", and clicking a sensor in the topics list would offer to command a robot. The marker is now half a contract: a topic claim on a publish slot may only be a `"command"`, and any other role on one is **dropped with a warning** rather than honoured (`packages/ormi-core/src/widgets/topic-claims.ts`). Commands are excluded from every _automatic_ routing decision — they are still offered, in commanding vocabulary, on the topic row's own amber affordance. A supporting input that is only meaningful once the primary topic is bound (a heatmap's weighting channel, a local frame's GPS origin, a side-channel profile topic) declares `role: "secondary"`, and a claim naming one is likewise dropped: a supporting input is never what a topic click meant, so make the slot primary if it really should be a destination. Both default to the permissive value (`"subscribe"` / `"primary"`), so a slot that forgets the marker is claimable rather than silently excluded — which is why the rule is on the author, not the walker.
- Routing is claimed, never inferred: which widget a clicked topic opens is **stated** by the plugin that ships that widget, as a `TopicClaim` registered on `PluginsHooks.TOPIC_ROUTING_CLAIMS` (`packages/ormi-core/src/widgets/topic-claims.ts`), and `resolveTopicRoute` reads nothing else. A claim names the topic type (a webapp type name **or** a raw schema name — both are looked up, so a topic that only ever carries a `rawType` is routable), the widget id, the `TopicSelect` slot the value is written into (`"topic"`, or `"topics[].topic"` for an array-backed one — `slotPath` spells it, and the claim must match that string exactly), and a role: **`default`** (opened on a click), **`alternative`** (offered, never automatic), **`command`** (publishes to the topic), **`fallback`** (a raw viewer, claims `"*"`, offered for every type and always last). `priority` is ascending and orders claims of the same role; a `default` wins only when it is _strictly_ lower than every other default for that type, so an exact tie asks. **The division of labour is the point.** `dataRequirements` answers _compatibility_ — may this slot take this topic? — for the config dialog, the pickers, `isTopicCompatible` and auto-bind. A claim answers _routing_ — should a click on this topic open this widget? Conflating them is what this replaced: the old resolver walked every `accepts` list and ran a five-rung ladder (open viewer, preference, sole candidate, narrowest list, sole array-backed), so the mapping was an emergent property of declaration order and list lengths that nobody could state and nobody could see change. `Image` routed correctly for months only because a competing widget declared two malformed raw names in the wrong field, inflating its apparent specificity — _fixing the typo_ would have moved the mapping. Three consequences. **(1)** A type no plugin claims is named, not guessed: an explicit "no widget claims this type", never a fall-through to whatever declared the narrowest list. **(2)** Being a raw viewer is declared, not implied by a missing `dataRequirements` — that inference is what silently offered the ROSTainer status panel for every topic in the build. **(3)** `autoRoute: false` is gone: it was per _slot_, so it could not say "not automatic for `Movement` but still automatic for `IMU`" on a one-slot widget; `role: "alternative"` is per type and says exactly that. Two rules still live in the walker rather than in a claim, because a plugin cannot state them: a slot whose array item schema `required`s a sibling topic is never automatic (appending one alone crashes the tile), and appending to an **already open** widget outranks the claimed default — context is not inference, and it is restricted to widgets that claim the type. Claims are validated against the live registry and dropped with a console warning (never thrown — plugins can be disabled); `apps/web/__tests__/topic-routing-mapping.test.tsx` resolves real topics against the real `WIDGETS_LIST` and the real merged claims, asserts that **no** registered claim is dropped, and holds one hard invariant: no topic type is ever answered _automatically_ with a slot that publishes. A failure there is not automatically a bug; it means the mapping moved and somebody has to agree it moved the right way.

- Stored settings are never rendered as a free-form summary: any surface that displays values out of a persisted `settings` blob renders an **allowlist the definition declares** — never a denylist, never a name heuristic (`/token|secret|password/i`). The allowlist is `DatasourceDefinition.summaryProps` (`packages/ormi-core/src/datasources/datasource-interface.ts`), a list of settings keys the plugin that owns the schema states are safe to show, resolved by the pure `resolveDatasourceSummary` beside the known-datasources rows (`packages/ormi-core/src/datasources/components/known-datasource-list.tsx`) and rendered as one muted line under the title. Datasource settings already carry a bearer credential (`c2-control-source.missionControlToken`, one prefix away from the `missionControlUrl` that _is_ declared), so a heuristic works by luck today and fails silently the day a plugin names a field `pw` or `c2Auth` — and the failure is a **leak** rather than an error. **There is no fallback: a definition that declares nothing displays nothing**, which is the right default for a datasource with no remote to name (`ormi-loadgen`, `ormi-randoms-datasources` declare nothing, deliberately). The helper skips what it cannot honestly show — an undeclared or absent key, a value that is not a `string` or a finite `number`, an empty or whitespace-only string — and returns values verbatim, because truncating is the view's job (CSS `truncate` plus a `title`, never a JS slice). The banned heuristic survives in exactly one place, as a **test**: `apps/web/__tests__/datasource-summary-props.test.tsx` walks `DATASOURCES_LIST` and rejects any declared key matching `/token|secret|password|…/i`, or any key absent from the definition's own `data`. It is correct there and nowhere else — at runtime it fails **open** (it cannot see a field it does not recognise), as a test it fails **closed** (it can only refuse a declaration an author should not have written). Never move it into the renderer. Beyond the declared remote, what distinguishes two stored configurations on screen is their identity and their usage — the title, the type, which workspaces carry them, when they were last used. The row test renders the real C2 shape carrying both a sentinel token and a real Mission Control url and asserts the url IS rendered while the sentinel is NOT, so a regression that swaps the two fields, or a later "just show everything" patch, has to break a test to land.
- A suggestion filters what it cannot honour; a restore names it: the stale-stored-configuration rule above governs _restoring_ committed work — never crash, never silently degrade, name the state unsupported. A surface that only _proposes_ does the opposite and **silently omits** anything whose definition this build lacks, because offering one manufactures an unsupported card out of a clean click. The filter is necessarily client-side: the server has no `DATASOURCES_LIST` (it is a client-side plugin registry, and dev-only plugins are gated out of it at registry generation), so the endpoint returns everything and the UI drops what it cannot resolve. The mirror case is the opposite again — a configuration the _current_ dashboard already carries is **marked, not hidden** (disabled row, "Already in this dashboard", sorted after the actionable ones, compared against live state and not the saved copy), for the same reason `kind: "present"` exists in topic routing: "already on screen" and "nothing can show this" are different answers and telling an operator the wrong one is worse than telling them neither.
- Configuration identity excludes the base settings fields: two datasource instances are the same configuration when `datasource_id` matches and their settings match with the `DatasourceProviderSettings` base fields (`id`, `title`, `enable`) removed — identity is **what the plugin declared**, never what core provides, so the exclusion set is derived from that interface through an exhaustive mapped type rather than written out as a literal triple that a future base field would silently escape. Canonicalisation sorts object keys **recursively** and **never sorts arrays**: order is meaningful in a settings blob, and over-splitting is visible and harmless where over-merging offers the operator the wrong configuration. `undefined` is equivalent to an absent key. The test for membership is whether the row could _explain_ the field: a field the row cannot display belongs out of the key. Lives in `packages/ormi-core/src/datasources/datasource-identity.ts` — React-, icon- and barrel-free, with its own `@workspace/ormi-core/datasources/identity` subpath, because a server route imports it and the datasources barrel reaches the dashboard barrel and `react-grid-layout/css/styles.css`; verify against built output, the way the worker-import rule is verified. It is **not** `datasource-configured.ts`, which answers "has anybody touched this instance yet?" and keeps its own comparison and its own ignored keys on purpose.

- A preconfigured operator surface is a **plugin page**, not a dashboard type: a plugin that ships an arrangement of its own panels registers a `PageDefinition` on `PluginsHooks.PAGES_LIST` and assembles the shell itself — `DashboardShell` + `TemplatesProvider` + `GlobalDataSourcesProvider` + `DashboardEngine` — as `plugins/teodor-emi-extension/src/page/` and `plugins/ormi-c2-control/src/page/` both do. A registered layout engine plus a new `dashboardType` costs three seams a page costs none of: `DashboardEngine` resolves an engine by `id` from the registry, so `dashboardType="FLEX"` renders the built-in FLEX engine with **no core re-export**; nothing is written to the workspace tables, so the workspace-PUT `dashboardType` enum never sees an id it does not know; and the create picker does not have to learn about it. Four properties are load-bearing. **(1) The arrangement is the loaded state, never a seeding pass** — `onLoad(apply)` applies a complete `DashboardInterface` built fresh per call; seeding after load with `addWidget` + `updateLayouts` races the persistence layer, which writes the same atoms. **(2) A panel is seeded from its definition's own `data`, deep-copied** — the host spreads `widget.settings` straight into the component, so a panel seeded with only a title gets `undefined` for every other property and the schema `default` is never consulted (a map with no `mapUrl` has an undefined tile template, not a fallback); copying also keeps the seed from aliasing the registry-shared definition. This is the canonical form and is C2's; the EMI cockpit predates it and still writes its titles and its map settings out as literals, which is exactly the drift the rule describes. Reading the definitions costs one thing, so state it where the seed is: the factories are invoked from **outside render**, and a definition factory may legally call hooks (`ormi-std-widgets`' tree viewer does), so a seeded widget's factory must stay hook-free. **(3) The layout sits under the engine's own `layoutKey`** (`flex` / `grid`) — a layout under the wrong key is not an error anywhere, FlexLayout answers a missing layout by stacking every panel into one tab strip, so the key is asserted by a test. **(4) Autosave is a component inside the shell**, keyed on `hasChanged`: the shell renders a skeleton until `onLoad` resolves, so a child structurally cannot overwrite the saved arrangement with the default. **(5) A page that seeds no datasource must re-assert its own panels past the datasource gate.** `GlobalDataSourcesProvider` registers a `WIDGETS_LIST` filter at `Number.MAX_SAFE_INTEGER` that returns `[]` outright when the dashboard has no datasource configured — a workspace policy that a plugin page trips on its **first open**, because it keeps its own datasource list and starts empty. Everything downstream reads that gated list: `getDefinition` answers the widget-not-found placeholder, so every placed panel renders as an unsupported tile, the rail offers nothing to put one back, and it does **not** heal — the FLEX engine's widget factory caches the element it built per box id, so a panel first resolved as unsupported stays a puzzle icon until the page is reloaded, long after the operator has added the datasource. The fix is a page-scoped filter at `Infinity` priority that appends only the panels the gate removed (idempotent, never duplicates an id — `plugins/ormi-c2-control/src/page/page-panels.ts`), with the page holding the shell's `loading` until it is registered, because the shell reads the list during **render**. Re-admitting a widget that `WIDGET_LIST_WITH_DATASOURCE` hides is correct _on that page only_: the gating still protects every general workspace, while on the surface built for those panels each one reports its own missing datasource in its body, which an operator can act on and a puzzle icon is not. Persistence is the page's own (local storage, versioned key, restored payload validated as a unit) because the workspace tables are reached through `apps/web` Prisma helpers a plugin cannot import. What a page gives up is a named, shareable workspace per surface — the layout is per browser. Whether the panels are registered from the page or from the plugin constructor is the separate page-scoped-widgets question above: page-scoped when they mean nothing on another workspace, constructor when they gate themselves on a datasource type.

- An approved plan stands authoring down, as a **transition** and never as a lock: approving a mission commits its plan to the C2, so the mission map leaves Edit for View by itself rather than staying armed over geometry that has already been dispatched. Four properties, and each of them is the difference between this and a bug. **(1) It is derived, not stored** (`resolveViewOnly` / `isMissionCommitted`, `plugins/ormi-c2-control/src/widgets/map-view-mode.ts`): a status-driven `setState` in an effect re-renders on every feedback message, and silencing `react-hooks/set-state-in-effect` for it would opt the whole 3000-line map body out of React Compiler. **(2) It is a transition, not a lock** — the operator can take Edit back over a committed plan, and the status that permission was granted under is remembered, so the _next_ transition (approved → started) stands the map down again. A plain "committed ⇒ read-only" bounces the Edit button back the instant it is pressed with nothing on screen explaining why. **(3) It is scoped to the mission context.** Map-feature authoring — roads, geofences, risk areas — belongs to the map and not to any mission, so an operator mid-polygon must never be thrown into View because a mission they are not looking at was approved, possibly from another console. **(4) The terminal states are not committed.** A `STOPPED` / `FAILED` / `PLANNED_FAILED` mission is refined and re-submitted, which is authoring; `allowedActions` keeps Submit available there and the two predicates must agree — a status that still offers Approve may never read as committed, which is asserted across the whole enum. Disarming happens where the draw mode is already decided (terra-draw to `static`), not by resetting the tool: the map can enter View on a status change, which is not an event the widget handles, and a tool left armed keeps drawing under a toolbar that has put its controls away. And because nobody pressed anything, the toggle's title says _why_ it is in View — a control whose affordances vanish with no reason given sends the operator to the gear dialog or a reload.

- A created topic is registered, never just returned: a topic the operator creates (`TopicCreatorDialog`) exists on no wire — that is the only reason to create one — so no datasource can answer `AVAILABLE_TOPICS` for it. It must be declared with the created-topics store (`packages/ormi-core/src/datasources/created-topics.ts`), which contributes it to `AVAILABLE_TOPICS` last (so a topic the robot has meanwhile started advertising is not listed twice) and notifies listeners so a list on screen refreshes on the same interaction instead of waiting for its poll. Handing the topic back through `onTopicCreated` alone is what made a new publisher visible only to the picker that created it: the topics panel, every other widget's picker and the routing index were blind to it until the robot itself advertised it, and the operator learned to reload the page. The store carries two kinds of entry, and they are not interchangeable: **declared** (the operator created it — it outlives any widget, for the session) and **retained** (a live `PublisherDataSourcesProvider` is advertising it right now — refcounted, released on unmount, which is what puts a restored control widget's own publish topic back in the list with nothing persisted anywhere). It is process state, not persisted state: a declared topic no widget uses is gone after a reload, by design.
- Commanding costs the same as displaying, in its own affordance: a topic row offers a neutral `+` that places a viewer and an amber `Gamepad2` that places a control, each acting on click when there is one answer and opening its own labelled chooser on a tie. The split is the safety — an operator reading down a column must never pick a control by momentum — so the two never share a menu and the wording (`Display in` / `Command a robot with it`) stays. What must not come back is the **cost asymmetry**: the controls used to live only inside the display chooser, which only opened when the _display_ decision was a tie, so for every topic with an obvious viewer the control was unreachable from the list and placing one meant the widget catalogue plus a topic picker. The command destinations come from `resolveTopicCommands` (`widgets/topic-routing.ts`), which mirrors `resolveTopicRoute`'s precedence exactly — a widget that can _display_ the topic is a viewer and is never also offered as a control — and `resolveTopicRoute` still never returns a publish slot as a `create` or an `append`.

- Architecture knowledge system lockstep: [ormi-doc/](ormi-doc/) is the internal, local-only architecture knowledge base (a LikeC4 model + markdown under `ormi-doc/knowledge/`) and is source-of-truth for platform architecture — when it disagrees with nearby code, it wins. On any structural platform change (new or changed container, component, datasource, plugin, or data-flow edge), update the owning `ormi-doc/knowledge/` file **and** the LikeC4 model in the same change. It is browsed locally (`cd ormi-doc && bun run dev`) and is never built into or shipped with the web app.
- Stale stored configuration is a named state, never a shim: a workspace is persisted as `{ widget_id, settings }` / `{ datasource_id, settings }` and outlives the build that wrote it, so a config this build cannot honour is **expected**. The project carries no legacy shims, so there is exactly one answer: **never crash, never silently degrade, name the state unsupported and require an operator action** (reconfigure, replace, or remove), with the settings explicitly kept as saved. Both surfaces render the same vocabulary — dashed border, muted `PuzzleIcon`, the named id, a Remove — deliberately _not_ error vocabulary (no warning triangle, no stack trace), because an operator must recognise one state whether it is a widget (`widgets/components/widget-status/`) or a datasource (`UnsupportedDatasourceCard`). Two failure modes, and they need different words: the definition is missing from this build (recoverable by enabling the plugin), versus the definition is present but the stored settings no longer satisfy its `schema` — the second is what every widget retirement or schema narrowing produces and is invisible unless detected, because the stale settings otherwise flow into the body and it renders a plausible wrong value. Detection (`findSettingsMismatches`) stays **shallow and conservative** — top-level `required`-without-`default`, declared-`type` contradiction, `enum` miss; combinators, nested objects and array items are skipped wholesale — because a false positive hides a working panel from an operator, which is worse than missing a subtlety the widget can still report itself. Undeclared leftover settings are never a mismatch. The predicates are pure and unit-tested (`widgets/__tests__/unsupported-settings.test.ts`): they rot silently in both directions.
- Operator-facing failures never lead with a raw `error.message`: a per-widget error boundary fallback leads with the widget's identity and the action available ("_<title>_ stopped rendering. Its settings are unchanged. Retry…"), keeps the technical detail behind a disclosure, and logs the error plus component stack to the console. A `TypeError` is a developer artefact; an operator cannot act on it and reading one in a tile teaches them the dashboard is broken rather than that one panel is.
- Definitions are registry-shared and read-only for consumers: the `WidgetDefinition` / `DatasourceDefinition` a component is handed is the one object the registry holds for that type — every instance of that widget resolves the same object. Read it, never write to it. Assigning an instance's settings onto `definition.data` (what "save to templates" did) rewrites the defaults for every widget of that type added afterwards, for the rest of the session, and the operator has no way to see it happened. Build payloads from the instance settings and copy them, so the payload does not alias live state either (`buildWidgetTemplate`, `packages/ormi-core/src/templates/build-widget-template.ts`). The only sanctioned writer is `extensibilityHook`, which runs at registry time, before any instance exists.
- Config dialogs commit only on valid input: the confirm button of a configuration dialog (`WidgetCard`, `DatasourceCard`) must **not** be wrapped in `DialogClose`. Radix closes on click regardless of what the handler decides, so an operator who confirms while AJV reports errors loses the whole edit with no explanation and cannot tell it apart from abandoning. Own the open state, close imperatively after `onValidate`, and always offer a Cancel so discarding is deliberate. Reset the form from the persisted props on every **open**, not once on mount — the gear card stays mounted between opens (`dashboard.tsx` renders it in the tile header whenever unlocked), so an abandoned edit otherwise becomes the starting point of the next one and the form drifts from the widget's real settings. Report errors by **field name**: the shadcn controls render the detail inline, so the toast only names the offending fields and spells out in full just the errors that attach to no field (`packages/ormi-core/src/forms/config-errors.ts`) — never the raw AJV string, which names neither field nor path.
- Losslessness is the consumer's declaration, never the datasource's guess: a datasource that coalesces (foxglove stashes at wire rate and emits latest-per-topic on a ~30 Hz drain tick) delivers the newest message per tick unless the subscriber sets `DatasourceTopic.lossless`. It sits beside `bufferSize` and is the same kind of hint for the same reason — from the wire, a series of samples and a state to be observed are indistinguishable, so only the consumer knows whether it is _observing_ a value or _accumulating_ one. Get it wrong and the failure is silent in the worst way: a widget building a run (a survey, a recorder, an analyser) is wrong by exactly the messages it never saw, and the result is short rather than visibly coarse, so nothing on screen reports it. A topic is **one wire shared by N subscribers**, from which three rules follow — the flag is the **OR** across live intents, it **only ever rises** (lowering it when a lossy subscriber joins drops samples underneath the consumer that asked for them), and it is **not part of the wire key**, so subscribers that disagree still share one subscription. Mark only what is genuinely accumulated: a latest-wins input gains nothing and costs a decode per message. Known limit — `-subscribe` fires once per wire, so raising the requirement on a live wire lands at the next reconnect; subscribe with the flag from the start. The two foxglove classification sites (`foxglove-source.worker.ts` and the main-thread `ws://` path in `subscription-manager.tsx`) mirror each other and must be changed together.
- Topic buffer depth is derived, never asked: `LocalDataSourcesProvider` resolves a topic's history limit as `topic.bufferSize || buffersSize`, so a value persisted on the topic **overrides** the widget's own declaration. The widget knows whether it needs history (a gauge passes `buffersSize={1}`, a timeseries chart `2000`); the operator has no basis to answer, and the picker used to ask them — defaulting to `1`, which silently capped every chart configured through it. The topic picker therefore writes no `bufferSize` unless the widget author declared `options.buffer` on the `TopicSelect` element (positive integer honoured verbatim, anything else ignored — a clamped guess would cap a chart with nobody noticing). Never reintroduce a buffer-size input in the operator's configuration UI. Rule and edge cases live in `packages/ormi-core/src/renderers/topic-selection/topic-auto-select.ts`.
- Auto-bind only on `directMatch`: `TopicSelect` and `FrameSelect` bind themselves when there is exactly one possible answer, but "compatible" is not the test. `analyzeTopicCompatibility` reports `isCompatible: true` for **property** matches too — an `Odometry` is compatible with a `number` slot through `pose.pose.position.x` — and auto-binding one of those plots a number that is plausible and wrong, the one failure mode nobody catches. Auto-binding uses `directMatch` only (`topic.type` in `accepts`, or `topic.rawType` in `acceptsRaw`); property matches stay offered in the picker. A slot with no `dataRequirements`, a wildcard `accepts: ["*"]`, or an existing stored value is never auto-bound. Two further refusals, both because soleness there is an accident rather than a constraint: a **scalar-only** slot (every `accepts` entry in `number`/`integer`/`string`/`boolean` and no `acceptsRaw`) is never auto-bound — a robot publishing hundreds of numeric topics that has not finished enumerating leaves exactly one, and the picker would bind it; naming a raw message type alongside is a deliberate structural declaration and still auto-binds. And a slot marked `role: "secondary"` is never auto-bound — a supporting input is by definition not what the operator's intent determines, so a heatmap's weighting channel must not fill itself. The single gate is `canAutoBindSlot` (`topic-auto-select.ts`); `findSoleDirectMatch` short-circuits on it. The decision is taken **once per control** — on the first non-empty topic list, or once the frame list has settled — and is never revisited: a second compatible topic appearing later must not re-bind under the operator.
- UI state signals are structural, never display strings: an affordance that reports "this is not configured / not done yet" derives that from the data it is about, never from comparing a user-visible label against a literal. The datasource card used to pulse while `data.title === "New Datasource"` — it nagged forever for an operator who set the URL without renaming, and would have nagged forever for everyone the day that string was reworded, localised or seeded differently by a plugin. The replacement, `isDatasourceConfigured(settings, definition)` (`packages/ormi-core/src/datasources/datasource-configured.ts`), asks whether the instance's settings still equal the definition's `data` defaults: `id` is excluded (a per-instance uuid never matches) and `title` is compared against the `NEW_DATASOURCE_TITLE` constant the add path seeds, exported from that same module so the seed and the predicate cannot drift. Predicates of this kind are **pure, exported and unit-tested** — they fail silently and nobody notices. What the signal _renders as_ matters too: the card states it in words (a "Needs setup" badge and a tinted border) rather than only animating, because an animation cannot be read — it says something is wrong without saying what, it is invisible to anyone using reduced motion, and on a wall-mounted console it is just movement in the corner of an operator's eye. The same card carries the datasource's **type** and its **live health**, both of which it already sits inside the state for: a row showing only the operator's own title cannot be told from another of a different type, and says nothing about whether the robot is actually there. And a destructive action is a visible control, never a right-click-only context menu — a `Remove` an operator cannot find is a `Remove` that does not exist, and nesting a button inside a menu inside a button is invalid besides.
- One named default per persisted choice: a value the app falls back to when a record does not carry its own (the workspace layout engine, and anything like it) lives in exactly one exported constant — `DEFAULT_DASHBOARD_TYPE` in `packages/ormi-core/src/dashboard/types.ts` — and every fallback site resolves through it or through the matching resolver (`resolveDashboardType`, `getDashboardTypeMeta`). `"GRID"` was hardcoded in six places (creation dialog, workspace edit, the workspace API route, the dashboard page, two list views); half of them would have been missed when the default moved to FLEX. The resolver substitutes the default **only for a missing or empty value** and returns an unrecognised id untouched — layout engines come from the plugin registry, so a workspace may legitimately persist an id core has never heard of. The module holding it is deliberately React-, icon- and CSS-free and is exposed as its own subpath (`@workspace/ormi-core/dashboard/types`) so a server route can import the default without dragging the dashboard barrel — client components and `react-grid-layout`'s stylesheet — into a server bundle. Changing the default does not touch existing rows: they persist their own value, and Prisma's column default is only a backstop for writes that bypass the API.
- Topic pickers settle once, never live: a `TopicSelect` control latches the **first non-empty** `AVAILABLE_TOPICS` list it sees and offers that list for as long as it stays mounted — both the auto-select decision and the inline candidate list. `AVAILABLE_TOPICS` is a pull filter with no change notification, so the only way to learn about topics is to poll; a picker that re-polls and re-renders its options moves the row out from under the operator's pointer as robots connect and drop. Freezing is the feature. Anything that arrived late is reached through the selection dialog, which re-reads on open. Within the frozen list, candidates are ordered by datasource title then topic name — datasources enumerate in wire order, which differs between connects. **The latch is not a deadline, though: the poll never gives up.** It used to stop after a fixed number of empty lists and latch `[]`, which turned "this robot took longer than twelve seconds to enumerate" into "this dashboard has no topics" — and because a widget's gear card stays mounted between opens, reopening the configuration dialog did not clear it; only a dashboard remount did. The interval backs off towards `SETTLED_TOPICS_MAX_POLL_MS` instead, so an idle dashboard is cheap while a robot powered on an hour later is still picked up. The hook therefore returns a **discriminated union**, never a nullable array: `{ status: "waiting" }` and `{ status: "settled", topics }` are different answers, and a control that renders the first as an empty list tells the operator no topics exist when the truth is that nothing has enumerated yet — a consumer cannot reach `topics` without narrowing. The poll lives in `useSettledTopics` (`packages/ormi-core/src/renderers/topic-selection/use-settled-topics.ts`); never add a second one. **The union is the general rule, not a detail of this hook**: any asynchronously injected list crossing the core boundary — the known datasource configurations the add-datasource dialog reads, and anything like it — is a discriminated union and never a nullable array, because a consumer must not be able to reach the payload without narrowing. "Still loading" rendered as "you have none" is a lie the operator acts on: they go and retype something that was about to appear.
- Inline topic candidates are direct type matches only: the inline radio list a `TopicSelect` renders for a small candidate set (`INLINE_CANDIDATE_MIN`..`INLINE_CANDIDATE_LIMIT` in `topic-inline-candidates.ts`) offers **whole topics whose own type satisfies the slot**, never property matches. A property match — `Odometry` reaching a `number` slot through `pose.pose.position.x` — is a different question (_which field?_) that needs the async property tree only `TopicSelectionDialog` builds; a one-click inline row would bind the whole message into a scalar slot, which is plausible, wrong and silent. Property matches are counted, advertised, and left to the dialog. The inline list also steps aside for any binding it cannot honestly represent (a stored `property`, or a bound topic outside the candidate set) — an unselected radio group next to a live binding is one stray click from erasing it. Every inline list keeps a link through to the dialog: the picker may shrink the common case, never close off the property tree, topic details or the topic creator. `INLINE_CANDIDATE_MIN` rests on "auto-select already took the single-candidate case", so for an **unbound slot that cannot auto-bind** (scalar-only, or `role: "secondary"`) the floor drops to `INLINE_CANDIDATE_MIN_UNBOUND` — otherwise narrowing auto-select would leave the operator a bare button where they used to get a binding. A slot that already holds a value keeps the higher minimum: a lone pre-checked radio next to a live binding decides nothing and is one stray click from erasing it.

- Names derive from the bound topic, they are never asked for: every `name` / `label` / `title` string property that sits beside a `TopicSelect` in the same object takes its value from the topic the operator just bound. The operator already said which thing they meant when they picked the topic — asking them to caption it is asking the same question twice, and the answer they type is almost always the topic name. This holds on **both** paths: the routing path (`seedArrayItem`, `widgets/topic-routing.ts`) and the configuration-dialog path (`renderers/topic-selection/topic-derived-name.ts`), which is where it was missing. Derivation fires only over a **placeholder** — absent, blank, equal to the property's schema `default`, or equal to what the _previously bound_ topic would have produced. Anything else was typed by the operator and is theirs for good. "Was this derived?" is answered by **recomputing** it, never by a persisted flag: a flag written into saved settings outlives the build that wrote it, which is the failure mode the stale-stored-configuration rule exists to prevent. Two narrowings, both because the alternative renames the wrong thing: a `role: "secondary"` slot names nothing (binding a heatmap's weighting channel must not rename the layer after it), and a top-level slot names the widget's own title. Relatedly, a `titleProp` that resolves to nothing falls back to the definition's `name` — `String(undefined)` put the literal text `undefined` on a tab.

- A slot that needs a companion topic is not a destination: a `TopicSelect` inside an array item whose schema `required` also names **another `TopicSelect` in the same item** cannot be routed to automatically, because binding one topic does not produce a working widget. The map's `localTopics.imuTopics` requires `["name", "topic", "gpsOriginTopic"]`, so routing an IMU topic there left `gpsOriginTopic` undefined and the visualizer crashed the tile on `getSource(undefined)`. The rule is read off the schema (`requiresCompanions` on `RoutableSlot`, carrying the missing companions' titles so the UI can name them), never from a list of bad pairings — a required property routing can seed itself (`name`, an enum, anything with a `default`) is deliberately not a companion. Such a slot is still **offered**, with the reason naming what is still needed, so an operator who wants it can pick it and finish the job; it is only never chosen unattended.

- Publish slots are offered, never automatic: a `direction: "publish"` slot is excluded from every **automatic** routing decision — that is the property that stops a sensor topic being silently wired into something that commands a robot, and it is load-bearing. It is not excluded from the **options**: a `/cmd_vel` is the most-clicked topic on any robot, and a dead click there is its own kind of failure. So a publish slot that directly type-matches appears among the offered options, flagged by direction, rendered in its own group with commanding vocabulary ("Command with …") rather than viewing vocabulary; a subscribe match always outranks it, and a topic whose only matches publish always asks. A publish slot that declares no `dataRequirements` is never offered at all — "writes something, somewhere" answers no question. Reachability counts (`countTopicReachable`) follow the options, not the automatic path, so a surface that shows a count and a surface that acts on a click cannot disagree.

- Widen a slot to a wrapper, never to a container: a widget's `accepts` list may be extended to another webapp type only when that type holds **exactly one** field of the shape the widget needs. `Pose` carries one `orientation` and `Transform` one `rotation`, so an attitude indicator reading an orientation can take either — reaching in is not a choice. `Movement` carries `linear` _and_ `angular`; `IMU` carries `linear_acceleration`, `angular_velocity` _and_ `orientation`, two of which are the same shape. Widening to one of those forces the code to pick a field, and a picked field is a guess that renders a plausible wrong number — the failure the auto-route and auto-bind rules exist to prevent. "Which field?" is the property picker's question (`TopicSelectionDialog`), not a widening. Two corollaries. **Structural identity is not semantic identity**: `Quaternion` and `Vector4` have byte-identical schemas, and a slot that accepted both would run Euler conversion over four arbitrary numbers. **And a widening no longer moves the mapping** — routing reads topic claims, not `accepts` lists, so widening only makes the widget selectable for one more type in the pickers and in the config dialog. That is the point of the split: this list is a statement about the widget, and where a topic _goes_ is a separate statement its plugin makes with a `TopicClaim`. If the widening is meant to be reachable from a topic click, add the claim too; otherwise it is dialog-only, which is often exactly right. A widening to a type no converter emits is inert either way — check `unified-converter.ts` on both transports before declaring one, and note that the two do not agree, which is its own bug.

- `AVAILABLE_TOPICS` contributors are total: the hook is applied **sequentially across every configured datasource with no per-contributor isolation** (`applyFilterAsync`, `packages/ormi-plugins/src/plugins/plugins-manager.ts`), so one contributor that throws — or simply never settles — empties the topic list for **every** datasource, for as long as the page is open, and the only recovery is a reload. That is not hypothetical: a worker host pinned a rejected `initPromise` from a first connection attempt against a wrong endpoint and re-awaited it on every poll, which is why a _newly created_ workspace showed no topics while a reloaded one showed them all — a fresh workspace necessarily passes through a phase with the definition's default url, and a restored one does not. A contributor therefore **returns the list it was given on any failure**, and **bounds any wait it cannot guarantee will settle** (a worker that fails to load never runs its own connect timeout, so it neither resolves nor rejects, and a `try`/`catch` does not help). A failed init is _remembered_, never re-thrown forever, so a datasource that recovers starts listing again without a reload. It is a **pull** filter: it resolves settings and state **at call time through refs**, never from the closure of the effect that registered it — a registration-time capture is exactly why renaming a datasource never reached the topic list.

- A `useState` updater over a collection returns `prev` when nothing changed: `GlobalDataSourcesProvider`'s output is memoised on `readyDatasources` / `datasourceStatuses`, and a new identity rebuilds every `<Provider {...datasource.settings} />` with a fresh **props object**; a datasource provider whose connection effect is keyed on the settings _object_ then tears its transport down and rebuilds it, which re-fires `DATASOURCE_READY`, which mints another new Set. `DATASOURCE_READY` is idempotent, documented, repeated traffic (the foxglove subscription manager re-fires it once per stable connection window so the registry re-flushes parked intents), so an unconditional `new Set(prev)` there is not a wasted render — it is an unbounded reconnect loop. Verified against the production bundle, where that provider really is React-Compiler-compiled and really does list both in its memo dependencies.

- A datasource provider keys its connection effect on settings **content**, never identity: `GlobalDataSourcesProvider` spreads `{...datasource.settings}`, so the props object is new on every one of its renders. Settings are persisted as JSON and are plain JSON, so content comparison is honest and cheap; read the value through a ref so the effect does not also depend on it. Keying on identity rebuilds a Web Worker or a robot connection when an unrelated datasource connects or the operator merely opens the Datasources dialog.

- An RPC client rejects in-flight calls on dispose: dropping a pending entry leaves a promise that can never settle, and these are awaited inside hooks applied sequentially across every datasource — so one stalled call hangs the chain exactly as a rejection would, but invisibly. A test asserting such a promise "never settles" is asserting the bug; the leak it claims to prevent is the opposite of what it measures, because an unsettled promise keeps the awaiter's continuation alive.

- A widget that discovers its own topics is claimed without a slot: the diagnostics and battery panels carry no `TopicSelect` at all — they poll `AVAILABLE_TOPICS` for every topic of their type across every datasource and present one merged view. A `TopicClaim` therefore has an **optional** `slot`, and omitting it says "this widget answers this type by finding it itself": routing creates it from the definition's defaults and binds nothing. `ResolvedTopicClaim.slot` and `RoutingOption.slot` are `undefined` for one rather than carrying a stand-in, so every call site that writes a topic has to confront the absence — writing into a path the widget does not have is how an operator ends up believing they bound something they did not. Three consequences that are easy to get wrong. **The routing index must include slotless widgets**: it used to skip any definition with no routable slots, which was right while routing was inferred from slots and silently made every slotless claim unresolvable the moment routing became claimed. **A slotless claim on a widget that _has_ slots is rejected**, because that is a forgotten slot, and honouring it would open the widget with an empty picker. And **an open instance is reported, never duplicated** (`kind: "present"`): it already subscribes to every topic of the type, so a second identical panel shows exactly the same thing — but saying nothing reads as a dead click, which is why this is its own decision kind and not a silent no-op. `"present"` is deliberately distinct from `"none"`: one means the topic is already on screen, the other that nothing can show it, and telling an operator the wrong one of those is worse than telling them neither.

- React Compiler bailout via lint directives: the web app builds with `reactCompiler: true`, and the compiler **skips any component or hook containing an `eslint-disable` for a `react-hooks/*` rule**. Silencing `exhaustive-deps` or `set-state-in-effect` therefore does not just suppress a warning — it opts that whole component out of compilation, losing every memo the compiler would have inferred, with no error and no build output to notice. There are currently ~20 such directives in the repo, several on hot paths (`plugins/ormi-foxglove/src/subscription-manager.tsx`, both `transform-tree-manager.tsx`, the EMI charts). Satisfy the rule honestly instead — add the dependency, hoist the value, or move a ref sync into its own effect (render-phase ref writes are what the compiler's lint rules actually reject). If a directive is genuinely unavoidable, say in the comment that the component is consequently uncompiled, so the cost is visible.

- One topic list, and plugins hand core the previews: the product has exactly one topic list — `TopicsPanel` (`packages/ormi-core/src/dashboard/components/topic-list/`), rendered by the dashboard's topics dialog and by the topics-list widget, which is a thin wrapper around it. Two lists over the same data drift, and the operator is the one who finds out — one gains sorting, the other gains an empty state, and "the topic list" stops meaning anything. The live preview a hovered row shows is a **plugin contribution** read through `PluginsHooks.TOPIC_PREVIEWS`, never a registry core hands out and plugins mutate: a preview mounts a real widget — an image decoder, a chart, a point-cloud scene — so core must be _handed_ it and never import it, and a pull filter also gives deterministic priority ordering where a `register()` singleton gives import-order last-write-wins. Previews are keyed on the webapp `type`; `TOPIC_PREVIEW_FALLBACK` catches every unregistered type, which is what keeps a brand-new message inspectable instead of silently un-previewable. Mounting is deferred until the pointer rests on a row — a preview subscribes, and a list of two hundred topics must not open two hundred streams to draw a table.

## Implementation Patterns

This section captures the approved patterns for common problems. Use these instead of inventing alternatives.

### 1. API Responses — `apiResponse` helper

Use a single `apiResponse(data, status)` helper for all API responses.

```typescript
// apps/web/lib/api-utils.ts
export function apiResponse(data: unknown, status = 200) {
	return NextResponse.json(data, { status });
}
```

```typescript
// ✅ Correct
return apiResponse({ error: "Not found" }, 404);

// ❌ Wrong — never use raw response constructors
return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
return NextResponse.json({ error: "Not found" }, { status: 404 });
```

### 2. Route Validation — Zod on every mutating endpoint

All POST/PUT/PATCH/DELETE routes must parse the body with a Zod schema before processing.

```typescript
const schema = z.object({ name: z.string().min(1) });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return apiResponse({ error: parsed.error.flatten() }, 400);
```

```typescript
// ❌ Wrong — never trust the body without parsing
const body = await request.json();
await db.create({ name: body.name });
```

- GET routes validate query params only when relevant.
- Zod schemas live next to the route or in a shared `validations/` folder.

### 3. Context Providers — `createSafeContext<T>(name)`

Use the `createSafeContext` factory (located at `packages/utils/src/create-safe-context.ts`) for all new contexts. Import it — do not reimplement it.

```typescript
import { createSafeContext } from "@ormi/utils/create-safe-context";

const [DashboardProvider, useDashboard] =
	createSafeContext<DashboardState>("Dashboard");
```

Factory reference:

```typescript
// packages/utils/src/create-safe-context.ts
function createSafeContext<T>(name: string) {
	const Context = createContext<T | undefined>(undefined);
	const useCtx = () => {
		const ctx = useContext(Context);
		if (ctx === undefined)
			throw new Error(`use${name} must be within ${name}Provider`);
		return ctx;
	};
	return [Context.Provider, useCtx] as const;
}
```

- Default is always `undefined`.
- Hook always throws if used outside provider.
- Context name uses PascalCase: `DashboardContext`, `NavbarContext`.
- Split state + actions into two contexts only when the provider is complex (e.g., `DashboardProvider`).

### 4. Plugin Exports — Standard file naming

Standardize on `export.ts` for all definition exports.

```typescript
// export.ts — definitions
export const datasourceDefinition = { id, name, schema, data, Provider };
export const widgetDefinitions = [{ id, name, component, ... }];
export const rendererDefinitions = [{ tester, renderer }];

// index.ts — plugin class
export default class MyPlugin extends Plugin {
	constructor() {
		super();
		this.name = "my-plugin";

		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "my-plugin-datasource",
			priority: 10,
			filter: (datasources) => {
				datasources.push(datasourceDefinition);
				return datasources;
			},
		});
	}
}
```

- Use `export.ts` (or `export.tsx` if JSX needed) for datasource/widget/renderer definitions.
- Keep inline only for trivial 1-2 line callbacks.
- Constructor registers hooks via `this.addFilter()` / `this.addAction()`.
- Filter functions receive array, mutate it, return it.

### 5. Plugin Datasource Providers — Lifecycle components

Plugin datasource providers that pass `null`/empty context values should be plain lifecycle components, not context providers.

**Use a Context provider when:**

- The provider holds shared reactive state that children consume directly (e.g., connection status, client instance).

**Use a plain component when:**

- Data flows solely through `PluginsManager.addFilter/addAction` hooks.
- The context value is `null`, `{}`, or unused.

### 6. Auth Route Wrappers — `withAuth` higher-order handler

Use `withAuth(handler)` wrapper for all authenticated routes.

```typescript
// apps/web/lib/auth/with-auth.ts
export function withAuth(
	handler: (req: Request, session: Session) => Promise<Response>,
) {
	return async (req: Request) => {
		const session = await getServerSession(authOptions);
		if (!session) return apiResponse({ error: "Unauthorized" }, 401);
		return handler(req, session);
	};
}
```

```typescript
// ❌ Wrong — never inline auth checks in route handlers
export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	if (!session) return apiResponse({ error: "Unauthorized" }, 401);
	// ...
}
```

### 7. Server-Side Data Access — Prisma helpers

All Prisma calls must go through dedicated helper files in `apps/web/lib/data/prisma-*.ts`. Do not call Prisma directly from route handlers or components.

```typescript
// ✅ Correct — call a server helper
import { getWorkspaceById } from "@/lib/data/prisma-workspaces";

// ❌ Wrong — never call prisma directly from a route
import { prisma } from "@/lib/prisma";
const workspace = await prisma.workspace.findUnique({ where: { id } });
```

### 8. Widget Gating — Utility function

Extract `filterWidgetsByDatasources(widgets, datasources)` into a shared utility (located at `packages/utils/src/filter-widgets.ts`). Widgets that require a specific datasource type declare their dependency in their definition.

### 9. Client-Side HTTP Requests — Domain API wrappers

Use the shared HTTP client and domain-specific API wrappers for all client-side HTTP operations.

```typescript
// apps/web/lib/http/client.ts
export class HttpClient {
	async get<T>(url: string): Promise<ApiResult<T>> {
		/* ... */
	}
	async post<T>(url: string, data: unknown): Promise<ApiResult<T>> {
		/* ... */
	}
	// ... put, patch, delete
}

export type ApiResult<T> =
	{ ok: true; data: T } | { ok: false; error: string; details?: unknown };

// apps/web/lib/api/workspace-api.ts
export const workspaceApi = {
	async getAll() {
		return httpClient.get<Workspace[]>("/api/workspaces");
	},
	async create(title: string, userId: string) {
		/* ... */
	},
};
```

```typescript
// ❌ Wrong — never use raw fetch() on the client
const res = await fetch("/api/workspaces");
const data = await res.json();
```

- All API wrappers return `ApiResult<T>` for consistent error handling.
- Test API wrappers with Bun test using mocked `httpClient`.
- Route handlers remain independent; this pattern is for client-side code only.

### 10. Widget `Component` — Stable module-level reference

A `WidgetDefinition.Component` must be a **stable, module-level function reference**. The dashboard re-invokes every widget definition factory on each render (intentionally not memoized, since factories may call hooks), and the widget host uses `definition.Component` **directly as the React component type**. An inline arrow in the factory's return produces a new component identity on every render, so React remounts the widget — resetting state, re-running effects, and tearing down any connections/timers it holds.

```typescript
// ✅ Correct — hoisted component, identity stable across factory calls
const MyWidget: React.FC<MyWidgetProps> = (props) => {
	/* ... */
};

export function MyWidgetDefinition(): WidgetDefinition<MyWidgetProps> {
	return {
		id: "my-widget",
		/* ...schema, uischema, data... */
		Component: MyWidget,
	};
}
```

```typescript
// ❌ Wrong — new function identity every render → remounts the widget
Component: (data: MyWidgetProps) => <MyWidget {...data} />;
```

- If props need remapping, do it inside the hoisted component or a module-scope wrapper — never an inline arrow in the factory.
- Rule of thumb: nothing inside a definition factory's `return { … }` may create a new function/component identity per call.

## Reference Docs (review before changes)

- Data flow: [apps/web/content/docs/Data-Flow.md](apps/web/content/docs/Data-Flow.md)
- Plugin system: [apps/web/content/docs/Plugin-System.md](apps/web/content/docs/Plugin-System.md)
- Widgets system: [apps/web/content/docs/Widgets.md](apps/web/content/docs/Widgets.md)
- Harmonization report: [HARMONIZATION_REPORT.md](HARMONIZATION_REPORT.md)
- Architecture knowledge system (internal, local-only): [ormi-doc/](ormi-doc/) — LikeC4 model + `ormi-doc/knowledge/` base

## Workflow

1. **Discovery**
    - Confirm must-have inputs are present; request missing ones before proceeding.
    - Detect whether the change belongs in packages or plugins.
    - If core changes are needed, confirm approval and scope per the [Core Immutability Rule](#core-immutability-rule).
    - If breaking changes are required, present an impact list and get user sign-off.

2. **Design and API preparation**
    - Draft data models, types, and interfaces.
    - Prepare API shape (inputs, outputs, errors) with example usage.
    - Validate the plan against the data flow and plugin system docs.

3. **Implementation plan**
    - Map file-level changes and confirm module boundaries.
    - Ensure naming and patterns match existing conventions.
    - Include JSDoc for exported or shared modules.
    - For breaking changes, enumerate and update every impacted area.

4. **Testing plan (production-oriented)**
    - Write tests that mirror production data and realistic workflows.
    - Prefer tests that detect broken logic and integration regressions.
    - Include error-path and edge-case coverage.
    - If a testing framework is missing, flag it and propose a minimal setup.

5. **Documentation and validation**
    - Update core docs if core changes are introduced.
    - Verify formatting and linting rules.
    - Ensure docs reflect final API and data flow.

## Definition of Done

- Must-have requirements confirmed; ambiguous inputs resolved.
- Data flow and logic flow captured.
- API prepared and validated against patterns.
- Implementation adheres to conventions and all 9 patterns.
- Tests added (or testing gap is documented with a reason).
- Documentation updated for any core changes.
- Any approved breaking changes implemented with all impacted areas updated.
