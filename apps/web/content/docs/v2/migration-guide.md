---
title: "Migration Guide"
order: 3
---

# V1 to V2 Migration Guide

Complete guide for migrating from V1 (nested providers + pub/sub) to V2 (Jotai atoms).

## Overview

V2 is a **breaking change** that requires updates to:

- Widget implementations
- Datasource providers
- Plugin registration
- Dashboard setup

**However**, V1 and V2 can **coexist** during migration, allowing gradual adoption.

---

## Migration Strategy

### Option 1: Gradual Migration (Recommended)

1. Keep V1 system running
2. Add V2 alongside (different import paths)
3. Migrate widgets one by one
4. Migrate datasources one by one
5. Remove V1 when complete

### Option 2: Complete Migration

1. Create migration branch
2. Update all code simultaneously
3. Test thoroughly
4. Deploy

---

## Step-by-Step Migration

### Step 1: Install Jotai

```bash
# In workspace root
bun add jotai jotai-devtools

# Or in specific packages
cd packages/ormi-core
bun add jotai jotai-devtools
```

### Step 2: Update App Root

**V1 Setup:**

```tsx
// app/layout.tsx
import { PluginsProvider } from "@workspace/ormi-plugins";

export default function RootLayout({ children }) {
    return <PluginsProvider>{children}</PluginsProvider>;
}
```

**V2 Setup:**

```tsx
// app/layout.tsx
import { Provider as JotaiProvider } from "jotai";
import { PluginsProvider } from "@workspace/ormi-plugins";

export default function RootLayout({ children }) {
    return (
        <JotaiProvider>
            <PluginsProvider>{children}</PluginsProvider>
        </JotaiProvider>
    );
}
```

**Changes:**

- Add `JotaiProvider` wrapping everything
- Keep `PluginsProvider` for compatibility

### Step 3: Initialize DatasourceManager

**V1:** Multiple nested providers

```tsx
<GlobalDataSourceProvider>{/* Nested providers */}</GlobalDataSourceProvider>
```

**V2:** Single DatasourceManagerProvider

```tsx
import { DatasourceManagerProvider } from "@workspace/ormi-core/v2";

<DatasourceManagerProvider datasources={datasources}>
    <Dashboard />
</DatasourceManagerProvider>;
```

For complete DatasourceManagerProvider implementation, see **[Datasource Manager](./core/datasource-manager)**.

### Step 4: Migrate Widgets

#### V1 Widget Pattern

```tsx
// V1: Wrapped in LocalDataSourceProvider
export function FloatWidgetDefinition(): WidgetDefinition {
  return {
    id: 'float-widget-v1',
    name: 'Float Widget',
    Component: (data: FloatWidgetProps) => (
      <LocalDataSourcesProvider
        SelectedTopics={[data.topic]}
        buffersSize={1}
      >
        <FloatWidget />
      </LocalDataSourcesProvider>
    )
  }
}

// Inside widget
function FloatWidget() {
  const { sources, getSource } = useLocalDataSource()
  const topic = /* get from config */
  const source = getSource(topic)
  const value = source?.data[0]

  if (!value) return <Spinner />

  return <div>{value}</div>
}
```

#### V2 Widget Pattern

```tsx
// V2: No wrapper needed
export function FloatWidgetDefinition(): WidgetDefinition {
    return {
        id: "float-widget-v2",
        name: "Float Widget (V2)",
        Component: FloatWidget, // Direct component!
    };
}

// Inside widget
function FloatWidget({ datasourceId, topic }: FloatWidgetProps) {
    const { data, isLoading } = useDataStream<number>(datasourceId, topic);

    if (isLoading) return <Spinner />;

    return <div>{data}</div>;
}
```

#### Migration Checklist for Widgets

