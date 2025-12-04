---
title: "Connection API"
order: 1
---

# Connection API Reference

Complete reference for implementing V2 datasource connections. Connections are class-based implementations that emit events to the atom transport layer.

## Connection Interface

```typescript
import { EventEmitter } from "events";

interface Connection extends EventEmitter {
    // Lifecycle methods
    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    reconnect(): Promise<void>;

    // Topic management
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;

    // Topic discovery
    getAvailableTopics(): Promise<TopicInfo[]>;
    getTopicType(topic: string): Promise<string | null>;

    // Status
    getStatus(): ConnectionStatus;

    // Publishing (for bidirectional connections)
    publish?(topic: string, data: any): Promise<void>;
    advertise?(topic: string, type: string): Promise<void>;
    unadvertise?(topic: string): Promise<void>;
}
```

## Type Definitions

### ConnectionConfig

Configuration passed to `connect()`:

```typescript
interface ConnectionConfig {
    // Common properties
    url?: string;
    timeout?: number;
    reconnectAttempts?: number;
    reconnectInterval?: number;

    // Authentication (if needed)
    username?: string;
    password?: string;
    token?: string;

    // Protocol-specific
    [key: string]: any;
}
```

**Example configurations:**

```typescript
// WebSocket
const wsConfig: ConnectionConfig = {
    url: "ws://localhost:9090",
    timeout: 5000,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
};

// HTTP REST API
const restConfig: ConnectionConfig = {
    url: "https://api.example.com",
    token: "bearer-token-here",
    pollInterval: 1000,
};

// Custom protocol
const customConfig: ConnectionConfig = {
    host: "192.168.1.100",
    port: 8080,
    protocol: "custom-v1",
    bufferSize: 1024,
};
```

### ConnectionStatus

Current connection state:

```typescript
interface ConnectionStatus {
    state: ConnectionState;
    error: ConnectionError | null;
    connectedAt: number | null;
    lastDataAt: number | null;
    bytesReceived?: number;
    bytesSent?: number;
    latency?: number;
}

type ConnectionState =
    | "disconnected" // Not connected
    | "connecting" // Connection in progress
    | "connected" // Active and ready
    | "reconnecting" // Attempting reconnection
    | "error"; // Failed connection
```

### ConnectionError

Error information:

```typescript
interface ConnectionError {
    type: ConnectionErrorType;
    message: string;
    code?: string | number;
    timestamp: number;
    topic?: string;
    recoverable: boolean;
    details?: any;
}

type ConnectionErrorType =
    | "connection" // Failed to connect
    | "authentication" // Auth failure
    | "subscription" // Topic subscription failed
    | "data" // Data parsing/validation error
    | "timeout" // Operation timeout
    | "protocol" // Protocol error
    | "unknown"; // Unclassified error
```

### TopicInfo

Topic metadata for discovery:

```typescript
interface TopicInfo {
    topic: string; // Topic name/path
    type: string; // Data type (internal representation)
    rawType?: string; // Source-specific type name
    description?: string; // Human-readable description
    frequency?: number; // Expected publishing rate (Hz)
    reliable?: boolean; // Delivery guarantee
    latched?: boolean; // Last value cached
    metadata?: {
        // Additional metadata
        [key: string]: any;
    };
}
```

**Example:**

```typescript
const topicInfo: TopicInfo = {
    topic: "/imu/data",
    type: "IMU",
    rawType: "sensor_msgs/Imu",
    description: "Inertial Measurement Unit data",
    frequency: 100,
    reliable: true,
    latched: false,
    metadata: {
        frame_id: "imu_link",
        sensor_model: "BMI088",
    },
};
```

### MessageMetadata

Metadata for published messages:

```typescript
interface MessageMetadata {
    timestamp: number; // Unix timestamp (milliseconds)
    frameId?: string; // Reference frame (for spatial data)
    sequenceId?: number; // Message sequence number
    sourceTimestamp?: number; // Original source timestamp
    latency?: number; // Transmission latency (ms)
    [key: string]: any; // Custom metadata
}
```

