# Plugin System

> Internal source-of-truth knowledge base. When it disagrees with code, this file
> wins — update it and the LikeC4 model in lockstep on structural changes.

Plugins extend ORMI without touching core. They inject widgets, datasources,
renderers, and layout engines through a hook system on the `PluginsManager`. Core
(`packages/ormi-core`) stays immutable.

## Extension contract

1. Create a `Plugin` subclass that declares filter/action hooks in its constructor.
2. Export definitions from `export.ts` (`export.tsx` if JSX is needed).
3. Register the plugin in `apps/web/ormi-plugins.ts`.

Naming convention: `ormi-*` for bundled plugins.

## Registration hooks (filters returning lists)

| Hook                          | Purpose                             | Signature                                                                   |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `WIDGETS_LIST`                | Register widgets                    | `(widgets: WidgetDefinition[]) => WidgetDefinition[]`                       |
| `DATASOURCES_LIST`            | Register datasources                | `(ds: DatasourceDefinition[]) => DatasourceDefinition[]`                    |
| `JSON_FORMS_RENDERER`         | Extend JSON Forms renderer registry | `(r: JsonFormsRendererRegistryEntry[]) => JsonFormsRendererRegistryEntry[]` |
| `DASHBOARD_LAYOUTS_LIST`      | Register dashboard layout engines   | `(e: LayoutEngineDefinition[]) => LayoutEngineDefinition[]`                 |
| `WIDGET_LIST_WITH_DATASOURCE` | Filter widgets by active datasource | `(w: WidgetDefinition[], datasourceId: string) => WidgetDefinition[]`       |

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
map layers/visualizers), and `PLUGIN_PROVIDER_BEFORE_CHILDREN` /
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
