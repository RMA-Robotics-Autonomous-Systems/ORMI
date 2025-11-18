# Example: Foxglove WebSocket Datasource

A walkthrough of the **Foxglove datasource** - a complex, production-ready WebSocket-based datasource with dynamic topic discovery.

## Overview

**Location:** `plugins/ormi-foxglove/`

**Purpose:** Connect to Foxglove WebSocket protocol servers (ROS2, etc.)

**Complexity:** ⭐⭐⭐ Advanced - Full-featured implementation

**Key Features:**

- WebSocket connection with auto-reconnect
- Dynamic topic discovery from server
- Message serialization/deserialization
- Transform tree management
- Pub/sub support
- Type system conversion

---

## Architecture

```
WebSocket Connection
    ↓
Protocol Negotiation (Foxglove WS Protocol)
    ↓
Server Info & Channel Discovery
    ↓
Subscribe to Channels
    ↓
Receive Binary Messages → Deserialize → Publish
```

---

## Key Components

### 1. Settings Interface

```typescript
export interface FoxgloveDataSourceSettings extends DatasourceProviderSettings {
    url: string; // WebSocket URL
    reconnectTimeout: number; // Reconnect delay
    toasts: boolean; // Show connection toasts
    transformTreeTopics: string[]; // TF topics to track
}
```

---

### 2. WebSocket Management

Uses `react-use-websocket` library:

```typescript
const { lastMessage, sendMessage, readyState, getWebSocket } = useWebSocket(
    props.url,
    {
        protocols: [FoxgloveClient.SUPPORTED_SUBPROTOCOL],
        shouldReconnect: () => true,
        reconnectAttempts: 10,
        reconnectInterval: props.reconnectTimeout * 1000,
        onOpen: () => {
            toast("Connected to Foxglove server");
            setClientConnected(true);
        },
        onClose: (event) => {
            toast("Disconnected from Foxglove server");
            setClientConnected(false);
        },
        onError: (event) => {
            console.error("WebSocket error:", event);
        },
    }
);
```

**Key Points:**

- Auto-reconnection handled by library
- Multiple protocol support
- Connection state tracking
- Toast notifications

---

### 3. Modular Architecture

The Foxglove datasource is split into specialized managers:

#### **FoxgloveDataHandler**

Main coordinator - processes messages and routes data

```typescript
const FoxgloveDataHandler = (props: {
    lastMessage: MessageEvent | null;
    sendMessage: (message: Uint8Array) => void;
    clientConnected: boolean;
    datasource_id: string;
    settings: FoxgloveDataSourceSettings;
}) => {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [subscribers, setSubscribers] = useState<Map<number, Subscriber>>(
        new Map()
    );

    // Process incoming messages
    useEffect(() => {
        if (!lastMessage) return;

        const data = new Uint8Array(lastMessage.data);
        const view = new DataView(data.buffer);
        const opcode = view.getUint8(0);

        switch (opcode) {
            case FoxgloveClient.serverInfo:
                handleServerInfo(data);
                break;
            case FoxgloveClient.status:
                handleStatus(data);
                break;
            case FoxgloveClient.advertise:
                handleAdvertise(data);
                break;
            case FoxgloveClient.messageData:
                handleMessageData(data);
                break;
            // ... more cases
        }
    }, [lastMessage]);

    // ... implementation
};
```

#### **SubscriptionManager**

Handles channel subscriptions

```typescript
const SubscriptionManager = {
    subscribe: async (channel: Channel, sendMessage: Function) => {
        const subscribeMessage = FoxgloveClient.subscribe({
            subscriptions: [
                {
                    id: nextSubscriberId++,
                    channelId: channel.id,
                },
            ],
        });
        sendMessage(subscribeMessage);
    },

    unsubscribe: async (subscriberId: number, sendMessage: Function) => {
        const unsubscribeMessage = FoxgloveClient.unsubscribe({
            subscriptionIds: [subscriberId],
        });
        sendMessage(unsubscribeMessage);
    },
};
```

#### **PublisherManager**

Handles publishing to server

```typescript
const PublisherManager = {
    advertise: (topic: string, schemaName: string, sendMessage: Function) => {
        const advertiseMessage = FoxgloveClient.advertise({
            channels: [
                {
                    id: nextChannelId++,
                    topic: topic,
                    encoding: "cdr",
                    schemaName: schemaName,
                },
            ],
        });
        sendMessage(advertiseMessage);
    },

    publish: (channelId: number, data: Uint8Array, sendMessage: Function) => {
        const publishMessage = FoxgloveClient.clientMessage({
            channelId: channelId,
            data: data,
        });
        sendMessage(publishMessage);
    },
};
```

#### **TypeSystemManager**

Converts ROS2 types to JSON Schema

```typescript
const TypeSystemManager = {
    parseSchema: (schemaData: string, schemaEncoding: string) => {
        if (schemaEncoding === "ros2msg" || schemaEncoding === "ros2idl") {
            return parseRos2Schema(schemaData);
        }
        // ... other formats
    },

    createReader: (schema: any) => {
        // Create message reader for deserialization
        return new MessageReader(schema);
    },

    createWriter: (schema: any) => {
        // Create message writer for serialization
        return new MessageWriter(schema);
    },
};
```

#### **TransformTreeManager**

Tracks coordinate transforms (TF)

```typescript
const TransformTreeManager = {
    processTransform: (transformMsg: any) => {
        // Update transform tree
        // Used for 3D visualization
    },

    getTransform: (from: string, to: string) => {
        // Look up transform between frames
    },
};
```

