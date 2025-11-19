---
title: "Data Flow"
order: 2
---

# Data Flow: Async Pub/Sub with Atoms

## Overview

V2 implements a **lazy asynchronous publish-subscribe pattern** using Jotai atoms as the transport layer. Data sources only subscribe to topics when widgets actually need them, and automatically unsubscribe when no longer needed.

## Core Concepts

### Lazy Subscription Model

**Critical principle: Datasources only start streaming when consumers exist.**

```mermaid
graph TD
    A[Initial State: No widgets mounted] --> A1[Datasource: IDLE]
    A --> A2[Connection: CONNECTED but not streaming]
    A --> A3[Atoms: Empty]

    B[Widget Mounts] --> B1[Widget calls useDataStream topic]
    B1 --> B2[Subscription count: 0 → 1]
    B2 --> B3[DatasourceManager: Detects first subscriber]
    B3 --> B4[Connection.subscribe topic called]
    B4 --> B5[Data starts flowing]

    C[Widget Unmounts] --> C1[Subscription count: 1 → 0]
    C1 --> C2[DatasourceManager: Detects no subscribers]
    C2 --> C3[Connection.unsubscribe topic called]
    C3 --> C4[Data stops flowing]
```

### Async Topic Transport

Atoms act as **topic-based message queues** with lazy activation:

```mermaid
sequenceDiagram
    participant W as Subscriber (Widget)
    participant A as Atom (Topic Queue)
    participant C as Publisher (Connection)

    Note over W,C: Widget subscribes to topic
    W->>A: useDataStream(topic)
    A->>A: [atom created, value=null]
    Note over A: Subscription count: 0→1

    Note over A,C: First subscriber detected
    A->>C: connection.subscribe()
    C->>C: [start streaming]

    Note over C,W: Data flows continuously
    C->>A: emit("message", data)
    A->>A: [atom updated]
    A->>W: notification
    W->>W: [re-render with data]
```

**Key characteristics:**

- **Lazy activation**: Connections only subscribe when first widget needs data
- **Automatic cleanup**: Connections unsubscribe when last widget unmounts
- **Fire-and-forget**: Publishers emit and don't wait for acknowledgment
- **Automatic routing**: No manual callback registration
- **Type-safe**: Atoms enforce data types
- **Decoupled**: Publishers don't know who subscribes
- **Efficient**: Only subscribed components get notifications

### Topic Naming

Topics follow a hierarchical naming pattern:

```typescript
// Format: datasourceId::topic
const topicKey = {
    datasourceId: "ros-1", // Which data source
    topic: "/imu/data", // Which topic within that source
};

// Creates unique atom: "ros-1::/imu/data"
```

**Why datasourceId + topic?**

- Multiple datasources can have same topic names (`/camera/image`)
- Allows source-specific subscriptions
- Enables datasource switching without topic conflicts
- Clear data provenance

## Subscription Lifecycle

### Complete Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    participant W as Widget
    participant UD as useDataStream Hook
    participant DA as Data Atom
    participant SA as Subscription Atom
    participant DM as DatasourceManager
    participant C as Connection
    participant Src as Data Source<br/>(ROS/WebSocket/etc)

    rect rgb(240, 248, 255)
        Note over W,Src: Phase 1: Mount & Subscribe
        W->>UD: Component mounts<br/>useDataStream(topic)

        UD->>DA: useAtom(dataAtomFamily({datasourceId, topic}))
        Note over DA: Atom created on first access
        DA-->>UD: Current value (null initially)

        UD->>SA: Add widgetId to subscription set
        Note over SA: Set: {} → {widgetId}
        SA->>SA: Trigger subscription effect

        SA->>DM: Subscription count changed: 0 → 1
        DM->>DM: Check if already subscribed

        alt First subscriber for this topic
            DM->>C: connection.subscribe(topic)
            C->>Src: Request topic subscription
            Src-->>C: Acknowledge
            C->>DM: emit("subscribed", topic)
        else Already subscribed
            Note over DM,C: No action, already streaming
        end

        UD-->>W: Return { data: null, isLoading: true, error: null }
    end

    rect rgb(240, 255, 240)
        Note over W,Src: Phase 2: Data Streaming (continuous)
        loop Every data arrival
            Src->>C: New data arrives
            C->>C: Transform to internal format
            C->>DM: emit("message", topic, data, metadata)

            DM->>DA: store.set(atom, {value, timestamp, frameId})
            Note over DA: Atom state updated

            DA->>UD: Atom change notification
            UD->>UD: Process data, update state
            UD-->>W: Return { data, isLoading: false }
            W->>W: Re-render with new data

            Note over W: Only this widget re-renders!<br/>No other components affected
        end
    end

    rect rgb(255, 248, 240)
        Note over W,Src: Phase 3: Unmount & Cleanup
        W->>UD: Component unmounts
        UD->>SA: Remove widgetId from subscription set
        Note over SA: Set: {widgetId} → {}
        SA->>SA: Trigger cleanup effect

        SA->>DM: Subscription count changed: 1 → 0
        DM->>DM: Check remaining subscribers

        alt No more subscribers
            DM->>C: connection.unsubscribe(topic)
            C->>Src: Cancel topic subscription
            Src-->>C: Acknowledge
            C->>DM: emit("unsubscribed", topic)
        else Still has subscribers
            Note over DM,C: Keep streaming for others
        end

        UD->>DA: Cleanup atom subscription
        Note over DA: Atom remains (with last value)<br/>for potential future subscribers
    end
