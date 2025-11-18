# Plugin System Integration

Datasources integrate with ORMI-CORE through the **Plugin System**, which uses a filter/action hook architecture similar to WordPress.

## Plugin Architecture

```
Plugin Class
    ↓ registers filters/actions
PluginsManager
    ↓ applies filters/triggers actions
Datasource Providers & Widgets
```

---

## Creating a Plugin

### 1. Basic Plugin Structure

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

class MyDatasourcePlugin extends Plugin {
    constructor() {
        super();

        // Plugin metadata
        this.name = "My Datasource Plugin";
        this.description = "Provides custom datasource";
        this.version = "1.0.0";
        this.author = "Your Name";
        this.email = "your.email@example.com";

        // Register datasource
        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "my-datasource-filter",
            priority: 10,
            filter: this.addDatasource,
        });
    }

    private addDatasource = (datasources: DatasourceDefinition[]) => {
        datasources.push(MyDatasourceDefinition);
        return datasources;
    };
}

export default MyDatasourcePlugin;
```

### 2. package.json Configuration

Mark your package as a plugin:

```json
{
    "name": "ormi-my-datasource",
    "version": "1.0.0",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "ormi_plugin": true, // ← Important!
    "dependencies": {
        "@workspace/ormi-core": "workspace:*",
        "@workspace/ormi-plugins": "workspace:*"
    }
}
```

---

## Key Plugin Hooks

### 1. `DATASOURCES_LIST`

**Purpose:** Register datasource definitions  
**Type:** Filter (modifies array)  
**When:** System initialization

```typescript
this.addFilter(PluginsHooks.DATASOURCES_LIST, {
    id: "my-datasource-list",
    priority: 10,
    filter: (datasources: DatasourceDefinition[]) => {
        datasources.push(MyDatasourceDefinition);
        return datasources;
    },
});
```

**Priority:** Lower number = higher priority (runs first)

### 2. `AVAILABLE_TOPICS`

**Purpose:** Expose topics to widgets  
**Type:** Filter (async)  
**When:** Widget queries for topics

```typescript
// In Provider component
pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
    id: `${datasource_id}-topics`,
    priority: 10,
    filter: async (
        topics: DatasourceTopic[],
        filter?: DatasourceTopicFilter
    ) => {
        // Add your topics
        const myTopics = getTopics();

        if (filter) {
            topics.push(...myTopics.filter((t) => filter.filter(t)));
        } else {
            topics.push(...myTopics);
        }

        return topics;
    },
});
```

### 3. Custom Topic Hooks

**Purpose:** Publish/subscribe to specific topics  
**Type:** Action  
**When:** Data published or subscription changes

#### Subscribe Hook

```typescript
pluginsManager.addAction(`${datasource_id}-subscribe`, {
    id: `${datasource_id}-subscribe-handler`,
    priority: 10,
    action: async (topic: SelectedTopic) => {
        console.log(`New subscription to ${topic.topic}`);
        // Start publishing logic
    },
});
```

#### Unsubscribe Hook

```typescript
pluginsManager.addAction(`${datasource_id}-unsubscribe`, {
    id: `${datasource_id}-unsubscribe-handler`,
    priority: 10,
    action: async (topic: SelectedTopic) => {
        console.log(`Unsubscribe from ${topic.topic}`);
        // Stop publishing logic
    },
});
```

#### Publish Hook

```typescript
// Trigger from provider when data arrives
pluginsManager.doAction(
    `${datasource_id}-${topic_name}-published`,
    data,
    Date.now()
);
```

### 4. `WIDGETS_LIST`

**Purpose:** Register widget definitions  
**Type:** Filter  
**When:** System initialization

```typescript
this.addFilter(PluginsHooks.WIDGETS_LIST, {
    id: "my-widgets",
    priority: 10,
    filter: (widgets: WidgetDefinition[]) => {
        widgets.push(MyWidgetDefinition);
        return widgets;
    },
});
```

### 5. `WIDGET_LIST_WITH_DATASOURCE`

**Purpose:** Filter widgets based on available datasources  
**Type:** Filter  
**When:** User opens widget selector

```typescript
this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
    id: "my-widget-filter",
    priority: 10,
    filter: (widgets: WidgetDefinition[], datasources: Datasource[]) => {
        // Only show widget if compatible datasource exists
        const hasCompatible = datasources.some(
            (ds) => ds.datasource_id === "my-datasource"
        );

        if (!hasCompatible) {
            // Remove widget from list
            return widgets.filter((w) => w.id !== "my-widget");
        }

        return widgets;
    },
});
```

---

## Filter vs Action

### Filters

- **Modify and return** data
- Must return the modified value
- Used for transforming arrays/objects
- Example: Adding datasources to list

```typescript
pluginsManager.addFilter(hook, {
    id: "unique-id",
    priority: 10,
    filter: (value, ...args) => {
        // Modify value
        return value;
    },
});
```

### Actions

- **Perform side effects**
- No return value
- Used for triggering events
- Example: Publishing data

```typescript
pluginsManager.addAction(hook, {
    id: "unique-id",
    priority: 10,
    action: async (data, ...args) => {
        // Do something
    },
});
```

---

## Complete Plugin Example

```typescript
// plugins/ormi-my-datasource/src/index.ts

