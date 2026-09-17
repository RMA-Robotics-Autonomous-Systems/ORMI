# Widgets, Renderers, Transforms & Templates

> Internal source-of-truth knowledge base for the widget/renderer/transform/
> template layer. When it disagrees with code, this file wins — update it and the
> LikeC4 model in lockstep on structural changes.

## Widgets

A widget is a React component plus a JSON-Schema-driven config surface.

### Widget definition contract

| Field                     | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `id`                      | Unique widget id                                                  |
| `name`, `description`     | Display metadata (picker)                                         |
| `Component`               | Typed React component receiving resolved settings as props        |
| `schema`                  | JSON Schema for settings validation                               |
| `uischema`                | JSON Forms layout for the settings UI                             |
| `data`                    | Default/initial settings (partial)                                |
| `titleProp` (opt)         | Settings property used as the widget title                        |
| `extensibilityHook` (opt) | Post-registration mutation of the definition via `pluginsManager` |

```typescript
// Stable, module-level component — referenced by the definition below.
const MyWidget = ({ title }: { title: string }) => <div>{title}</div>;

export function MyWidgetDefinition(): WidgetDefinition<{ title: string }> {
	return {
		id: "my-widget",
		name: "My Widget",
		titleProp: "title",
		schema: { type: "object", properties: { title: { type: "string" } } },
		uischema: { type: "VerticalLayout", elements: [{ scope: "#/properties/title" }] },
		data: { title: "Default" },
		Component: MyWidget,
	};
}
```

> **Pattern 10 — `Component` must be a stable, module-level reference.** The
> dashboard re-invokes every widget definition factory on each render (factories
> may call hooks, so they are intentionally not memoized) and uses
> `definition.Component` directly as the component type. An inline arrow in the
> factory's `return` produces a new component identity each render → React
> remounts the widget, resetting state, re-running effects, tearing down
> connections/timers. Remap props inside the hoisted component or a module-scope
> wrapper — never an inline arrow.

> **A registry definition is shared, so consumers only ever read it.** One
> `WidgetDefinition` backs every widget of its type; writing instance settings
> back onto it (`definition.data = props.data`, as the "save as template" button
> used to do) hands one operator's configuration to every widget of that type
> added afterwards, in the same session, with nothing to show where it came
> from. Build a new payload instead and copy the settings — see
> `buildWidgetTemplate` (`ormi-core/templates/build-widget-template.ts`), which
> also keeps the template from aliasing the live widget's settings object.

### Special JSON Forms UI elements

