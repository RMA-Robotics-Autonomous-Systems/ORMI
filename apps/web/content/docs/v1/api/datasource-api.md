---
title: "Datasource API"
order: 3
---

# Datasource API Reference

Datasources connect ORMI-CORE to external data sources and publish data to topics. This reference covers the complete Datasource API.

## DatasourceDefinition Interface

```typescript
interface DatasourceDefinition<T = DatasourceProviderSettings> {
    id: string;
    name: string;
    description: string;
    titleProp?: string;
    schema: JsonSchema;
    uischema?: UISchemaElement;
    data: T;
    Provider: FC<{
        children: ReactNode;
        props: T;
    }>;
}
```

### Properties

#### `id`

**Type:** `string` (required)  
**Unique identifier** for the datasource type.

```typescript
id: "my-websocket-datasource";
```

#### `name`

**Type:** `string` (required)  
**Display name** in datasource management UI.

```typescript
name: "My WebSocket Data Source";
```

#### `description`

**Type:** `string` (required)  
**Short description** of datasource functionality.

```typescript
description: "Connect to custom WebSocket server and stream data";
```

#### `titleProp`

**Type:** `string` (optional)  
**Property name** for datasource instance title.

```typescript
titleProp: "title";
```

#### `schema`

**Type:** `JsonSchema` (required)  
**Configuration schema** for datasource settings.

```typescript
schema: {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      title: 'Datasource Name'
    },
    enable: {
      type: 'boolean',
      title: 'Enable',
      default: true
    },
    url: {
      type: 'string',
      title: 'WebSocket URL',
      format: 'uri'
    },
    reconnect: {
      type: 'boolean',
      title: 'Auto Reconnect',
      default: true
    }
  },
  required: ['title', 'url']
}
```

#### `uischema`

**Type:** `UISchemaElement` (optional)  
**UI layout** for configuration form. If omitted, auto-generated.

```typescript
uischema: {
  type: "VerticalLayout",
  elements: [
    {
      type: "Control",
      scope: "#/properties/title"
    },
    {
      type: "Control",
      scope: "#/properties/enable"
    },
    {
      type: "Control",
      scope: "#/properties/url",
      options: {
        placeholder: "ws://localhost:9090"
      }
    }
  ]
}
```

#### `data`

**Type:** `T` (required)  
**Default configuration** values. Must include base datasource properties.

```typescript
data: {
  id: '',           // Set by system
  title: '',        // User-provided
  enable: true,     // Default enabled
  url: 'ws://localhost:9090',
  reconnect: true
}
```

#### `Provider`

**Type:** `FC<{ children: ReactNode; props: T }>` (required)  
**React Provider component** that manages datasource lifecycle.

```typescript
Provider: ({ children, props }) => {
  return <MyDatasourceProvider {...props}>{children}</MyDatasourceProvider>;
}
```

## DatasourceProviderSettings

Base interface that all datasource settings must extend:

```typescript
interface DatasourceProviderSettings {
    id: string; // Unique instance ID (auto-generated)
    title: string; // User-provided name
    enable: boolean; // Whether datasource is active
}
```

**Example custom settings:**

```typescript
interface WebSocketDatasourceSettings extends DatasourceProviderSettings {
    url: string;
    reconnect: boolean;
    topics: Array<{
        topic: string;
        type: string;
    }>;
}
```

## Datasource Instance

When added to a dashboard, a datasource becomes an instance:

```typescript
interface Datasource {
    datasource_id: string; // Reference to DatasourceDefinition.id
    title: string; // Instance name
    settings: DatasourceProviderSettings; // Current configuration
}
```

## DatasourceTopic Interface

Topics published by datasources:

```typescript
interface DatasourceTopic {
    topic: string; // Topic name: "/robot/velocity"
    datasource_id: string; // Source datasource instance ID
    source: DatasourceProviderSettings; // Datasource settings
    type: string; // Internal webapp type: "Movement"
    rawType: string; // Original type: "geometry_msgs/Twist"
    bufferSize?: number; // Optional default buffer size
}
```

## Provider Implementation

### Basic Structure

```typescript
import { usePluginsManager } from '@workspace/ormi-plugins';
import { ReactNode, useEffect, useRef, useState } from 'react';

interface MyDatasourceSettings extends DatasourceProviderSettings {
  url: string;
  topics: Array<{ topic: string; type: string; }>;
}

export function MyDatasourceProvider(
  children: ReactNode,
  props: MyDatasourceSettings
) {
  const pluginManager = usePluginsManager();
  const datasource_id = props.id;

  // Hook names
  const available_topics_hook = `${datasource_id}-available-topics`;
  const subscribe_hook = `${datasource_id}-subscribe`;
  const unsubscribe_hook = `${datasource_id}-unsubscribe`;
  const definition_hook = `${datasource_id}-definition`;

  // State
  const [initialized, setInitialized] = useState(false);
  const subscribersRef = useRef(new Map<string, Set<Function>>());

  // ... implementation ...

  return <>{initialized && children}</>;
}
```

