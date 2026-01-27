---
title: "Plugin API"
order: 1
---

# Plugin API Reference

Complete reference for the Plugin class and PluginManager.

## Plugin Class

Base class for creating plugins.

### Constructor

```typescript
constructor(options?: {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  email?: string;
  url?: string;
  dependencies?: string[];
})
```

### Properties

```typescript
class Plugin {
  protected name: string;
  protected author: string;
  protected email: string;
  protected url: string;
  protected description: string;
  protected version: string;
  protected dependencies: string[];

  public actions: Map<string | PluginsHooks, Map<string, PluginAction>>;
  public filters: Map<string | PluginsHooks, Map<string, PluginFilter>>;
}
```

### Methods

#### `initialize(): void`

Override this method to register hooks.

```typescript
protected initialize(): void {
  // Register filters and actions
}
```

#### `addFilter(filterName, filter): void`

Register a filter hook.

```typescript
addFilter(
  filterName: string | PluginsHooks,
  filter: PluginFilter
): void
```

#### `addAction(actionName, action): void`

Register an action hook.

```typescript
addAction(
  actionName: string | PluginsHooks,
  action: PluginAction
): void
```

#### Metadata Getters

```typescript
getName(): string
getDescription(): string
getVersion(): string
getAuthor(): string
getEmail(): string
getUrl(): string
getDependencies(): string[]
```

## PluginManager Class

Central manager for executing hooks.

### Methods

#### `applyFilter<T>(filterName, ...args): T`

Execute filter chain synchronously.

```typescript
applyFilter<T>(
  filterName: string | PluginsHooks,
  ...args: any
): T
```

**Example:**

```typescript
const widgets = pluginManager.applyFilter<WidgetDefinition[]>(
  PluginsHooks.WIDGETS_LIST,
  [],
);
```

#### `applyFilterAsync<T>(filterName, ...args): Promise<T>`

Execute filter chain asynchronously.

```typescript
async applyFilterAsync<T>(
  filterName: string | PluginsHooks,
  ...args: any
): Promise<T>
```

#### `doAction(actionName, ...args): void`

Execute all registered actions.

```typescript
doAction(
  actionName: string | PluginsHooks,
  ...args: any
): void
```

#### `addFilter(filterName, filter): void`

Dynamically add filter at runtime.

```typescript
addFilter(
  filterName: string | PluginsHooks,
  filter: PluginFilter
): void
```

#### `removeFilter(pluginFilterId): void`

Remove a filter by ID.

```typescript
removeFilter(pluginFilterId: string): void
```

#### `addAction(actionName, action): void`

Dynamically add action at runtime.

```typescript
addAction(
  actionName: string | PluginsHooks,
  action: PluginAction
): void
```

#### `removeAction(pluginActionId): void`

Remove an action by ID.

```typescript
removeAction(pluginActionId: string): void
```

#### `WaitAndDoAction(actionName, timeoutSecond, ...args): Promise<boolean>`

Wait for action to exist before executing.

```typescript
async WaitAndDoAction(
  actionName: string | PluginsHooks,
  timeoutSecond: number = 5,
  ...args: any
): Promise<boolean>
```

## PluginFilter Interface

```typescript
interface PluginFilter {
  id: string;
  priority: number;
  filter: (...args: any) => any;
}
```

## PluginAction Interface

```typescript
interface PluginAction {
  id: string;
  priority: number;
  action: (...args: any) => void;
}
```

## PluginsHooks Enum

Predefined hook names.

```typescript
enum PluginsHooks {
  PLUGIN_PROVIDER_BEFORE_CHILDREN = "plugins-before-children",
  PLUGIN_PROVIDER_AFTER_CHILDREN = "plugins-after-children",
  JSON_FORMS_RENDERER = "plugins-jsonforms-renderer",
  WIDGETS_LIST = "plugins-widgets-list",
  DATASOURCES_LIST = "plugins-datasources-list",
  WIDGET_LIST_WITH_DATASOURCE = "plugins-widgets-list-with-datasource",
  AVAILABLE_TOPICS = "plugins-topics-list",
  AVAILABLE_DATASOURCES = "plugins-datasources-availables",
  TRANSFORM_TREE = "CORE-TRANSFORM-TREE",
  MAP_LOCAL_VISUALIZERS = "map-local-visualizers",
}
```

## React Hooks

### `usePluginsManager(): PluginManager`

Access PluginManager in React components.

```typescript
import { usePluginsManager } from "@workspace/ormi-plugins";

function MyComponent() {
  const pluginManager = usePluginsManager();
  // ...
}
```

## Plugin Registration

### PluginRegistry Type

```typescript
type PluginRegistry = Record<string, Promise<Plugin>>;
```

### Example Registry

```typescript
// ormi-plugins.ts
import { PluginRegistry } from "@workspace/ormi-plugins";

const registry: PluginRegistry = {
  "my-plugin": import("my-plugin"),
  "another-plugin": import("another-plugin"),
};

export default registry;
```

### PluginsProvider

```typescript
import { PluginsProvider } from '@workspace/ormi-plugins';
import pluginRegistry from './ormi-plugins';

<PluginsProvider PluginsInfo={pluginRegistry}>
  <App />
</PluginsProvider>
```

## Complete Example

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

class MyPlugin extends Plugin {
  constructor() {
    super({
      name: "My Plugin",
      description: "Example plugin",
      version: "1.0.0",
      author: "Your Name",
      email: "your@email.com",
      dependencies: [],
    });
  }

  protected initialize(): void {
    // Register widgets
    this.addFilter(PluginsHooks.WIDGETS_LIST, {
      id: `${this.name}-widgets`,
      priority: 10,
      filter: (widgets) => {
        widgets.push(MyWidget());
        return widgets;
      },
    });

    // Register datasources
    this.addFilter(PluginsHooks.DATASOURCES_LIST, {
      id: `${this.name}-datasources`,
      priority: 10,
      filter: (datasources) => {
        datasources.push(MyDatasource);
        return datasources;
      },
    });

    // Register JSON Forms renderers
    this.addFilter(PluginsHooks.JSON_FORMS_RENDERER, {
      id: `${this.name}-renderers`,
      priority: 10,
      filter: (renderers) => {
        renderers.push({
          tester: myTester,
          renderer: MyRenderer,
        });
        return renderers;
      },
    });
  }
}

export default MyPlugin;
```
