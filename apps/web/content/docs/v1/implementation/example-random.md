# Example: Random Data Datasource

A walkthrough of the **Random Data datasource** - the simplest type of datasource that generates data internally without external connections.

## Overview

**Location:** `plugins/ormi-randoms-datasources/`

**Purpose:** Generate random test data for development and testing

**Complexity:** ⭐ Simple - Good starting point

**Key Features:**

- No external dependencies
- Timer-based data generation
- Multiple data types (number, boolean, IMU, GeolocationPosition, etc.)
- Configurable topics and frequencies

---

## Architecture

```ascii
Timer (setInterval)
    ↓
Generate Random Data
    ↓
Publish via pluginsManager.doAction()
    ↓
Subscribers receive data
```

---

## Code Walkthrough

### 1. Settings Interface

```typescript
interface RandomDataSourceTopicDefinition {
    topic: string;
    frequency: number;
    type: string;
}

interface RandomDataSourceSettings extends DatasourceProviderSettings {
    topics: RandomDataSourceTopicDefinition[];
}
```

**Key Points:**

- User configures list of topics to generate
- Each topic has name, frequency (Hz), and type
- Types: `number`, `boolean`, `IMU`, `GeolocationPosition`, etc.

---

### 2. Datasource Definition

```typescript
const RandomDataSourceDefinition: DatasourceDefinition<RandomDataSourceSettings> =
    {
        id: "random-data-source",
        name: "Random Data",
        description: "Generate random test data",

        schema: {
            type: "object",
            properties: {
                title: { type: "string" },
                enable: { type: "boolean" },
                topics: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            topic: { type: "string", title: "Topic Name" },
                            frequency: {
                                type: "number",
                                title: "Frequency (Hz)",
                            },
                            type: {
                                type: "string",
                                title: "Data Type",
                                enum: [
                                    "number",
                                    "boolean",
                                    "IMU",
                                    "GeolocationPosition" /* ... */,
                                ],
                            },
                        },
                        required: ["topic", "frequency"],
                    },
                },
            },
        },

        data: {
            id: "",
            title: "Random Data",
            enable: true,
            topics: [],
        },

        Provider: ({ children, props }) =>
            RandomDataSourceProvider(children, props),
    };
```

**Key Points:**

- Schema defines array of topic configurations
- Enum constrains type selection in UI
- Empty topics array by default - user adds topics

---

### 3. Provider Setup

```typescript
export const RandomDataSourceProvider = (
    children: ReactNode,
    props: RandomDataSourceSettings
) => {
    const pluginsManager = usePluginsManager();
    const datasource_id = props.id;

    // Track intervals and subscribers
    const intervalsRef = useRef(new Map<string, NodeJS.Timeout>());
    const subscribersCountRef = useRef(new Map<string, number>());

    const [initialized, setInitialized] = useState(false);

    // ... rest of implementation
};
```

**Key Points:**

- `intervalsRef` stores active timers per topic
- `subscribersCountRef` tracks how many widgets subscribed to each topic
- Use `useRef` not `useState` to avoid re-renders

---

### 4. Expose Topics

```typescript
useEffect(() => {
    pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
        id: `${datasource_id}-topics`,
        priority: 10,
        filter: async (topics: DatasourceTopic[]) => {
            if (!props.enable) return topics;

            const availableTopics = props.topics.map((topicDef) => ({
                topic: topicDef.topic,
                datasource_id: datasource_id,
                source: props,
                type: topicDef.type,
                rawType: topicDef.type,
            }));

            topics.push(...availableTopics);
            return topics;
        },
    });

    setInitialized(true);

    return () => {
        pluginsManager.removeFilter(
            PluginsHooks.AVAILABLE_TOPICS,
            `${datasource_id}-topics`
        );
    };
}, [datasource_id, props, pluginsManager]);
```

**Key Points:**

- Convert user-configured topics to `DatasourceTopic` format
- Only add if datasource enabled
- Clean up on unmount

---

### 5. Handle Subscriptions

```typescript
useEffect(() => {
    if (!initialized) return;

    // Subscribe
    pluginsManager.addAction(`${datasource_id}-subscribe`, {
        id: `${datasource_id}-sub`,
        priority: 10,
        action: async (topic: SelectedTopic) => {
            const count = subscribersCountRef.current.get(topic.topic) || 0;
            subscribersCountRef.current.set(topic.topic, count + 1);

            // Start generating on first subscriber
            if (count === 0) {
                startPublishing(topic);
            }
        },
    });

    // Unsubscribe
    pluginsManager.addAction(`${datasource_id}-unsubscribe`, {
        id: `${datasource_id}-unsub`,
        priority: 10,
        action: async (topic: SelectedTopic) => {
            const count = subscribersCountRef.current.get(topic.topic) || 0;
            if (count > 0) {
                subscribersCountRef.current.set(topic.topic, count - 1);

                // Stop generating on last unsubscribe
                if (count === 1) {
                    stopPublishing(topic.topic);
                }
            }
        },
    });

    return () => {
        // Cleanup all intervals
        intervalsRef.current.forEach((interval) => clearInterval(interval));
        pluginsManager.removeAction(
            `${datasource_id}-subscribe`,
            `${datasource_id}-sub`
        );
        pluginsManager.removeAction(
            `${datasource_id}-unsubscribe`,
            `${datasource_id}-unsub`
        );
    };
}, [initialized, datasource_id, pluginsManager]);
```