```

### Phase 1: Subscription (Detailed)

When a widget first mounts and calls `useDataStream()`:

#### Step 1: Atom Registration

Widget hook subscribes to the atom for this datasource+topic combination. If the atom doesn't exist, it's created automatically with null initial state.

#### Step 2: Subscription Tracking

Widget's unique ID is added to the subscription tracking atom. This increments the subscriber count from 0 to 1 (or higher if other widgets are already subscribed).

#### Step 3: Connection Subscription (Lazy Activation)

**LAZY SUBSCRIPTION - Key Feature:**

DatasourceManager monitors subscription count changes. When the count transitions:

- **0 → 1 (First subscriber)**: Calls `connection.subscribe(topic)` to START the data stream
- **1 → 2+ (Additional subscribers)**: No action - already streaming, new widgets use existing stream
- **2+ → 1 (Subscriber removed)**: No action - keep streaming for remaining widgets
- **1 → 0 (Last subscriber removed)**: Calls `connection.unsubscribe(topic)` to STOP the data stream

**Critical Insight:** The datasource connection does NOT subscribe to topics until a widget actually needs the data. This prevents wasted bandwidth and CPU for unused topics.

### Phase 2: Data Streaming (Detailed)

Once subscribed, data flows continuously:

#### Step 1: Data Arrives at Connection

Connection receives data from the external source (WebSocket, REST API, etc.), transforms it to internal format if needed, and emits a "message" event with:

- Topic name
- Data payload (in internal format)
- Metadata (timestamp, frameId, etc.)

The Connection has no knowledge of who will consume the data.

#### Step 2: DatasourceManager Writes to Atom

DatasourceManager listens to the Connection's "message" event and:

- Looks up the atom for this datasource+topic
- Writes data directly to the atom (synchronous operation)
- If widgets need buffered data, also updates buffer atom
- Atom system handles notifying subscribers automatically

#### Step 3: Widget Receives Update

Widget's `useDataStream` hook:

- Detects atom change
- Extracts new data value
- Triggers component re-render with new data
- Only this specific component re-renders (isolated updates)

### Phase 3: Unsubscription (Detailed)

When widget unmounts:

#### Step 1: Cleanup Hook

React cleanup runs on component unmount, removing the widget's ID from the subscription tracking atom. This decrements the subscriber count.

#### Step 2: Connection Unsubscribe

When DatasourceManager detects the count reached 0 (last subscriber):

- Calls `connection.unsubscribe(topic)`
- Connection stops requesting data from the source
- Active subscription tracking is updated

#### Step 3: Atom Persistence

The atom is NOT destroyed - it remains in the store with its last value. This means:

- If a widget re-mounts, it gets the last known value immediately (no "flash of null")
- Reduces redundant subscriptions for frequently mounted/unmounted widgets
- Efficient for dashboard tab switching

## Multiple Subscribers

Multiple widgets can subscribe to the same topic:

```typescript
// Dashboard with 3 widgets
<Dashboard>
  <Widget1 datasourceId="ros-1" topic="/imu/data" />
  <Widget2 datasourceId="ros-1" topic="/imu/data" />
  <Widget3 datasourceId="ros-1" topic="/imu/data" />
