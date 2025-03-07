# ORMI Plugin System

The ORMI Plugin System allows developers to extend the functionality of ORMI through plugins that register themselves with the system.

## How It Works

The plugin system uses a registry approach where plugins register themselves with the central registry during application initialization. This approach is compatible with Next.js and avoids issues with dynamic imports.

## Creating a Plugin

To create an ORMI plugin:

1. Create a class that extends the `PluginServerSide` class
2. Register your plugin using one of these methods:
   - Use the `registerPlugin` function
   - Use the `@RegisterPlugin` decorator

### Example Using registerPlugin Function

```typescript
// my-plugin.ts
import { PluginServerSide, PluginsHooks, registerPlugin } from "ormi-core";

class MyPlugin extends PluginServerSide {
  constructor() {
    super({
      name: "my-feature",
      description: "Adds my feature to ORMI",
      version: "1.0.0",
    });
  }

  protected initialize(): void {
    // Add actions and filters
    this.addAction(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, {
      id: "my-action",
      priority: 10,
      action: () => console.log("My action executed!"),
    });
  }
}

// Register the plugin
registerPlugin("my-feature", MyPlugin);
```

### Example Using @RegisterPlugin Decorator

```typescript
// my-plugin.ts
import { PluginServerSide, PluginsHooks, RegisterPlugin } from "ormi-core";

@RegisterPlugin("my-decorator-plugin")
export default class MyDecoratorPlugin extends PluginServerSide {
  constructor() {
    super({
      name: "my-decorator-plugin",
      description: "Plugin using decorator registration",
      version: "1.0.0",
    });
  }

  protected initialize(): void {
    // Add actions and filters
    this.addFilter(PluginsHooks.WIDGETS_LIST, {
      id: "my-filter",
      priority: 10,
      filter: (widgets) => [
        ...widgets,
        { type: "my-widget", name: "My Widget" },
      ],
    });
  }
}
```

### Available Hooks

ORMI provides several hooks for your plugins:

| Hook                              | Type   | Description                               |
| --------------------------------- | ------ | ----------------------------------------- |
| `PLUGIN_PROVIDER_BEFORE_CHILDREN` | Filter | Called before rendering provider children |
| `PLUGIN_PROVIDER_AFTER_CHILDREN`  | Filter | Called after rendering provider children  |
| `WIDGETS_LIST`                    | Filter | Modify the available widgets list         |
| `DATASOURCES_LIST`                | Filter | Modify the available data sources         |
| `AVAILABLE_TOPICS`                | Filter | Modify the available topics               |
| `AVAILABLE_DATASOURCES`           | Filter | Modify available data sources             |

## Using the Plugin System

Here's how to use the plugin system in your application:

```typescript
import { PluginsLoader, PluginsProvider } from "ormi-core";

// Import plugins to trigger registration
import "./plugins/my-plugin";
import "./plugins/another-plugin";

async function initializePlugins() {
  const pluginsLoader = new PluginsLoader();
  await pluginsLoader.load(); // Loads all registered plugins
  return pluginsLoader.getClientSide();
}

// In your React component:
const plugins = await initializePlugins();

return (
  <PluginsProvider pluginsLoader={plugins}>
    <YourApp />
  </PluginsProvider>
);
```
