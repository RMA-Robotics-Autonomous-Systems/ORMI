---
title: "Plugin Development (V2)"
order: 5
---

# V2 Plugin Development Guide

Guide for creating plugins that work with the V2 Jotai-based architecture.

## Overview

V2 plugins have the same structure as V1 plugins but register different types of extensions:

**V1 registered:**

- Provider components
- Pub/sub actions

**V2 registers:**

- Connection factories
- Widget definitions with version markers
- Custom hooks (optional)

---

## Plugin Structure

### Basic Plugin Template

```typescript
// plugins/my-plugin/src/index.ts
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

export class MyPluginV2 extends Plugin {
    constructor() {
        super();
        this.name = "My Plugin V2";
        this.version = "2.0.0";

        this.registerWidgets();
        this.registerDatasources();
        this.registerRenderers();
    }

    private registerWidgets() {
        this.addFilter(PluginsHooks.WIDGETS_LIST_V2, {
            id: "my-plugin-widgets",
            priority: 10,
            filter: (widgets) => {
                // Import widget definitions
                widgets.push(MyWidgetDefinition(), AnotherWidgetDefinition());
                return widgets;
            },
        });
    }

    private registerDatasources() {
        this.addFilter(PluginsHooks.DATASOURCE_CONNECTIONS_V2, {
            id: "my-plugin-datasources",
            priority: 10,
            filter: (connections) => {
                // Register connection factories
                connections.set("my-datasource-type", {
                    name: "My Datasource",
                    createConnection: (config) => new MyConnection(config),
                    schema: MyConnectionSchema,
                    uischema: MyConnectionUISchema,
                });
                return connections;
            },
        });
    }

    private registerRenderers() {
        this.addFilter(PluginsHooks.JSONFORMS_RENDERERS, {
            id: "my-plugin-renderers",
            priority: 10,
            filter: (renderers) => {
                renderers.push(MyCustomRenderer);
                return renderers;
            },
        });
    }
}

export default new MyPluginV2();
```

### File Structure

```
plugins/my-plugin/
├── src/
│   ├── index.ts                 # Plugin entry point
│   ├── widgets/
│   │   ├── widget-a.tsx
│   │   └── widget-b.tsx
│   ├── datasources/
│   │   ├── connection-a.ts
│   │   └── connection-b.ts
│   ├── hooks/                   # Optional custom hooks
│   │   └── useCustomData.ts
│   ├── renderers/               # Optional JSON Forms renderers
│   │   └── custom-renderer.tsx
│   └── types/
│       └── index.ts
├── package.json
└── tsconfig.json
```

---

## Widget Development

### Widget Definition

```typescript
// widgets/my-widget.tsx
import { useDataStream } from '@workspace/ormi-core/v2'
import type { WidgetDefinition } from '@workspace/ormi-core/widgets'

interface MyWidgetProps {
  datasourceId: string;
  topic: SelectedTopic;
  // ... other config
}

function MyWidget({ topic, ...config }: MyWidgetProps) {
  const { data, isLoading, error } = useDataStream<MyDataType>(topic)

  if (isLoading) return <Loading />
  if (error) return <ErrorDisplay error={error} />

  return <div>{/* Render data */}</div>
}

export function MyWidgetDefinition(): WidgetDefinition {
  return {
    id: 'my-widget-v2',
    name: 'My Widget',
    description: 'Does something useful',
    version: 2,  // IMPORTANT: Mark as V2

    schema: {
      type: 'object',
      required: ['datasourceId', 'topic'],
      properties: {
        datasourceId: {
          type: 'string',
          title: 'Datasource'
        },
        topic: {
          type: 'string',
          title: 'Topic'
        }
        // ... other properties
      }
    },

    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/datasourceId',
          options: {
            format: 'datasource-selector'  // Custom renderer
          }
        },
        {
          type: 'Control',
          scope: '#/properties/topic',
          options: {
            format: 'topic-selector'  // Custom renderer
          }
        }
      ]
    },

    data: {
      datasourceId: '',
      topic: ''
    },

    Component: MyWidget
  }
}
```

### Widget Best Practices

#### 1. Always Handle Loading and Error States

```typescript
function MyWidget({ topic }: { topic: SelectedTopic }) {
  const { data, isLoading, error, status } = useDataStream(topic)

  // Handle disconnected datasource
  if (status === 'disconnected') {
    return <Alert>Datasource not connected</Alert>
  }

  // Handle loading state
  if (isLoading) {
    return <Skeleton />
  }

  // Handle errors
  if (error) {
    return <ErrorDisplay error={error} />
  }

  // Handle no data
  if (!data) {
    return <NoData />
  }

  // Render data
  return <Display data={data} />
}
```

