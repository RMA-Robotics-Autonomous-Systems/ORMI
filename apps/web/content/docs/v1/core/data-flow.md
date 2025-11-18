---
title: "Data Flow"
order: 2
---

# Data Flow

Understanding how data moves through ORMI-CORE is essential for building effective widgets and datasources. This guide explains the complete data flow from data sources to widget visualization.

## Overview

Data in ORMI-CORE follows a **publish-subscribe pattern** facilitated by the PluginManager.

### Step 1: Subscription Request (Widget Mount)

```mermaid
graph LR
    W["Widget Mounts<br/>(LocalDataSourceProvider)"]
    W -->|"1. addAction()<br/>{datasource}-{topic}-published<br/>(register callback)"| PM["PluginManager"]
    W -->|"2. WaitAndDoAction()<br/>{datasource}-subscribe<br/>(request subscription)"| PM
    PM -->|"Subscribe action"| DS["Datasource Provider<br/>receives request"]
    DS -->|"Starts data<br/>generation/streaming"| DS

    style W fill:#e8f5e9
    style PM fill:#ffecb3
    style DS fill:#f3e5f5
```

**What happens:**

- Widget wraps component in `LocalDataSourceProvider`
- LocalDS registers a callback for receiving data
- LocalDS requests subscription from datasource
- Datasource starts generating/streaming data for that topic

### Step 2: Data Flow (Runtime)

```mermaid
graph LR
    DS["Datasource<br/>publishes data"]
    DS -->|"doAction()<br/>{datasource}-{topic}-published<br/>+ timestamp + frameId"| PM["PluginManager<br/>(broadcast hub)"]
    PM -->|"Execute all<br/>registered callbacks"| L["LocalDataSourceProvider<br/>(callback)"]
    L -->|"Buffer data<br/>(useRef)"| L
    L -->|"Update state<br/>(React)"| W["Widget re-renders<br/>useLocalDataSource()<br/>getSource(topic)"]

    style DS fill:#f3e5f5
    style PM fill:#ffecb3
    style L fill:#e8f5e9
    style W fill:#c8e6c9
```

**What happens:**

- Datasource publishes data via `doAction()`
- PluginManager calls all registered callbacks
- LocalDS callback buffers data
- State update triggers widget re-render
- Widget retrieves buffered data with `getSource()`

### Step 3: Unsubscription (Widget Unmount)

```mermaid
graph LR
    W["Widget Unmounts"]
    W -->|"WaitAndDoAction()<br/>{datasource}-unsubscribe<br/>(cleanup)"| PM["PluginManager"]
    PM -->|"Unsubscribe action"| DS["Datasource Provider"]
    DS -->|"Decrement counter<br/>stop if no subscribers"| DS
    W -->|"removeAction()<br/>cleanup callbacks"| PM

    style W fill:#ffcdd2
    style PM fill:#ffecb3
    style DS fill:#f3e5f5
```

**What happens:**

- Widget unmounts, LocalDS cleanup runs
- Unsubscribe request sent to datasource
- Datasource stops if no other subscribers
- Callbacks are removed from PluginManager

## Data Flow Layers

### Layer 1: Datasource Provider

The **Datasource Provider** is a React Provider component that:

1. Connects to external data sources
2. Converts raw data to internal types
3. **Listens for subscription requests** via `{datasource_id}-subscribe` action
4. Manages subscriber counts (start/stop data flow)
5. Publishes data via the Plugin Manager when active

**Important:** Datasources wait for subscription requests before starting data generation!

**Example from Random Datasource:**

```typescript
const RandomDataSourceProvider = (children, props: RandomDataSourceSettings) => {
  const pluginManager = usePluginsManager();
  const datasource_id = props.id;
  const intervalsRef = useRef(new Map());
  const subscribersCountRef = useRef(new Map());

  // Handle subscription requests
  useEffect(() => {
    pluginManager.addAction(`${datasource_id}-subscribe`, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic) => {
        const count = subscribersCountRef.current.get(topic.topic) || 0;
        subscribersCountRef.current.set(topic.topic, count + 1);

        // Start data generation on first subscriber
        if (count === 0) {
          const interval = setInterval(() => {
            const data = generateRandomData();

            // Publish data via Plugin Manager
            pluginManager.doAction(
              `${datasource_id}-${topic.topic}-published`,
              data,
              Date.now(),
              "sensor_frame"
            );
          }, 1000 / frequency);

          intervalsRef.current.set(topic.topic, interval);
        }
      }
    });

    return () => {
      pluginManager.removeAction(`${datasource_id}-subscribe`);
    };
  }, []);

  return <>{children}</>;
};
```

