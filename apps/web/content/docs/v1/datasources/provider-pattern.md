# Provider Pattern

The **Provider component** is the heart of each datasource implementation. It's a React component that establishes connections, manages subscriptions, and publishes data.

## Component Signature

```typescript
const Provider: FC<{
    children: ReactNode;
    props: T extends DatasourceProviderSettings;
}>
```

### Parameters

- **`children`**: The React children to render (typically the rest of the app)
- **`props`**: Your datasource settings (extends `DatasourceProviderSettings`)

### Return Value

The provider should return the children, optionally wrapped in a Context Provider:

```typescript
return (
    <MyDataSourceContext.Provider value={contextValue}>
        {children}
    </MyDataSourceContext.Provider>
);
```

Or simply:

```typescript
return <>{children}</>;
```

---

## Core Responsibilities

### 1. Register with Plugin Manager

The provider must interact with the plugin manager to:

- Expose available topics
- Handle subscriptions
- Publish data

```typescript
const MyProvider = (children: ReactNode, props: MySettings) => {
    const pluginsManager = usePluginsManager();
    const datasource_id = props.id;

    // ... implementation
};
```

---

## Implementation Pattern

### Basic Structure

```typescript
"use client"

import React, { ReactNode, useEffect, useState } from 'react';
import { usePluginsManager } from '@workspace/ormi-plugins';
import { DatasourceProviderSettings } from '@workspace/ormi-core/datasources';

interface MyDatasourceSettings extends DatasourceProviderSettings {
    url: string;
    // ... other settings
}

const MyDatasourceProvider = (children: ReactNode, props: MyDatasourceSettings) => {
    const pluginsManager = usePluginsManager();
    const datasource_id = props.id;

    const [initialized, setInitialized] = useState(false);

    // 1. Connection management
    useEffect(() => {
        // Establish connection
        // ...
        setInitialized(true);

        return () => {
            // Cleanup
        };
    }, []);

    // 2. Register available topics
    useEffect(() => {
        pluginsManager.addFilter(/* ... */);

        return () => {
            pluginsManager.removeFilter(/* ... */);
        };
    }, []);

    // 3. Handle subscriptions
    useEffect(() => {
        pluginsManager.addAction(/* subscribe hook */);
        pluginsManager.addAction(/* unsubscribe hook */);

        return () => {
            // Remove hooks
        };
    }, []);

    // 4. Render
    if (!initialized) {
        return <Spinner />;
    }

    return <>{children}</>;
};

export { MyDatasourceProvider };
```

---

## Key Hooks Integration

### 1. Expose Available Topics

Use `AVAILABLE_TOPICS` filter to register your topics:

```typescript
useEffect(() => {
    pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
        id: `${datasource_id}-available-topics`,
        priority: 10,
        filter: async (
            topics: DatasourceTopic[],
            filter?: DatasourceTopicFilter
        ) => {
            // Only add if datasource is enabled
            if (!props.enable) return topics;

            // Build topic list
            const myTopics: DatasourceTopic[] = [
                {
                    topic: "/sensor/temperature",
                    datasource_id: datasource_id,
                    source: props,
                    type: "number",
                    rawType: "float64",
                },
            ];

            // Apply filter if provided
            if (filter) {
                const filtered = myTopics.filter((topic) =>
                    filter.filter(topic)
                );
                topics.push(...filtered);
            } else {
                topics.push(...myTopics);
            }

            return topics;
        },
    });

    return () => {
        pluginsManager.removeFilter(
            PluginsHooks.AVAILABLE_TOPICS,
            `${datasource_id}-available-topics`
        );
    };
}, [datasource_id, props, pluginsManager]);
```

### 2. Handle Subscriptions

Create hooks for subscription management:

```typescript
const subscribersCountRef = useRef(new Map<string, number>());

useEffect(() => {
    // Subscribe hook
    const subscribeHook = `${datasource_id}-subscribe`;
    pluginsManager.addAction(subscribeHook, {
        id: `${datasource_id}-subscribe-handler`,
        priority: 10,
        action: async (topic: SelectedTopic) => {
            const currentCount =
                subscribersCountRef.current.get(topic.topic) || 0;
            subscribersCountRef.current.set(topic.topic, currentCount + 1);

            // First subscriber? Start publishing
            if (currentCount === 0) {
                startPublishing(topic.topic);
            }
        },
    });

    // Unsubscribe hook
    const unsubscribeHook = `${datasource_id}-unsubscribe`;
    pluginsManager.addAction(unsubscribeHook, {
        id: `${datasource_id}-unsubscribe-handler`,
        priority: 10,
        action: async (topic: SelectedTopic) => {
            const currentCount =
                subscribersCountRef.current.get(topic.topic) || 0;
            if (currentCount > 0) {
                subscribersCountRef.current.set(topic.topic, currentCount - 1);

                // Last subscriber? Stop publishing
                if (currentCount === 1) {
                    stopPublishing(topic.topic);
                }
            }
        },
    });

    return () => {
        pluginsManager.removeAction(
            subscribeHook,
            `${datasource_id}-subscribe-handler`
        );
        pluginsManager.removeAction(
            unsubscribeHook,
            `${datasource_id}-unsubscribe-handler`
        );
    };
}, [datasource_id, pluginsManager]);
```

### 3. Publish Data

When data arrives, publish to subscribers:

```typescript
const publishData = (topicName: string, data: any) => {
    pluginsManager.doAction(
        `${datasource_id}-${topicName}-published`,
        data,
        Date.now()
    );
};

// Example: Publishing from WebSocket
websocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    publishData(message.topic, message.data);
};
```

---

## Complete Example: Random Datasource

```typescript
"use client"

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { usePluginsManager } from '@workspace/ormi-plugins';
import { DatasourceProviderSettings, DatasourceTopic, SelectedTopic } from '@workspace/ormi-core/datasources';

interface RandomTopicDef {
    topic: string;
    frequency: number;
    type: string;
}

interface RandomDataSourceSettings extends DatasourceProviderSettings {
    topics: RandomTopicDef[];
}

const RandomDataSourceProvider = (children: ReactNode, props: RandomDataSourceSettings) => {
    const pluginsManager = usePluginsManager();
    const datasource_id = props.id;

    const intervalsRef = useRef(new Map<string, NodeJS.Timeout>());
    const subscribersRef = useRef(new Map<string, number>());
    const [initialized, setInitialized] = useState(false);

    // 1. Expose available topics
    useEffect(() => {
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: `${datasource_id}-topics`,
            priority: 10,
            filter: async (topics: DatasourceTopic[]) => {
                if (!props.enable) return topics;

                const availableTopics = props.topics.map(topicDef => ({
                    topic: topicDef.topic,
                    datasource_id: datasource_id,
                    source: props,
                    type: topicDef.type,
                    rawType: topicDef.type,
                }));

                topics.push(...availableTopics);
                return topics;
            }
        });

        setInitialized(true);

        return () => {
            pluginsManager.removeFilter(PluginsHooks.AVAILABLE_TOPICS, `${datasource_id}-topics`);
        };
    }, [datasource_id, props, pluginsManager]);

    // 2. Handle subscriptions
    useEffect(() => {
        if (!initialized) return;

        // Subscribe
        pluginsManager.addAction(`${datasource_id}-subscribe`, {
            id: `${datasource_id}-sub`,
            priority: 10,
            action: async (topic: SelectedTopic) => {
                const count = subscribersRef.current.get(topic.topic) || 0;
                subscribersRef.current.set(topic.topic, count + 1);

                if (count === 0) {
                    startPublishing(topic);
                }
            }
        });

        // Unsubscribe
        pluginsManager.addAction(`${datasource_id}-unsubscribe`, {
            id: `${datasource_id}-unsub`,
            priority: 10,
            action: async (topic: SelectedTopic) => {
                const count = subscribersRef.current.get(topic.topic) || 0;
                if (count > 0) {
                    subscribersRef.current.set(topic.topic, count - 1);

                    if (count === 1) {
                        stopPublishing(topic.topic);
                    }
                }
            }
        });

        return () => {
            // Cleanup all intervals
            intervalsRef.current.forEach(interval => clearInterval(interval));
            pluginsManager.removeAction(`${datasource_id}-subscribe`, `${datasource_id}-sub`);
            pluginsManager.removeAction(`${datasource_id}-unsubscribe`, `${datasource_id}-unsub`);
        };
    }, [initialized, datasource_id, pluginsManager]);

    // 3. Publishing logic
    const startPublishing = (topic: SelectedTopic) => {
        const topicDef = props.topics.find(t => t.topic === topic.topic);
        if (!topicDef) return;

        const interval = setInterval(() => {
            let data: any;

            // Generate random data based on type
            switch (topicDef.type) {
                case 'number':
                    data = Math.random() * 100;
                    break;
                case 'boolean':
                    data = Math.random() > 0.5;
                    break;
                // ... other types
            }

            // Publish
            pluginsManager.doAction(
                `${datasource_id}-${topic.topic}-published`,
                data,
                Date.now()
            );
        }, 1000 / topicDef.frequency);

        intervalsRef.current.set(topic.topic, interval);
    };

    const stopPublishing = (topicName: string) => {
        const interval = intervalsRef.current.get(topicName);
        if (interval) {
            clearInterval(interval);
            intervalsRef.current.delete(topicName);
        }
    };

    return <>{children}</>;
};

export { RandomDataSourceProvider };
```

