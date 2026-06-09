---
name: create-plugin
description: "Scaffold a new ORMI plugin (datasource and/or widgets). Use when adding a feature extension under plugins/ — a new datasource integration, widget collection, or visualizer. Covers directory layout, the Plugin class, export.ts, hook registration, and monorepo wiring."
when_to_use: "Creating a new ormi-* plugin, adding a datasource or widget that should live in plugins/ rather than apps/ or core."
---

# Create an ORMI Plugin

Plugins are isolated feature extensions under `plugins/`. They register datasources, widgets, renderers, or visualizers into the core **through hooks** — never by importing app internals or modifying `packages/ormi-core` (which is immutable). Each plugin is a standalone workspace package built with `tsc` to `dist/`.

Before scaffolding, confirm placement with the rules in `AGENTS.md`: feature extensions go in `plugins/`; reusable shared logic goes in `packages/`; never in `apps/` when reusable. If the feature needs a core change, stop and get approval per the Core Immutability Rule.

## 0. Scaffold manually

Plugins are created **manually** — there is no working generator (the `bun run create` / `scripts/create-package.js` reference in `package.json` is dead; do not use it). The fastest start is to copy an existing plugin (e.g. `plugins/ormi-std-widgets` or `plugins/ormi-rest-bags`), rename it, and strip it down to the structure below.

## 1. Directory layout

```
plugins/ormi-<name>/
  package.json        # name, private, exports → ./dist, workspace deps
  tsconfig.json       # extends @workspace/typescript-config
  eslint.config.js    # extends @workspace/eslint-config
  src/
    index.ts          # default Plugin subclass — registers hooks
    export.ts(x)      # definitions (datasource / widgets / renderers)
    <feature>/        # components, providers, hooks per feature
```

`package.json` essentials (mirror a sibling plugin):

```jsonc
{
	"name": "ormi-<name>",
	"version": "1.0.0",
	"private": true,
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
	},
	"scripts": {
		"build": "tsc",
		"dev": "tsc --watch",
		"lint": "eslint .",
		"typecheck": "tsc --noEmit",
		"clean": "rm -rf dist build .turbo node_modules",
	},
	"dependencies": {
		"@workspace/ormi-core": "workspace:*",
		"@workspace/ormi-plugins": "workspace:*",
		"@workspace/ui": "workspace:*",
		// add @workspace/ormi-jsonforms for widget config schemas, three/react-three for 3D, etc.
	},
}
```

## 2. The plugin class — `src/index.ts`

The default export extends `Plugin` from `@workspace/ormi-plugins`, sets metadata, and registers hooks in its constructor. Each filter has a **unique `id`**, a `priority`, and a `filter` function that receives the list, mutates it, and returns it.

```ts
import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";
import WidgetExport from "./export";

/** <Name> plugin registration. */
class MyPlugin extends Plugin {
	constructor() {
		super();

		this.name = "My Plugin";
		this.description = "What this plugin adds.";
		this.version = "1.0.0";
		this.author = "<you>";
		this.email = "<you>@mil.be";

		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: this.name + "-widget-export",
			priority: 10,
			filter: WidgetExport,
		});

		// For a datasource:
		// this.addFilter(PluginsHooks.DATASOURCES_LIST, {
		//   id: this.name + "-datasource",
		//   priority: 10,
		//   filter: (datasources) => { datasources.push(myDatasourceDefinition); return datasources; },
		// });
	}
}

export default MyPlugin;
```

Use the hook that matches what you register: `PluginsHooks.WIDGETS_LIST` for widgets, `PluginsHooks.DATASOURCES_LIST` for datasources, plus specialized hooks (e.g. `MAP_LOCAL_VISUALIZERS`) when extending an existing widget. Check `@workspace/ormi-plugins` for the current `PluginsHooks` enum rather than guessing names.

## 3. Definitions — `src/export.ts`

Keep definitions out of the class. A widget export is a filter function that pushes `WidgetDefinition`s:

```ts
"use client";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { MyWidgetDefinition } from "./widgets/my-widget";

/** Register this plugin's widget definitions. */
const WidgetExport = (widgets: WidgetDefinition<any>[]) => {
	widgets.push(MyWidgetDefinition());
	return widgets;
};

export default WidgetExport;
```

Use `export.tsx` if the file contains JSX. Add `"use client"` when the definitions pull in client-only React/UI code.

## 4. Widgets and datasources

- **Widgets** that need a specific datasource type must declare that dependency in their definition so `filterWidgetsByDatasources` can gate them (Pattern 8 in `AGENTS.md`). Use `@workspace/ormi-jsonforms` for the widget's configuration schema.
- **Datasource providers**: use a plain lifecycle component when the context value is null/unused; use a Context provider (via `createSafeContext` from `@workspace/utils`) only when children consume shared reactive state such as a connection status or client instance (Pattern 5).
- Read the core docs before wiring data: `apps/web/content/docs/{Data-Flow,Plugin-System,Widgets}.md`.

## 5. Wire into the monorepo and verify

1. Plugins are discovered and loaded by the plugin manager at runtime — confirm how the app enumerates `plugins/` (a sibling plugin shows the registration path) and add your package there if registration is explicit.
2. Install workspace deps: `bun install`.
3. Validate: `bun run typecheck`, `bun run lint`, and `bun run build` (Turbo-cached). Add Bun tests for non-trivial logic and run `bun run test`.
4. Keep the change minimal and self-contained; do not touch `packages/ormi-core`.

## Checklist

- [ ] Lives in `plugins/ormi-<name>/`, not `apps/` or core.
- [ ] `index.ts` default-exports a `Plugin` subclass; every `addFilter` has a unique `id`.
- [ ] Definitions live in `export.ts(x)`, not inline in the class.
- [ ] Widgets declare datasource dependencies; datasource provider style matches Pattern 5.
- [ ] `package.json` exports `./dist`; workspace deps use `workspace:*`.
- [ ] `typecheck`, `lint`, and `build` pass; tests added where it matters.
- [ ] No core changes, no hardcoded secrets.