**Key Points:**

- Increment/decrement subscriber count
- Only start timer on first subscription
- Stop timer when no subscribers remain
- Critical for resource management!

---

### 6. Data Generation

```typescript
const startPublishing = (topic: SelectedTopic) => {
    const topicDef = props.topics.find((t) => t.topic === topic.topic);
    if (!topicDef) return;

    const interval = setInterval(() => {
        let data: any;

        switch (topicDef.type) {
            case "number":
                data = Math.random() * 100;
                break;

            case "boolean":
                data = Math.random() > 0.5;
                break;

            case "GeolocationPosition":
                data = {
                    coords: {
                        latitude: 50.8503 + (Math.random() - 0.5) * 0.01,
                        longitude: 4.3517 + (Math.random() - 0.5) * 0.01,
                        altitude: 100 + Math.random() * 10,
                        accuracy: 5,
                        heading: Math.random() * 360,
                        speed: Math.random() * 10,
                    },
                };
                break;

            case "IMU":
                data = {
                    orientation: {
                        x: Math.random() * 2 - 1,
                        y: Math.random() * 2 - 1,
                        z: Math.random() * 2 - 1,
                        w: Math.random() * 2 - 1,
                    },
                    angularVelocity: {
                        x: Math.random() * 0.1,
                        y: Math.random() * 0.1,
                        z: Math.random() * 0.1,
                    },
                    linearAcceleration: {
                        x: Math.random() * 2 - 1,
                        y: Math.random() * 2 - 1,
                        z: 9.81 + Math.random() * 0.1,
                    },
                };
                break;

            // ... more types
        }

        // Publish
        pluginsManager.doAction(
            `${datasource_id}-${topic.topic}-published`,
            data,
            Date.now()
        );
    }, 1000 / topicDef.frequency); // Convert Hz to ms

    intervalsRef.current.set(topic.topic, interval);
};

const stopPublishing = (topicName: string) => {
    const interval = intervalsRef.current.get(topicName);
    if (interval) {
        clearInterval(interval);
        intervalsRef.current.delete(topicName);
    }
};
```

**Key Points:**

- `setInterval` fires at configured frequency
- Switch statement handles different data types
- `pluginsManager.doAction()` publishes to subscribers
- Store interval reference for cleanup

---

## Usage Example

### 1. Configure Datasource

```json
{
    "title": "Test Sensors",
    "enable": true,
    "topics": [
        {
            "topic": "/test/temperature",
            "frequency": 1,
            "type": "number"
        },
        {
            "topic": "/test/gps",
            "frequency": 5,
            "type": "GeolocationPosition"
        },
        {
            "topic": "/test/active",
            "frequency": 2,
            "type": "boolean"
        }
    ]
}
```

### 2. Subscribe in Widget

```typescript
useEffect(() => {
    const topic = {
        topic: "/test/temperature",
        datasource_id: "datasource_1_12345",
        // ... other fields
    };

    // Subscribe
    pluginsManager.doActionAsync(`${topic.datasource_id}-subscribe`, topic);

    // Listen for data
    pluginsManager.addAction(
        `${topic.datasource_id}-${topic.topic}-published`,
        {
            id: "my-widget-listener",
            action: (data, timestamp) => {
                console.log("Temperature:", data, "at", timestamp);
                setTemperature(data);
            },
        }
    );

    return () => {
        // Unsubscribe
        pluginsManager.doActionAsync(
            `${topic.datasource_id}-unsubscribe`,
            topic
        );
        pluginsManager.removeAction(/* ... */);
    };
}, []);
```

---

## Lessons Learned

### ✅ What Works Well

1. **Simple architecture** - Easy to understand and modify
2. **No dependencies** - No network, no external services
3. **Configurable** - User controls topics and rates
4. **Resource efficient** - Only generates when subscribed

### 🔧 Improvements

1. **Add seed option** - Reproducible random sequences
2. **Add value ranges** - Min/max for numbers
3. **Add patterns** - Sine waves, ramps, etc.
4. **Better type definitions** - Schema per type

---

## Key Takeaways

1. **Refs for timers** - Always use `useRef` for intervals/timeouts
2. **Subscriber counting** - Prevent unnecessary work
3. **Cleanup is critical** - Clear intervals on unmount
4. **Type switching** - Handle different data types elegantly
5. **Frequency control** - Convert Hz to milliseconds correctly

---

## When to Use This Pattern

✅ **Good for:**

- Test/demo data
- Simulations
- Development without real hardware
- Load testing

❌ **Not suitable for:**

- Production data sources
- External API connections
- Real sensor data

---

## Next Steps

- **[Foxglove Example](example-foxglove)** - WebSocket-based datasource
- **[REST Bags Example](example-rest-bags)** - REST API datasource
- **[Provider Pattern](../datasources/provider-pattern)** - Deep dive
