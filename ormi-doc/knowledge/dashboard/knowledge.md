# Dashboard System

> Internal source-of-truth knowledge base. When it disagrees with code, this file
> wins — update it and the LikeC4 model in lockstep on structural changes.

The dashboard arranges widgets through **pluggable layout engines**. State lives
in Jotai atoms on the single app-wide `appStore`; engines read/write it through
atoms and `useDashboardActions()`.

## Layout engine contract

Register custom engines on the `DASHBOARD_LAYOUTS_LIST` hook:

```typescript
interface LayoutEngineDefinition {
	id: string; // "GRID", "FLEX", …
	name: string; // display name
	layoutKey: string; // key into layoutsAtom
	Component: React.FC; // self-contained engine
}
```

```typescript
this.addFilter(PluginsHooks.DASHBOARD_LAYOUTS_LIST, {
	id: "my-engine",
	filter: (engines) => {
		engines.push(myEngineDefinition);
		return engines;
	},
});
```

## Built-in engines

| Engine | ID     | Layout key | Backing library                 |
| ------ | ------ | ---------- | ------------------------------- |
| Grid   | `GRID` | `grid`     | react-grid-layout               |
| Flex   | `FLEX` | `flex`     | flexlayout-react (with popouts) |

## A plugin page as a dashboard surface

A plugin that ships a preconfigured operator surface registers a **page**
(`PAGES_LIST`) that assembles the shell by hand, rather than a layout engine
plus a new dashboard type. Two live instances: the EMI cockpit
(`/plugin-pages/teodor-emi`) and C2 mission control
(`/plugin-pages/c2-mission-control`).

The recipe, and what each part is load-bearing for:

- `<DashboardShell dashboardType="FLEX">` — `DashboardEngine` resolves the engine
  by `id` from the registry, so a page names a built-in engine as a plain string.
  Reusing GRID or FLEX needs **no** core export.
- **The arrangement is the loaded state, never a seeding pass.** `onLoad(apply)`
  applies a complete `DashboardInterface` — `{layouts: {<layoutKey>: model},
widgets, datasources, locked}` — built fresh on every call so a caller cannot
  mutate the template. Seeding after load with `addWidget` + `updateLayouts`
  races the persistence layer, which writes the same atoms.
- Panel settings come from each widget definition's own `data`, **deep-copied**
  (the C2 page; the EMI cockpit predates this and uses literals). The
  host spreads `widget.settings` straight into the component, so a panel seeded
  with only a title gets `undefined` for everything else and the schema's
  `default` is never consulted (a map without `mapUrl` renders blank). Copying
  also keeps the seed from aliasing the registry-shared definition.
- The layout sits under the engine's own `layoutKey` (`flex` / `grid`). A layout
  under the wrong key is not an error anywhere — FlexLayout answers a missing
  layout by stacking every panel into one tab strip, which looks broken rather
  than misconfigured. Assert the key in a test.
- Persistence is the page's own — local storage, because the workspace tables are
  reached through `apps/web` Prisma helpers a plugin cannot import and should
  not. Version the key, validate a restored payload as a unit, and fall back to
  the shipped default on anything suspicious.
- `TemplatesProvider` and `GlobalDataSourcesProvider` are not optional chrome:
  the engine and the rail call `useTemplates()`, which is a safe context and
  throws when absent, and the datasource provider carries the Datasources dialog
  that points the page at a host.
- Autosave is a component **inside** the shell, keyed on `hasChanged`. The shell
  renders a skeleton until `onLoad` resolves, so a child structurally cannot
  overwrite saved state with the default.
- **A page that seeds no datasource has its widget registry gated to `[]`.**
  `GlobalDataSourcesProvider` registers a `WIDGETS_LIST` filter at
  `Number.MAX_SAFE_INTEGER` returning `[]` when no datasource is configured,
  which is a workspace policy that a page trips on first open. Everything reads
  that gated list, so every placed panel resolves to the widget-not-found
  placeholder, the rail offers nothing, and it does not heal: the FLEX engine's
  factory caches the element per box id, so the tiles stay puzzle icons until a
  reload even after the operator adds a datasource. A page therefore re-asserts
  its own panels in a page-scoped filter at `Infinity` priority, appending only
  what the gate removed, and holds `loading` until it is registered
  (`plugins/ormi-c2-control/src/page/page-panels.ts`). The EMI cockpit registers
  its panels page-scoped at priority 10 and is **below** the gate, so it has the
  same first-open defect.