### Layer 2: Plugin Manager (Pub/Sub Hub)

The **Plugin Manager** acts as a central message broker:

- Receives published data from datasources
- Maintains subscriber lists
- Dispatches data to all subscribers
- No data transformation or storage

**Execution flow:**

```typescript
// Datasource publishes
pluginManager.doAction("foxglove-/robot/pose-published", poseData, timestamp);

// Plugin Manager finds all registered actions for this hook
// Calls each action's callback in priority order
action1.action(poseData, timestamp);
action2.action(poseData, timestamp);
// ...
```

### Layer 3: LocalDataSourceProvider

The **LocalDataSourceProvider** wraps individual widgets and:

1. **Requests subscription** via `pluginsManager.WaitAndDoAction('{datasource_id}-subscribe', topic)`
2. **Registers action callbacks** on the PluginManager for data updates
3. Maintains data buffers in memory
4. Provides React context to child widgets
5. Manages subscription lifecycle (subscribe on mount, unsubscribe on unmount)

**Key features:**

- **Active subscription request**: LocalDS explicitly asks datasources for data
- **Callback registration**: Separate from subscription request
- **Buffer management**: Keep last N messages per topic
- **Subscription coordination**: Uses PluginManager actions to communicate with datasources
- **Throttled updates**: Batches state updates at specified frequency (default 30Hz)
- **Automatic lifecycle**: Subscribe on mount, unsubscribe on unmount

- **Buffer management**: Keep last N messages per topic
- **Subscription coordination**: Uses PluginManager actions to communicate with datasources
- **Throttled updates**: Batches state updates at specified frequency (default 30Hz)
- **Automatic lifecycle**: Subscribe on mount, unsubscribe on unmount

**Usage:**

```typescript
<LocalDataSourcesProvider
  SelectedTopics={[topicSelection]}
  buffersSize={10}
  updateFrequency={30}  // Optional: Hz, default 30
>
  <MyWidget />
</LocalDataSourcesProvider>
```

**How it works internally:**

1. On mount, for each topic:
    - **Step A:** Registers an action callback: `pluginsManager.addAction('{datasource_id}-{topic}-published', callback)`
    - **Step B:** **Requests subscription**: `await pluginsManager.WaitAndDoAction('{datasource_id}-subscribe', topic)`
    - This triggers the datasource to start generating/streaming data for this topic