#### 2. Use TypeScript for Data Types

```typescript
interface SensorData {
  temperature: number;
  humidity: number;
  pressure: number;
}

function SensorWidget({ datasourceId, topic }: Props) {
  const { data } = useDataStream<SensorData>(datasourceId, topic)

  // TypeScript knows data is SensorData | null
  return (
    <div>
      <div>Temp: {data?.temperature}°C</div>
      <div>Humidity: {data?.humidity}%</div>
      <div>Pressure: {data?.pressure}hPa</div>
    </div>
  )
}
```

#### 3. Memoize Expensive Computations

```typescript
function ChartWidget({ datasourceId, topic }: Props) {
  const { buffer } = useDataBuffer(datasourceId, topic, 100)

  const chartData = useMemo(() => {
    return buffer.map(msg => ({
      x: msg.timestamp,
      y: extractValue(msg.value)  // Expensive operation
    }))
  }, [buffer])

  return <LineChart data={chartData} />
}
```

#### 4. Add PropTypes or Zod Validation

```typescript
import { z } from "zod";

const MyWidgetPropsSchema = z.object({
    datasourceId: z.string().min(1, "Datasource required"),
    topic: z.string().min(1, "Topic required"),
    threshold: z.number().min(0).max(100).optional(),
});

type MyWidgetProps = z.infer<typeof MyWidgetPropsSchema>;

function MyWidget(props: MyWidgetProps) {
    // Validate props
    const validated = MyWidgetPropsSchema.parse(props);

    // ... widget code
}
```

---

## Datasource Development

### Connection Implementation

```typescript
// datasources/my-connection.ts
import {
    Connection,
    TopicInfo,
    MessageMetadata,
} from "@workspace/ormi-core/v2";

interface MyConnectionConfig {
    id: string;
    url: string;
    apiKey?: string;
    // ... other config
}

export class MyConnection implements Connection {
    private config: MyConnectionConfig;
    private client: any; // Your client library
    private subscriptions = new Map<string, number>();
    private eventTarget = new EventTarget();
    private connected = false;

    constructor(config: MyConnectionConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        try {
            this.client = await createClient(this.config.url, {
                apiKey: this.config.apiKey,
            });

            this.client.on("connected", () => {
                this.connected = true;
                this.emit("connected");
            });

            this.client.on("disconnected", () => {
                this.connected = false;
                this.emit("disconnected");
            });

            this.client.on("error", (error: Error) => {
                this.emit("error", error);
            });

            await this.client.connect();
        } catch (error) {
            this.emit("error", error as Error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.disconnect();
            this.client = null;
        }
        this.connected = false;
        this.emit("disconnected");
    }

    isConnected(): boolean {
        return this.connected;
    }

    subscribe(topic: string): void {
        // Reference counting
        const count = this.subscriptions.get(topic) || 0;
        this.subscriptions.set(topic, count + 1);

        if (count === 0) {
            // First subscriber - start streaming
            this.client.subscribe(topic, (data: any) => {
                this.emit("message", topic, data, {
                    timestamp: Date.now(),
                    frameId: data.frame_id,
                });
            });
        }
    }

    unsubscribe(topic: string): void {
        const count = this.subscriptions.get(topic) || 0;

        if (count <= 1) {
            // Last subscriber - stop streaming
            this.client.unsubscribe(topic);
            this.subscriptions.delete(topic);
        } else {
            this.subscriptions.set(topic, count - 1);
        }
    }

    async discoverTopics(): Promise<TopicInfo[]> {
        const topics = await this.client.getTopics();
        return topics.map((t: any) => ({
            topic: t.name,
            type: t.type,
            schema: t.schema,
        }));
    }

    async publish(topic: string, data: any): Promise<void> {
        await this.client.publish(topic, data);
    }

    // Event emitter implementation
    on(event: string, callback: Function): void {
        this.eventTarget.addEventListener(event, ((e: CustomEvent) => {
            if (event === "message") {
                callback(e.detail.topic, e.detail.data, e.detail.metadata);
            } else {
                callback(e.detail);
            }
        }) as EventListener);
    }

    off(event: string, callback: Function): void {
        this.eventTarget.removeEventListener(event, callback as EventListener);
    }

    private emit(event: string, ...args: any[]) {
        const detail =
            event === "message"
                ? { topic: args[0], data: args[1], metadata: args[2] }
                : args[0];

        this.eventTarget.dispatchEvent(new CustomEvent(event, { detail }));
    }
}
```

### Connection Registration