Where the panels are registered depends on whether they mean anything elsewhere:
page-scoped (an effect that adds the `WIDGETS_LIST` filter and removes it on
unmount, with the page holding `loading` until it is in place) when they do not,
as with the EMI panels; left in the plugin constructor when they gate themselves
on a datasource type, as the C2 widgets do — page-scoping those would take them
out of the workspaces where operators already place them.

What a page does not give you: a named, shareable workspace per surface. The
layout is per browser and the workspace create-picker does not list it.

## Getting things onto a dashboard

There is exactly **one** entry point: a floating button in the bottom-right of
the dashboard surface opening a single dialog with three tabs — Topics, Widgets,
Templates (`dashboard/components/launcher/`). `DashboardEngine` mounts it beside
whichever engine is active, so an engine contributed by a plugin inherits it
without doing anything.

Its open state, selected tab and search text are **ephemeral**. None of them may
reach `layoutsAtom` or any other persisted state: a docked panel that stored its
own open flag in `layouts` made opening a side panel count as editing the
dashboard, and the operator was asked to save after looking at a list. The
remembered tab is per-viewer `localStorage`, read once, guarded by try/catch.

The Topics tab renders `TopicsPanel`
(`dashboard/components/topic-list/topics-panel.tsx`) — the **single** topic list
in the product, which the `topics-List-widget` also renders, so sorting, search,
previews and the routing action behave identically wherever a topic is met.

## Where a new widget lands

Grid appends at the first free row. **Flex splits**: `placeNewTabs`
(`dashboard/components/flex-layout/widget-placement.ts`) takes the largest panel
by rendered area and divides its longer axis, so two widgets sit side by side,
three make an L and four a grid, with no rule about counts. Below a measured
floor (320×240 CSS px, tested against the _resulting half_ so a short panel can
still split left/right) it stacks into that tabset as a tab instead. A maximized
tabset is restored first, or the widget just added would be invisible behind it.

The decision is a pure function over layout JSON precisely because a layout bug
is invisible in a passing build — it is measured against a live `Model` in tests
so that FlexLayout's own `tidy()` cannot silently rearrange what it produces.

## State contract (atoms)

| Atom              | Shape                                            |
| ----------------- | ------------------------------------------------ |
| `widgetsAtom`     | `Map<string, Widget>`                            |
| `layoutsAtom`     | `Record<string, unknown>` (keyed by `layoutKey`) |
| `lockedAtom`      | `boolean`                                        |
| `datasourcesAtom` | `Map<string, Datasource>`                        |

These atoms live on the one shared `appStore` (`packages/ormi-core/src/store.ts`).
The React tree is wrapped in `<Provider store={appStore}>`; never read/write these
through `getDefaultStore()` or an ad-hoc store — see
`../shared/coding-standards.md`.

## Actions

Engines mutate state via `useDashboardActions()`:

- `addWidget(def, settings)`
- `removeWidget(boxId)`
- `updateWidget(boxId, settings)`
- `updateLayouts(updater)` — takes an updater callback `(prev) => next`, not a
  layouts object

## Notes

- The dashboard mounts immediately — there is no "all datasources connected" gate.
  Widgets mount before datasources connect and degrade per-datasource (see
  `../widgets/knowledge.md` and `../shared/data-flow.md`).
- Each widget body is wrapped in its own error boundary by the host, so one
  throwing widget cannot crash the dashboard.

## Toolbar, cold start, and pulse discipline

- Every toolbar control contributed through `NavbarItem` carries an `aria-label`
  and a tooltip (`@workspace/ui/components/tooltip`); decorative icons inside a
  labelled control are `aria-hidden`. Labels name the action, not the state.
- Primary menus open on left click from a labelled trigger. The grid engine's
  layout presets live in the `Arrange` dropdown; a right-click-only context menu
  hides the choice behind a gesture nobody discovers.
- An engine renders an explicit empty state while `widgetsAtom` is empty, naming
  the one next step — add a datasource when `datasourcesAtom` is empty, add a
  widget otherwise. The grid engine implements this; the flex engine does not yet.
- Pulsing means "this is the next required step", so at most one control pulses
  at a time along **datasource → widget → save**: the `Datasources` button while
  no datasource is configured, then the save button once there are unsaved
  changes plus at least one datasource and one widget.
