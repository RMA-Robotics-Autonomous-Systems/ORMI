---
title: "Hooks API"
order: 2
---

# Hooks API Reference

Complete reference for V2 React hooks used in widgets to access data from the atom transport layer.

## Design Philosophy

All data-related hooks (`useDataStream`, `usePublisher`) accept **SelectedTopic objects** directly rather than separate `datasourceId` and `topic` parameters. This design:

1. **Prevents topic name conflicts**: Multiple datasources can have topics with the same name (e.g., "ros-1::/camera/image" vs "foxglove-1::/camera/image")
2. **Maintains V1 compatibility**: Widgets already receive SelectedTopic props, so migration is simpler
3. **Simplifies API**: One parameter instead of two, impossible to pass mismatched values
4. **Type safety**: The object contains all necessary metadata (type, rawType, bufferSize hints)

Connection-level hooks (`useConnectionStatus`, `useAvailableTopics`, `useDatasources`) still use `datasourceId` strings since they query datasource-level information, not specific topics.

## useDataStream

Primary hook for subscribing to data topics.

### Signature

```typescript
function useDataStream<T = any>(
    topic: SelectedTopic | DatasourceTopic | null,
    options?: UseDataStreamOptions
): UseDataStreamResult<T>;
```

### Parameters

#### `topic`

**Type:** `SelectedTopic | DatasourceTopic | null`  
**Required:** Yes (can be `null` to disable subscription)

The SelectedTopic or DatasourceTopic object containing datasource_id and topic name. This object is used to prevent conflicts when multiple datasources have topics with the same name (e.g., "ros-1::/camera/image" vs "foxglove-1::/camera/image").

Pass `null` to disable the subscription.

```typescript
// SelectedTopic interface
interface SelectedTopic extends DatasourceTopic {
    property: string; // Property extraction path
}

interface DatasourceTopic {
    topic: string; // Topic path (e.g., "/imu/data")
    datasource_id: string; // Datasource instance ID
    source: DatasourceProviderSettings; // Datasource config
    type: string; // Internal type (e.g., "IMU", "number")
    rawType: string; // Source-specific type
    bufferSize?: number; // Buffer size hint
}
```

**Usage:**

```typescript
// Subscribe to topic
const { data } = useDataStream(topic);

// Conditional subscription (disabled when null)
const { data } = useDataStream(enabled ? topic : null);

// Type inference from topic metadata
const { data } = useDataStream<IMU>(topic); // data is IMU | null
```

**Why pass the whole object?**

- ✅ **Simpler API** - one parameter instead of two
- ✅ **Access to metadata** - type info, property path available in hook
- ✅ **Prevents errors** - datasource_id and topic always paired correctly
- ✅ **Future-proof** - easy to add more topic metadata without API changes

#### `options`

**Type:** `UseDataStreamOptions` (optional)

```typescript
interface UseDataStreamOptions {
    // Buffer configuration
    bufferSize?: number; // Number of messages to buffer (default: 0 = latest only)

    // Update control
    throttle?: number; // Minimum ms between updates (default: 0 = no throttle)
    skipInitial?: boolean; // Skip initial null value (default: false)

    // Data processing
    transform?: (data: any) => T; // Transform function for data

    // Error handling
    onError?: (error: ConnectionError) => void; // Error callback

    // Lifecycle callbacks
    onSubscribed?: () => void; // Called when subscription succeeds
    onData?: (data: T) => void; // Called on each data update
}
```

**Examples:**

```typescript
// Buffered data for charts
const { buffer } = useDataStream(topic, {
    bufferSize: 100, // Keep last 100 messages
});

// Throttled updates for high-frequency data
const { data } = useDataStream(lidarTopic, {
    throttle: 100, // Max 10 Hz updates to component
});

// With data transformation
const { data } = useDataStream<number>(temperatureTopic, {
    transform: (raw) => (raw.celsius * 9) / 5 + 32, // Convert to Fahrenheit
});

// With error handling
const { data } = useDataStream(cameraTopic, {
    onError: (error) => {
        console.error("Camera error:", error);
        toast.error("Camera feed lost");
    },
});
```

### Return Value

```typescript
interface UseDataStreamResult<T> {
    // Data
    data: T | null; // Latest data value
    buffer: DataMessage<T>[]; // Buffered messages (if bufferSize > 0)

    // Metadata
    timestamp: number | null; // Timestamp of latest data
    frameId: string | null; // Reference frame ID
    sequenceId: number | null; // Sequence number

    // Status
    isLoading: boolean; // True while waiting for first data
    isSubscribed: boolean; // True when subscribed to topic
    error: ConnectionError | null; // Error if any

    // Stats
    messageCount: number; // Total messages received
    frequency: number | null; // Estimated frequency (Hz)
    latency: number | null; // Latest message latency (ms)
}
```