| Element       | Purpose                            | Usage                                                                                                          |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TopicSelect` | Select a topic with type filtering | `{ type: "TopicSelect", scope: "#/properties/topic", options: { dataRequirements: { accepts: ["number"] } } }` |
| `FrameSelect` | Select a coordinate frame          | `{ type: "FrameSelect", scope: "#/properties/frameId" }`                                                       |

`dataRequirements.accepts` is how a widget declares which webapp types it can bind
to (there is no `supportedTypes` field).

#### Compatibility is not routing

`dataRequirements` answers one question — _may_ this slot take this topic? — and
drives the configuration dialog, the topic pickers, auto-bind and
`isTopicCompatible`. It does **not** decide where a clicked topic goes.

Topic-first routing is **claimed, never inferred**. The plugin that ships a
widget registers a `TopicClaim` on `PluginsHooks.TOPIC_ROUTING_CLAIMS` naming the
topic type (webapp name or raw schema name), the widget id, the `TopicSelect`
slot (`"topic"`, or `"topics[].topic"` for an array-backed one) and a role:
`default` (opened on a click), `alternative` (offered, never automatic),
`command` (publishes to the topic) or `fallback` (a raw viewer, offered for any
type, last). `resolveTopicRoute` reads nothing else; a type nothing claims gives
an explicit "no widget claims this type".

It used to infer the mapping by walking every `accepts` list and running a ladder
(sole candidate, narrowest list, sole array-backed), so the mapping fell out of
declaration order and list lengths — `Image` routed correctly only because a
competing widget's list held two misspelled raw names that inflated its apparent
specificity. Widening an `accepts` list is therefore now a local change: it makes
the widget selectable for one more type in the pickers and moves no mapping.

Claims are validated against the live registry and **dropped with a warning**
when they name a missing widget, a missing slot, a publish slot without
`role: "command"`, or a `role: "secondary"` slot. `isTopicReachable` — the count
the topics panel footer shows — is simply "some plugin claims this widget".

#### Auto-binding an unambiguous slot

Both pickers bind themselves when there is only one answer, so the common case —
one robot, one matching topic — costs no modal trip.

- **`TopicSelect`** binds when exactly one available topic is a **direct type
  match** (`topic.type ∈ accepts`, or `topic.rawType ∈ acceptsRaw`). Direct match
  only: `analyzeTopicCompatibility` also reports `isCompatible: true` for
  **property** matches (an `Odometry` satisfies a number slot through
  `pose.pose.position.x`), and binding one of those unattended would plot a
  number that is plausible and wrong — the one failure mode nobody catches. A
  property match is still offered in the dialog, it is just never chosen for the
  operator. Two distinct direct matches (the same message type on two robots)
  are ambiguous and bind nothing.
- **`FrameSelect`** waits for the transform tree to **settle** (~1.5 s with an
  unchanged frame list) before deciding. A TF tree fills in edge by edge, so the
  first non-empty list routinely holds one frame that is about to be joined by
  others; settling is what makes "exactly one frame" mean the tree has one
  rather than has one _so far_.

Two mechanics follow from how each list is obtained. `AVAILABLE_TOPICS` is a
**pull filter with no change notification**, so `TopicSelect` polls it (1.5 s,
capped attempts) and the first non-empty list decides; the frame list is a
reactive store, so `FrameSelect` keys its settle timer on the frame list's
content instead. Either way **the decision is taken once and never revisited** —
a topic or frame appearing later must not re-bind under an operator who is
already reading the widget. The operator can always change the value.

Pure decision logic (`findSoleDirectMatch`, `deriveTopicBufferSize`,
`buildSelectedTopic`) lives in
`ormi-core/renderers/topic-selection/topic-auto-select.ts`, apart from the React
control, because a silently wrong answer from either question is invisible in the
running dashboard.

### Per-widget error boundary

The dashboard host wraps every widget body in its own error boundary. A widget
that throws (render or lifecycle) shows a localized fallback with a manual
**Retry** — it does not crash the rest of the dashboard. The boundary resets when
the widget id changes, so a transient throw (e.g. data briefly absent before a
datasource is ready) clears once inputs change. You don't add the boundary.

### Datasource health & offline gating

Widgets mount **before** their datasources connect, so a data-display widget must
say something useful while its datasource is `connecting`/`offline` instead of
rendering a misleading empty/zero value. `useLocalDataSource()` exposes:

- `health` — aggregate worst-case across the provider's topics
  (`offline` if any topic is offline, else `connecting` if any is connecting,
  else `online`).
- `getTopicHealth(topic)` — health of a single topic's datasource.

Health ∈ `connecting | online | offline`.

**Standard pattern:** single-topic value/status display widgets wrap their body in
`<DatasourceGate>` (`@workspace/ui/components/datasource-gate`), which renders the
body only while `online` and otherwise shows a clear offline/connecting card.

```typescript
<DatasourceGate health={health} title={props.topic.source.title}>
	{/* body — only rendered while online */}