### Required Hooks

Every datasource must implement these four hooks:

#### 1. Available Topics Hook

**Purpose:** Return list of available topics

```typescript
useEffect(() => {
    pluginManager.addFilter(available_topics_hook, {
        id: datasource_id,
        priority: 10,
        filter: (topics: DatasourceTopic[]) => {
            // Add your datasource's topics
            props.topics.forEach((topicDef) => {
                topics.push({
                    topic: topicDef.topic,
                    datasource_id: datasource_id,
                    source: props,
                    type: topicDef.type, // Internal type
                    rawType: topicDef.type, // Raw type (if same)
                    bufferSize: 10,
                });
            });
            return topics;
        },
    });

    return () => {
        pluginManager.removeFilter(available_topics_hook);
    };
}, [props.topics]);
```

#### 2. Subscribe Hook

**Purpose:** Handle subscription requests from LocalDataSourceProvider

**Important:** The subscribe hook does NOT receive a callback parameter. Instead, LocalDataSourceProvider registers its own action callback for data updates.

```typescript
useEffect(() => {
    pluginManager.addAction(subscribe_hook, {
        id: datasource_id,
        priority: 10,
        action: (topic: SelectedTopic) => {
            // Check if topic is available
            const topicDef = props.topics.find((t) => t.topic === topic.topic);
            if (!topicDef) {
                console.error(`Topic ${topic.topic} not available`);
                return;
            }

            // Track subscriber count
            const count = subscribersCountRef.current.get(topic.topic) || 0;
            subscribersCountRef.current.set(topic.topic, count + 1);

            // Start data generation/connection on first subscriber
            if (count === 0) {
                startTopicDataFlow(topic.topic);
            }

            console.log(`Subscribed to ${topic.topic} (count: ${count + 1})`);
        },
    });

    return () => {
        pluginManager.removeAction(subscribe_hook);
    };
}, []);
```

#### 3. Unsubscribe Hook

**Purpose:** Handle unsubscription requests

```typescript
useEffect(() => {
    pluginManager.addAction(unsubscribe_hook, {
        id: datasource_id,
        priority: 10,
        action: (topic: SelectedTopic, ignoreCount = false) => {
            // Force cleanup if ignoreCount is true
            if (ignoreCount) {
                stopTopicDataFlow(topic.topic);
                subscribersCountRef.current.delete(topic.topic);
                return;
            }

            // Decrement subscriber count
            const count = subscribersCountRef.current.get(topic.topic) || 0;
            const newCount = Math.max(0, count - 1);
            subscribersCountRef.current.set(topic.topic, newCount);

            // Stop data flow when no subscribers remain
            if (newCount === 0) {
                stopTopicDataFlow(topic.topic);
            }

            console.log(
                `Unsubscribed from ${topic.topic} (count: ${newCount})`
            );
        },
    });

    return () => {
        pluginManager.removeAction(unsubscribe_hook);
    };
}, []);
```

#### 4. Definition Hook

**Purpose:** Return datasource settings (used by dashboard persistence)

```typescript
useEffect(() => {
    pluginManager.addFilter(definition_hook, {
        id: datasource_id,
        priority: 10,
        filter: () => props,
    });

    return () => {
        pluginManager.removeFilter(definition_hook);
    };
}, [props]);
```

### Publishing Data

When data arrives from your source, publish it via the PluginManager:

```typescript
const publishData = (
    topic: string,
    data: any,
    timestamp: number,
    referenceFrameId?: string
) => {
    // Publish to PluginManager - triggers ALL registered action callbacks
    // including those from LocalDataSourceProvider instances
    pluginManager.doAction(
        `${datasource_id}-${topic}-published`,
        data,
        timestamp,
        referenceFrameId || "unknown"
    );
};

// Example: WebSocket message handler
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    // Convert to internal type if needed
    const data = convertToInternalType(message.data, message.type);

    publishData(
        message.topic,
        data,
        message.timestamp || Date.now(),
        message.frame_id
    );
};

// Example: Interval-based data generation
const interval = setInterval(() => {
    const randomValue = Math.random() * 100;

    publishData("/sensor/temperature", randomValue, Date.now());
}, 1000 / frequency);
```

**Key Points:**

- Use `doAction` (not `doActionAsync`) for data publishing
- Published data is immediately sent to all registered callbacks
- LocalDataSourceProvider instances receive data via their registered action callbacks
- No need to track callbacks manually - PluginManager handles routing

## Complete Datasource Example