</Dashboard>
```

### Subscription Timeline

```mermaid
gantt
    title Multiple Subscribers Lifecycle
    dateFormat YYYY-MM-DD
    axisFormat %H:%M:%S

    section Widget1
    Subscribed           :2024-01-01 00:00:00, 10s

    section Widget2
    Subscribed           :2024-01-01 00:00:01, 10s

    section Widget3
    Subscribed           :2024-01-01 00:00:02, 10s

    section Connection
    subscribe called     :crit, 2024-01-01 00:00:00, 1s
    Streaming            :active, 2024-01-01 00:00:00, 12s
    unsubscribe called   :crit, 2024-01-01 00:00:12, 1s
```

| Time | Event                     | Subscribers  | Connection State  |
| ---- | ------------------------- | ------------ | ----------------- |
| t0   | Widget1 mounts            | [w1]         | **subscribe()**   |
| t1   | Widget2 mounts            | [w1, w2]     | (no action)       |
| t2   | Widget3 mounts            | [w1, w2, w3] | (no action)       |
| ...  | Data flowing continuously |              | streaming         |
| t10  | Widget1 unmounts          | [w2, w3]     | (keep streaming)  |
| t11  | Widget2 unmounts          | [w3]         | (keep streaming)  |
| t12  | Widget3 unmounts          | []           | **unsubscribe()** |

**Key points:**

- Only first subscriber triggers `connection.subscribe()`
- Intermediate mounts/unmounts don't affect connection
- Only when last subscriber unmounts does connection stop
- All widgets receive same data simultaneously
- Each widget re-renders independently

## Buffered Data Streams

Some widgets need historical data (charts, playback):

### Buffer Atom

```typescript
const bufferedAtom = bufferedDataFamily({
    datasourceId: "ros-1",
    topic: "/imu/data",
    bufferSize: 1000, // Keep last 1000 messages
});
```

### Mixed Buffered and Non-Buffered Subscriptions

**What happens when two widgets subscribe to the same topic, but one needs a buffer and the other doesn't?**

```typescript
// Widget 1: Needs latest value only (gauge, indicator)
function GaugeWidget({ topic }) {
  const { data } = useDataStream(topic)  // No buffer
  return <Gauge value={data} />
}

// Widget 2: Needs historical data (chart)
function ChartWidget({ topic }) {
  const { buffer } = useDataStream(topic, {
    bufferSize: 1000  // With buffer
  })
  return <LineChart data={buffer} />
}
```

**How it works:**

1. **Separate Atoms**: The system maintains two atom types:
    - Latest value atom: stores only the most recent message
    - Buffer atom: stores historical array of messages

2. **Both Updated**: When data arrives, DatasourceManager updates:
    - Always: the latest value atom
    - Conditionally: the buffer atom (if any widget requests buffering)

3. **No Conflict**: Each widget subscribes to the atom type it needs:
    - Non-buffered widgets: subscribe to latest value atom
    - Buffered widgets: subscribe to buffer atom
    - Both receive updates from the SAME data stream

4. **Efficient**: Only ONE `connection.subscribe(topic)` regardless of buffer needs

**Key Insight**: Buffer requirement is a property of the subscription, not the data source. Multiple widgets can have different views (latest vs buffered) of the same data stream.

**Data Flow:**

1. Both GaugeWidget and ChartWidget subscribe to the same topic
2. DatasourceManager sees at least one subscriber, calls `connection.subscribe(topic)` once
3. When data arrives:
    - Latest value atom is updated → GaugeWidget re-renders
    - Buffer atom is updated → ChartWidget re-renders
4. Each widget re-renders independently based on its atom

### Buffer Updates

Buffer atoms maintain a circular buffer automatically:

- New data is appended to the buffer array
- When buffer exceeds configured size, oldest entries are removed
- Widgets always receive the most recent N messages

### Widget Usage

```typescript
function ChartWidget({ topic }) {
  const { buffer } = useDataStream(topic, {
    bufferSize: 100
  })

  return <LineChart data={buffer} />
}
```

## Error Handling

Errors flow through the same async pattern:

```mermaid
sequenceDiagram
    participant C as Connection
    participant DM as DatasourceManager
    participant EA as Error Atom
    participant W as Widget

    C->>C: Error occurs
    C->>DM: emit("error", error)
    DM->>EA: store.set(errorAtom, error)
    EA->>W: Notification
    W->>W: Display error UI