### Usage Examples

#### Basic Usage

```typescript
function TemperatureWidget({ topic, title }: Props) {
  const { data, isLoading, error } = useDataStream<number>(topic)

  if (isLoading) return <Spinner />
  if (error) return <ErrorDisplay error={error} />

  return (
    <div>
      <h3>{title}</h3>
      <p>{data}°C</p>
    </div>
  )
}
```

#### Buffered Data (Charts)

```typescript
function ChartWidget({ topic }: Props) {
  const { buffer, frequency } = useDataStream(topic, {
    bufferSize: 1000  // Last 1000 points
  })

  return (
    <div>
      <LineChart
        data={buffer.map(m => ({ x: m.timestamp, y: m.value }))}
      />
      <p>Rate: {frequency?.toFixed(1)} Hz</p>
    </div>
  )
}
```

#### Multiple Topics

```typescript
function MultiSensorWidget({ imuTopic, gpsTopic, batteryTopic }: Props) {
  const imu = useDataStream<IMU>(imuTopic)
  const gps = useDataStream<GPS>(gpsTopic)
  const battery = useDataStream<number>(batteryTopic)

  return (
    <div>
      <div>IMU: {imu.data?.x}, {imu.data?.y}, {imu.data?.z}</div>
      <div>GPS: {gps.data?.latitude}, {gps.data?.longitude}</div>
      <div>Battery: {battery.data}%</div>
    </div>
  )
}
```

#### Conditional Subscription

```typescript
function CameraWidget({ topic, enabled }: Props) {
  // Only subscribes when enabled is true
  const { data, isSubscribed } = useDataStream(
    enabled ? topic : null
  )

  if (!enabled) {
    return <div>Camera disabled</div>
  }

  return <ImageDisplay image={data} />
}
```

#### With Transformation

```typescript
function IMUWidget({ topic }: Props) {
  const { data } = useDataStream<{ roll: number, pitch: number, yaw: number }>(
    topic,
    {
      transform: (raw: IMU) => ({
        roll: raw.orientation.x * 180 / Math.PI,
        pitch: raw.orientation.y * 180 / Math.PI,
        yaw: raw.orientation.z * 180 / Math.PI
      })
    }
  )

  return (
    <div>
      <div>Roll: {data?.roll.toFixed(1)}°</div>
      <div>Pitch: {data?.pitch.toFixed(1)}°</div>
      <div>Yaw: {data?.yaw.toFixed(1)}°</div>
    </div>
  )
}
```

### Error Handling

All hooks return error information that should be handled in your widgets.

#### Error Types

```typescript
interface ConnectionError {
    type: "connection" | "subscription" | "data";
    message: string;
    timestamp: number;
    topic?: string;
    recoverable: boolean;
}
```

#### Basic Error Display

```typescript
function MyWidget({ topic }: Props) {
  const { data, error, isLoading } = useDataStream(topic)

  if (error) {
    return (
      <div className="error">
        <h4>Error: {error.type}</h4>
        <p>{error.message}</p>
        {error.recoverable && <button>Retry</button>}
      </div>
    )
  }

  if (isLoading) return <Spinner />

  return <DataDisplay data={data} />
}
```

#### Error Callback

```typescript
function CameraWidget({ topic }: Props) {
  const [errorCount, setErrorCount] = useState(0)

  const { data } = useDataStream(topic, {
    onError: (error) => {
      console.error("Camera error:", error)
      setErrorCount(prev => prev + 1)

      // Show toast notification
      if (error.type === 'connection') {
        toast.error("Connection lost, attempting reconnect...")
      }
    }
  })

  return (
    <div>
      {errorCount > 0 && (
        <div className="warning">
          {errorCount} error(s) occurred
        </div>
      )}
      <ImageDisplay image={data} />
    </div>
  )
}
```

