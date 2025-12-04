---
title: "Quick Reference"
order: 100
---

# Quick Reference

Fast lookup for common patterns and code snippets.

## Plugin Structure

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

class MyPlugin extends Plugin {
    constructor() {
        super({
            name: "My Plugin",
            version: "1.0.0",
        });
    }

    protected initialize(): void {
        // Register widgets
        this.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: "my-widgets",
            priority: 10,
            filter: (widgets) => {
                widgets.push(MyWidget());
                return widgets;
            },
        });

        // Register datasources
        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "my-datasources",
            priority: 10,
            filter: (datasources) => {
                datasources.push(MyDatasource);
                return datasources;
            },
        });
    }
}

export default MyPlugin;
```

## Simple Widget

```typescript
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

function MyWidget({ title }: { title: string }) {
  return <div>{title}</div>;
}

export function MyWidgetDefinition(): WidgetDefinition {
  return {
    id: 'my-widget',
    name: 'My Widget',
    description: 'Simple widget',
    titleProp: 'title',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' }
      }
    },
    uischema: {
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/title" }
      ]
    },
    data: { title: 'My Widget' },
    Component: (data) => <MyWidget {...data} />
  };
}
```

## Data Widget

```typescript
import { LocalDataSourcesProvider, useLocalDataSource, SelectedTopic } from "@workspace/ormi-core/datasources";

function DataWidget({ topic }: { topic: SelectedTopic }) {
  const { getSource } = useLocalDataSource();
  const source = getSource(topic);

  if (!source || source.data.length === 0) {
    return <div>No data</div>;
  }

  // Get the most recent value
  const latestValue = source.data[source.data.length - 1];
  const latestTime = source.times[source.times.length - 1];

  return (
    <div>
      <div>Value: {JSON.stringify(latestValue)}</div>
      <div>Time: {new Date(latestTime).toLocaleTimeString()}</div>
      <div>Frame: {source.referenceFrameId}</div>
    </div>
  );
}

export function DataWidgetDefinition(): WidgetDefinition {
  return {
    id: 'data-widget',
    name: 'Data Widget',
    description: 'Shows data',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        topic: { type: 'object' }
      }
    },
    uischema: {
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/title" },
        {
          type: "TopicSelect",
          scope: "#/properties/topic",
          options: {
            dataRequirements: {
              accepts: ["number"]
            }
          }
        }
      ]
    },
    data: { title: 'Data Widget' },
    Component: (data) => (
      <LocalDataSourcesProvider
        SelectedTopics={[data.topic]}
        buffersSize={10}
        updateFrequency={30}
      >
        <DataWidget {...data} />
      </LocalDataSourcesProvider>
    )
  };
}
```

## Simple Datasource

```typescript
import { DatasourceDefinition, DatasourceProviderSettings } from "@workspace/ormi-core/datasources";
import { usePluginsManager } from "@workspace/ormi-plugins";

interface MyDatasourceSettings extends DatasourceProviderSettings {
  interval: number;
}

function MyDatasourceProvider(children, props: MyDatasourceSettings) {
  const pluginManager = usePluginsManager();
  const datasource_id = props.id;

  // Register available topics
  useEffect(() => {
    pluginManager.addFilter(`${datasource_id}-available-topics`, {
      id: datasource_id,
      priority: 10,
      filter: (topics) => {
        topics.push({
          topic: '/data',
          datasource_id,
          source: props,
          type: 'number',
          rawType: 'number'
        });
        return topics;
      }
    });
    return () => pluginManager.removeFilter(`${datasource_id}-available-topics`);
  }, []);

  // Subscribe hook - handles subscription requests
  useEffect(() => {
    const subscribersCountRef = useRef(new Map<string, number>());

    pluginManager.addAction(`${datasource_id}-subscribe`, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic) => {
        // Track subscriber count
        const count = subscribersCountRef.current.get(topic.topic) || 0;
        subscribersCountRef.current.set(topic.topic, count + 1);

        // Start publishing on first subscriber
        if (count === 0) {
          startPublishing(topic.topic);
        }
      }
    });
    return () => pluginManager.removeAction(`${datasource_id}-subscribe`);
  }, []);

  // Unsubscribe hook - handles unsubscription
  useEffect(() => {
    pluginManager.addAction(`${datasource_id}-unsubscribe`, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic, ignoreCount = false) => {
        if (ignoreCount) {
          stopPublishing(topic.topic);
          return;
        }

        const count = subscribersCountRef.current.get(topic.topic) || 0;
        const newCount = Math.max(0, count - 1);
        subscribersCountRef.current.set(topic.topic, newCount);

        // Stop publishing when no subscribers
        if (newCount === 0) {
          stopPublishing(topic.topic);
        }
      }
    });
    return () => pluginManager.removeAction(`${datasource_id}-unsubscribe`);
  }, []);

  // Definition hook
  useEffect(() => {
    pluginManager.addFilter(`${datasource_id}-definition`, {
      id: datasource_id,
      priority: 10,
      filter: () => props
    });
    return () => pluginManager.removeFilter(`${datasource_id}-definition`);
  }, [props]);

  // Publish data - example with interval-based generation
  useEffect(() => {
    if (!props.enable) return;

    const interval = setInterval(() => {
      const value = Math.random();

      // Publish to PluginManager - triggers LocalDataSourceProvider callbacks
      pluginManager.doAction(
        `${datasource_id}-/data-published`,
        value,                    // data
        Date.now(),              // timestamp
        "sensor_frame"           // referenceFrameId (optional)
      );
    }, props.interval);

    return () => clearInterval(interval);
  }, [props.enable, props.interval]);

  return <>{children}</>;
}

