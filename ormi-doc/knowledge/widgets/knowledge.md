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

### Special JSON Forms UI elements

| Element       | Purpose                            | Usage                                                                                                          |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TopicSelect` | Select a topic with type filtering | `{ type: "TopicSelect", scope: "#/properties/topic", options: { dataRequirements: { accepts: ["number"] } } }` |
| `FrameSelect` | Select a coordinate frame          | `{ type: "FrameSelect", scope: "#/properties/frameId" }`                                                       |

`dataRequirements.accepts` is how a widget declares which webapp types it can bind
to (there is no `supportedTypes` field).

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
