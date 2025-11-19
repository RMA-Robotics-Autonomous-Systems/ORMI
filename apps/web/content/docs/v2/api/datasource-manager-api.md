---
title: "DatasourceManager API"
description: API for managing datasource connections and lifecycle
order: 5
---

# DatasourceManager API

## Overview

The **DatasourceManager** provides the API for managing datasource connections in V2. It orchestrates Connection lifecycle and provides plugin integration points.

**Key responsibilities:**

1. Create/destroy Connection instances based on datasource configuration
2. Provide plugin API for datasource interaction
3. Manage connection state transitions
4. Route connection events to atoms

For architectural details on how DatasourceManager works internally, see **[Core - Architecture](../core/architecture)**.

## Architecture Overview

```
┌─────────────────────┐
│  datasourcesAtom    │  ← Dashboard UI writes here
│  (Jotai atom)       │
└──────────┬──────────┘
           │
           │ reads
           ▼
┌─────────────────────┐
│ DatasourceManager   │  ← Orchestrator
└──────────┬──────────┘
           │
           │ creates/destroys
           ▼
┌─────────────────────┐
│   Connection[]      │  ← One per datasource
└──────────┬──────────┘
           │
           │ writes data to
           ▼
┌─────────────────────┐
│  dataAtomFamily     │  ← Widgets read from here
│  (per-topic atoms)  │
└─────────────────────┘
```

## Core Responsibilities

### 1. Connection Lifecycle Management

The DatasourceManager monitors the `datasourcesAtom` and manages Connection instances:

```typescript
import { useAtomValue } from "jotai";
import { datasourcesAtom } from "@/atoms/dashboard";
import { Connection } from "@/lib/connections";

export function DatasourceManager() {
    const datasources = useAtomValue(datasourcesAtom);
    const connectionsRef = useRef<Map<string, Connection>>(new Map());

    useEffect(() => {
        const currentIds = new Set(
            datasources.filter((ds) => ds.enabled).map((ds) => ds.id)
        );
        const existingIds = new Set(connectionsRef.current.keys());

        // Remove connections for disabled/deleted datasources
        for (const id of existingIds) {
            if (!currentIds.has(id)) {
                connectionsRef.current.get(id)?.disconnect();
                connectionsRef.current.delete(id);
            }
        }

        // Create connections for new enabled datasources
        for (const datasource of datasources) {
            if (
                datasource.enabled &&
                !connectionsRef.current.has(datasource.id)
            ) {
                const connection = createConnection(datasource);
                connection.connect();
                connectionsRef.current.set(datasource.id, connection);
            }
        }

        return () => {
            // Cleanup on unmount
            connectionsRef.current.forEach((conn) => conn.disconnect());
            connectionsRef.current.clear();
        };
    }, [datasources]);

    return null; // Headless component
}
```

### 2. Connection Factory

Creates appropriate Connection instances based on datasource type:

```typescript
function createConnection(datasource: DatasourceConfig): Connection {
    // Plugins register connection factories via PluginsHooks
    const factories = PluginManager.applyFilters(
        PluginsHooks.CONNECTION_FACTORIES,
        []
    );

    const factory = factories.find((f) => f.type === datasource.type);

    if (!factory) {
        throw new Error(`No connection factory for type: ${datasource.type}`);
    }

    return factory.create(datasource.config);
}
```

### 3. Connection Status Tracking

Tracks status of all connections in atoms:

```typescript
import { atomFamily } from "jotai/utils";

// Per-datasource status atom
export const datasourceStatusAtomFamily = atomFamily((datasourceId: string) =>
    atom<ConnectionStatus>({
        state: "disconnected",
        error: null,
        connectedAt: null,
        stats: {
            messagesReceived: 0,
            bytesReceived: 0,
            messageRate: 0,
        },
    })
);
```

## Plugin Abstraction Layer API

The DatasourceManager provides a clean API for plugins to interact with datasources without coupling to Connection internals.

### Core API Functions