### Simple WebSocket Datasource

```typescript
import { DatasourceDefinition, DatasourceProviderSettings } from '@workspace/ormi-core/datasources';
import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { ReactNode, useEffect, useRef, useState } from 'react';

// Settings interface
interface WebSocketDatasourceSettings extends DatasourceProviderSettings {
  url: string;
  reconnect: boolean;
  topics: Array<{
    topic: string;
    type: string;
  }>;
}

// Provider component
function WebSocketProvider(children: ReactNode, props: WebSocketDatasourceSettings) {
  const pluginManager = usePluginsManager();
  const datasource_id = props.id;

  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef(new Map<string, Set<Function>>());
  const [initialized, setInitialized] = useState(false);

  // Hook names
  const available_topics_hook = `${datasource_id}-available-topics`;
  const subscribe_hook = `${datasource_id}-subscribe`;
  const unsubscribe_hook = `${datasource_id}-unsubscribe`;
  const definition_hook = `${datasource_id}-definition`;

  // Register available topics
  useEffect(() => {
    pluginManager.addFilter(available_topics_hook, {
      id: datasource_id,
      priority: 10,
      filter: (topics: DatasourceTopic[]) => {
        props.topics.forEach(topicDef => {
          topics.push({
            topic: topicDef.topic,
            datasource_id,
            source: props,
            type: topicDef.type,
            rawType: topicDef.type,
            bufferSize: 10
          });
        });
        return topics;
      }
    });

    return () => pluginManager.removeFilter(available_topics_hook);
  }, [props.topics]);

  // Subscribe hook
  useEffect(() => {
    pluginManager.addAction(subscribe_hook, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic, callback: Function) => {
        if (!subscribersRef.current.has(topic.topic)) {
          subscribersRef.current.set(topic.topic, new Set());
        }
        subscribersRef.current.get(topic.topic)!.add(callback);
      }
    });

    return () => pluginManager.removeAction(subscribe_hook);
  }, []);

  // Unsubscribe hook
  useEffect(() => {
    pluginManager.addAction(unsubscribe_hook, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic) => {
        subscribersRef.current.delete(topic.topic);
      }
    });

    return () => pluginManager.removeAction(unsubscribe_hook);
  }, []);

  // Definition hook
  useEffect(() => {
    pluginManager.addFilter(definition_hook, {
      id: datasource_id,
      priority: 10,
      filter: () => props
    });

    return () => pluginManager.removeFilter(definition_hook);
  }, [props]);

  // WebSocket connection
  useEffect(() => {
    if (!props.enable) {
      setInitialized(false);
      return;
    }

    const connect = () => {
      try {
        const ws = new WebSocket(props.url);

        ws.onopen = () => {
          console.log(`WebSocket connected: ${props.url}`);
          setInitialized(true);
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);

          // Publish to subscribers
          pluginManager.doAction(
            `${datasource_id}-${message.topic}-published`,
            message.data,
            Date.now()
          );
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          setInitialized(false);

          // Auto-reconnect
          if (props.reconnect) {
            setTimeout(connect, 3000);
          }
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Failed to connect:', error);
      }
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [props.enable, props.url]);

  return <>{initialized && children}</>;
}

// Datasource definition
export const WebSocketDatasourceDefinition: DatasourceDefinition<WebSocketDatasourceSettings> = {
  id: 'custom-websocket-datasource',
  name: 'WebSocket Data Source',
  description: 'Connect to custom WebSocket server',
  titleProp: 'title',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Name'
      },
      enable: {
        type: 'boolean',
        title: 'Enable',
        default: true
      },
      url: {
        type: 'string',
        title: 'WebSocket URL',
        default: 'ws://localhost:9090'
      },
      reconnect: {
        type: 'boolean',
        title: 'Auto Reconnect',
        default: true
      },
      topics: {
        type: 'array',
        title: 'Topics',
        items: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              title: 'Topic Name'
            },
            type: {
              type: 'string',
              title: 'Data Type',
              enum: ['number', 'boolean', 'Vector3', 'Movement', 'IMU']
            }
          }
        }
      }
    },
    required: ['title', 'url']
  },

  data: {
    id: '',
    title: '',
    enable: true,
    url: 'ws://localhost:9090',
    reconnect: true,
    topics: []
  },

  Provider: ({ children, props }) => WebSocketProvider(children, props)
};
```

## Registration

Register datasource via plugin:

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { WebSocketDatasourceDefinition } from "./websocket-datasource";

class MyPlugin extends Plugin {
    constructor() {
        super({
            name: "WebSocket Plugin",
            version: "1.0.0",
        });

        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "websocket-datasource",
            priority: 10,
            filter: (datasources) => {
                datasources.push(WebSocketDatasourceDefinition);
                return datasources;
            },
        });
    }
}