2. When datasource publishes data via `doAction(...-published)`, the registered callback receives it
3. Callback stores data in a pending buffer (useRef, doesn't trigger re-render)
4. At regular intervals (updateFrequency), batches pending updates and updates React state
5. On unmount, calls `WaitAndDoAction('{datasource_id}-unsubscribe')` and removes callbacks

### Layer 4: Widget Component

The **Widget** consumes data via React hooks:

```typescript
function MyWidget({ topic }: { topic: SelectedTopic }) {
  const { getSource, getSourceId } = useLocalDataSource();

  // Get the buffered data for this topic
  const sourceId = getSourceId(topic);
  const source = getSource(topic);

  if (!source) return <div>No data</div>;

  // source.data: array of buffered messages (most recent last)
  // source.times: corresponding timestamps
  // source.referenceFrameId: coordinate frame reference

  const latestValue = source.data[source.data.length - 1];

  return <div>Latest: {JSON.stringify(latestValue)}</div>;
}
```

**LocalDataSource Context API:**

```typescript
interface LocalDataSources {
    getSource: (topic: SelectedTopic) => Source | undefined;
    getSourceId: (topic: SelectedTopic) => string;
}

interface Source {
    data: unknown[];
    times: number[];
    referenceFrameId: string;
}
```

## Subscription Mechanism

### How LocalDataSourceProvider Requests Subscription

**Key Concept:** LocalDataSourceProvider **actively requests** subscription from datasources. Data doesn't flow until subscription is requested.

**Two-step process:**

1. **Register data callback:**

    ```typescript
    pluginsManager.addAction(`${datasource_id}-${topic}-published`, {
        id: `unique-callback-id`,
        priority: 10,
        action: (data, timestamp, frameId) => {
            // Handle incoming data
        },
    });
    ```

2. **Request subscription:**
    ```typescript
    await pluginsManager.WaitAndDoAction(
        `${datasource_id}-subscribe`,
        1, // timeout in seconds
        topic
    );
    ```

**Why this pattern?**

- Datasources only generate/stream data when needed (performance)
- Multiple widgets can subscribe to same topic (reference counting)
- Clean lifecycle management (subscribe on mount, unsubscribe on unmount)

### Widget-Initiated Subscription

When a widget needs data:

```mermaid
sequenceDiagram
    participant W as Widget
    participant L as LocalDataSourceProvider
    participant PM as PluginManager
    participant DS as DatasourceProvider

    W->>L: Mount with SelectedTopics
    L->>L: Initialize empty buffers

    loop For each topic
        Note over L: STEP 1: Subscribe to topic
        L->>PM: addAction({datasource}-{topic}-published, callback)
        Note over L,PM: Register callback for data updates
        L->>PM: WaitAndDoAction({datasource}-subscribe, topic)
        Note over L,PM: Request subscription (async, waits for action)
        PM->>DS: Execute subscribe action
        Note over DS: STEP 2: Handle subscription request
        DS->>DS: Increment subscriber count
        alt First subscriber
            DS->>DS: Start data generation/connection
        end
    end

    L->>L: setInitialized(true)
    L->>W: Render children

    Note over DS: STEP 3: Data arrives from source
    DS->>PM: doAction({datasource}-{topic}-published, data, time, frameId)
    Note over PM: STEP 4: Broadcast to callbacks
    PM->>L: Execute registered callback
    L->>L: Store in pendingUpdates buffer

    Note over L: Update interval fires (e.g., every 33ms for 30Hz)
    L->>L: Process pendingUpdates batch
    L->>L: Update buffers with new data
    L->>L: Apply buffer size limit
    L->>L: Trigger React state update
    Note over L,W: STEP 5: Widget re-renders
    L->>W: Context update → Widget re-renders
    W->>L: getSource(topic)
    L->>W: Return buffered data
```

**Important Notes:**

- **LocalDataSourceProvider actively requests subscription** via `WaitAndDoAction()`
- The datasource doesn't push data until a subscription is requested
- Multiple widgets can subscribe to the same topic (subscriber count tracking)
- Unsubscribe happens automatically when widget unmounts

### Subscription Lifecycle

```typescript
// Inside LocalDataSourceProvider
useEffect(() => {
    let isMounted = true;

    Topics.forEach(async (topic) => {
        const sourceId = getSourceId(topic);

        // Register callback for data updates
        pluginsManager.addAction(
            `${topic.source.id}-${topic.topic}-published`,
            {
                id: `${localId}-${topic.source.id}-${topic.topic}-published`,
                priority: 10,
                action: (
                    value: any,
                    time: number,
                    referenceFrameId: string
                ) => {
                    if (!isMounted) return;

                    // Process property extraction if needed
                    const processedValue = topic.property
                        ? extractProperty(value, topic.property)
                        : value;

                    // Store in pending updates (batched processing)
                    pendingUpdates.set(sourceId, {
                        value: processedValue,
                        time,
                        referenceFrameId: referenceFrameId || "unknown",
                    });
                },
            }
        );

        // Subscribe to the topic
        const result = await pluginsManager.WaitAndDoAction(
            `${topic.source.id}-subscribe`,
            1, // timeout in seconds
            topic
        );

        if (!result) {
            console.error(`Failed to subscribe to ${topic.topic}`);
        }
    });

    // Cleanup: unsubscribe
    return () => {
        isMounted = false;

        Topics.forEach(async (topic) => {
            // Unsubscribe from topic
            await pluginsManager.WaitAndDoAction(
                `${topic.source.id}-unsubscribe`,
                1,
                topic
            );

            // Remove action callback
            pluginsManager.removeAction(
                `${localId}-${topic.source.id}-${topic.topic}-published`
            );
        });
    };
}, [SelectedTopics]);
```

## Type System

ORMI-CORE uses a dual type system with standardized internal types and raw external types. See the **[Type System](type-system)** guide for complete details on type conversion and available types.

## Data Buffering

### Buffer Configuration

Buffers store the last N messages for each topic:

```typescript
<LocalDataSourcesProvider
  SelectedTopics={[topic1, topic2]}
  buffersSize={10}  // Keep last 10 messages
>
```

### Buffer Structure

```typescript
// LocalDataSource context provides
interface LocalDataSources {
    getSource: (topic: SelectedTopic) => Source | undefined;
    getSourceId: (topic: SelectedTopic) => string;
}

interface Source {
    data: unknown[]; // Array of buffered messages
    times: number[]; // Corresponding timestamps (milliseconds)
    referenceFrameId: string; // Coordinate frame reference
}

// Usage in widget
const { getSource, getSourceId } = useLocalDataSource();
const source = getSource(myTopic);

if (source) {
    console.log(source.data); // [msg1, msg2, ..., msgN]
    console.log(source.times); // [time1, time2, ..., timeN]
    // Most recent message is at the end of the arrays
    const latest = source.data[source.data.length - 1];
    const latestTime = source.times[source.times.length - 1];
}
```

### Use Cases

**Single value (buffer = 1):**

- Current robot position
- Latest sensor reading
- Status indicators

**Time series (buffer > 1):**

- Plotting charts
- Path visualization
- Historical analysis

**Example:**

```typescript
function TimeSeriesChart({ topic }: { topic: SelectedTopic }) {
  return (
    <LocalDataSourcesProvider
      SelectedTopics={[topic]}
      buffersSize={100}  // Keep last 100 points
      updateFrequency={30}  // Update at 30Hz
    >
      <ChartComponent topic={topic} />
    </LocalDataSourcesProvider>
  );
}

function ChartComponent({ topic }: { topic: SelectedTopic }) {
  const { getSource } = useLocalDataSource();
  const source = getSource(topic);

  if (!source) return <div>Loading...</div>;

  // Plot all buffered points (up to 100)
  const dataPoints = source.data.map((value, index) => ({
    x: source.times[index],
    y: value as number
  }));

  return <LineChart data={dataPoints} />;
}
```

## Topic Filtering

Widgets can specify which types of topics they accept:

### DataRequirements

```typescript
interface DataRequirements {
    accepts: string[]; // Array of internal types
}
```

### TopicSelectElement

Use in widget UISchema to filter available topics:

```typescript
{
  type: "TopicSelect",
  scope: "#/properties/topic",
  options: {
    dataRequirements: {
      accepts: ["Vector3", "Movement"]
    }
  }
} as TopicSelectElement
```

### DatasourceTopicFilter

Programmatically filter topics:

```typescript
import { DatasourceTopicFilter } from "@workspace/ormi-core/datasources";

// Filter by type
const filter = new DatasourceTopicFilter({
    type: /Vector3|Movement/, // RegExp
    strict: false,
});

// Get filtered topics
const topics = pluginManager.applyFilter<DatasourceTopic[]>(
    PluginsHooks.AVAILABLE_TOPICS,
    [],
    filter
);

// Filter by name pattern
const robotTopics = new DatasourceTopicFilter({
    name: /^\/robot\//,
});

// Filter by datasource
const foxgloveTopics = new DatasourceTopicFilter({
    source_id: /foxglove/,
});
```

## Publishing Data

### From Datasources

Datasources publish data when it arrives:

```typescript
// In your datasource provider
useEffect(() => {
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const topic = message.topic;
        const data = convertToInternalType(message.data);

        // Publish to subscribers
        pluginManager.doAction(
            `${datasource_id}-${topic}-published`,
            data,
            Date.now()
        );
    };

    return () => ws.close();
}, []);
```

### From Widgets (Control Widgets)

Widgets can also publish data (e.g., joystick control):

```typescript
function JoystickWidget({ publishTopic }: { publishTopic: SelectedTopic }) {
  const pluginManager = usePluginsManager();

  const handleJoystickMove = (x: number, y: number) => {
    const movement: Movement = {
      linear: { x, y, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    };

    // Publish control command
    pluginManager.doAction(
      `${publishTopic.datasource_id}-${publishTopic.topic}-published`,
      movement,
      Date.now()
    );
  };

  return <Joystick onChange={handleJoystickMove} />;
}
```

## GlobalDataSourceProvider

The **GlobalDataSourceProvider** manages datasource lifecycle and creates a nested provider chain:

```typescript
// Conceptual usage
<GlobalDataSourceProvider datasources={datasourcesMap}>
  <Dashboard />
</GlobalDataSourceProvider>
```

**Responsibilities:**

- Load available datasource definitions via plugins
- Build a nested chain of datasource providers using `reduceRight()`
- Pass configuration settings to each datasource provider
- Coordinate datasource lifecycle (enable/disable)
- Provide UI for datasource management

**How it works:**

```typescript
// Internal implementation (simplified)
const providerChain = Array.from(datasources.values()).reduceRight(
  (children, datasource) => {
    const Provider = getDatasourceProvider(datasource.datasource_id);
    return (
      <Provider key={datasource.settings.id} props={datasource.settings}>
        {children}
      </Provider>
    );
  },
  children // Start with dashboard children
);

// Result is nested like:
// <FoxgloveProvider>
//   <ROSBridgeProvider>
//     <RandomDataProvider>
//       <Dashboard />
//     </RandomDataProvider>
//   </ROSBridgeProvider>
// </FoxgloveProvider>
```

**Data flow:**

```mermaid
graph TD
    A["Dashboard Config<br/>{datasources: Map}"] --> B["datasource1<br/>(id: 'foxglove-1', enabled: true)"]
    A --> C["datasource2<br/>(id: 'random-1', enabled: true)"]
    A --> D["datasource3<br/>(id: 'rosbridge-1', enabled: false)"]

    B --> E["GlobalDataSourceProvider<br/>creates nested chain"]
    C --> E

    E --> F["FoxgloveProvider<br/>(connects & publishes)"]
    F --> G["RandomDataProvider<br/>(generates & publishes)"]
    G --> H["Dashboard & Widgets"]

    D --> I["Not instantiated<br/>(disabled)"]

    style A fill:#e3f2fd
    style B fill:#c8e6c9
    style C fill:#c8e6c9
    style D fill:#ffcdd2
    style E fill:#fff3e0
    style F fill:#f3e5f5
    style G fill:#f3e5f5
```

## Performance Considerations

### 1. Minimize Re-renders

Use buffer size wisely:

```typescript
// ❌ Bad: Large buffer causes frequent re-renders
<LocalDataSourcesProvider buffersSize={1000}>

// ✅ Good: Only keep what you need
<LocalDataSourcesProvider buffersSize={10}>
```

### 2. Selective Subscriptions

Only subscribe to topics you need:

```typescript
// ❌ Bad: Subscribe to all topics
<LocalDataSourcesProvider SelectedTopics={allTopics}>

// ✅ Good: Only topics used by this widget
<LocalDataSourcesProvider SelectedTopics={[velocityTopic]}>
```

### 3. Throttle High-Frequency Data

In your datasource, throttle updates:

```typescript
let lastPublishTime = 0;
const THROTTLE_MS = 100; // Max 10 Hz

ws.onmessage = (event) => {
    const now = Date.now();
    if (now - lastPublishTime < THROTTLE_MS) {
        return; // Skip this message
    }

    lastPublishTime = now;
    pluginManager.doAction(/* ... */);
};
```

## Debugging Data Flow

### 1. Check Plugin Manager

Enable logging to see all hook executions:

```typescript
// In browser console
localStorage.setItem("DEBUG", "plugins:*");
```

### 2. Inspect Topics

Use the Topics List widget to see all available topics:

```typescript
// Built into ormi-std-widgets
<TopicsListWidget />
```

### 3. Monitor Subscriptions

Track subscription counts in your datasource:

```typescript
const subscribersCountRef = useRef(new Map<string, number>());

// On subscribe
subscribersCountRef.current.set(topic, count + 1);
console.log(`Topic ${topic} now has ${count + 1} subscribers`);
```

## Common Patterns

### Pattern 1: Multi-Topic Widget

Subscribe to multiple related topics:

```typescript
function RobotDashboard() {
  const topics = [
    { topic: '/robot/pose', ...},
    { topic: '/robot/velocity', ...},
    { topic: '/robot/battery', ...}
  ];

  return (
    <LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
      <RobotVisualization />
    </LocalDataSourcesProvider>
  );
}
```

### Pattern 2: Property Selection

Subscribe to a sub-property of a complex message:

```typescript
const selectedTopic: SelectedTopic = {
    topic: "/robot/imu",
    datasource_id: "foxglove-1",
    type: "Vector3",
    rawType: "sensor_msgs/Imu",
    property: "linear_acceleration.x", // Select sub-property
    source: {
        /* ... */
    },
};
```

### Pattern 3: Bidirectional Communication

Widget both subscribes and publishes:

```typescript
function ControlWidget() {
  return (
    <>
      {/* Subscribe to feedback */}
      <LocalDataSourcesProvider
        SelectedTopics={[feedbackTopic]}
        buffersSize={1}
      >
        <FeedbackDisplay />
      </LocalDataSourcesProvider>

      {/* Publish commands */}
      <ControlInterface publishTopic={commandTopic} />
    </>
  );
}
```

## Next Steps

- **[Type System](type-system)** - Deep dive into types and conversions
- **[Widget API](../api/widget-api)** - Building widgets that consume data
- **[Datasource API](../api/datasource-api)** - Creating datasources that publish data
