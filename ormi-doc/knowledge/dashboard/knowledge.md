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
