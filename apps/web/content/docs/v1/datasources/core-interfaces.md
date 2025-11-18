# Core Interfaces

This document provides the complete TypeScript interface definitions for the datasource system.

## DatasourceDefinition

The **blueprint** for a datasource type. Every datasource plugin must provide a definition.

```typescript
interface DatasourceDefinition<T = DatasourceProviderSettings> {
    id: string; // Unique identifier (e.g., 'foxglove-source')
    name: string; // Display name (e.g., 'Foxglove WebSocket')
    description: string; // Short description

    titleProp?: string; // Property to use as instance title

    schema: JsonSchema; // JSON Schema for configuration
    uischema?: UISchemaElement; // Optional JSON Forms UI schema
    data: T; // Default/initial settings

    Provider: FC<{
        // React Provider component
        children: ReactNode;
        props: T;
    }>;
}
```

### Properties

#### `id: string`

Unique identifier for the datasource type. Used to reference this datasource definition.

**Convention:** Use kebab-case (e.g., `foxglove-source`, `rest-bag-source`)

#### `name: string`

Human-readable display name shown in the UI.

#### `description: string`

Brief description of what this datasource provides.

#### `titleProp?: string`

Optional property name from settings to use as the datasource instance title. If not provided, uses `settings.title`.

**Example:**

```typescript
titleProp: "url"; // Will use settings.url as title
```

#### `schema: JsonSchema`

JSON Schema defining the configuration structure. This is used to:

- Generate UI forms automatically
- Validate user input
- Provide type information

**Example:**

```typescript
schema: {
  title: "Foxglove WebSocket",
  type: 'object',
  properties: {
    title: {
      type: "string",
      title: "Connection Name"
    },
    enable: {
      type: "boolean",
      title: "Enable Connection"
    },
    url: {
      type: "string",
      title: "WebSocket URL",
      default: "ws://localhost:8765"
    },
    reconnectTimeout: {
      type: "number",
      title: "Reconnect Timeout (seconds)",
      default: 3
    }
  },
  required: ['title', 'url']
}
```

#### `uischema?: UISchemaElement`

Optional JSON Forms UI Schema for custom form layout and controls.

#### `data: T`

Default settings object. Must match the schema structure.

#### `Provider: FC<>`

React Functional Component that provides the datasource functionality. See [Provider Pattern](provider-pattern) for details.

---

## Datasource

A **configured instance** of a datasource type.

```typescript
interface Datasource {
    datasource_id: string; // References DatasourceDefinition.id
    title: string; // Instance display name
    settings: DatasourceProviderSettings; // User configuration
}
```

### Properties

#### `datasource_id: string`

Reference to the `DatasourceDefinition.id` this instance is based on.

#### `title: string`

Display name for this specific instance (e.g., "Robot 1 Connection", "Local ROS").

#### `settings: DatasourceProviderSettings`

Configuration for this instance. Must extend `DatasourceProviderSettings`.

---

## DatasourceProviderSettings

Base settings interface that all datasource configurations must extend.

```typescript
interface DatasourceProviderSettings {
    id: string; // Unique instance ID (auto-generated)
    title: string; // Instance name
    enable: boolean; // Whether datasource is active
}
```

### Extending for Custom Settings

```typescript
interface FoxgloveDataSourceSettings extends DatasourceProviderSettings {
    url: string;
    reconnectTimeout: number;
    toasts: boolean;
    transformTreeTopics: string[];
}
```

---

## DatasourceTopic

Represents a **data stream** exposed by a datasource.

```typescript
interface DatasourceTopic {
    topic: string; // Topic name/path (e.g., '/robot/pose')
    datasource_id: string; // Source datasource instance ID
    source: DatasourceProviderSettings; // Source configuration
    type: string; // Internal webapp type
    rawType: string; // External/native type
    bufferSize?: number; // Optional buffer size
}
```

### Properties

#### `topic: string`

Topic identifier/path. Convention varies by datasource type:

- ROS-style: `/robot/position`, `/camera/image`
- Flat: `temperature`, `battery_status`

#### `datasource_id: string`

The instance ID of the datasource providing this topic.

#### `source: DatasourceProviderSettings`

Complete settings of the source datasource.

#### `type: string`

**Internal** type used within the webapp. Examples:

- `GeolocationPosition`
- `IMU`
- `number`
- `string`
- `PointsCloud`

#### `rawType: string`

**External** type from the datasource. Examples:

- `sensor_msgs/msg/NavSatFix` (ROS2)
- `geometry_msgs/msg/Pose`
- `float64`

#### `bufferSize?: number`

Optional buffer size for historical data.

---

## SelectedTopic

Extension of `DatasourceTopic` with additional property binding information.

```typescript
interface SelectedTopic extends DatasourceTopic {
    property: string; // Property path in data structure
}
```

Used when a widget selects a topic and needs to bind it to a specific property.

---

## DatasourceTopicFilter

Utility class for filtering topics based on regex patterns.

```typescript
class DatasourceTopicFilter {
    name?: RegExp; // Filter by topic name
    type?: RegExp; // Filter by internal type
    rawType?: RegExp; // Filter by raw type
    source_id?: RegExp; // Filter by datasource ID
    strict?: boolean; // Require all filters to match

    constructor(props: DatasourceTopicFilterProps);
    filter(topic: DatasourceTopic): boolean;
}
```

### Constructor Props

```typescript
interface DatasourceTopicFilterProps {
    name?: RegExp; // Topic name pattern
    type?: RegExp; // Type pattern
    rawType?: RegExp; // Raw type pattern
    source_id?: RegExp; // Source ID pattern
    strict?: boolean; // Match mode (default: false)
}
```

### Behavior

- **Non-strict mode** (default): Returns `true` if any specified filter matches
- **Strict mode**: Returns `true` only if ALL specified filters match

### Example Usage

```typescript
// Find all position topics from foxglove
const filter = new DatasourceTopicFilter({
    name: /position/i,
    source_id: /foxglove/,
    strict: true,
});

const positionTopics = allTopics.filter((topic) => filter.filter(topic));
```

```typescript
// Find any IMU or GPS topics
const filter = new DatasourceTopicFilter({
    type: /(IMU|GeolocationPosition)/,
});

const sensorTopics = allTopics.filter((topic) => filter.filter(topic));
```

```typescript
// Find ROS2 sensor messages
const filter = new DatasourceTopicFilter({
    rawType: /^sensor_msgs/,
});

const rosTopics = allTopics.filter((topic) => filter.filter(topic));
```

---

## Type System Summary

```
DatasourceDefinition (Template)
    ↓ instantiate with settings
Datasource (Instance)
    ↓ provides
DatasourceTopic[] (Data Streams)
    ↓ can be filtered by
DatasourceTopicFilter
    ↓ can be selected as
SelectedTopic (Bound to widget property)
```

---

## Complete Example

```typescript
// 1. Define settings interface
interface MyDatasourceSettings extends DatasourceProviderSettings {
    serverUrl: string;
    apiKey: string;
}

// 2. Create definition
const MyDatasourceDefinition: DatasourceDefinition<MyDatasourceSettings> = {
    id: "my-custom-source",
    name: "My Custom Datasource",
    description: "Connects to my custom API",

    schema: {
        type: "object",
        properties: {
            title: { type: "string" },
            enable: { type: "boolean" },
            serverUrl: { type: "string" },
            apiKey: { type: "string" },
        },
    },

    data: {
        id: "",
        title: "My Datasource",
        enable: true,
        serverUrl: "https://api.example.com",
        apiKey: "",
    },

    Provider: MyDatasourceProvider,
};

// 3. Datasource instance (created by system)
const instance: Datasource = {
    datasource_id: "my-custom-source",
    title: "Production API",
    settings: {
        id: "datasource_0_1234567890",
        title: "Production API",
        enable: true,
        serverUrl: "https://prod.example.com",
        apiKey: "secret_key",
    },
};

// 4. Topics exposed
const topics: DatasourceTopic[] = [
    {
        topic: "/api/temperature",
        datasource_id: "datasource_0_1234567890",
        source: instance.settings,
        type: "number",
        rawType: "float64",
    },
];
```

---

## Next Steps

- [Provider Pattern](provider-pattern) - Implement the Provider component
- [Topics & Filters](topics-and-filters) - Deep dive into topic management
- [Creating a Datasource](../implementation/creating-datasource) - Build your own