```typescript
// datasources/index.ts
import { MyConnection } from "./my-connection";

export const MyDatasourceDefinition = {
    id: "my-datasource",
    name: "My Datasource",
    version: 2,

    createConnection: (config: any) => new MyConnection(config),

    schema: {
        type: "object",
        required: ["id", "url"],
        properties: {
            id: {
                type: "string",
                title: "ID",
                description: "Unique identifier for this datasource",
            },
            url: {
                type: "string",
                title: "Server URL",
                format: "uri",
            },
            apiKey: {
                type: "string",
                title: "API Key (optional)",
                format: "password",
            },
        },
    },

    uischema: {
        type: "VerticalLayout",
        elements: [
            { type: "Control", scope: "#/properties/id" },
            { type: "Control", scope: "#/properties/url" },
            {
                type: "Control",
                scope: "#/properties/apiKey",
                options: {
                    format: "password",
                },
            },
        ],
    },
};
```

### Connection Best Practices

#### 1. Handle Reconnection

```typescript
class MyConnection implements Connection {
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 5000;

    async connect(): Promise<void> {
        try {
            await this.doConnect();
            this.reconnectAttempts = 0;
        } catch (error) {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                setTimeout(() => this.connect(), this.reconnectDelay);
            } else {
                this.emit(
                    "error",
                    new Error("Max reconnection attempts reached")
                );
            }
        }
    }
}
```

#### 2. Implement Heartbeat

```typescript
class MyConnection implements Connection {
    private heartbeatInterval?: NodeJS.Timer;

    async connect(): Promise<void> {
        // ... connection logic

        // Start heartbeat
        this.heartbeatInterval = setInterval(() => {
            this.client.ping().catch((error) => {
                this.emit("error", new Error("Heartbeat failed"));
                this.reconnect();
            });
        }, 30000); // Every 30 seconds
    }

    async disconnect(): Promise<void> {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        // ... disconnect logic
    }
}
```

#### 3. Buffer Messages During Reconnection

```typescript
class MyConnection implements Connection {
    private messageBuffer: Array<{ topic: string; data: any }> = [];
    private bufferSize = 100;

    subscribe(topic: string): void {
        this.client.on(topic, (data: any) => {
            if (this.connected) {
                this.emit("message", topic, data, { timestamp: Date.now() });
            } else {
                // Buffer messages during disconnection
                this.messageBuffer.push({ topic, data });
                if (this.messageBuffer.length > this.bufferSize) {
                    this.messageBuffer.shift();
                }
            }
        });
    }

    async connect(): Promise<void> {
        await this.doConnect();

        // Emit buffered messages
        this.messageBuffer.forEach(({ topic, data }) => {
            this.emit("message", topic, data, { timestamp: Date.now() });
        });
        this.messageBuffer = [];
    }
}
```

---

## Custom Hooks

Create reusable hooks for your plugin.

### Example: Filtered Data Hook

```typescript
// hooks/useFilteredData.ts
import { useMemo } from "react";
import { useDataStream } from "@workspace/ormi-core/v2";

export function useFilteredData<T>(
    datasourceId: string,
    topic: string,
    predicate: (data: T) => boolean
) {
    const { data, ...rest } = useDataStream<T>(datasourceId, topic);

    const filteredData = useMemo(() => {
        if (!data) return null;
        return predicate(data) ? data : null;
    }, [data, predicate]);

    return { data: filteredData, ...rest };
}
```

### Example: Aggregated Data Hook

```typescript
// hooks/useAggregatedData.ts
import { useMemo } from "react";
import { useDataBuffer } from "@workspace/ormi-core/v2";

export function useAggregatedData(
    datasourceId: string,
    topic: string,
    aggregator: "mean" | "max" | "min" | "sum"
) {
    const { buffer } = useDataBuffer<number>(datasourceId, topic, 100);

    const aggregated = useMemo(() => {
        if (buffer.length === 0) return null;

        const values = buffer.map((msg) => msg.value);

        switch (aggregator) {
            case "mean":
                return values.reduce((a, b) => a + b, 0) / values.length;
            case "max":
                return Math.max(...values);
            case "min":
                return Math.min(...values);
            case "sum":
                return values.reduce((a, b) => a + b, 0);
        }
    }, [buffer, aggregator]);

    return aggregated;
}
```

---

## Custom Renderers

Create JSON Forms renderers for widget configuration.

### Datasource Selector Renderer

```typescript
// renderers/datasource-selector.tsx
import { useAvailableDatasources } from '@workspace/ormi-core/v2'
import { withJsonFormsControlProps } from '@jsonforms/react'

function DatasourceSelectorRenderer({
  data,
  handleChange,
  path
}: ControlProps) {
  const datasources = useAvailableDatasources()

  return (
    <select
      value={data || ''}
      onChange={(e) => handleChange(path, e.target.value)}
    >
      <option value="">Select datasource...</option>
      {Array.from(datasources.entries()).map(([id, ds]) => (
        <option key={id} value={id}>
          {ds.settings.name || id}
        </option>
      ))}
    </select>
  )
}

export default withJsonFormsControlProps(DatasourceSelectorRenderer)

// Tester
export const datasourceSelectorTester = (uischema: any, schema: any) => {
  return schema.format === 'datasource-selector' ? 10 : -1
}
```