import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import {
    DatasourceDefinition,
    DatasourceProviderSettings,
} from "@workspace/ormi-core/datasources";
import { MyDatasourceProvider } from "./my-datasource-provider";

// Settings interface
interface MyDatasourceSettings extends DatasourceProviderSettings {
    apiUrl: string;
    apiKey: string;
}

// Datasource definition
const MyDatasourceDefinition: DatasourceDefinition<MyDatasourceSettings> = {
    id: "my-datasource",
    name: "My Custom API",
    description: "Connects to my custom API",

    schema: {
        type: "object",
        properties: {
            title: { type: "string", title: "Name" },
            enable: { type: "boolean", title: "Enable" },
            apiUrl: { type: "string", title: "API URL" },
            apiKey: { type: "string", title: "API Key" },
        },
        required: ["title", "apiUrl", "apiKey"],
    },

    data: {
        id: "",
        title: "My API",
        enable: true,
        apiUrl: "https://api.example.com",
        apiKey: "",
    },

    Provider: ({ children, props }) => MyDatasourceProvider(children, props),
};

// Plugin class
class MyDatasourcePlugin extends Plugin {
    constructor() {
        super();

        this.name = "My Datasource Plugin";
        this.description = "Custom API datasource integration";
        this.version = "1.0.0";
        this.author = "Developer Name";
        this.email = "dev@example.com";

        // Register datasource
        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "my-datasource-registration",
            priority: 10,
            filter: (datasources: DatasourceDefinition[]) => {
                datasources.push(MyDatasourceDefinition);
                return datasources;
            },
        });
    }
}

export default MyDatasourcePlugin;
export type { MyDatasourceSettings };
```

---

## Hook Naming Conventions

### System Hooks

Use predefined constants from `PluginsHooks`:

```typescript
PluginsHooks.DATASOURCES_LIST;
PluginsHooks.AVAILABLE_TOPICS;
PluginsHooks.WIDGETS_LIST;
PluginsHooks.WIDGET_LIST_WITH_DATASOURCE;
```

### Datasource-Specific Hooks

Pattern: `${datasource_id}-${action}`

```typescript
`${datasource_id}-subscribe``${datasource_id}-unsubscribe``${datasource_id}-available-topics``${datasource_id}-definition`;
```

### Topic-Specific Hooks

Pattern: `${datasource_id}-${topic_name}-published`

```typescript
`datasource_1-/robot/position-published``foxglove-source-/camera/image-published`;
```

---

## Best Practices

### ✅ Plugin Metadata

Always provide complete metadata:

```typescript
this.name = "Clear descriptive name";
this.description = "What this plugin does";
this.version = "1.0.0"; // Semantic versioning
this.author = "Your Name";
this.email = "contact@example.com";
```

### ✅ Unique IDs

Use descriptive, namespaced IDs:

```typescript
// Good
id: "my-plugin-datasource-registration";
id: "foxglove-topics-filter";

// Bad
id: "datasource"; // Too generic
id: "1"; // Not descriptive
```

### ✅ Priority Values

Common priority ranges:

- **1-5**: Core system plugins
- **10-20**: Standard plugins
- **50+**: Optional/extension plugins

Lower = runs first

### ✅ Cleanup

Always remove hooks when unmounting:

```typescript
useEffect(() => {
    pluginsManager.addFilter(/* ... */);

    return () => {
        pluginsManager.removeFilter(hookName, filterId);
    };
}, []);
```

### ✅ Error Handling

Wrap filter/action logic in try-catch:

```typescript
filter: (datasources) => {
    try {
        datasources.push(MyDefinition);
        return datasources;
    } catch (error) {
        console.error("Failed to register datasource:", error);
        return datasources;
    }
};
```

---

## Plugin Discovery

ORMI-CORE automatically discovers plugins marked with `"ormi_plugin": true` in their `package.json`.

### Monorepo Structure

```
plugins/
    ormi-my-datasource/
        package.json         # "ormi_plugin": true
        src/
            index.ts         # Default export: Plugin class
            provider.tsx
```

### Build Requirements

1. TypeScript compilation to `dist/`
2. Proper exports in `package.json`
3. Default export of Plugin class

```json
{
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.js"
        }
    }
}
```

---

## Testing Your Plugin

### 1. Check Registration

```typescript
const datasources = pluginsManager.applyFilter<DatasourceDefinition[]>(
    PluginsHooks.DATASOURCES_LIST,
    []
);

console.log(
    "Registered datasources:",
    datasources.map((d) => d.id)
);
// Should include your datasource ID
```

### 2. Check Topics

```typescript
const topics = await pluginsManager.applyFilterAsync<DatasourceTopic[]>(
    PluginsHooks.AVAILABLE_TOPICS,
    []
);

console.log("Available topics:", topics);
```

### 3. Test Subscription

```typescript
// Subscribe
await pluginsManager.doActionAsync(`${datasource_id}-subscribe`, mockTopic);

// Check if publishing works
pluginsManager.addAction(`${datasource_id}-${topic}-published`, {
    id: "test-listener",
    action: (data) => console.log("Received:", data),
});
```

---

## Next Steps

- [Provider Pattern](../datasources/provider-pattern) - Implement the provider component
- [Creating a Datasource](../implementation/creating-datasource) - Complete tutorial
- [Plugin Hooks Reference](hooks) - Complete hook documentation