```

**Error flow principles:**

- Errors propagate through the atom layer (same as data)
- Connection-level errors affect all subscribed topics
- Topic-specific errors only affect that topic's subscribers
- Widgets receive errors via `useDataStream` hook's error property
- Error atoms maintain last error state until cleared

For error types, widget error handling patterns, and API details, see **[Hooks API - Error Handling](../api/hooks-api#error-handling)**.

## Connection Status Monitoring

Connection health is tracked independently from data flow:

## Connection Status Monitoring

Connection health is tracked independently from data flow:

```mermaid
graph LR
    C[Connection] -->|state changes| SA[Status Atom]
    SA -->|notification| W1[Widget 1]
    SA -->|notification| W2[Widget 2]
    SA -->|notification| UI[Status Bar]
```

**Status tracking principles:**

- Each connection has a status atom tracking its state
- Status changes independently of data messages
- Multiple components can monitor the same connection
- Status states: `disconnected`, `connecting`, `connected`, `reconnecting`, `error`

For `useConnectionStatus` API, status types, and usage patterns, see **[Hooks API - useConnectionStatus](../api/hooks-api#useconnectionstatus)**.

## Performance Optimization Principles

### Lazy Subscription

Connections only subscribe to topics when widgets actually need them:

```mermaid
graph TD
    A[No Widgets] --> A1[Connection: Not subscribed]
    B[Widget Mounts] --> B1[Connection: Subscribe to topic]
    C[Widget Unmounts] --> C1[Connection: Unsubscribe from topic]
```

**Benefits:**

- No unnecessary network traffic
- Reduced server load
- Lower memory usage
- Faster initial page load

### Selective Subscriptions

Only subscribe to the specific data you need - avoid over-subscribing:

- ✅ Widget needs `/imu/data` → Subscribe to `/imu/data` only
- ❌ Widget needs `/imu/data` → Don't subscribe to `/camera/image`, `/gps/fix`, etc.

### Conditional Subscriptions

Subscriptions can be enabled/disabled dynamically based on UI state:

- Widget hidden/collapsed → Pass `null` to `useDataStream` (unsubscribe)
- Widget visible → Pass topic to `useDataStream` (subscribe)
- Tab inactive → Unsubscribe
- Tab active → Re-subscribe

For API usage patterns (conditional subscriptions, throttling, selective updates), see **[Hooks API - Performance](../api/hooks-api#performance-optimization)**.

### Throttling Re-renders

For high-frequency data (100+ Hz):

```typescript
const { data } = useDataStream(lidarTopic, {
    throttle: 100, // Max 10 Hz updates to component
});
```

## Comparison with V1

### V1 Data Flow

```mermaid
sequenceDiagram
    participant W as Widget
    participant LDS as LocalDataSourceProvider
    participant PM as PluginManager
    participant DSP as Datasource Provider

    W->>LDS: Mount with LocalDataSourceProvider
    LDS->>PM: addAction(`${ds}-${topic}-published`, callback)
    LDS->>PM: doAction(`${ds}-subscribe`, topic)
    PM->>DSP: Broadcast subscribe action
    DSP->>DSP: Start data generation

    loop Data streaming
        DSP->>PM: doAction(`${ds}-${topic}-published`, data)
        PM->>LDS: Broadcast to ALL callbacks
        LDS->>LDS: Update local buffer
        LDS->>W: Context update → re-render
    end
```

**Problems:**

- Manual callback registration required
- PluginManager broadcasts to ALL registered callbacks (even unrelated widgets)
- Each LocalDataSourceProvider maintains duplicate buffers
- Context update causes cascading re-renders

### V2 Data Flow

```mermaid
sequenceDiagram
    participant W as Widget
    participant H as useDataStream Hook
    participant A as Atom Store
    participant DM as DatasourceManager
    participant C as Connection

    W->>H: useDataStream(topic)
    H->>A: Subscribe to atom
    H->>A: Add to subscription set
    A->>DM: Subscription count > 0 detected
    DM->>C: connection.subscribe(topic)
    C->>C: Start streaming

    loop Data flowing
        C->>A: emit("message") → write atom directly
        A->>H: Notify ONLY subscribed hooks
        H->>W: Re-render with new data
    end
```

**Benefits:**

- Automatic subscription management - no manual callback registration
- Direct, targeted updates - only subscribed widgets notified
- Single atom per topic - no buffer duplication
- No context overhead - atomic re-renders only affected widgets

---

**Next:** See [Connection API](../api/connection-api) for implementing data sources, or [Hooks API](../api/hooks-api) for consuming data in widgets.
