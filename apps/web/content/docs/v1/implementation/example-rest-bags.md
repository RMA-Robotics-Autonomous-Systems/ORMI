# Example: REST Bags Datasource

A walkthrough of the **REST Bags datasource** - a REST API-based datasource for playing back ROS2 bag files.

## Overview

**Location:** `plugins/ormi-rest-bags/`

**Purpose:** Connect to REST API for ROS2 bag file playback

**Complexity:** ⭐⭐ Intermediate - REST API + custom client

**Key Features:**

- REST API client
- Bag file listing and management
- Playback control
- Topic discovery from bags
- Recording support

---

## Architecture

```
REST API Client
    ↓
Fetch Bag List
    ↓
Select Bag → Get Topics
    ↓
Start Playback → Poll for Messages
    ↓
Publish Messages to Subscribers
```

---

## Key Components

### 1. REST Client Class

Custom client wrapping fetch API:

```typescript
export class RestBagClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async getBags(): Promise<BagFile[]> {
        const response = await fetch(`${this.baseUrl}/bags`);
        return response.json();
    }

    async getBagTopics(bagId: string): Promise<TopicInfo[]> {
        const response = await fetch(`${this.baseUrl}/bags/${bagId}/topics`);
        return response.json();
    }

    async startPlayback(
        bagId: string,
        options?: PlaybackOptions
    ): Promise<PlaybackSession> {
        const response = await fetch(`${this.baseUrl}/bags/${bagId}/play`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options),
        });
        return response.json();
    }

    async stopPlayback(sessionId: string): Promise<void> {
        await fetch(`${this.baseUrl}/playback/${sessionId}/stop`, {
            method: "POST",
        });
    }

    async getMessages(sessionId: string, topic: string): Promise<Message[]> {
        const response = await fetch(
            `${this.baseUrl}/playback/${sessionId}/messages?topic=${topic}`
        );
        return response.json();
    }
}
```

**Key Points:**

- Encapsulates API calls
- Type-safe responses
- Reusable across components

---

### 2. Provider Component

```typescript
const RestBagDataSourceProvider = (children: ReactNode, props: RestBagDatasourceSettings) => {
    const pluginsManager = usePluginsManager();
    const { url, id: datasource_id } = props;

    const [initialized, setInitialized] = useState(false);
    const [bagClient] = useState(new RestBagClient(url));

    useEffect(() => {
        // Register API URL for widgets to access
        pluginsManager.addFilter(`${datasource_id}-api-url`, {
            id: `${datasource_id}-url`,
            priority: 10,
            filter: () => url
        });

        // Register client instance
        pluginsManager.addFilter(`${datasource_id}-client`, {
            id: `${datasource_id}-client`,
            priority: 10,
            filter: () => bagClient
        });

        setInitialized(true);

        return () => {
            pluginsManager.removeFilter(`${datasource_id}-api-url`, `${datasource_id}-url`);
            pluginsManager.removeFilter(`${datasource_id}-client`, `${datasource_id}-client`);
        };
    }, [url, datasource_id, bagClient, pluginsManager]);

    if (!initialized) {
        return <Spinner />;
    }

    return <>{children}</>;
};
```

**Key Points:**

- Exposes client and URL via filters
- Widgets can access API directly
- Simpler than full pub/sub for this use case

---

### 3. Bag List Widget

A specialized widget for managing bags:

```typescript
const BagList = (props: { datasource_id: string }) => {
    const pluginsManager = usePluginsManager();
    const [bags, setBags] = useState<BagFile[]>([]);
    const [loading, setLoading] = useState(true);

    // Get client from datasource
    const bagClient = pluginsManager.applyFilter(
        `${props.datasource_id}-client`,
        null
    ) as RestBagClient;

    useEffect(() => {
        const loadBags = async () => {
            try {
                const bagList = await bagClient.getBags();
                setBags(bagList);
            } catch (error) {
                toast.error('Failed to load bags');
            } finally {
                setLoading(false);
            }
        };

        loadBags();
    }, [bagClient]);

    const handlePlay = async (bagId: string) => {
        try {
            const session = await bagClient.startPlayback(bagId);
            toast.success(`Playing bag: ${bagId}`);
            // Start polling for messages...
        } catch (error) {
            toast.error('Failed to start playback');
        }
    };

    return (
        <div>
            {loading ? <Spinner /> : (
                <ul>
                    {bags.map(bag => (
                        <li key={bag.id}>
                            <span>{bag.name}</span>
                            <Button onClick={() => handlePlay(bag.id)}>
                                Play
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
```

---

### 4. Playback Management

