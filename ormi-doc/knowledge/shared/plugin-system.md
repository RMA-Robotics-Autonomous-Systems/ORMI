# Plugin System

> Internal source-of-truth knowledge base. When it disagrees with code, this file
> wins — update it and the LikeC4 model in lockstep on structural changes.

Plugins extend ORMI without touching core. They inject widgets, datasources,
renderers, and layout engines through a hook system on the `PluginsManager`. Core
(`packages/ormi-core`) stays immutable.

## Extension contract

1. Create a `Plugin` subclass that declares filter/action hooks in its constructor.
2. Export definitions from `export.ts` (`export.tsx` if JSX is needed).
3. Mark the package: `"ormi_plugin": true` in its `package.json`, and add it to
   `apps/web/package.json` dependencies so it is installed.

Naming convention: `ormi-*` for bundled plugins.

## Registry generation and the production gate

`apps/web/ormi-plugins.ts` is **generated, not written** — it is gitignored and
produced by `bun run plugin-init` (`packages/utils/src/cli`), which scans every
reachable `node_modules` for packages whose `package.json` declares
`"ormi_plugin": true` and emits one `import()` per plugin:

```ts
const registry: PluginRegistry = {
	"ormi-foxglove": import("ormi-foxglove") as any,
	// …
};
```

That registry is the **only** module that imports plugin packages, which makes it
the gate. A plugin absent from it is unreachable from the module graph, so Next
never emits its chunks — including its workers.

A plugin that also declares `"ormi_plugin_dev_only": true` is a development
fixture (synthetic data, benchmarking) and is **excluded when the registry is
generated with `--production`**, which `apps/web`'s `build` script does. `dev`,
`test` and `typecheck` generate without the flag, so dev keeps everything.

Gating here rather than at hook registration is deliberate. A `NODE_ENV` guard
around `this.addFilter(DATASOURCES_LIST, …)` would only hide the entry from the
"Add new datasource" list: the `import()` still exists, `index.ts` still pulls in
`export.ts` at module scope, and the whole plugin — worker chunks included —
still ships. Registry gating is the only version that genuinely keeps the code
out of the image.

`ORMI_DEV_PLUGINS=1` re-includes dev-only plugins in a production registry. It is
a **build-time** switch (the code has to be in the bundle; no runtime flag can
resurrect a chunk that was never emitted) and exists for one real workflow:
ORMI perf must be judged on a production build, and the load generator is the
source that work depends on. `Dockerfile.ormi_core` exposes it as a build arg,
and `turbo.json` lists it under `build.env` so a changed value cannot be served
from a stale cached build.

Gating makes a saved workspace able to reference a datasource this build does not
have, which is now a **supported state rather than a crash**.
`GlobalDataSourcesProvider` resolves each configured datasource through the pure
`resolveDatasourceEntries` pass and renders an unsupported-configuration card for
what it cannot resolve; it used to call a `getDatasourceDef` that threw during
render, with no error boundary above it, taking the whole dashboard down. See
`../datasources/knowledge.md` — "A missing definition is a state, not an
exception". Still be conservative about which plugins get the marker: an operator
meeting that card has lost a panel, however gracefully.

## Registration hooks (filters returning lists)

| Hook                          | Purpose                              | Signature                                                                   |
| ----------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `WIDGETS_LIST`                | Register widgets                     | `(widgets: WidgetDefinition[]) => WidgetDefinition[]`                       |
| `DATASOURCES_LIST`            | Register datasources                 | `(ds: DatasourceDefinition[]) => DatasourceDefinition[]`                    |
| `JSON_FORMS_RENDERER`         | Extend JSON Forms renderer registry  | `(r: JsonFormsRendererRegistryEntry[]) => JsonFormsRendererRegistryEntry[]` |
| `DASHBOARD_LAYOUTS_LIST`      | Register dashboard layout engines    | `(e: LayoutEngineDefinition[]) => LayoutEngineDefinition[]`                 |
| `WIDGET_LIST_WITH_DATASOURCE` | Filter widgets by active datasource  | `(w: WidgetDefinition[], datasourceId: string) => WidgetDefinition[]`       |
| `TOPIC_ROUTING_CLAIMS`        | Claim a topic type for a widget slot | `(claims: TopicClaim[]) => TopicClaim[]`                                    |