### DataMessage

Complete message with metadata (stored in atoms):

```typescript
interface DataMessage<T = any> {
    value: T; // The actual data
    timestamp: number; // When received
    frameId?: string; // Reference frame
    sequenceId?: number; // Sequence number
    metadata?: MessageMetadata; // Full metadata
}
```

## Events

Connections emit events using the EventEmitter pattern:

### "connected"

Emitted when connection is established:

```typescript
connection.emit("connected");

// Listener
connection.on("connected", () => {
    console.log("Connection established");
});
```

### "disconnected"

Emitted when connection is closed:

```typescript
connection.emit("disconnected", reason?: string);

// Listener
connection.on("disconnected", (reason) => {
  console.log("Disconnected:", reason);
});
```

### "message"

Emitted when new data arrives - **most important event**:

```typescript
connection.emit(
  "message",
  topic: string,
  data: any,
  metadata: MessageMetadata
);

// Listener (typically in DatasourceManager)
connection.on("message", (topic, data, metadata) => {
  // Write to atom
  const atom = dataAtomFamily({ datasourceId, topic });
  store.set(atom, {
    value: data,
    timestamp: metadata.timestamp,
    frameId: metadata.frameId
  });
});
```

### "error"

Emitted when error occurs:

```typescript
connection.emit("error", error: ConnectionError);

// Listener
connection.on("error", (error) => {
  console.error("Connection error:", error);
  // Update error atom
});
```

### "subscribed"

Emitted when topic subscription succeeds:

```typescript
connection.emit("subscribed", topic: string);

// Listener
connection.on("subscribed", (topic) => {
  console.log("Subscribed to:", topic);
});
```

### "unsubscribed"

Emitted when topic unsubscription succeeds:

```typescript
connection.emit("unsubscribed", topic: string);

// Listener
connection.on("unsubscribed", (topic) => {
  console.log("Unsubscribed from:", topic);
});
```

### "topic-discovered"

Emitted when new topic becomes available:

```typescript
connection.emit("topic-discovered", topicInfo: TopicInfo);

// Listener
connection.on("topic-discovered", (topicInfo) => {
  console.log("New topic:", topicInfo.topic);
  // Update available topics list
});
```

### "topic-removed"

Emitted when topic no longer available:

```typescript
connection.emit("topic-removed", topic: string);

// Listener
connection.on("topic-removed", (topic) => {
  console.log("Topic removed:", topic);
  // Update available topics list
});
```

### "status-changed"

Emitted when connection status changes:

```typescript
connection.emit("status-changed", status: ConnectionStatus);

// Listener
connection.on("status-changed", (status) => {
  // Update status atom
});
```

## Lifecycle Methods

### connect()

Establish connection to data source:

```typescript
async connect(config: ConnectionConfig): Promise<void>
```

**Responsibilities:**

1. Establish underlying connection (WebSocket, HTTP, etc.)
2. Perform authentication if needed
3. Initialize protocol handshake
4. Discover initial topics
5. Emit "connected" event
6. Update status to 'connected'

**Implementation example:**

```typescript
class WebSocketConnection extends EventEmitter implements Connection {
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = {
        state: "disconnected",
        error: null,
        connectedAt: null,
        lastDataAt: null,
    };

    async connect(config: ConnectionConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            this.status.state = "connecting";
            this.emit("status-changed", this.status);

            this.ws = new WebSocket(config.url!);

            this.ws.onopen = () => {
                this.status.state = "connected";
                this.status.connectedAt = Date.now();
                this.status.error = null;
                this.emit("status-changed", this.status);
                this.emit("connected");
                resolve();
            };

            this.ws.onerror = (event) => {
                const error: ConnectionError = {
                    type: "connection",
                    message: "WebSocket connection failed",
                    timestamp: Date.now(),
                    recoverable: true,
                };
                this.status.state = "error";
                this.status.error = error;
                this.emit("status-changed", this.status);
                this.emit("error", error);
                reject(error);
            };

            // Set up message handler
            this.ws.onmessage = (event) => this.handleMessage(event);
        });
    }

    private handleMessage(event: MessageEvent) {
        const message = JSON.parse(event.data);

        this.status.lastDataAt = Date.now();

        // Emit message event (DatasourceManager listens)
        this.emit("message", message.topic, message.data, {
            timestamp: message.timestamp || Date.now(),
            frameId: message.frameId,
            sequenceId: message.seq,
        });
    }
}
```