For error flow architecture and how errors propagate through the system, see **[Core - Data Flow - Error Handling](../core/data-flow#error-handling)**.

### Performance Optimization

#### Selective Subscriptions

Only subscribe to data you actually need:

```typescript
// ❌ Bad: Subscribe to everything
const { data: imu } = useDataStream(imuTopic)
const { data: gps } = useDataStream(gpsTopic)
const { data: camera } = useDataStream(cameraTopic)

return <div>{imu.x}</div> // Only using IMU!

// ✅ Good: Subscribe only to what you need
const { data: imu } = useDataStream(imuTopic)

return <div>{imu.x}</div>
```

#### Conditional Subscriptions

Disable subscriptions when not needed:

```typescript
function MyWidget({ topic, enabled, isVisible }: Props) {
  // Only subscribe when enabled AND visible
  const { data } = useDataStream(
    enabled && isVisible ? topic : null
  )

  if (!enabled) return <div>Widget disabled</div>
  if (!isVisible) return null

  return <DataDisplay data={data} />
}
```

#### Throttling Updates

Reduce re-render frequency for high-rate topics:

```typescript
function ChartWidget({ topic }: Props) {
  // Update at most every 100ms (10 Hz) even if data arrives faster
  const { data } = useDataStream(topic, {
    throttle: 100
  })

  return <LineChart data={data} />
}
```

For performance principles and architecture, see **[Core - Data Flow - Performance](../core/data-flow#performance-optimization-principles)**.

## useConnectionStatus

Monitor connection health and status.

### Signature

```typescript
function useConnectionStatus(datasourceId: string | null): ConnectionStatus;
```

### Parameters

#### `datasourceId`

**Type:** `string | null`  
**Required:** Yes

The ID of the datasource to monitor.

### Return Value

```typescript
interface ConnectionStatus {
    state: ConnectionState; // Current connection state
    error: ConnectionError | null; // Latest error if any
    connectedAt: number | null; // Connection timestamp
    lastDataAt: number | null; // Last data received timestamp
    bytesReceived?: number; // Total bytes received
    bytesSent?: number; // Total bytes sent
    latency?: number; // Current latency (ms)
}

type ConnectionState =
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "error";
```

### Usage Examples

#### Status Indicator

```typescript
function StatusIndicator({ datasourceId }: Props) {
  const status = useConnectionStatus(datasourceId)

  const getColor = () => {
    switch (status.state) {
      case 'connected': return 'green'
      case 'connecting': return 'yellow'
      case 'reconnecting': return 'orange'
      case 'error': return 'red'
      default: return 'gray'
    }
  }

  return (
    <div>
      <span style={{ color: getColor() }}>●</span>
      <span>{status.state}</span>
      {status.latency && <span>({status.latency}ms)</span>}
    </div>
  )
}
```

#### Connection Monitor

```typescript
function ConnectionMonitor({ datasourceId }: Props) {
  const status = useConnectionStatus(datasourceId)

  return (
    <div>
      <h4>Connection Status</h4>
      <dl>
        <dt>State:</dt>
        <dd>{status.state}</dd>

        {status.connectedAt && (
          <>
            <dt>Connected:</dt>
            <dd>{new Date(status.connectedAt).toLocaleString()}</dd>
          </>
        )}

        {status.lastDataAt && (
          <>
            <dt>Last data:</dt>
            <dd>{formatDistanceToNow(status.lastDataAt)} ago</dd>
          </>
        )}

        {status.error && (
          <>
            <dt>Error:</dt>
            <dd>{status.error.message}</dd>
          </>
        )}

        {status.latency && (
          <>
            <dt>Latency:</dt>
            <dd>{status.latency}ms</dd>
          </>
        )}
      </dl>
    </div>
  )
}
```

## useAvailableTopics

Get list of available topics from a datasource.

### Signature

```typescript
function useAvailableTopics(
    datasourceId: string | null
): UseAvailableTopicsResult;
```

### Return Value

```typescript
interface UseAvailableTopicsResult {
    topics: TopicInfo[]; // Available topics
    isLoading: boolean; // Loading state
    error: Error | null; // Error if any
    refetch: () => Promise<void>; // Manual refresh function
}

interface TopicInfo {
    topic: string;
    type: string;
    rawType?: string;
    description?: string;
    frequency?: number;
    reliable?: boolean;
    latched?: boolean;
    metadata?: Record<string, any>;
}
```

### Usage Examples

#### Topic Selector

```typescript
function TopicSelector({ datasourceId, onSelect }: Props) {
  const { topics, isLoading, error, refetch } = useAvailableTopics(datasourceId)

  if (isLoading) return <Spinner />
  if (error) return <Error message={error.message} />

  return (
    <div>
      <button onClick={refetch}>Refresh</button>
      <ul>
        {topics.map(topic => (
          <li key={topic.topic} onClick={() => onSelect(topic.topic)}>
            {topic.topic} ({topic.type})
            {topic.frequency && <span> @ {topic.frequency}Hz</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

#### Filtered Topics

```typescript
function CameraTopicSelector({ datasourceId, onSelect }: Props) {
  const { topics } = useAvailableTopics(datasourceId)

  const cameraTopics = topics.filter(t =>
    t.type === 'Image' || t.topic.includes('/camera/')
  )

  return (
    <select onChange={(e) => onSelect(e.target.value)}>
      <option value="">Select camera...</option>
      {cameraTopics.map(topic => (
        <option key={topic.topic} value={topic.topic}>
          {topic.topic}
        </option>
      ))}
    </select>
  )
}
```

## usePublisher

Publish data to a topic (for bidirectional connections).

### Signature

```typescript
function usePublisher<T = any>(
    topic: SelectedTopic | DatasourceTopic | null,
    topicType?: string
): UsePublisherResult<T>;
```

### Parameters

#### `topic`

**Type:** `SelectedTopic | DatasourceTopic | null`  
**Required:** Yes

Topic object containing datasource_id and topic name.

#### `topicType`

**Type:** `string`  
**Required:** No

Optional topic type for type-checking by the datasource.

### Return Value

```typescript
interface UsePublisherResult<T> {
    publish: (data: T) => Promise<void>; // Publish function
    isAdvertised: boolean; // Whether topic is advertised
    error: Error | null; // Error if any
}
```

### Usage Examples

#### Command Publisher

```typescript
function VelocityControl({ cmdTopic }: Props) {
  const { publish } = usePublisher<Twist>(
    cmdTopic,
    'Twist'
  )

  const handleForward = () => {
    publish({
      linear: { x: 1.0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    })
  }

  const handleStop = () => {
    publish({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    })
  }

  return (
    <div>
      <button onClick={handleForward}>Forward</button>
      <button onClick={handleStop}>Stop</button>
    </div>
  )
}
```

## useDatasources

Get list of configured datasources.

### Signature

```typescript
function useDatasources(): DatasourceInstance[];
```

### Return Value

```typescript
interface DatasourceInstance {
    id: string; // Instance ID
    datasourceId: string; // Definition ID
    title: string; // User-provided title
    enabled: boolean; // Whether enabled
    settings: DatasourceProviderSettings; // Configuration
}
```

### Usage Examples

```typescript
function DatasourceList() {
  const datasources = useDatasources()

  return (
    <ul>
      {datasources.map(ds => (
        <li key={ds.id}>
          {ds.title} ({ds.datasourceId})
          {!ds.enabled && <span> (disabled)</span>}
        </li>
      ))}
    </ul>
  )
}
```

## Hook Patterns

### Pattern: Latest + Buffered

Use both latest and buffered data from the same topic:

```typescript
function HybridWidget({ topic }: Props) {
  const latest = useDataStream<number>(topic)
  const buffered = useDataStream<number>(topic, {
    bufferSize: 100
  })

  return (
    <div>
      <div>Current: {latest.data}</div>
      <LineChart data={buffered.buffer} />
      <div>Freq: {latest.frequency?.toFixed(1)} Hz</div>
    </div>
  )
}
```

**How it works:**

- Both hooks subscribe to the same topic from the same datasource
- Only **ONE** `connection.subscribe()` call is made
- Data arrives once and is distributed to two different atoms:
    - `dataAtomFamily` - Latest value only (for gauge/indicator)
    - `bufferedDataFamily` - Historical array (for chart)
- Each hook only re-renders when its specific atom changes
- No duplicate subscriptions or wasted bandwidth

**Use case:** Dashboard showing both real-time value AND historical trend

### Pattern: Multiple Widgets, Mixed Buffer Needs

Two separate widgets subscribing to the same topic with different buffer requirements:

```typescript
// Widget 1: Real-time gauge (no buffer needed)
function TemperatureGauge({ topic }: Props) {
  const { data, isLoading } = useDataStream<number>(topic)

  if (isLoading) return <Spinner />

  return (
    <div className="gauge">
      <div className="value">{data?.toFixed(1)}°C</div>
    </div>
  )
}

// Widget 2: Historical chart (needs buffer)
function TemperatureChart({ topic }: Props) {
  const { buffer, isLoading } = useDataStream<number>(topic, {
    bufferSize: 1000  // Last 1000 data points
  })

  if (isLoading) return <Spinner />

  return (
    <LineChart
      data={buffer.map((msg, i) => ({
        x: msg.timestamp,
        y: msg.value
      }))}
    />
  )
}

// Dashboard using both
function TemperatureDashboard({ tempTopic }: Props) {
  return (
    <div className="grid">
      <TemperatureGauge topic={tempTopic} />
      <TemperatureChart topic={tempTopic} />
    </div>
  )
}
```

**Efficiency:**

- ✅ Single `connection.subscribe('/temperature')` call
- ✅ Data received once from network/datasource
- ✅ Distributed to both `dataAtomFamily` and `bufferedDataFamily`
- ✅ GaugeWidget gets latest value immediately
- ✅ ChartWidget maintains circular buffer of 1000 points
- ✅ Each widget re-renders independently

### Pattern: Conditional Multiple Topics

```typescript
function AdaptiveWidget({ lidarTopic, cameraTopic, mode }: Props) {
  const primaryTopic = mode === 'lidar' ? lidarTopic : cameraTopic
  const primary = useDataStream(primaryTopic)

  // Only subscribe to secondary when needed
  const secondary = useDataStream(
    mode === 'lidar' ? cameraTopic : null
  )

  return mode === 'lidar'
    ? <LidarView primary={primary.data} camera={secondary.data} />
    : <CameraView image={primary.data} />
}
```

### Pattern: Error Recovery

```typescript
function ResilientWidget({ topic }: Props) {
  const [fallbackMode, setFallbackMode] = useState(false)

  const { data, error } = useDataStream(topic, {
    onError: (err) => {
      if (!err.recoverable) {
        setFallbackMode(true)
      }
    }
  })

  if (fallbackMode) {
    return <OfflineMode />
  }

  if (error?.recoverable) {
    return <ReconnectingOverlay />
  }

  return <DataDisplay data={data} />
}
```

### Pattern: Synchronized Topics

Subscribe to multiple related topics:

```typescript
function SynchronizedWidget({ imageTopic, infoTopic, depthTopic }: Props) {
  const camera = useDataStream<Image>(imageTopic)
  const cameraInfo = useDataStream<CameraInfo>(infoTopic)
  const depth = useDataStream<Image>(depthTopic)

  // Wait for all data before rendering
  if (!camera.data || !cameraInfo.data || !depth.data) {
    return <Spinner />
  }

  return (
    <CameraDepthView
      image={camera.data}
      info={cameraInfo.data}
      depth={depth.data}
    />
  )
}
```

## TypeScript Tips

### Generic Typing

```typescript
// Strongly typed data
interface IMU {
    acceleration: Vector3;
    angular_velocity: Vector3;
    orientation: Quaternion;
}

const { data } = useDataStream<IMU>(topic);
// data is typed as IMU | null
```

### Optional Chaining

```typescript
const { data } = useDataStream<IMU>(topic);

// Safe access
const accelX = data?.acceleration?.x ?? 0;
```

### Type Guards

```typescript
function isIMUData(data: any): data is IMU {
    return (
        data &&
        typeof data.acceleration === "object" &&
        typeof data.angular_velocity === "object"
    );
}

const { data } = useDataStream(topic);

if (isIMUData(data)) {
    // TypeScript knows data is IMU here
    console.log(data.acceleration.x);
}
```

## Performance Considerations

### 1. Minimize Subscriptions

Only subscribe to topics you actually use:

```typescript
// Bad: Subscribe to all, use one
const temp = useDataStream(tempTopic)
const pressure = useDataStream(pressureTopic)
const humidity = useDataStream(humidityTopic)
return <div>{temp.data}</div>

// Good: Only subscribe to what you need
const temp = useDataStream(tempTopic)
return <div>{temp.data}</div>
```

### 2. Use Throttling

For high-frequency data:

```typescript
// Without throttle: 100 Hz data = 100 re-renders/sec
const { data } = useDataStream(lidarTopic);

// With throttle: 100 Hz data = 10 re-renders/sec
const { data } = useDataStream(lidarTopic, {
    throttle: 100, // Limit to 10 Hz
});
```

### 3. Conditional Subscriptions

Avoid subscriptions when not needed:

```typescript
// Subscribe only when visible
const { data } = useDataStream(isVisible ? topic : null);
```

### 4. Buffer Size

Choose appropriate buffer sizes:

```typescript
// Small buffer for indicators
const { buffer } = useDataStream(topic, { bufferSize: 10 });

// Large buffer for charts
const { buffer } = useDataStream(topic, { bufferSize: 1000 });
```

---

**Next:** See [Widget API](./widget-api) for complete widget interface documentation, or [Examples](../examples) for practical usage patterns.