export default MyPlugin;
```

## Advanced Patterns

### Pattern: Type Conversion

Convert raw data types to internal types:

```typescript
function convertROS2ToInternal(rosMsg: any, rosType: string): any {
    switch (rosType) {
        case "geometry_msgs/Twist":
            return {
                linear: rosMsg.linear as Vector3,
                angular: rosMsg.angular as Vector3,
            } as Movement;

        case "sensor_msgs/Imu":
            return {
                linear_acceleration: rosMsg.linear_acceleration,
                angular_velocity: rosMsg.angular_velocity,
                orientation: rosMsg.orientation,
            } as IMU;

        default:
            return rosMsg;
    }
}

// In onmessage handler
const internalData = convertROS2ToInternal(message.data, message.type);
pluginManager.doAction(
    `${datasource_id}-${topic}-published`,
    internalData,
    timestamp
);
```

### Pattern: Subscription Counting

Track how many widgets are subscribed:

```typescript
const subscriberCountRef = useRef(new Map<string, number>());

// Subscribe
action: (topic: SelectedTopic, callback: Function) => {
    const count = subscriberCountRef.current.get(topic.topic) || 0;
    subscriberCountRef.current.set(topic.topic, count + 1);

    // Only start sending data if first subscriber
    if (count === 0) {
        startPublishing(topic.topic);
    }
};

// Unsubscribe
action: (topic: SelectedTopic) => {
    const count = subscriberCountRef.current.get(topic.topic) || 0;
    subscriberCountRef.current.set(topic.topic, Math.max(0, count - 1));

    // Stop publishing if no more subscribers
    if (count <= 1) {
        stopPublishing(topic.topic);
    }
};
```

### Pattern: Connection Status

Expose connection state to UI:

```typescript
const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected" | "error"
>("disconnected");

// Add status filter
useEffect(() => {
    pluginManager.addFilter(`${datasource_id}-status`, {
        id: datasource_id,
        priority: 10,
        filter: () => connectionStatus,
    });

    return () => pluginManager.removeFilter(`${datasource_id}-status`);
}, [connectionStatus]);

// Update status
ws.onopen = () => setConnectionStatus("connected");
ws.onclose = () => setConnectionStatus("disconnected");
ws.onerror = () => setConnectionStatus("error");
```

### Pattern: Data Buffering/Throttling

```typescript
const lastPublishTime = useRef(new Map<string, number>());
const THROTTLE_MS = 100; // Max 10 Hz

const publishData = (topic: string, data: any) => {
    const now = Date.now();
    const last = lastPublishTime.current.get(topic) || 0;

    if (now - last < THROTTLE_MS) {
        return; // Skip this update
    }

    lastPublishTime.current.set(topic, now);
    pluginManager.doAction(`${datasource_id}-${topic}-published`, data, now);
};
```

## Best Practices

### 1. Cleanup Hooks

Always remove hooks when unmounting:

```typescript
useEffect(() => {
    pluginManager.addFilter(hook_name, filter);
    return () => pluginManager.removeFilter(hook_name);
}, [dependencies]);
```

### 2. Handle Disabled State

Respect the `enable` flag:

```typescript
useEffect(() => {
    if (!props.enable) {
        setInitialized(false);
        // Clean up connections
        return;
    }

    // ... initialize datasource
}, [props.enable]);
```

### 3. Error Handling

Gracefully handle connection errors:

```typescript
try {
    const ws = new WebSocket(props.url);
    // ...
} catch (error) {
    console.error("Failed to connect:", error);
    toast.error("Connection failed");
}
```

### 4. Unique IDs

Use datasource instance ID consistently:

```typescript
const datasource_id = props.id; // System-provided unique ID
const hook_name = `${datasource_id}-subscribe`; // Include in all hook names
```

### 5. Type Safety

Define interfaces for settings and messages:

```typescript
interface MyDatasourceSettings extends DatasourceProviderSettings {
    url: string;
    apiKey: string;
}

interface MyMessage {
    topic: string;
    data: any;
    timestamp: number;
}
```

## Testing Datasources

### Manual Testing

1. Create datasource instance in dashboard
2. Add widget that subscribes to topic
3. Verify data flows to widget
4. Check browser console for errors

### Debug Logging

```typescript
console.log(`[${datasource_id}] Connected`);
console.log(`[${datasource_id}] Publishing to ${topic}:`, data);
console.log(`[${datasource_id}] Subscribers: ${subscriberCount}`);
```

## Next Steps

- **[Creating a Datasource Guide](../guides/creating-datasource)** - Step-by-step tutorial
- **[Data Flow](../core/data-flow)** - Understanding the pub/sub system
- **[Datasource Examples](../examples/datasource-example)** - Real implementations