---

### 4. Dynamic Topic Discovery

Topics are discovered from server channels:

```typescript
useEffect(() => {
    if (!channels || channels.length === 0) return;

    pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
        id: `${datasource_id}-topics`,
        priority: 10,
        filter: async (topics: DatasourceTopic[]) => {
            const foxgloveTopics = channels.map((channel) => ({
                topic: channel.topic,
                datasource_id: datasource_id,
                source: props,
                type: mapToInternalType(channel.schemaName),
                rawType: channel.schemaName,
                bufferSize: 100,
            }));

            topics.push(...foxgloveTopics);
            return topics;
        },
    });

    return () => {
        pluginsManager.removeFilter(
            PluginsHooks.AVAILABLE_TOPICS,
            `${datasource_id}-topics`
        );
    };
}, [channels, datasource_id]);
```

**Key Points:**

- Topics come from server, not hardcoded
- Updates when server channels change
- Maps ROS2 types to internal types

---

### 5. Message Deserialization

Binary messages must be deserialized:

```typescript
const handleMessageData = (data: Uint8Array) => {
    const view = new DataView(data.buffer);

    // Parse header
    const subscriptionId = view.getUint32(1, true);
    const timestamp = view.getBigUint64(5, true);

    // Get subscriber info
    const subscriber = subscribers.get(subscriptionId);
    if (!subscriber) return;

    // Deserialize message
    const messageData = data.slice(13); // Skip header
    const message = subscriber.reader.readMessage(messageData);

    // Convert and publish
    const converted = convertRos2ToInternal(message, subscriber.schemaName);

    pluginsManager.doAction(
        `${datasource_id}-${subscriber.topic}-published`,
        converted,
        Number(timestamp)
    );
};
```

**Key Points:**

- Binary protocol requires careful parsing
- Each subscriber has its own deserializer
- Type conversion before publishing

---

### 6. Subscription Lifecycle

```typescript
// Subscribe hook
pluginsManager.addAction(`${datasource_id}-subscribe`, {
    id: `${datasource_id}-subscribe-handler`,
    action: async (topic: SelectedTopic) => {
        // Find channel
        const channel = channels.find((c) => c.topic === topic.topic);
        if (!channel) {
            console.error("Channel not found:", topic.topic);
            return;
        }

        // Check if already subscribed
        const existing = Array.from(subscribers.values()).find(
            (s) => s.channelId === channel.id
        );

        if (existing) {
            // Increment ref count
            existing.count++;
            return;
        }

        // Create reader for deserialization
        const reader = TypeSystemManager.createReader(channel.schema);

        // Send subscribe message
        const subscriberId = await SubscriptionManager.subscribe(
            channel,
            sendMessage
        );

        // Store subscriber info
        const newSub: Subscriber = {
            subscriberId: subscriberId,
            channelId: channel.id,
            topic: channel.topic,
            schemaName: channel.schemaName,
            count: 1,
            reader: reader,
        };

        setSubscribers((prev) => new Map(prev).set(subscriberId, newSub));
    },
});
```

---

## Complex Features

### Transform Tree Tracking

```typescript
// Filter TF topics
const tfTopics = channels.filter((c) =>
    props.transformTreeTopics.some((pattern) =>
        new RegExp(pattern).test(c.topic)
    )
);

// Subscribe to TF topics
tfTopics.forEach(async (tfChannel) => {
    await SubscriptionManager.subscribe(tfChannel, sendMessage);
});

// Process transforms
const handleTFMessage = (msg: any) => {
    TransformTreeManager.processTransform(msg);

    // Expose transform tree via custom hook
    pluginsManager.addFilter(`${datasource_id}-transform-tree`, {
        id: `${datasource_id}-tf`,
        filter: () => TransformTreeManager.getTree(),
    });
};
```

### Connection Status Overlay

```typescript
{isMounted && showOverlay && (
    <WebSocketStatusOverlay
        readyState={readyState}
        url={props.url}
        reconnectAttempt={reconnectAttempt}
        error={connectionError}
    />
)}
```

Shows visual feedback during connection/reconnection.

---

## Lessons Learned

### ✅ What Works Well

1. **Modular design** - Separate managers for different concerns
2. **Dynamic discovery** - No hardcoded topics
3. **Binary protocol** - Efficient data transfer
4. **Auto-reconnect** - Robust to network issues
5. **Type system** - Proper message deserialization

### 🔧 Challenges

1. **Binary parsing** - Requires careful byte manipulation
2. **Type conversion** - ROS2 → Internal types mapping
3. **State management** - Many moving parts to coordinate
4. **Memory management** - Deserializers and buffers
5. **Error handling** - Network failures, malformed messages

---

## Key Takeaways

1. **Use libraries** - `react-use-websocket` handles complexity
2. **Separate concerns** - Managers for different functionality
3. **Handle errors** - Network is unreliable
4. **Type safety** - TypeScript helps with binary protocols
5. **User feedback** - Toasts and overlays for connection state

---

## When to Use This Pattern

✅ **Good for:**

- WebSocket-based protocols
- Dynamic topic systems
- Binary message formats
- ROS2/robotics applications

❌ **Not suitable for:**

- Simple REST APIs
- Static topic lists
- Text-based protocols

---

## Next Steps

- **[REST Bags Example](example-rest-bags)** - REST API datasource
- **[Creating a Datasource](creating-datasource)** - Build your own
- **[Provider Pattern](../datasources/provider-pattern)** - Deep dive
