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