### Topic Selector Renderer

```typescript
// renderers/topic-selector.tsx
import { useAvailableTopics } from '@workspace/ormi-core/v2'
import { withJsonFormsControlProps } from '@jsonforms/react'

function TopicSelectorRenderer({
  data,
  handleChange,
  path,
  rootSchema
}: ControlProps) {
  // Get datasourceId from sibling property
  const datasourceId = rootSchema?.properties?.datasourceId?.const

  const topics = useAvailableTopics(datasourceId || '')

  return (
    <select
      value={data || ''}
      onChange={(e) => handleChange(path, e.target.value)}
      disabled={!datasourceId}
    >
      <option value="">Select topic...</option>
      {topics.map((topic) => (
        <option key={topic.topic} value={topic.topic}>
          {topic.topic} ({topic.type})
        </option>
      ))}
    </select>
  )
}

export default withJsonFormsControlProps(TopicSelectorRenderer)

export const topicSelectorTester = (uischema: any, schema: any) => {
  return schema.format === 'topic-selector' ? 10 : -1
}
```

---

## Testing

### Widget Testing

```typescript
// __tests__/my-widget.test.tsx
import { render, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { dataAtomFamily } from '@workspace/ormi-core/v2/atoms'
import { MyWidget } from '../widgets/my-widget'

describe('MyWidget', () => {
  it('displays data', async () => {
    const store = createStore()

    // Set test data
    const atom = dataAtomFamily({
      datasourceId: 'test',
      topic: '/test'
    })
    store.set(atom, {
      value: { message: 'Hello' },
      timestamp: Date.now(),
      frameId: 'test'
    })

    const { getByText } = render(
      <Provider store={store}>
        <MyWidget datasourceId="test" topic="/test" />
      </Provider>
    )

    await waitFor(() => {
      expect(getByText('Hello')).toBeInTheDocument()
    })
  })
})
```

### Connection Testing

```typescript
// __tests__/my-connection.test.ts
import { MyConnection } from "../datasources/my-connection";

describe("MyConnection", () => {
    it("connects and emits connected event", async () => {
        const connection = new MyConnection({
            id: "test",
            url: "http://localhost:8080",
        });

        const connectedPromise = new Promise((resolve) => {
            connection.on("connected", resolve);
        });

        await connection.connect();
        await connectedPromise;

        expect(connection.isConnected()).toBe(true);
    });

    it("emits message events", async () => {
        const connection = new MyConnection({ id: "test", url: "..." });

        const messages: any[] = [];
        connection.on("message", (topic, data, metadata) => {
            messages.push({ topic, data, metadata });
        });

        await connection.connect();
        connection.subscribe("/test");

        // Trigger message somehow
        // ...

        expect(messages.length).toBeGreaterThan(0);
    });
});
```

---

## Publishing

### Package Structure

```json
{
    "name": "@my-org/ormi-plugin-xyz",
    "version": "2.0.0",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.js"
        }
    },
    "peerDependencies": {
        "@workspace/ormi-core": "^2.0.0",
        "@workspace/ormi-plugins": "^2.0.0",
        "jotai": "^2.0.0",
        "react": "^18.0.0"
    }
}
```

### Documentation

Include these sections in your plugin README:

1. **Installation**
2. **Configuration**
3. **Widgets** - List and describe each widget
4. **Datasources** - List and describe each datasource
5. **Examples** - Code examples
6. **API Reference** - TypeScript types
7. **Migration** - If upgrading from V1

---

## Best Practices Summary

✅ **DO:**

- Mark widgets with `version: 2`
- Handle loading, error, and disconnected states
- Use TypeScript for data types
- Implement proper cleanup in connections
- Add unit tests for widgets and connections
- Document your API

❌ **DON'T:**

- Use V1 hooks in V2 widgets
- Create atoms inside render functions
- Forget to unsubscribe in connection cleanup
- Ignore connection errors
- Mix V1 and V2 patterns in same component

---

## Example: Complete Plugin

See [Complete Examples](./examples#plugin-development) for a full plugin implementation.

## Next Steps

- Review [Connection API](./api/connection-api) for data source implementation
- Review [Hooks API](./api/hooks-api) for widget development patterns
- Study [Complete Examples](./examples) for real-world implementations
- Start coding your plugin!
