# Datasource System Overview

The ORMI-CORE datasource system provides a **plugin-based architecture** for integrating real-time data sources into dashboards. This system enables widgets to subscribe to topics from various data providers (ROS2, WebSockets, REST APIs, etc.) through a unified interface.

## Core Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Widget Layer (Consumers)                      │
│  - Widgets subscribe to topics                         │
│  - Receive data updates through plugin hooks           │
│  - Can publish data back to datasources                │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│ Layer 2: Plugin Manager (Pub/Sub Hub)                  │
│  - Routes topic subscriptions                           │
│  - Manages filters and hooks                            │
│  - Coordinates data flow                                │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│ Layer 3: Datasource Layer (Providers)                  │
│  - Expose available topics                              │
│  - Publish data to subscribers                          │
│  - Manage external connections                          │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### 1. DatasourceDefinition

The blueprint for a datasource type. Defines:

- Unique identifier
- Configuration schema (JSON Schema)
- Default settings
- React Provider component

**Example:**

```typescript
{
  id: 'foxglove-source',
  name: 'Foxglove WebSocket',
  description: 'Connect via Foxglove protocol',
  schema: { /* JSON Schema */ },
  data: { /* Default settings */ },
  Provider: FoxgloveSourceProvider
}
```

### 2. Datasource Instance

A configured instance of a datasource type:

- References a DatasourceDefinition (via `datasource_id`)
- Contains user-provided settings
- Unique instance ID
- Title/name

### 3. Topics

Topics are **data streams** exposed by datasources:

```typescript
interface DatasourceTopic {
    topic: string; // e.g., "/robot/position"
    datasource_id: string; // Source instance ID
    source: DatasourceProviderSettings; // Source config
    type: string; // Internal webapp type
    rawType: string; // External/native type
    bufferSize?: number; // Optional buffering
}
```

### 4. Provider Component

Each datasource implements a React Provider that:

1. Establishes connections to external sources
2. Registers available topics with the plugin manager
3. Handles subscriptions/unsubscriptions
4. Publishes data to subscribers via plugin hooks

## Data Flow

### Publishing Data

```
External Source → Datasource Provider → Plugin Hook → Widget
```

1. **External data arrives** (WebSocket message, API response, etc.)
2. **Provider publishes** via `pluginsManager.doAction(hook, data, timestamp)`
3. **Plugin Manager routes** to all subscribers
4. **Widgets receive** data updates

### Subscription Flow

```
Widget → Plugin Filter → Datasource Provider → External Subscription
```

1. **Widget requests** topic subscription via filter
2. **Provider receives** subscription hook call
3. **Provider establishes** external subscription (if needed)
4. **Data flows** back through publishing flow

## Plugin System Integration

Datasources integrate through **three main hooks**:

### 1. `DATASOURCES_LIST`

Register datasource definitions:

```typescript
pluginsManager.addFilter(PluginsHooks.DATASOURCES_LIST, {
    id: "my-datasource",
    priority: 10,
    filter: (datasources) => {
        datasources.push(myDatasourceDefinition);
        return datasources;
    },
});
```

### 2. `AVAILABLE_TOPICS`

Expose available topics to widgets:

```typescript
pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
    id: `${datasource_id}-available-topics`,
    priority: 10,
    filter: async (topics, filter?) => {
        // Add your topics
        topics.push(...myTopics);
        return topics;
    },
});
```

### 3. Topic-Specific Hooks

For subscriptions and data:

```typescript
// Subscribe
`${datasource_id}-subscribe`
// Unsubscribe
`${datasource_id}-unsubscribe`
// Data publication
`${datasource_id}-${topic_name}-published`;
```

## Topic Filtering

The system includes a powerful filtering mechanism:

```typescript
const filter = new DatasourceTopicFilter({
    name: /^\/robot\/.*/, // Topic name regex
    type: /GeolocationPosition/, // Internal type regex
    rawType: /sensor_msgs/, // External type regex
    source_id: /foxglove/, // Datasource ID regex
    strict: true, // Match all criteria
});

const matches = filter.filter(topic); // true/false
```

## Configuration via JSON Schema

Datasources are configured using JSON Schema:

```typescript
schema: {
  title: "My Datasource",
  type: 'object',
  properties: {
    title: { type: "string", title: "Title" },
    enable: { type: "boolean", title: "Enable" },
    url: { type: "string", title: "Server URL" },
    timeout: { type: "number", title: "Timeout (ms)" }
  },
  required: ['title', 'url']
}
```

This enables:

- **Auto-generated UI** via JSON Forms
- **Validation** of settings
- **Type safety** through TypeScript interfaces

## Lifecycle

### 1. Registration Phase

- Plugin loads and registers datasource definition
- Definition added to `DATASOURCES_LIST`

### 2. Configuration Phase

- User selects datasource type
- UI generated from schema
- Settings validated

### 3. Instantiation Phase

- Datasource instance created with settings
- Provider component mounted in React tree
- Connection established

### 4. Operation Phase

- Topics exposed via `AVAILABLE_TOPICS`
- Subscriptions handled
- Data published to subscribers

### 5. Cleanup Phase

- Provider unmounted
- Connections closed
- Resources released

## Benefits

✅ **Decoupled** - Widgets don't know about datasource implementations  
✅ **Extensible** - New datasources via plugins  
✅ **Type-safe** - Full TypeScript support  
✅ **Configurable** - JSON Schema-based configuration  
✅ **Real-time** - Built for streaming data  
✅ **Flexible** - Pub/sub pattern allows 1:N relationships

## Next Steps

- [Core Interfaces](core-interfaces) - Detailed interface reference
- [Provider Pattern](provider-pattern) - How to implement providers
- [Creating a Datasource](../implementation/creating-datasource) - Step-by-step guide