- [ ] Remove `LocalDataSourcesProvider` wrapper
- [ ] Replace `useLocalDataSource()` with `useDataStream()`
- [ ] Update props to include `datasourceId` and `topic` separately
- [ ] Remove `getSource()` calls
- [ ] Update data access from `source.data[0]` to just `data`
- [ ] Update loading state from checking `source` to `isLoading`
- [ ] Update error handling to use `error` from hook

### Step 5: Migrate Datasources

**Key changes:**

1. ❌ Remove React Provider pattern
2. ❌ Remove `pluginManager.addAction()` / `pluginManager.doAction()` calls
3. ✅ Create Connection class implementing `Connection` interface
4. ✅ Use `this.emit("message", topic, data, metadata)` to publish
5. ✅ Implement `connect()`, `disconnect()`, `subscribe()`, `unsubscribe()` methods

**Pattern:**

```tsx
// V1: React Provider + pub/sub
const MyProvider = ({ children, props }) => {
    useEffect(() => {
        pluginManager.doAction(`${id}-${topic}-published`, data, timestamp);
    }, []);
    return <>{children}</>;
};

// V2: Connection class + events
class MyConnection implements Connection {
    subscribe(topic: string) {
        // Start streaming
        this.emit("message", topic, data, { timestamp, frameId });
    }
}
```

For complete Connection implementation examples (WebSocket, REST, Random), see:

- **[Connection API](./api/connection-api)** - Full interface and lifecycle
- **[Examples - Datasource Implementations](./examples#datasource-implementations)** - Complete working examples

        async connect() {
            // No actual connection needed for random data
            this.emit("connected");
        }

        async disconnect() {
            this.intervals.forEach(clearInterval);
            this.intervals.clear();
            this.emit("disconnected");
        }

        subscribe(topic: string) {
            const interval = setInterval(() => {
                const value = Math.random();

                // Emit message event - manager handles atom updates
                this.emit("message", topic, value, {
                    timestamp: Date.now(),
                    frameId: "unknown",
                });
            }, 1000);

            this.intervals.set(topic, interval);
        }

        unsubscribe(topic: string) {
            const interval = this.intervals.get(topic);
        async discoverTopics(): Promise<TopicInfo[]> {
            return [
                { topic: "/random/float", type: "std_msgs/Float64" },
                { topic: "/random/int", type: "std_msgs/Int32" },
            ];
        }

    }

// Registration
export const RandomDatasourceDefinition: DatasourceDefinition = {
id: "random",
name: "Random Data Generator",
version: 2, // Mark as V2
createConnection: (config) => new RandomConnection(config),
schema: { /_ config schema _/ },
};

````

#### Migration Checklist for Datasources

- [ ] Convert Provider component to Connection class
- [ ] Implement Connection interface methods
- [ ] Replace `pluginManager.addAction()` with event listeners (`on()`)
- [ ] Replace `pluginManager.doAction()` with `emit('message')`
- [ ] Implement `discoverTopics()` method
- [ ] Add connection lifecycle (`connect()`, `disconnect()`)
- [ ] Update registration to use `createConnection` and `version: 2`

### Step 6: Update Plugin Registration

#### V1 Plugin Registration

```tsx
class MyPlugin extends Plugin {
    constructor() {
        super();
        this.name = "My Plugin";

        // Register widgets
        this.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: "my-widgets",
            priority: 10,
            filter: (widgets) => {
                widgets.push(MyWidgetDefinition());
                return widgets;
            },
        });

        // Register datasources
        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "my-datasources",
            priority: 10,
            filter: (datasources) => {
                datasources.push(MyDatasourceProviderDefinition);
                return datasources;
            },
        });
    }
}
````

#### V2 Plugin Registration

```tsx
class MyPlugin extends Plugin {
    constructor() {
        super();
        this.name = "My Plugin";

        // Register V2 widgets (marked with version)
        this.addFilter(PluginsHooks.WIDGETS_LIST_V2, {
            id: "my-widgets-v2",
            priority: 10,
            filter: (widgets) => {
                widgets.push(MyWidgetDefinitionV2());
                return widgets;
            },
        });

        // Register V2 datasource connections
        this.addFilter(PluginsHooks.DATASOURCE_CONNECTIONS_V2, {
            id: "my-datasources-v2",
            priority: 10,
            filter: (connections) => {
                connections.set("my-datasource-type", {
                    createConnection: (config) => new MyConnection(config),
                    schema: MyConnectionSchema,
                });
                return connections;
            },
        });
    }
}
```

#### New Plugin Hooks

```typescript
// Add to PluginsHooks enum
export enum PluginsHooks {
    // ... existing hooks ...

    // V2 hooks
    WIDGETS_LIST_V2 = "widgets_list_v2",
    DATASOURCE_CONNECTIONS_V2 = "datasource_connections_v2",
}
```

---

## Coexistence Strategy

During migration, V1 and V2 can run side-by-side:

### Separate Import Paths

```typescript
// V1 imports
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { LocalDataSourcesProvider } from "@workspace/ormi-core/datasources";

// V2 imports
import { useDataStream } from "@workspace/ormi-core/v2";
import { DatasourceManagerProvider } from "@workspace/ormi-core/v2";
```

### Widget Versioning

```typescript
// Mark widgets with version
export function FloatWidgetDefinition(): WidgetDefinition {
    return {
        id: "float-widget",
        name: "Float Widget",
        version: 1, // V1
        Component: FloatWidgetV1,
    };
}

export function FloatWidgetDefinitionV2(): WidgetDefinition {
    return {
        id: "float-widget-v2",
        name: "Float Widget (V2)",
        version: 2, // V2
        Component: FloatWidgetV2,
    };
}
```

### Datasource Versioning

```typescript
// V1 datasource
export const RandomDatasourceV1: DatasourceDefinition = {
    id: "random",
    name: "Random (V1)",
    version: 1,
    Provider: RandomDataSourceProvider,
};

// V2 datasource
export const RandomDatasourceV2: DatasourceDefinition = {
    id: "random-v2",
    name: "Random (V2)",
    version: 2,
    createConnection: (config) => new RandomConnection(config),
};
```

### Dashboard Detection

```tsx
function Dashboard() {
    const widgets = useWidgets();
    const hasV2Widgets = widgets.some((w) => w.version === 2);
    const hasV1Widgets = widgets.some((w) => !w.version || w.version === 1);

    return (
        <>
            {hasV1Widgets && (
                <GlobalDataSourceProvider>
                    <V1WidgetGrid />
                </GlobalDataSourceProvider>
            )}

            {hasV2Widgets && (
                <DatasourceManagerProvider>
                    <V2WidgetGrid />
                </DatasourceManagerProvider>
            )}
        </>
    );
}
```

---

## Common Migration Patterns

### Pattern 1: Basic Data Display

```tsx
// V1: Wrapper + getSource
<LocalDataSourcesProvider SelectedTopics={[topic]}>
  <Component />
</LocalDataSourcesProvider>

// V2: Direct props + useDataStream
<Component datasourceId={id} topic={topic} />
```

### Pattern 2: Multiple Topics

```tsx
// V1: Array of topics
<LocalDataSourcesProvider SelectedTopics={[topic1, topic2]}>
    <Component />
</LocalDataSourcesProvider>;

// V2: Multiple hook calls
const { data: data1 } = useDataStream(id, topic1);
const { data: data2 } = useDataStream(id, topic2);
```

### Pattern 3: Historical Data (Buffer)

```tsx
// V1: buffersSize prop
<LocalDataSourcesProvider SelectedTopics={[topic]} buffersSize={100}>
    <Component />
</LocalDataSourcesProvider>;

// V2: buffer option in hook
const { buffer } = useDataStream(id, topic, { bufferSize: 100 });
```

For complete pattern examples with full context, see **[Examples](./examples)**.
const { sources, getSource } = useLocalDataSource();
const source = getSource(topic);
const history = source?.data; // Array of last 100 messages

````

**V2:**

```tsx
<Component datasourceId={datasourceId} topic={topic} />;

// Inside
const { buffer } = useDataBuffer(datasourceId, topic, 100);
````

### Pattern 4: Connection Status

**V1:**

```tsx
// Check if datasource is in list
const { datasources } = useDashboardManager();
const ds = datasources.get(datasourceId);
const connected = ds?.enabled;
```

**V2:**

```tsx
const status = useConnectionStatus(datasourceId);
const connected = status.state === "connected";
```

---

## Breaking Changes

### Widget API Changes

| V1                         | V2                            | Notes                 |
| -------------------------- | ----------------------------- | --------------------- |
| `useLocalDataSource()`     | `useDataStream()`             | Different return type |
| `getSource(topic)`         | Direct `data`                 | No getter needed      |
| `source.data[0]`           | `data`                        | Direct access         |
| `source.times[0]`          | `timestamp`                   | Separate field        |
| `source.referenceFrameId`  | `frameId`                     | Renamed               |
| `LocalDataSourcesProvider` | None                          | No wrapper needed     |
| `SelectedTopics` prop      | `datasourceId`, `topic` props | Separate props        |

### Datasource API Changes

| V1                            | V2                                    | Notes              |
| ----------------------------- | ------------------------------------- | ------------------ |
| Provider component            | Connection class                      | Different paradigm |
| `pluginManager.addAction()`   | `emit('message')`                     | Event-based        |
| `pluginManager.doAction()`    | `emit('message')`                     | Event-based        |
| Subscribe/unsubscribe actions | `subscribe()`/`unsubscribe()` methods | Direct calls       |
| Nested providers              | Parallel connections                  | Flat architecture  |

### Plugin API Changes

| V1                    | V2                          | Notes                  |
| --------------------- | --------------------------- | ---------------------- |
| `WIDGETS_LIST`        | `WIDGETS_LIST_V2`           | New hook               |
| `DATASOURCES_LIST`    | `DATASOURCE_CONNECTIONS_V2` | New hook               |
| Provider registration | Connection factory          | Different registration |

### Type Conversion System (Maintained)

The following V1 components are **preserved** in V2:

| Component                   | Status        | Notes                                 |
| --------------------------- | ------------- | ------------------------------------- |
| `DatasourceTopic` interface | ✅ Maintained | Used in Connection.subscribe()        |
| `SelectedTopic` interface   | ✅ Maintained | Extends DatasourceTopic with property |
| `UnifiedConverter`          | ✅ Maintained | Type conversion layer                 |
| `TypeConverter` interface   | ✅ Maintained | Converter contract                    |
| rawType/type distinction    | ✅ Maintained | Datasource vs internal formats        |
| Property extraction         | ✅ Maintained | Via `property` option in hooks        |

**Migration Note:** If your V1 datasource implements type converters, they work unchanged in V2. Simply register them with `UnifiedConverterRegistry` in your Connection's `connect()` method.

---

## Testing Strategy

### Unit Testing Widgets

**V2 Widget Test:**

```typescript
import { render, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { dataAtomFamily } from '@workspace/ormi-core/v2/atoms'
import { MyWidget } from './my-widget'

test('displays data from stream', async () => {
  const store = createStore()

  // Set up test data
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
```

### Integration Testing

```typescript
test('widget subscribes and receives data', async () => {
  const manager = new DatasourceManager(store)

  // Mock connection
  const mockConnection = {
    subscribe: jest.fn(),
    on: jest.fn()
  }

  await manager.connect({
    id: 'test',
    type: 'mock',
    enabled: true,
    settings: {}
  })

  // Render widget
  render(
    <DatasourceManagerProvider manager={manager}>
      <MyWidget datasourceId="test" topic="/test" />
    </DatasourceManagerProvider>
  )

  // Verify subscription
  expect(mockConnection.subscribe).toHaveBeenCalledWith('/test')
})
```

---

## Performance Comparison

### Render Count Test

**Setup:** 10 widgets, 30 Hz data stream

**V1 Results:**

```
PluginManager.doAction() called: 300 times/sec
Widget re-renders: 300 times/sec
Total renders: 3000/sec (300 per widget)
```

**V2 Results:**

```
Atom updates: 30 times/sec
Widget re-renders: 30 times/sec
Total renders: 300/sec (30 per widget)
```

**Improvement: 10x fewer renders**

### Memory Usage

**V1:**

- Every widget: LocalDataSourceProvider (context + state)
- Every topic: Multiple callback registrations
- PluginManager: Large action map

**V2:**

- No per-widget providers
- Single atom per topic
- Minimal subscription tracking

**Improvement: ~30% less memory**

---

## Troubleshooting

### Issue: Widget Not Receiving Data

**Check:**

1. Is datasource connected? `useConnectionStatus(datasourceId)`
2. Is topic available? `useAvailableTopics(datasourceId)`
3. Is widget subscribing? Check subscription atom in DevTools
4. Is connection emitting messages? Add logging

**Debug:**

```typescript
// Add debug logging
const { data, status } = useDataStream(datasourceId, topic);

useEffect(() => {
    console.log("Stream status:", status);
    console.log("Data:", data);
}, [status, data]);
```

### Issue: Too Many Re-renders

**Cause:** Creating atoms inside render

**Fix:**

```typescript
// ❌ Bad
function Widget() {
    const atom = dataAtomFamily({ datasourceId, topic }); // New atom every render!
}

// ✅ Good
function Widget() {
    const atom = useMemo(
        () => dataAtomFamily({ datasourceId, topic }),
        [datasourceId, topic]
    );
}
```

### Issue: Connection Not Starting

**Check:**

1. Is `DatasourceManagerProvider` in tree?
2. Is datasource config enabled?
3. Does Connection class emit 'connected' event?

**Debug:**

```typescript
const manager = useDatasourceManager();

useEffect(() => {
    console.log("Connected:", manager.isConnected(datasourceId));
}, [manager, datasourceId]);
```

---

## Timeline Example

### Phase 1: Foundation (Week 1)

- Install Jotai
- Add `JotaiProvider` to app root
- Create `DatasourceManagerProvider`
- Set up parallel system

### Phase 2: Datasources (Week 2-3)

- Migrate 1 datasource to V2
- Test thoroughly
- Migrate remaining datasources
- Keep V1 as fallback

### Phase 3: Widgets (Week 4-6)

- Identify widget categories
- Migrate simple widgets first
- Migrate complex widgets
- Update tests

### Phase 4: Cleanup (Week 7)

- Remove V1 code
- Update documentation
- Final testing
- Deploy

---

## Rollback Plan

If issues arise:

1. **Keep V1 code:** Don't delete until V2 is stable
2. **Feature flags:** Toggle V2 on/off
3. **Gradual rollout:** Deploy to subset of users
4. **Monitoring:** Track errors and performance

```typescript
// Feature flag example
const USE_V2 = process.env.NEXT_PUBLIC_USE_V2 === 'true'

function Dashboard() {
  if (USE_V2) {
    return <DashboardV2 />
  }
  return <DashboardV1 />
}
```

---

## Summary

**Key Points:**

- V2 is a breaking change but provides 10x performance improvement
- Coexistence allows gradual migration
- Widgets become simpler (no wrappers)
- Datasources become Connection classes
- Testing is easier with direct atom manipulation

**Benefits:**

- ✅ Better performance
- ✅ Simpler code
- ✅ Better DevTools
- ✅ Easier testing
- ✅ More maintainable

**Next:** [Complete Examples](./examples.md)