</DatasourceGate>
```

**Do NOT blank the whole widget when:**

- **Multi-topic** widgets — degrade per series via `getTopicHealth(topic)`, not on
  the aggregate `health`.
- **Control/publisher** and **history/last-known-value** widgets — keep showing
  buffered data / stay interactive.

### Control widgets: a bound key is not always a command

Control widgets (`btn`, `toggle`, `cycle`, the cmd_vel keyboard/joystick panels,
the Tello command panel) bind a single character and listen on `window`. Without
a guard, that character typed into the widget search box, a JSON-Forms config
field or a workspace name reaches the robot — every `cmd_vel` and Tello control
published on a raw global keydown.

`useDigitalTrigger` (`@workspace/ui`) therefore applies a **default-on** guard:
a bound key is ignored while the operator is typing in an editable element
(`input`/`textarea`/`select`/`contenteditable`, resolved through
`event.composedPath()` so a shadow-root field is not missed) or while a Radix
dialog/alert-dialog is open. The predicates are pure and live on their own in
`packages/ui/src/lib/input-guards.ts`, so they are unit-testable without a DOM
and fail **open on a missing DOM** — they never manufacture a block where there
is no document to inspect.

Three properties are load-bearing:

- **Opt-out, not opt-in.** `allowKeyboardWhileTyping` exists for bindings that
  genuinely must fire inside a field (a binding picker); anything reaching a
  robot leaves it `false`. A widget author who forgets the guard gets the safe
  behaviour.
- **`shouldHandleKeyboardEvent` can only narrow.** It runs after the guard and
  can reject a press the guard accepted — never re-admit one it rejected.
- **Release is symmetric by state, not by predicate.** A keyup deactivates only a
  press the keydown path actually started. Re-testing the guard on release would
  strand a control active — focus can move into a text field while a key is
  held, and a suppressed release leaves the robot moving.

### Widget picker

The floating "+" picker groups widgets by the contributing plugin. Attribution is
automatic (provenance-based): each plugin's `WIDGETS_LIST` filters run in
isolation and the resulting widgets are attributed to that plugin — no field is
added to `WidgetDefinition`. Widgets natural-sort within a group ("Camera 2"
before "Camera 10"); a search box filters by name/description, hiding empty groups.

---

## Renderers

Renderers draw widget/datasource **configuration controls**. ORMI defines no
renderer type of its own — a renderer is a standard JSON Forms
`JsonFormsRendererRegistryEntry`: a `{ tester, renderer }` pair where the `tester`
decides by **rank** whether the `renderer` handles a given control.

Each form composes several renderer sets and lets JSON Forms pick the
highest-ranked match per control, in order:

1. `materialRenderers` / `shadcnRenderer` — base controls (`@workspace/ormi-jsonforms`)
2. `coreRenderer` — ORMI built-in controls (`@workspace/ormi-core/renderers`)
3. anything plugins add via the `JSON_FORMS_RENDERER` hook

Built-in core renderers are the topic and frame pickers:

```typescript
export const coreRenderer: JsonFormsRendererRegistryEntry[] = [
	{ tester: topicSelectTester, renderer: TopicSelectRenderer },
	{ tester: frameSelectTester, renderer: FrameSelectRenderer },
];
```

Plugins register extra `{ tester, renderer }` entries on `JSON_FORMS_RENDERER`.
Selection is by tester rank — there is **no** `options.renderer` string id and no
`RENDERERS_LIST` hook. Real example:
`plugins/ormi-foxglove/` → `url-with-button-renderer.tsx`.

### Datasource pick-lists

A widget that pins itself to ONE configured datasource stores that datasource's
_instance_ id (`datasource_<uuid>`, i.e. `Datasource.settings.id` — not the
definition id). As a plain `{ type: "string" }` property that renders as a text
box the operator has to fill from memory, so the field is rewritten into a
`oneOf` of `{ const, title }` members — the same shape `basemapOneOf()` produces,
but built at runtime from the datasources actually configured.

`createDatasourceSelectHook({ field, definitionId, autoLabel? })`
(`packages/utils/src/datasource-select-schema.ts`) returns a
`WidgetDefinition.extensibilityHook`. The dashboard shell runs that hook on every
render with the live `PluginsManager`, so the hook resolves
`AVAILABLE_DATASOURCES`, keeps the instances whose _definition_ id matches, and
replaces the property with the pick-list. Persisted values are unchanged.

Two rules keep it safe:

- **No match → no rewrite.** An empty `oneOf` is invalid schema, and a widget
  whose datasource is not configured (or not loaded yet) must stay configurable,
  so the property is left as the free-text field.
- **`autoLabel` only where unset is meaningful.** The five C2 widgets resolve
  their `c2.*` remote calls across every datasource when the field is blank, so
  they get a leading `{ const: "" }` "automatic" member — the value they already
  treat as unset — and the operator can go back to it. Widgets that build a
  per-instance hook name from the id (`rqt-graph`, the Tello command widget, both
  RestBag widgets) need a concrete datasource and get no empty member.

### Config dialogs commit only valid input

`WidgetCard` and `DatasourceCard` render the JSON Forms config surface in a
dialog. The confirm button **does not close the dialog when AJV reports errors**:
it keeps the dialog open and raises one notice naming the offending fields.
Previously the trigger was a `DialogClose`, so an invalid confirm toasted and
closed anyway — dropping the edit with no way back to it.

The notice is built by `ormi-core/forms/config-errors.ts`, which splits errors by
whether the operator can already see them: a field that carries its own inline
error contributes only its **label**, and only errors that resolve to no field
(and would therefore appear nowhere) contribute their message. `required` errors
are reported by AJV on the parent object, so the missing property name is what
names the field.

Two supporting rules: reopening the dialog reloads the persisted settings, so an
abandoned edit is not the starting point of the next one; and the dialog seeds
its state from `props.data ?? definition.data` at mount rather than through a
mount-only effect.

This is why definitions must be **valid on open** (see `AGENTS.md`): the card
feeds `schema` + `data` straight into JsonForms/AJV, so a `schema.required`
property with neither a value in `data` nor a `default` now makes the dialog
un-confirmable before the operator has touched anything.

---

## Transforms & Coordinates

ORMI maintains a TF-style tree of coordinate frames so multi-sensor data can be
related spatially (sensor → body → world, GPS → local, …). Datasources feed
transforms into a shared store; widgets read via hooks. There is **no**
`useTransforms()` hook and **no** "transform datasource".

### Authoritative state: a flat edge table

The authoritative state is a **flat edge table** — `TransformTable`, a
`Map<childFrameId, TransformEdge>`. Each incoming transform is an **O(1) upsert**
keyed by child frame, so re-parenting just works and repeated `/tf_static`
delivery is idempotent. World poses, chains, and diagnostics are **derived from
the table at read time** — there is no stored tree.

**Reactivity:** a monotonic version counter drives updates so a high-rate stream
doesn't force a render per message. Bumps are **leading-edge synchronous +
trailing-coalesced**: the first change after a quiet period commits immediately
(no timer — a dropped/starved callback can't strand consumers on a stale
snapshot); rapid follow-ups within ~16ms coalesce into a single trailing
`setTimeout` bump (~60Hz cap). A watchdog in `processTFMessage` force-commits any
trailing bump overstaying ~100ms. (A pure-deferred rAF/timer design hung every
notification on one one-shot callback and froze the TF UI in production — do not
regress to it.)

**Virtual roots:** frames only ever referenced as a parent (e.g. a fixed `map`
root never itself published as a child) are **not** materialized as phantom
identity nodes; chain resolution treats an unobserved parent as an identity
virtual root at query time. For display, `selectWorldFrames` emits each such root
as a real `WorldFrame` at the origin flagged `inferred: true` (rendered
distinctly, e.g. wireframe); real edges are never `inferred`.

**Source namespacing:** table keys are `${datasourceId}::${rawFrameId}`, so two
datasources publishing the same bare names (two robots each with
`map`/`odom`/`base_link`) stay in independent trees. The bare name is kept on
`rawFrameId`; legacy **bare** references (`targetFrame: "base_link"`, a layer's
`referenceFrameId`) auto-resolve to the uniquely-matching namespaced frame — a
bare name matching >1 source is ambiguous and must be qualified. Helpers:
`namespaceFrame`, `frameRawName`, `frameSource`.

### Reading transforms (`@workspace/ormi-core/transforms`)

- `useTransformEdges(source?)` → live `TransformEdge[]` (optionally per source)
- `useTransformTable()` → `Map` snapshot for chain/geometry resolution
- `useTransformFrameCount()` → number of edges
- `useWorldFrames`, `useWorldPose`, `useFrameDiagnostics` → derived world geometry
  and per-frame diagnostics
- Non-React: `getTransformTable()` (read-only), `subscribeToTransforms(cb)`

### GPS conversion

- `useGPSOrigin(gpsTopic, getSource)` → `GeolocationPosition | null`
- `useTransformToGPS(fromFrame, gpsFrame, gpsOrigin)` → `{ transformPointToGPS,
hasTransform, transformError }`

### Types (`@workspace/ormi-core/types`)

```typescript
type CoordinateConvention = "ROS" | "THREE" | "ENU" | "NED" | "NWU" | "CUSTOM";