```typescript
// Get all active datasource IDs
export function useActiveDatasources(): string[] {
    const datasources = useAtomValue(datasourcesAtom);
    return datasources.filter((ds) => ds.enabled).map((ds) => ds.id);
}

// Get connection for a datasource
export function useDatasourceConnection(
    datasourceId: string
): Connection | null {
    const manager = useDatasourceManager();
    return manager.getConnection(datasourceId);
}

// Get status for a datasource
export function useDatasourceStatus(datasourceId: string): ConnectionStatus {
    return useAtomValue(datasourceStatusAtomFamily(datasourceId));
}

// Get available topics from all datasources
export function useAvailableTopics(): AvailableTopic[] {
    const datasourceIds = useActiveDatasources();

    const topicsArrays = datasourceIds.map((id) =>
        useAtomValue(availableTopicsAtomFamily(id))
    );

    return topicsArrays.flat();
}

// Subscribe to a topic (abstracted - doesn't need Connection reference)
export function useSubscribeTopic(
    datasourceId: string,
    topic: string,
    callback: (data: unknown) => void
) {
    const connection = useDatasourceConnection(datasourceId);

    useEffect(() => {
        if (!connection) return;

        connection.subscribe(topic, callback);
        return () => connection.unsubscribe(topic, callback);
    }, [connection, topic, callback]);
}
```

### Plugin Usage Example

Plugins use the abstraction API without knowing about Connection internals:

```typescript
// Plugin widget using DatasourceManager API
function MyPluginWidget({ datasourceId, topic }: WidgetProps) {
  const [data, setData] = useState<unknown>(null);
  const status = useDatasourceStatus(datasourceId);

  // Abstract subscription - no Connection reference needed
  useSubscribeTopic(datasourceId, topic, setData);

  if (status.state !== 'connected') {
    return <div>Waiting for connection...</div>;
  }

  return <div>Latest data: {JSON.stringify(data)}</div>;
}
```

## DatasourceManager Hook

The core hook providing full manager API:

```typescript
export function useDatasourceManager() {
    const datasources = useAtomValue(datasourcesAtom);
    const connectionsRef = useRef<Map<string, Connection>>(new Map());

    return {
        // Get connection by ID
        getConnection(id: string): Connection | null {
            return connectionsRef.current.get(id) || null;
        },

        // Get all active connections
        getActiveConnections(): Connection[] {
            return Array.from(connectionsRef.current.values());
        },

        // Get datasource config by ID
        getDatasourceConfig(id: string): DatasourceConfig | undefined {
            return datasources.find((ds) => ds.id === id);
        },

        // Check if datasource is enabled
        isDatasourceEnabled(id: string): boolean {
            return datasources.some((ds) => ds.id === id && ds.enabled);
        },

        // Get all datasource IDs
        getDatasourceIds(): string[] {
            return datasources.map((ds) => ds.id);
        },

        // Get enabled datasource IDs
        getEnabledDatasourceIds(): string[] {
            return datasources.filter((ds) => ds.enabled).map((ds) => ds.id);
        },
    };
}
```

## Connection Registry Pattern

For plugins that need to interact with connections directly:

```typescript
// Global connection registry (singleton)
class ConnectionRegistry {
    private connections = new Map<string, Connection>();

    register(id: string, connection: Connection) {
        this.connections.set(id, connection);
    }

    unregister(id: string) {
        this.connections.delete(id);
    }

    get(id: string): Connection | undefined {
        return this.connections.get(id);
    }

    getAll(): Connection[] {
        return Array.from(this.connections.values());
    }
}

export const connectionRegistry = new ConnectionRegistry();

// DatasourceManager registers connections
export function DatasourceManager() {
    // ... connection lifecycle code ...

    useEffect(() => {
        datasources.forEach((ds) => {
            if (ds.enabled && !connectionsRef.current.has(ds.id)) {
                const connection = createConnection(ds);
                connection.connect();
                connectionsRef.current.set(ds.id, connection);
                connectionRegistry.register(ds.id, connection); // Register globally
            }
        });

        return () => {
            connectionsRef.current.forEach((conn, id) => {
                conn.disconnect();
                connectionRegistry.unregister(id); // Unregister globally
            });
        };
    }, [datasources]);

    return null;
}
```

## Plugin Hooks Integration

Plugins can register connection factories via PluginsHooks:

```typescript
// Plugin registers connection factory
export class MyDatasourcePlugin extends Plugin {
    onLoad() {
        // Register connection factory
        this.registerFilter(PluginsHooks.CONNECTION_FACTORIES, (factories) => [
            ...factories,
            {
                type: "my-datasource",
                create: (config: unknown) => new MyConnection(config),
            },
        ]);
    }
}

// PluginsHooks enum
export enum PluginsHooks {
    CONNECTION_FACTORIES = "connection-factories",
    // ... other hooks
}
```

## Complete API Example