export const MyDatasource: DatasourceDefinition<MyDatasourceSettings> = {
  id: 'my-datasource',
  name: 'My Datasource',
  description: 'Generates random data',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      enable: { type: 'boolean', default: true },
      interval: { type: 'number', default: 1000 }
    }
  },
  data: {
    id: '',
    title: '',
    enable: true,
    interval: 1000
  },
  Provider: ({ children, props }) => MyDatasourceProvider(children, props)
};
```

## PluginManager Usage

```typescript
import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';

function MyComponent() {
  const pluginManager = usePluginsManager();

  // Apply filter
  const widgets = pluginManager.applyFilter<WidgetDefinition[]>(
    PluginsHooks.WIDGETS_LIST,
    []
  );

  // Execute action
  pluginManager.doAction('my-action', arg1, arg2);

  // Add runtime filter
  useEffect(() => {
    pluginManager.addFilter('my-hook', {
      id: 'my-filter',
      priority: 10,
      filter: (value) => value
    });

    return () => pluginManager.removeFilter('my-filter');
  }, []);

  return <div>{/* ... */}</div>;
}
```

## Topic Filtering

```typescript
import { DatasourceTopicFilter } from "@workspace/ormi-core/datasources";

// Filter by type
const filter = new DatasourceTopicFilter({
    type: /number|boolean/,
});

// Filter by name pattern
const robotTopics = new DatasourceTopicFilter({
    name: /^\/robot\//,
});

// Filter by datasource
const foxgloveTopics = new DatasourceTopicFilter({
    source_id: /foxglove/,
});

// Use filter
const topics = pluginManager.applyFilter(
    PluginsHooks.AVAILABLE_TOPICS,
    [],
    filter
);
```

## Common Hooks

```typescript
// Widgets
PluginsHooks.WIDGETS_LIST;
PluginsHooks.WIDGET_LIST_WITH_DATASOURCE;

// Datasources
PluginsHooks.DATASOURCES_LIST;
PluginsHooks.AVAILABLE_DATASOURCES;
PluginsHooks.AVAILABLE_TOPICS;

// Renderers
PluginsHooks.JSON_FORMS_RENDERER;

// Transforms
PluginsHooks.TRANSFORM_TREE;

// Visualizers
PluginsHooks.MAP_LOCAL_VISUALIZERS;
```

## TypeScript Types

```typescript
// Import types
import type {
    Vector3,
    Movement,
    IMU,
    Path,
    PointsCloud,
    GeolocationPosition,
} from "@workspace/ormi-core/types";

// Use in code
const velocity: Movement = {
    linear: { x: 1, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0.5 },
};
```

## Build Commands

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Build specific package
cd packages/ormi-core
bun run build

# Watch mode
bun run dev

# Start webapp
cd apps/web
bun run dev

# Lint
bun run lint

# Type check
bun run typecheck
```

## File Structure

```
my-plugin/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts           # Plugin class
    ├── widgets/
    │   ├── index.ts       # Widget exports
    │   └── my-widget.tsx
    └── datasources/
        ├── index.ts       # Datasource exports
        └── my-datasource.tsx
```

## Common Patterns

### Error Handling

```typescript
if (!topic) {
  return <div>Please select a topic</div>;
}

const data = sources.get(topic.topic);
if (!data || data.length === 0) {
  return <div>Waiting for data...</div>;
}
```

### Derived Values

```typescript
const speeds = velocities.map((v) =>
    Math.sqrt(v.linear.x ** 2 + v.linear.y ** 2)
);
const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
```

### Publishing Data

```typescript
pluginManager.doAction(`${datasource_id}-${topic}-published`, data, Date.now());
```

## Debugging

```typescript
// Plugin loading
console.log("[MyPlugin] Initializing");

// Hook execution
console.log("[MyPlugin] Registering widgets");

// Data flow
console.log("[MyDatasource] Publishing:", data);
console.log("[MyWidget] Received:", data);
```

## Resources

- **[Plugin System](../core/plugin-system)** - Full architecture
- **[Widget API](../api/widget-api)** - Complete reference
- **[Datasource API](../api/datasource-api)** - Complete reference
- **[Creating a Plugin](creating-plugin)** - Step-by-step guide