type Transform = {
	position: Vector4;
	rotation: Quaternion;
	convention?: CoordinateConvention;
};

type TransformEdge = {
	frameId: string; // table key (the child frame)
	rawFrameId: string; // frame id as published
	parentId: string;
	source: string; // datasource that published this edge
	transform: Transform; // child-in-parent, already in THREE convention
	stamp?: number; // header stamp (s), if provided
	receivedAt: number; // monotonic ms; drives staleness
	isStatic: boolean; // from /tf_static — never goes stale
	parentObserved: boolean; // was the parent itself seen as a child edge?
};

type TransformTable = Map<string, TransformEdge>;
```

### Population & cleanup

A datasource carrying TF subscribes to its transform topics through the shared
subscription registry (READY-waited, refcounted, reconnect-reflushed), converts
each transform to THREE convention at its boundary, and calls
`processTFMessage(datasourceId, message, { isStatic })`. Plugins can participate
via the `TRANSFORM_TREE` hook. Every edge is tagged with its `source`. The store
is the single app-wide Jotai `appStore` (see `../shared/coding-standards.md`).

**Cleanup is automatic and core-owned.** Datasource plugins do **not** clear their
own transforms on unmount (an unmount can't distinguish a genuine removal from a
transient remount). The core datasource provider calls
`reconcileTransformSources(liveSourceIds)` whenever the configured datasource set
changes: any source no longer in the dashboard is dropped **entirely, including
its `/tf_static` edges**, so a departed datasource takes its frames with it and
can't leak or collide with a later datasource reusing the same names. A
transiently disconnected but still-configured datasource keeps its frames —
staleness, not removal, reflects a dropped connection.
(`clearTransformsFromDatasource(id, { includeStatic })` is the low-level primitive.)

---

## Templates

A template saves **one** configured widget instance or **one** configured
datasource instance for reuse — it is **not** a whole-dashboard snapshot.

Types (`@workspace/ormi-core/templates`):

```typescript
type TemplateType = "widget" | "datasource";