```typescript
// DatasourceManager with full API implementation
import { useAtomValue, useSetAtom } from "jotai";
import { datasourcesAtom, datasourceStatusAtomFamily } from "@/atoms/dashboard";

export function DatasourceManager() {
    const datasources = useAtomValue(datasourcesAtom);
    const connectionsRef = useRef<Map<string, Connection>>(new Map());

    // Track status for each datasource
    const updateStatus = (id: string, status: ConnectionStatus) => {
        const setStatus = useSetAtom(datasourceStatusAtomFamily(id));
        setStatus(status);
    };

    useEffect(() => {
        const enabled = datasources.filter((ds) => ds.enabled);
        const currentIds = new Set(enabled.map((ds) => ds.id));
        const existingIds = new Set(connectionsRef.current.keys());

        // Remove old connections
        for (const id of existingIds) {
            if (!currentIds.has(id)) {
                const conn = connectionsRef.current.get(id)!;
                conn.disconnect();
                connectionsRef.current.delete(id);
                connectionRegistry.unregister(id);
                updateStatus(id, { state: "disconnected", error: null });
            }
        }

        // Add new connections
        for (const ds of enabled) {
            if (!connectionsRef.current.has(ds.id)) {
                try {
                    const conn = createConnection(ds);

                    // Listen to connection events
                    conn.on("connect", () => {
                        updateStatus(ds.id, {
                            state: "connected",
                            connectedAt: Date.now(),
                            error: null,
                        });
                    });

                    conn.on("disconnect", () => {
                        updateStatus(ds.id, {
                            state: "disconnected",
                            connectedAt: null,
                            error: null,
                        });
                    });

                    conn.on("error", (error) => {
                        updateStatus(ds.id, {
                            state: "error",
                            error: error.message,
                            connectedAt: null,
                        });
                    });

                    conn.connect();
                    connectionsRef.current.set(ds.id, conn);
                    connectionRegistry.register(ds.id, conn);
                } catch (error) {
                    console.error(
                        `Failed to create connection for ${ds.id}:`,
                        error
                    );
                    updateStatus(ds.id, {
                        state: "error",
                        error:
                            error instanceof Error
                                ? error.message
                                : "Unknown error",
                    });
                }
            }
        }

        return () => {
            connectionsRef.current.forEach((conn, id) => {
                conn.disconnect();
                connectionRegistry.unregister(id);
            });
            connectionsRef.current.clear();
        };
    }, [datasources]);

    return null;
}
```

## Abstraction Layer Benefits

### For Plugin Developers

1. **No coupling to Connection internals**: Plugins use high-level API
2. **Consistent interface**: Same API works for all datasource types
3. **Automatic lifecycle management**: No manual cleanup needed
4. **Status tracking**: Built-in connection status monitoring
5. **Type safety**: Full TypeScript support

### For Core Developers

1. **Centralized management**: All connections managed in one place
2. **Easy debugging**: Single point to monitor all datasources
3. **Flexible implementation**: Can change Connection internals without breaking plugins
4. **Testability**: Easy to mock for testing
5. **Performance**: Optimized connection pooling and reuse

## Migration from V1

### V1: Direct Provider Access

```tsx
// V1: Widget directly accessed provider
function MyWidget({ topic }) {
    const datasource = useContext(GlobalDataSourceContext);
    const [data, setData] = useState(null);

    useEffect(() => {
        datasource.subscribe(topic, setData);
        return () => datasource.unsubscribe(topic, setData);
    }, [topic]);

    return <div>{JSON.stringify(data)}</div>;
}
```

### V2: Abstracted API

```tsx
// V2: Widget uses abstraction layer
function MyWidget({ datasourceId, topic }) {
    const [data, setData] = useState(null);

    // High-level API - no provider context needed
    useSubscribeTopic(datasourceId, topic, setData);

    return <div>{JSON.stringify(data)}</div>;
}
```

## Advanced Usage

### Multi-Datasource Widgets

Widgets can consume data from multiple datasources:

```typescript
function MultiSourceWidget() {
  const datasources = useActiveDatasources();
  const [dataMap, setDataMap] = useState<Map<string, unknown>>(new Map());

  // Subscribe to same topic from all datasources
  datasources.forEach(id => {
    useSubscribeTopic(id, '/robot/pose', (data) => {
      setDataMap(prev => new Map(prev).set(id, data));
    });
  });

  return (
    <div>
      {Array.from(dataMap.entries()).map(([id, data]) => (
        <div key={id}>
          <strong>{id}:</strong> {JSON.stringify(data)}
        </div>
      ))}
    </div>
  );
}
```

### Datasource Filtering