`TOPIC_ROUTING_CLAIMS` is the whole of what topic-first routing decides from: a
claim names a topic type (webapp or raw schema name), a widget id, a
`TopicSelect` slot path and a role (`default` / `alternative` / `command` /
`fallback`), and nothing infers a destination from a widget's `accepts` list.
Register claims from the plugin that ships the widget — it is the only one that
can keep the widget id honest. See `../widgets/knowledge.md`.

## Datasource runtime hooks

| Hook                     | Purpose                                  | Signature                                                                                     |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `AVAILABLE_TOPICS`       | Aggregate topics from active datasources | `(t: DatasourceTopic[], filter?) => DatasourceTopic[] \| Promise<…>`                          |
| `AVAILABLE_DATASOURCES`  | List available datasource instance ids   | `(ids: string[]) => string[]`                                                                 |
| `DATASOURCE_READY`       | Action: datasource provider is ready     | `(datasourceId: string) => void`                                                              |
| `DATASOURCE_DISPOSED`    | Action: datasource provider disposed     | `(datasourceId: string) => void`                                                              |
| `AVAILABLE_REMOTE_CALLS` | Aggregate remote calls                   | `(calls: RemoteCallDefinition[], filter?) => RemoteCallDefinition[]`                          |
| `REMOTE_CALL_DEFINITION` | Resolve one remote call definition       | `(def: RemoteCallDefinition \| null, datasourceId, callName) => RemoteCallDefinition \| null` |
| `TRANSFORM_TREE`         | Participate in TF population             | see `../widgets/knowledge.md`                                                                 |

`DATASOURCE_READY`/`DATASOURCE_DISPOSED` are the events the subscription registry
listens on to flush/re-flush subscribe intents (see `data-flow.md`).

The tables above are the common hooks, not exhaustive. `PluginsHooks` also
includes `PAGES_LIST` (register full pages), `MAP_LOCAL_VISUALIZERS` (contribute
map layers/visualizers), `TOPIC_PREVIEWS` (live per-type previews for the topics
panel), and `PLUGIN_PROVIDER_BEFORE_CHILDREN` /
`PLUGIN_PROVIDER_AFTER_CHILDREN` (wrap the provider tree). See
`packages/ormi-plugins/src/plugins/plugins-types.ts` for the full enum.

## Priority system

Filters run in ascending priority (lower = earlier). There is no enforced banding
— treat these as a rough convention, and check real registrations before assuming:

- **registration filters** (`WIDGETS_LIST`, `DATASOURCES_LIST`, …) commonly use
  `~5–12`.
- **datasource-runtime filters** (`AVAILABLE_TOPICS`, remote-call resolution, …)
  commonly use `100`, or `1` to run first.

## Plugin structure

```
plugins/ormi-my-plugin/
├── src/
│   ├── index.ts        # Plugin class (hook registration)
│   ├── export.ts       # Definition exports
│   ├── widgets/        # Widget components
│   └── datasources/    # Datasource providers/workers
└── package.json
```

## Minimal plugin

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { widgetDefinitions } from "./export";

export default class MyPlugin extends Plugin {
	constructor() {
		super();
		this.name = "ormi-my-plugin";

		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "ormi-my-plugin-widgets",
			priority: 10,
			filter: (widgets) => {
				widgets.push(...widgetDefinitions);
				return widgets;
			},
		});
	}
}
```

Filters receive the array, mutate it, and **return it**. Trivial 1–2 line
callbacks may stay inline; anything larger goes in `export.ts`.

## Constraints

**Do not:** mutate core; register duplicate hook ids; block the main thread (use
workers for `wss://`/HTTP-served I/O); access private APIs (use exported
interfaces only).

**Must:** use `export.ts` for definitions; follow `ormi-*` naming; return the
modified array from filters; handle cleanup in the datasource provider's
unmount / worker `shutdown()`.

See `../datasources/knowledge.md` for datasource providers,
`../widgets/knowledge.md` for widgets/renderers, and `../dashboard/knowledge.md`
for layout engines. The `create-plugin` skill (`.claude/skills/`) scaffolds a new
plugin.