**Error handling:**

```typescript
async connect(config: ConnectionConfig): Promise<void> {
  try {
    await this.establishConnection(config);
  } catch (error) {
    const connError: ConnectionError = {
      type: 'connection',
      message: error.message,
      timestamp: Date.now(),
      recoverable: true,
      details: error
    };
    this.emit("error", connError);
    throw connError;
  }
}
```

### disconnect()

Close connection gracefully:

```typescript
async disconnect(): Promise<void>
```

**Responsibilities:**

1. Unsubscribe from all active topics
2. Close underlying connection
3. Clean up resources
4. Emit "disconnected" event
5. Update status to 'disconnected'

**Implementation example:**

```typescript
async disconnect(): Promise<void> {
  if (!this.ws) return;

  // Unsubscribe from all topics
  for (const topic of this.activeSubscriptions) {
    await this.unsubscribe(topic);
  }

  // Close WebSocket
  return new Promise((resolve) => {
    if (!this.ws) {
      resolve();
      return;
    }

    this.ws.onclose = () => {
      this.status.state = 'disconnected';
      this.status.connectedAt = null;
      this.emit("status-changed", this.status);
      this.emit("disconnected");
      this.ws = null;
      resolve();
    };

    this.ws.close();
  });
}
```

### reconnect()

Attempt to reconnect after disconnection:

```typescript
async reconnect(): Promise<void>
```

**Implementation example:**

```typescript
private config: ConnectionConfig | null = null;
private reconnectTimer: NodeJS.Timeout | null = null;
private reconnectAttempt = 0;

async reconnect(): Promise<void> {
  if (!this.config) {
    throw new Error("Cannot reconnect: no config stored");
  }

  this.status.state = 'reconnecting';
  this.emit("status-changed", this.status);

  this.reconnectAttempt++;

  try {
    await this.connect(this.config);
    this.reconnectAttempt = 0;

    // Re-subscribe to previously active topics
    for (const topic of this.previousSubscriptions) {
      this.subscribe(topic);
    }
  } catch (error) {
    const maxAttempts = this.config.reconnectAttempts || 10;
    const interval = this.config.reconnectInterval || 3000;

    if (this.reconnectAttempt < maxAttempts) {
      // Schedule next attempt
      this.reconnectTimer = setTimeout(() => {
        this.reconnect();
      }, interval);
    } else {
      // Give up
      const connError: ConnectionError = {
        type: 'connection',
        message: `Failed to reconnect after ${maxAttempts} attempts`,
        timestamp: Date.now(),
        recoverable: false
      };
      this.emit("error", connError);
      throw connError;
    }
  }
}
```

## Topic Management Methods

### subscribe()

Subscribe to a topic:

```typescript
subscribe(topic: string): void
```

**Responsibilities:**

1. Send subscription request to data source
2. Store topic in active subscriptions
3. Start receiving data for this topic
4. Emit "subscribed" event when confirmed
5. Emit "message" events as data arrives

**Implementation example:**

```typescript
private activeSubscriptions = new Set<string>();

subscribe(topic: string): void {
  // Already subscribed?
  if (this.activeSubscriptions.has(topic)) {
    return;
  }

  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    const error: ConnectionError = {
      type: 'subscription',
      message: 'Cannot subscribe: not connected',
      topic,
      timestamp: Date.now(),
      recoverable: true
    };
    this.emit("error", error);
    return;
  }

  // Send subscription request
  this.ws.send(JSON.stringify({
    op: 'subscribe',
    topic: topic,
    type: this.getTopicType(topic)
  }));

  this.activeSubscriptions.add(topic);
  this.emit("subscribed", topic);
}
```