interface BaseTemplate {
	name: string;
	public: boolean; // shared with everyone vs. private
	tags: string[];
	yours: boolean; // owned by the current user
	type: TemplateType;
}

interface WidgetTemplate extends BaseTemplate {
	type: "widget";
	widget: Widget;
}
interface DatasourceTemplate extends BaseTemplate {
	type: "datasource";
	datasource: Datasource;
}
type Template = WidgetTemplate | DatasourceTemplate;
```

`Widget`/`Datasource` are the runtime **instance** types — a placed widget
(`widget_id`, `box_id`, `title`, `settings`) or a configured datasource
(`datasource_id`, `title`, `settings`).

Templates are exposed through a React context. `useTemplates()` returns the
in-memory map plus mutators and typed selectors (`getWidgetTemplates`,
`addTemplate`, `removeTemplate`, …) and works only inside a `TemplatesProvider`.
The provider receives its persistence callbacks (`addTemplate`, `removeTemplate`,
`updateTemplate`, initial load) as props, so the same UI can be backed by
different stores. In the web app these are wired to `/api/templates` via the
server/data helpers; a localStorage-backed variant exists for offline use.

---

## Basemaps

Every map widget — `ormi-std-widgets`' Maps box and `ormi-c2-control`'s mission
map — picks its base layer from ONE shared catalogue,
`packages/utils/src/basemap-providers.ts`. `basemapOneOf()` turns that table into
the `mapUrl` dropdown in both widget schemas, so the two never drift.

### The raster / vector discriminator

`BasemapProvider` is a discriminated union on `kind`, and **an absent `kind`
means raster**. That is load-bearing, not shorthand: the ten pre-existing raster
rows carry no `kind` and were left byte-identical when vector support landed, so
every `mapUrl` already persisted on a deployed robot keeps taking the code path
it took before. `url` stays the identity field either way — it is what
`{ const: entry.url }` writes into the schema and what a widget config stores.

| kind                | `url` holds                   | rows                                                   |
| ------------------- | ----------------------------- | ------------------------------------------------------ |
| absent (⇒ `raster`) | an XYZ tile template          | Carto ×1, OpenStreetMap ×3, Stadia ×2, Esri ×2, BKG ×2 |
| `"vector"`          | an `ormi:vector/...` sentinel | OpenFreeMap Liberty, Positron, Dark                    |

Carto and Stadia additionally carry a `keyParam`; `applyBasemapKey` appends the
operator's key with the vendor's own parameter name. It is a no-op on every
other row, sentinels included.

### The sentinel format

A vector row's `url` is **not a URL to fetch**. It is an opaque sentinel:

```
ormi:vector/openfreemap-liberty
ormi:vector/openfreemap-positron
ormi:vector/openfreemap-dark
```

The non-HTTP scheme is deliberate. Anything that mistakes a sentinel for a tile
template or a style URL and hands it to `setStyle()` fails loudly, rather than
quietly loading the vendor's own style — which would render, look plausible, and
carry none of ORMI's anchor layers. `isVectorBasemap(url)` and
`vectorBasemapStyleId(url)` are the only sanctioned readers.

### Bundled styles, never fetched

The three vector styles are repo modules under
`packages/utils/src/basemap-styles/`, derived from OpenFreeMap's published
styles. They are bundled rather than fetched so `useMapStyle` stays synchronous
and C2's non-optional `StyleSpecification` return type holds. They are **not**
re-exported from `@workspace/utils`' barrel — the barrel reaches worker
entrypoints, and ~150 KB of style JSON has no business in a worker chunk.
Consumers import `@workspace/utils/basemap-style`.

Two rules the styles themselves encode:

- **The `openmaptiles` source keeps its TileJSON `url`, never an inline
  `tiles` array.** The concrete tile path behind
  `https://tiles.openfreemap.org/planet` is date-versioned and rotates on every
  weekly planet rebuild; an inlined path passes review and breaks in the field
  within a week. A unit test asserts `tiles` is absent.