---

## Best Practices

### ✅ Do's

1. **Always use `useRef` for subscriptions/intervals** - Prevents re-creation on re-renders
2. **Track subscriber count** - Only start publishing when someone is listening
3. **Clean up properly** - Remove hooks and close connections in return functions
4. **Handle disabled state** - Check `props.enable` before registering topics
5. **Use unique hook IDs** - Include `datasource_id` in all hook names
6. **Provide loading states** - Show spinner during initialization
7. **Error handling** - Catch and handle connection errors gracefully

### ❌ Don'ts

1. **Don't create subscriptions on every render** - Use `useEffect` and `useRef`
2. **Don't forget cleanup** - Always return cleanup functions
3. **Don't publish without subscribers** - Wastes resources
4. **Don't block rendering** - Keep providers lightweight
5. **Don't use global state unnecessarily** - Context is optional

---

## Advanced: Context Provider

For datasources that need to expose utilities to child components:

```typescript
interface MyDataSourceContextValue {
    publishMessage: (topic: string, data: any) => void;
    getTopicList: () => string[];
}

const MyDataSourceContext = createContext<MyDataSourceContextValue | null>(null);

const MyDataSourceProvider = (children: ReactNode, props: MySettings) => {
    // ... setup

    const contextValue = {
        publishMessage: (topic, data) => {
            // Implementation
        },
        getTopicList: () => {
            return Array.from(topicsRef.current.keys());
        }
    };

    return (
        <MyDataSourceContext.Provider value={contextValue}>
            {children}
        </MyDataSourceContext.Provider>
    );
};

// Custom hook for consumers
const useMyDataSource = () => {
    const context = useContext(MyDataSourceContext);
    if (!context) {
        throw new Error('Must be used within MyDataSourceProvider');
    }
    return context;
};

export { MyDataSourceProvider, useMyDataSource };
```

---

## Testing Checklist

- [ ] Provider mounts without errors
- [ ] Topics appear in `AVAILABLE_TOPICS`
- [ ] Subscription increases subscriber count
- [ ] Data publishes to correct hook
- [ ] Unsubscribe decreases subscriber count
- [ ] Publishing stops when count reaches zero
- [ ] Cleanup happens on unmount
- [ ] Disabled datasource doesn't register topics
- [ ] Connection errors handled gracefully

---

## Next Steps

- [Plugin Integration](../plugins/integration) - Register your datasource
- [Creating a Datasource](../implementation/creating-datasource) - Complete tutorial
- [Example: Foxglove](../implementation/example-foxglove) - Real-world WebSocket example