**With confirmation:**

```typescript
subscribe(topic: string): void {
  this.pendingSubscriptions.add(topic);

  this.ws.send(JSON.stringify({
    op: 'subscribe',
    topic: topic,
    id: this.nextRequestId++
  }));

  // Wait for confirmation in message handler
}

private handleSubscribeResponse(response: any) {
  if (response.success) {
    this.activeSubscriptions.add(response.topic);
    this.pendingSubscriptions.delete(response.topic);
    this.emit("subscribed", response.topic);
  } else {
    const error: ConnectionError = {
      type: 'subscription',
      message: `Subscription failed: ${response.error}`,
      topic: response.topic,
      timestamp: Date.now(),
      recoverable: true
    };
    this.emit("error", error);
  }
}
```

### unsubscribe()

Unsubscribe from a topic:

```typescript
unsubscribe(topic: string): void
```

**Implementation example:**

```typescript
unsubscribe(topic: string): void {
  if (!this.activeSubscriptions.has(topic)) {
    return;
  }

  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify({
      op: 'unsubscribe',
      topic: topic
    }));
  }

  this.activeSubscriptions.delete(topic);
  this.emit("unsubscribed", topic);
}
```

## Topic Discovery Methods

### getAvailableTopics()

Retrieve list of available topics:

```typescript
async getAvailableTopics(): Promise<TopicInfo[]>
```

**Implementation example:**

```typescript
async getAvailableTopics(): Promise<TopicInfo[]> {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    return [];
  }

  return new Promise((resolve) => {
    const requestId = this.nextRequestId++;

    // Register one-time response handler
    const handler = (message: any) => {
      if (message.id === requestId && message.op === 'topics_response') {
        this.ws!.removeEventListener('message', handler);

        const topics: TopicInfo[] = message.topics.map((t: any) => ({
          topic: t.name,
          type: this.mapRawType(t.type),
          rawType: t.type,
          description: t.description,
          frequency: t.frequency
        }));

        resolve(topics);
      }
    };

    this.ws.addEventListener('message', handler);

    // Send request
    this.ws.send(JSON.stringify({
      op: 'get_topics',
      id: requestId
    }));

    // Timeout after 5 seconds
    setTimeout(() => {
      this.ws!.removeEventListener('message', handler);
      resolve([]);
    }, 5000);
  });
}
```

### getTopicType()

Get type information for a specific topic:

```typescript
async getTopicType(topic: string): Promise<string | null>
```

**Implementation example:**

```typescript
private topicTypes = new Map<string, string>();

async getTopicType(topic: string): Promise<string | null> {
  // Check cache
  if (this.topicTypes.has(topic)) {
    return this.topicTypes.get(topic)!;
  }

  // Query from source
  const topics = await this.getAvailableTopics();
  const topicInfo = topics.find(t => t.topic === topic);

  if (topicInfo) {
    this.topicTypes.set(topic, topicInfo.type);
    return topicInfo.type;
  }

  return null;
}
```

## Status Method

### getStatus()

Get current connection status:

```typescript
getStatus(): ConnectionStatus
```

**Implementation example:**

```typescript
getStatus(): ConnectionStatus {
  return { ...this.status }; // Return copy
}
```

## Publishing Methods (Optional)

For bidirectional connections:

### publish()

Publish data to a topic:

```typescript
async publish(topic: string, data: any): Promise<void>
```

**Implementation example:**

```typescript
async publish(topic: string, data: any): Promise<void> {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    throw new Error("Cannot publish: not connected");
  }

  if (!this.advertisedTopics.has(topic)) {
    throw new Error(`Topic not advertised: ${topic}`);
  }

  this.ws.send(JSON.stringify({
    op: 'publish',
    topic: topic,
    data: data,
    timestamp: Date.now()
  }));
}
```

