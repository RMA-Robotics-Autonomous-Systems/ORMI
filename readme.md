# ORMI-Core

Open Robot Management Interface; this is the core application

## Plugin System & Datasource Implementation Guide

### Plugin System Overview

The plugin system is built around two main components:

- PluginServerSide - Base class for implementing plugins
- PluginsManager - Manages plugin instances and handles actions/filters

### Key Concepts

- Actions - Allow plugins to execute code at specific points
- Filters - Allow plugins to modify data as it flows through the system
- Hooks - Predefined poits where actions/filters can be registered

```ts
enum PluginsHooks {
  PLUGIN_PROVIDER_BEFORE_CHILDREN = "plugins-before-children", // filter called before rendering children of the plugin provider
  PLUGIN_PROVIDER_AFTER_CHILDREN = "plugins-after-children", // filter called after  rendering children of the plugin provider

  WIDGETS_LIST = "plugins-widgets-list", // hooks that take an array of widgets and return an array of widgets
  DATASOURCES_LIST = "plugins-datasources-list", // hooks that take an array of datasources definition and return an array of datasources definition
  AVAILABLE_TOPICS = "plugins-topics-list", // hooks that take an array of topics and return an array of topics
  AVAILABLE_DATASOURCES = "plugins-datasources-availables", // hooks that take an array of datasources and return an array of datasources
}
```

### Implementing a Datasource Plugin

1. Create Plugin Class
   Create a new class that extends PluginServerSide:

```ts
import { PluginServerSide } from "@/core/plugins/plugin-core";
import { PluginsHooks } from "@/core/plugins/plugins-types";

class MyDatasourcePlugin extends PluginServerSide {
  constructor() {
    super();
    this.name = "My Datasource";
    this.description = "My custom datasource plugin";
    this.version = "1.0.0";

    // Register the datasource definition
    this.addFilter(PluginsHooks.DATASOURCES_LIST, {
      id: "my-datasource",
      priority: 10,
      filter: myDatasourceDefinition,
    });
  }
}
```

2. Define Datasource Interface
   Create settings interface extending DatasourceProviderSettings:

```ts
interface MyDatasourceSettings extends DatasourceProviderSettings {
  // Add custom settings
  url: string;
  port: number;
  topics: TopicDefinition[];
}
```

3. Create Datasource Definition
   Implement the datasource definition object:

```ts
import { DatasourceDefinition } from "@/core/datasources/datasource-interface";
const myDatasourceDefinition: DatasourceDefinition = {
  id: "my-datasource",
  name: "My Datasource",
  description: "Description of my datasource",

  // JSON Schema for settings
  schema: {
    type: "object",
    properties: {
      url: { type: "string" },
      port: { type: "number" },
    },
  },

  // Default settings
  data: {
    id: "",
    title: "",
    enable: true,
    url: "localhost",
    port: 9090,
  },

  // React component that provides the datasource
  Provider: MyDatasourceProvider,
};
```

4. Implement Provider Component
   Create a React component to handle datasource lifecycle:

```ts
const MyDatasourceProvider: React.FC<{
  children: ReactNode;
  props: MyDatasourceSettings;
}> = ({ children, props }) => {
  const pluginsManager = usePluginsManager();

  useEffect(() => {
    // Register available topics
    pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
      id: "my-topics",
      priority: 10,
      filter: (topics: DatasourceTopic[]) => {
        // Add your topics
        return topics;
      },
    });

    // Handle cleanup
    return () => {
      // Cleanup code
    };
  }, []);

  return <>{children}</>;
};
```

5. Register the Plugin
   Add your plugin to the plugins directory:

### Using Datasources

Datasources can be added and managed through the dashboard UI. The system will:

1. Load available datasource definitions via PluginsHooks.DATASOURCES_LIST
2. Allow users to create datasource instances with custom settings
3. Store datasource configurations in the dashboard state
4. Render provider components for active datasources

The dashboard manages datasources through:

- addDatasource() - Creates new datasource instances
- updateDatasource() - Updates datasource settings
- removeDatasource() - Removes datasource instances

The datasource providers can then:

- Publish data through actions
- Register available topics
- Handle subscriptions/unsubscriptions
- Manage data buffers and connections