- **Each style is exposed only through a factory returning a `structuredClone`
  of a frozen literal.** MapLibre consumes and normalises the object it is
  handed, so two map widgets on one dashboard sharing one is an intermittent,
  hard-to-reproduce bug.

Glyphs and sprites point at OpenFreeMap rather than being vendored — worldwide
Unicode coverage for the Noto fontstacks is 100–300 MB.

OpenFreeMap Liberty is the **default** in both widget schemas
(`DEFAULT_BASEMAP_URL`), and is C2's runtime fallback for a blank `mapUrl`. This
was a deliberate reversal of the shipped-as-opt-in position: OpenFreeMap states
it has no SLA, so accept that an outage leaves newly added widgets without a
basemap. Two things bound the blast radius — a persisted `mapUrl` is never
rewritten, so dashboards already in the field keep the raster basemap they were
saved with; and an operator recovers any affected widget from the dropdown.
Changing the default back, however, needs a redeploy.

### Layer stack order (the anchor contract)

Each bundled style carries four no-op anchor layers over an empty GeoJSON source
(`ormi-anchor`), at documented seams. Bottom to top:

| anchor                  | sits                                             | who inserts there                          |
| ----------------------- | ------------------------------------------------ | ------------------------------------------ |
| `ormi-anchor-imagery`   | above the background, below the basemap geometry | full-coverage imagery                      |
| `ormi-anchor-overlay`   | above all geometry, below the label stack        | COG/TiTiler layers, raster overlays, radar |
| `ormi-anchor-graticule` | directly above `overlay`                         | the coordinate grid                        |
| `ormi-anchor-top`       | last layer of the style                          | anything that must clear the labels        |

Helpers live in `packages/utils/src/style-layers.ts` (`ORMI_STYLE_ANCHORS`,
`insertLayersAt`, `resolveAnchor`) and are barrel-safe. `building-3d` ships with
`visibility: "none"` in all three styles; the std map's 3D toggle flips it,
which is why a vector basemap needs no MapTiler key.

The anchors are what make raster and vector one code path: a raster style
contains none of them, `insertLayersAt` appends when its anchor is absent, and
`resolveAnchor` returns `undefined` (= append) — exactly the pre-anchor
behaviour. Anything that reaches for a bare anchor constant as a `beforeId`
blanks a raster map, because MapLibre throws on a `beforeId` naming a layer the
style does not contain.

## Widget families that carry their own data

The contract above assumes a widget is configured with topics and reads them
through `useLocalDataSource` or the subscription registry. One family
deliberately does not: the **Teodor EMI cockpit**
([knowledge/datasources/teodor-emi.md](../datasources/teodor-emi.md)) registers
ten widgets that resolve their own source through a shared module store, so any
of them can be dropped on an ordinary workspace with nothing to configure but a
title.

Two consequences worth knowing before copying the shape:

- **A panel whose body is gated does not exist until it is online.** Those
  widgets sit inside `DatasourceGate`, so anything that measures or observes the
  host element has to react to it _arriving_ — a callback ref, not an effect
  keyed on a `useRef` object, which never re-runs and leaves every canvas blank.
- **Charting there is raw canvas, not uPlot.** Not a rejection of the standard
  time-series widget: those panels decimate to one min/max pair per pixel column
  so a repaint costs the panel width rather than the recording length, and
  having done that there is nothing left for a chart library to do. A widget
  showing a few thousand points should still use uPlot.

A widget that needs a `TemplatesProvider` in its own page must mount one:
`GlobalDataSourcesProvider` and the grid engine both call `useTemplates()`, which
throws when the provider is absent. Core ships `temphandleLoad`/`temphandleSave`
for pages that cannot reach the app's Prisma helpers.