### advertise()

Advertise intent to publish on a topic:

```typescript
async advertise(topic: string, type: string): Promise<void>
```

**Implementation example:**

```typescript
private advertisedTopics = new Map<string, string>();

async advertise(topic: string, type: string): Promise<void> {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    throw new Error("Cannot advertise: not connected");
  }

  this.ws.send(JSON.stringify({
    op: 'advertise',
    topic: topic,
    type: type
  }));

  this.advertisedTopics.set(topic, type);
}
```

### unadvertise()

Stop advertising a topic:

```typescript
async unadvertise(topic: string): Promise<void>
```

**Implementation example:**

```typescript
async unadvertise(topic: string): Promise<void> {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  this.ws.send(JSON.stringify({
    op: 'unadvertise',
    topic: topic
  }));

  this.advertisedTopics.delete(topic);
}
```

## Complete Implementation Example

```typescript
import { EventEmitter } from "events";
import {
    Connection,
    ConnectionConfig,
    ConnectionStatus,
    ConnectionError,
    TopicInfo,
    MessageMetadata,
} from "@workspace/ormi-core/v2";

class WebSocketConnection extends EventEmitter implements Connection {
    private ws: WebSocket | null = null;
    private config: ConnectionConfig | null = null;
    private status: ConnectionStatus = {
        state: "disconnected",
        error: null,
        connectedAt: null,
        lastDataAt: null,
    };
    private activeSubscriptions = new Set<string>();
    private topicTypes = new Map<string, string>();

    async connect(config: ConnectionConfig): Promise<void> {
        this.config = config;

        return new Promise((resolve, reject) => {
            this.status.state = "connecting";
            this.emit("status-changed", this.status);

            try {
                this.ws = new WebSocket(config.url!);

                this.ws.onopen = () => {
                    this.status.state = "connected";
                    this.status.connectedAt = Date.now();
                    this.status.error = null;
                    this.emit("status-changed", this.status);
                    this.emit("connected");
                    resolve();
                };

                this.ws.onerror = (event) => {
                    const error: ConnectionError = {
                        type: "connection",
                        message: "WebSocket connection failed",
                        timestamp: Date.now(),
                        recoverable: true,
                    };
                    this.status.state = "error";
                    this.status.error = error;
                    this.emit("status-changed", this.status);
                    this.emit("error", error);
                    reject(error);
                };

                this.ws.onmessage = (event) => this.handleMessage(event);

                this.ws.onclose = () => {
                    if (this.status.state === "connected") {
                        this.status.state = "disconnected";
                        this.emit("status-changed", this.status);
                        this.emit("disconnected", "Connection closed");
                    }
                };
            } catch (error) {
                const connError: ConnectionError = {
                    type: "connection",
                    message: error.message,
                    timestamp: Date.now(),
                    recoverable: false,
                };
                reject(connError);
            }
        });
    }

    async disconnect(): Promise<void> {
        if (!this.ws) return;

        // Clean up subscriptions
        this.activeSubscriptions.clear();

        return new Promise((resolve) => {
            this.ws!.onclose = () => {
                this.status.state = "disconnected";
                this.status.connectedAt = null;
                this.emit("status-changed", this.status);
                this.emit("disconnected");
                this.ws = null;
                resolve();
            };

            this.ws!.close();
        });
    }

    async reconnect(): Promise<void> {
        await this.disconnect();
        if (this.config) {
            await this.connect(this.config);
        }
    }

    subscribe(topic: string): void {
        if (this.activeSubscriptions.has(topic)) return;

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            const error: ConnectionError = {
                type: "subscription",
                message: "Cannot subscribe: not connected",
                topic,
                timestamp: Date.now(),
                recoverable: true,
            };
            this.emit("error", error);
            return;
        }

        this.ws.send(
            JSON.stringify({
                op: "subscribe",
                topic: topic,
            })
        );

        this.activeSubscriptions.add(topic);
        this.emit("subscribed", topic);
    }

    unsubscribe(topic: string): void {
        if (!this.activeSubscriptions.has(topic)) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({
                    op: "unsubscribe",
                    topic: topic,
                })
            );
        }

        this.activeSubscriptions.delete(topic);
        this.emit("unsubscribed", topic);
    }

    async getAvailableTopics(): Promise<TopicInfo[]> {
        // Implementation depends on protocol
        return [];
    }

    async getTopicType(topic: string): Promise<string | null> {
        return this.topicTypes.get(topic) || null;
    }

    getStatus(): ConnectionStatus {
        return { ...this.status };
    }

    private handleMessage(event: MessageEvent) {
        try {
            const message = JSON.parse(event.data);

            this.status.lastDataAt = Date.now();

            if (message.op === "publish") {
                // Data message
                const metadata: MessageMetadata = {
                    timestamp: message.timestamp || Date.now(),
                    frameId: message.frameId,
                    sequenceId: message.seq,
                };

                this.emit("message", message.topic, message.data, metadata);
            }
            // Handle other message types...
        } catch (error) {
            const dataError: ConnectionError = {
                type: "data",
                message: `Failed to parse message: ${error.message}`,
                timestamp: Date.now(),
                recoverable: true,
                details: error,
            };
            this.emit("error", dataError);
        }
    }
}

export default WebSocketConnection;
```