```typescript
const PlaybackManager = {
    sessions: new Map<string, PlaybackSession>(),
    pollIntervals: new Map<string, NodeJS.Timeout>(),

    async start(bagClient: RestBagClient, bagId: string, topics: string[]) {
        const session = await bagClient.startPlayback(bagId, {
            topics: topics,
            rate: 1.0, // Playback speed
        });

        this.sessions.set(session.id, session);

        // Poll for new messages
        const interval = setInterval(async () => {
            for (const topic of topics) {
                const messages = await bagClient.getMessages(session.id, topic);

                messages.forEach((msg) => {
                    // Publish message
                    pluginsManager.doAction(
                        `${datasource_id}-${topic}-published`,
                        msg.data,
                        msg.timestamp
                    );
                });
            }
        }, 100); // Poll every 100ms

        this.pollIntervals.set(session.id, interval);

        return session.id;
    },

    async stop(bagClient: RestBagClient, sessionId: string) {
        // Stop polling
        const interval = this.pollIntervals.get(sessionId);
        if (interval) {
            clearInterval(interval);
            this.pollIntervals.delete(sessionId);
        }

        // Stop server playback
        await bagClient.stopPlayback(sessionId);
        this.sessions.delete(sessionId);
    },
};
```

**Key Points:**

- Manages multiple playback sessions
- Polls API for new messages
- Publishes via plugin system

---

### 5. Dynamic Topics from Bag

```typescript
const [currentBag, setCurrentBag] = useState<string | null>(null);
const [bagTopics, setBagTopics] = useState<TopicInfo[]>([]);

useEffect(() => {
    if (!currentBag) return;

    const loadTopics = async () => {
        const topics = await bagClient.getBagTopics(currentBag);
        setBagTopics(topics);
    };

    loadTopics();
}, [currentBag, bagClient]);

useEffect(() => {
    pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
        id: `${datasource_id}-topics`,
        priority: 10,
        filter: async (topics: DatasourceTopic[]) => {
            if (!props.enable || !currentBag) return topics;

            const bagDataTopics = bagTopics.map((topicInfo) => ({
                topic: topicInfo.name,
                datasource_id: datasource_id,
                source: props,
                type: mapRos2Type(topicInfo.type),
                rawType: topicInfo.type,
            }));

            topics.push(...bagDataTopics);
            return topics;
        },
    });

    return () => {
        pluginsManager.removeFilter(
            PluginsHooks.AVAILABLE_TOPICS,
            `${datasource_id}-topics`
        );
    };
}, [bagTopics, currentBag, datasource_id]);
```

**Key Points:**

- Topics come from selected bag file
- Updates when bag changes
- Only exposes topics from current bag

---

## Recording Support

The datasource also supports recording:

```typescript
const RecordingManager = {
    async startRecording(
        bagClient: RestBagClient,
        topics: string[],
        filename: string
    ) {
        const response = await fetch(`${bagClient.baseUrl}/record/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topics: topics,
                filename: filename,
            }),
        });

        return response.json();
    },

    async stopRecording(bagClient: RestBagClient, recordingId: string) {
        await fetch(`${bagClient.baseUrl}/record/${recordingId}/stop`, {
            method: "POST",
        });
    },
};
```

---

## Widget Integration

### Conditional Widget Display

Only show bag-specific widgets when REST Bags datasource is present:

```typescript
// In plugin registration
this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
    id: "rest-bags-widget-filter",
    priority: 10,
    filter: (widgets: WidgetDefinition[], datasources: Datasource[]) => {
        const hasRestBags = datasources.some(
            (ds) => ds.datasource_id === "rest-bag-source"
        );

        if (!hasRestBags) {
            // Remove bag-specific widgets
            return widgets.filter(
                (w) => !["ros2-bag-list", "ros2-bag-recorder"].includes(w.id)
            );
        }

        return widgets;
    },
});
```

---

## Lessons Learned

### ✅ What Works Well

1. **REST API** - Simple, widely supported
2. **Polling** - Reliable for playback
3. **Client class** - Encapsulates API logic
4. **Widget integration** - Specialized UI for bags
5. **Filter exposure** - Widgets access client directly

### 🔧 Challenges

1. **Polling overhead** - Not as efficient as WebSocket
2. **Timing accuracy** - Playback timing can drift
3. **Large messages** - JSON encoding overhead
4. **State sync** - Keep UI and playback in sync

---

## Alternative Approaches

### Server-Sent Events (SSE)

Instead of polling:

```typescript
const eventSource = new EventSource(`${url}/playback/${sessionId}/stream`);

eventSource.onmessage = (event) => {
    const message = JSON.parse(event.data);

    pluginsManager.doAction(
        `${datasource_id}-${message.topic}-published`,
        message.data,
        message.timestamp
    );
};
```

Benefits:

- Real-time push
- Lower latency
- Less API calls

### WebSocket Upgrade

For better performance:

```typescript
const ws = new WebSocket(`${wsUrl}/playback/${sessionId}`);

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // Process and publish...
};
```

---

## Key Takeaways

1. **REST is simple** - Good for CRUD operations
2. **Polling works** - For non-realtime use cases
3. **Client classes** - Organize API calls
4. **Widget specialization** - Create domain-specific widgets
5. **Filter exposure** - Share resources with widgets

---

## When to Use This Pattern

✅ **Good for:**

- REST API data sources
- File-based playback
- Management interfaces
- Non-realtime data

❌ **Not suitable for:**

- High-frequency real-time data
- Low-latency requirements
- Streaming protocols

---

## Next Steps

- **[Creating a Datasource](creating-datasource)** - Build your own
- **[Random Data Example](example-random)** - Timer-based datasource
- **[Foxglove Example](example-foxglove)** - WebSocket datasource