Filter datasources by type or capability:

```typescript
export function useDatasourcesByType(type: string): DatasourceConfig[] {
  const datasources = useAtomValue(datasourcesAtom);
  return datasources.filter(ds => ds.type === type && ds.enabled);
}

// Usage
function ROSWidget() {
  const rosDatasources = useDatasourcesByType('rosbridge');

  if (rosDatasources.length === 0) {
    return <div>No ROS datasources available</div>;
  }

  return <div>Connected to {rosDatasources.length} ROS bridges</div>;
}
```

### Connection Health Monitoring

Monitor health of all connections:

```typescript
export function useConnectionHealth() {
  const datasourceIds = useActiveDatasources();

  const statuses = datasourceIds.map(id => ({
    id,
    status: useAtomValue(datasourceStatusAtomFamily(id))
  }));

  return {
    total: statuses.length,
    connected: statuses.filter(s => s.status.state === 'connected').length,
    disconnected: statuses.filter(s => s.status.state === 'disconnected').length,
    errors: statuses.filter(s => s.status.state === 'error').length,
    statuses
  };
}

// Usage in health dashboard
function ConnectionHealthPanel() {
  const health = useConnectionHealth();

  return (
    <div>
      <h3>Connection Health</h3>
      <div>Total: {health.total}</div>
      <div>Connected: {health.connected}</div>
      <div>Errors: {health.errors}</div>

      {health.statuses.map(({ id, status }) => (
        <div key={id}>
          {id}: {status.state} {status.error && `(${status.error})`}
        </div>
      ))}
    </div>
  );
}
```

## API Reference

### Hooks

| Hook                                     | Returns                | Description                                   |
| ---------------------------------------- | ---------------------- | --------------------------------------------- |
| `useActiveDatasources()`                 | `string[]`             | IDs of all enabled datasources                |
| `useDatasourceConnection(id)`            | `Connection \| null`   | Get connection for datasource                 |
| `useDatasourceStatus(id)`                | `ConnectionStatus`     | Get connection status                         |
| `useAvailableTopics()`                   | `AvailableTopic[]`     | Get all available topics from all datasources |
| `useSubscribeTopic(id, topic, callback)` | `void`                 | Subscribe to topic (abstracted)               |
| `useDatasourcesByType(type)`             | `DatasourceConfig[]`   | Filter datasources by type                    |
| `useConnectionHealth()`                  | `HealthStats`          | Monitor all connection health                 |
| `useDatasourceManager()`                 | `DatasourceManagerAPI` | Full manager API                              |

### Types

```typescript
interface DatasourceConfig {
    id: string;
    type: string;
    enabled: boolean;
    name: string;
    config: Record<string, unknown>;
    priority: number;
}

interface ConnectionStatus {
    state: "connected" | "connecting" | "disconnected" | "error";
    connectedAt: number | null;
    error: string | null;
    stats?: {
        messagesReceived: number;
        bytesReceived: number;
        messageRate: number;
    };
}

interface DatasourceManagerAPI {
    getConnection(id: string): Connection | null;
    getActiveConnections(): Connection[];
    getDatasourceConfig(id: string): DatasourceConfig | undefined;
    isDatasourceEnabled(id: string): boolean;
    getDatasourceIds(): string[];
    getEnabledDatasourceIds(): string[];
}

interface ConnectionFactory {
    type: string;
    create(config: unknown): Connection;
}
```

### Plugin Hooks

| Hook                   | Type                          | Description                                        |
| ---------------------- | ----------------------------- | -------------------------------------------------- |
| `CONNECTION_FACTORIES` | `Filter<ConnectionFactory[]>` | Register connection factories for datasource types |

## Best Practices

1. **Use abstraction layer**: Prefer `useSubscribeTopic` over direct Connection access
2. **Monitor status**: Always check connection status before subscribing
3. **Handle errors**: Connection failures are common, handle gracefully
4. **Cleanup subscriptions**: Always unsubscribe in useEffect cleanup
5. **Type safety**: Use TypeScript for datasource configs and data types
6. **Test with mocks**: Mock DatasourceManager for widget testing

## Next Steps

- [Dashboard Integration](/docs/v2/core/dashboard-integration.md) - How datasourcesAtom is managed
- [Connection API](/docs/v2/api/connection-api.md) - Connection interface details
- [Hooks API](/docs/v2/api/hooks-api.md) - useDataStream and other hooks
- [Atoms API](/docs/v2/api/atoms-api.md) - Complete atom families reference