## Best Practices

### 1. Always Use EventEmitter

Extend EventEmitter for proper event handling:

```typescript
class MyConnection extends EventEmitter implements Connection {
    // ...
}
```

### 2. Handle Errors Gracefully

Emit errors instead of throwing:

```typescript
try {
    // risky operation
} catch (error) {
    this.emit("error", {
        type: "data",
        message: error.message,
        timestamp: Date.now(),
        recoverable: true,
    });
}
```

### 3. Update Status Consistently

Always emit status changes:

```typescript
private updateStatus(state: ConnectionState, error?: ConnectionError) {
  this.status.state = state;
  this.status.error = error || null;
  this.emit("status-changed", this.status);
}
```

### 4. Clean Up Resources

Properly clean up in disconnect():

```typescript
async disconnect(): Promise<void> {
  // Unsubscribe from all
  for (const topic of this.activeSubscriptions) {
    this.unsubscribe(topic);
  }

  // Clear maps/sets
  this.activeSubscriptions.clear();
  this.topicTypes.clear();

  // Close connection
  this.ws?.close();
  this.ws = null;
}
```

### 5. Support Reconnection

Store config and previous subscriptions:

```typescript
private config: ConnectionConfig | null = null;
private previousSubscriptions = new Set<string>();

async connect(config: ConnectionConfig): Promise<void> {
  this.config = config; // Store for reconnection
  // ...
}

subscribe(topic: string): void {
  this.previousSubscriptions.add(topic); // Remember for reconnection
  // ...
}
```

### 6. Validate Data

Validate before emitting:

```typescript
private handleMessage(event: MessageEvent) {
  const message = JSON.parse(event.data);

  // Validate
  if (!message.topic || message.data === undefined) {
    this.emit("error", {
      type: 'data',
      message: 'Invalid message format',
      timestamp: Date.now(),
      recoverable: true
    });
    return;
  }

  // Emit
  this.emit("message", message.topic, message.data, metadata);
}
```

### 7. Provide Type Mapping

Map source types to internal types:

```typescript
private mapRawType(rawType: string): string {
  const typeMap: Record<string, string> = {
    'sensor_msgs/Imu': 'IMU',
    'geometry_msgs/Vector3': 'Vector3',
    'std_msgs/Float64': 'number',
    // ...
  };

  return typeMap[rawType] || rawType;
}
```

---

**Next:** See [Hooks API](./hooks-api) for consuming data in widgets, or [Examples](../examples) for complete implementation examples.
