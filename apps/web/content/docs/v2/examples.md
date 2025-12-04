---
title: "Complete Examples"
order: 4
---

# V2 Complete Examples

Real-world examples showing V1-to-V2 widget conversions and Connection implementations. **Key principle: Widget business logic and props remain unchanged.**

## Table of Contents

1. [V1 to V2 Widget Migration](#v1-to-v2-widget-migration)
2. [Connection Implementations](#connection-implementations)
3. [Simple Widgets](#simple-widgets)
4. [Complex Widgets](#complex-widgets)
5. [Advanced Patterns](#advanced-patterns)

---

## V1 to V2 Widget Migration

### Example: Temperature Widget Conversion

**V1 Implementation:**

```typescript
import { useLocalDataSource, SelectedTopic } from '@workspace/ormi-core'
import { LocalDataSourcesProvider } from '@workspace/ormi-core'

interface TemperatureWidgetProps {
  title: string;
  units: '°C' | '°F';
  showHistory: boolean;
  topic: SelectedTopic;  // V1 complex object
}

function TemperatureWidget({ title, units, showHistory, topic }: TemperatureWidgetProps) {
  // V1 data access
  const { sources, getSource } = useLocalDataSource()
  const data = getSource(topic.topic)?.data[0]
  const buffer = getSource(topic.topic)?.data || []

  const temp = data ?? 0
  const displayTemp = units === '°F' ? (temp * 9/5) + 32 : temp

  return (
    <div>
      <h3>{title}</h3>
      <div>{displayTemp.toFixed(1)}{units}</div>
      {showHistory && <Chart data={buffer} />}
    </div>
  )
}

// V1 requires wrapper
export default function WrappedWidget(props: TemperatureWidgetProps) {
  return (
    <LocalDataSourcesProvider
      SelectedTopics={[props.topic]}
      buffersSize={props.showHistory ? 100 : 1}
    >
      <TemperatureWidget {...props} />
    </LocalDataSourcesProvider>
  )
}
```

**V2 Implementation:**

```typescript
import { useDataStream } from '@workspace/ormi-core/v2'

interface TemperatureWidgetProps {
  title: string;
  units: '°C' | '°F';
  showHistory: boolean;
  // V2 simplified data binding
  datasourceId: string;
  topic: string;
}

function TemperatureWidget({ title, units, showHistory, datasourceId, topic }: TemperatureWidgetProps) {
  // V2 data access - only change!
  const { data, buffer } = useDataStream<number>(
    datasourceId,
    topic,
    { bufferSize: showHistory ? 100 : 0 }
  )

  // Business logic identical to V1
  const temp = data ?? 0
  const displayTemp = units === '°F' ? (temp * 9/5) + 32 : temp

  return (
    <div>
      <h3>{title}</h3>
      <div>{displayTemp.toFixed(1)}{units}</div>
      {showHistory && <Chart data={buffer.map(m => m.value)} />}
    </div>
  )
}

// V2 - no wrapper needed!
export default TemperatureWidget
```

**Changes made:**

1. ✅ Props: `topic: SelectedTopic` → `datasourceId: string, topic: string`
2. ✅ Hook: `useLocalDataSource()` → `useDataStream(datasourceId, topic)`
3. ✅ Wrapper: Removed `LocalDataSourcesProvider`
4. ✅ Business logic: **Unchanged** (`title`, `units`, `showHistory`, conversion logic)

### Example: IMU Visualizer Conversion

**V1 Implementation:**

```typescript
interface IMUVisualizerProps {
  title: string;
  showRaw: boolean;
  showDerived: boolean;
  colorScheme: 'light' | 'dark';
  topic: SelectedTopic;
}

function IMUVisualizer({ title, showRaw, showDerived, colorScheme, topic }: IMUVisualizerProps) {
  const { sources, getSource } = useLocalDataSource()
  const data = getSource(topic.topic)?.data[0] as IMU | undefined

  if (!data) return <Spinner />

  return (
    <div className={colorScheme}>
      <h3>{title}</h3>
      {showRaw && <RawDataDisplay data={data} />}
      {showDerived && <DerivedDataDisplay data={data} />}
    </div>
  )
}

export default function WrappedWidget(props: IMUVisualizerProps) {
  return (
    <LocalDataSourcesProvider SelectedTopics={[props.topic]} buffersSize={1}>
      <IMUVisualizer {...props} />
    </LocalDataSourcesProvider>
  )
}
```

**V2 Implementation:**

```typescript
interface IMUVisualizerProps {
  title: string;
  showRaw: boolean;
  showDerived: boolean;
  colorScheme: 'light' | 'dark';
  datasourceId: string;
  topic: string;
}

function IMUVisualizer({ title, showRaw, showDerived, colorScheme, datasourceId, topic }: IMUVisualizerProps) {
  const { data, isLoading } = useDataStream<IMU>(datasourceId, topic)

  if (isLoading) return <Spinner />

  // Rest is identical to V1
  return (
    <div className={colorScheme}>
      <h3>{title}</h3>
      {showRaw && <RawDataDisplay data={data!} />}
      {showDerived && <DerivedDataDisplay data={data!} />}
    </div>
  )
}

// No wrapper needed
export default IMUVisualizer
```

**Key insight:** Only 3 lines changed, business logic preserved!

---

## Connection Implementations

### Example: WebSocket Connection

Key responsibilities of a WebSocket Connection:

**Connection Lifecycle:**

- `connect()`: Establish WebSocket connection, handle open/error/close events
- `disconnect()`: Close connection and cleanup

**Topic Management:**

- `subscribe(topic)`: Send subscription message to server, track active subscriptions
- `unsubscribe(topic)`: Send unsubscription message, clean up tracking
- Track subscriber counts to avoid duplicate subscriptions

**Data Flow:**

- Listen to `ws.onmessage` for incoming data
- Parse messages and extract topic/data
- Emit `"message"` event with topic, data, and metadata
- DatasourceManager listens and routes to atoms

**Discovery:**

- `getAvailableTopics()`: Query server for available topics
- `getTopicType(topic)`: Return type information

**Error Handling:**

- Emit `"error"` events for connection failures
- Implement auto-reconnect logic
- Update connection status appropriately

See the [Connection API documentation](../api/connection-api) for the complete interface and detailed implementation guide.

---

## Property Extraction (V1 Compatible)

The V2 API maintains V1's powerful property extraction system for subscribing to nested values.

### Basic Property Extraction

Extract a single value from a nested message structure:

```typescript
// Widget subscribing to temperature from nested sensor data
function TemperatureWidget({ datasourceId, topic }: Props) {
  // Message structure: { sensors: { temperature: 25.3, humidity: 60 } }
  const { data } = useDataStream<number>(datasourceId, topic, {
    property: "sensors.temperature"  // Extract just the temperature
  })

  return <div>Temperature: {data}°C</div>
}
```

### Multiple Property Subscriptions

Subscribe to different properties from the same topic:

```typescript
function SensorDashboard({ datasourceId, topic }: Props) {
  // Each subscription extracts a different property
  const { data: temp } = useDataStream<number>(datasourceId, topic, {
    property: "sensors.temperature"
  })

  const { data: humidity } = useDataStream<number>(datasourceId, topic, {
    property: "sensors.humidity"
  })

  const { data: pressure } = useDataStream<number>(datasourceId, topic, {
    property: "sensors.pressure"
  })

  return (
    <div>
      <div>Temp: {temp}°C</div>
      <div>Humidity: {humidity}%</div>
      <div>Pressure: {pressure}hPa</div>
    </div>
  )
}
```

### Property Extraction with Buffering

Extract a property and maintain history:

```typescript
function TemperaturePlot({ datasourceId, topic }: Props) {
  const { buffer } = useDataBuffer<number>(
    datasourceId,
    topic,
    100,  // Keep last 100 values
    "data.temperature"  // Extract from each buffered message
  )

  // Each buffer entry already has the extracted temperature value
  const chartData = buffer.map(msg => ({
    timestamp: msg.timestamp,
    value: msg.value  // Already extracted temperature
  }))

  return <LineChart data={chartData} />
}
```

---

## Simple Widgets

### Float Display Widget

Displays a single floating-point value.

```typescript
// widgets/float-widget.tsx
import { useDataStream } from '@workspace/ormi-core/v2'

interface FloatWidgetProps {
  datasourceId: string;
  topic: string;
  label?: string;
  precision?: number;
}

function FloatWidget({ datasourceId, topic, label, precision = 2 }: FloatWidgetProps) {
  const { data, isLoading, error } = useDataStream<number>(datasourceId, topic)

  if (isLoading) return <Skeleton width={200} height={60} />
  if (error) return <Alert variant="error">{error.message}</Alert>

  const displayValue = data !== null ? data.toFixed(precision) : '--'

  return (
    <Card>
      {label && <Label>{label}</Label>}
      <Value>{displayValue}</Value>
    </Card>
  )
}

// Widget definition
export function FloatWidgetDefinition(): WidgetDefinition {
  return {
    id: 'float-display-v2',
    name: 'Float Display',
    description: 'Displays a numeric value',
    version: 2,
    schema: {
      type: 'object',
      required: ['datasourceId', 'topic'],
      properties: {
        datasourceId: {
          type: 'string',
          title: 'Datasource'
        },
        topic: {
          type: 'string',
          title: 'Topic'
        },
        label: {
          type: 'string',
          title: 'Label'
        },
        precision: {
          type: 'number',
          title: 'Decimal Places',
          default: 2,
          minimum: 0,
          maximum: 6
        }
      }
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/datasourceId' },
        { type: 'Control', scope: '#/properties/topic' },
        { type: 'Control', scope: '#/properties/label' },
        { type: 'Control', scope: '#/properties/precision' }
      ]
    },
    Component: FloatWidget
  }
}
```

### Text Display Widget

Shows string messages.

```typescript
// widgets/text-widget.tsx
import { useDataStream } from '@workspace/ormi-core/v2'

interface TextMessage {
  data: string;
}

interface TextWidgetProps {
  datasourceId: string;
  topic: string;
  maxLength?: number;
}

function TextWidget({ datasourceId, topic, maxLength }: TextWidgetProps) {
  const { data, timestamp, isLoading } = useDataStream<TextMessage>(
    datasourceId,
    topic
  )

  if (isLoading) return <Spinner />

  let displayText = data?.data || 'No data'
  if (maxLength && displayText.length > maxLength) {
    displayText = displayText.substring(0, maxLength) + '...'
  }

  return (
    <Card>
      <Text>{displayText}</Text>
      {timestamp && (
        <Timestamp>
          {new Date(timestamp).toLocaleTimeString()}
        </Timestamp>
      )}
    </Card>
  )
}

export function TextWidgetDefinition(): WidgetDefinition {
  return {
    id: 'text-display-v2',
    name: 'Text Display',
    version: 2,
    schema: {
      type: 'object',
      required: ['datasourceId', 'topic'],
      properties: {
        datasourceId: { type: 'string', title: 'Datasource' },
        topic: { type: 'string', title: 'Topic' },
        maxLength: {
          type: 'number',
          title: 'Max Length',
          minimum: 10
        }
      }
    },
    Component: TextWidget
  }
}
```

### Boolean Indicator Widget

Visual indicator for boolean states.

```typescript
// widgets/boolean-widget.tsx
import { useDataStream } from '@workspace/ormi-core/v2'

interface BooleanWidgetProps {
  datasourceId: string;
  topic: string;
  trueLabel?: string;
  falseLabel?: string;
}

function BooleanWidget({
  datasourceId,
  topic,
  trueLabel = 'ON',
  falseLabel = 'OFF'
}: BooleanWidgetProps) {
  const { data, isLoading } = useDataStream<boolean>(datasourceId, topic)

  if (isLoading) return <Spinner />

  return (
    <Card>
      <Indicator active={data === true}>
        <Status>{data ? trueLabel : falseLabel}</Status>
      </Indicator>
    </Card>
  )
}

export function BooleanWidgetDefinition(): WidgetDefinition {
  return {
    id: 'boolean-indicator-v2',
    name: 'Boolean Indicator',
    version: 2,
    schema: {
      type: 'object',
      required: ['datasourceId', 'topic'],
      properties: {
        datasourceId: { type: 'string' },
        topic: { type: 'string' },
        trueLabel: { type: 'string', default: 'ON' },
        falseLabel: { type: 'string', default: 'OFF' }
      }
    },
    Component: BooleanWidget
  }
}
```

---

## Complex Widgets

### Time Series Chart

Plots historical data over time.

```typescript
// widgets/chart-widget.tsx
import { useDataBuffer } from '@workspace/ormi-core/v2'
import { LineChart } from '@/components/charts'

interface ChartWidgetProps {
  datasourceId: string;
  topic: string;
  bufferSize?: number;
  property?: string;  // JSON path to extract value
}

function ChartWidget({
  datasourceId,
  topic,
  bufferSize = 100,
  property
}: ChartWidgetProps) {
  const { buffer, isLoading } = useDataBuffer(
    datasourceId,
    topic,
    bufferSize
  )

  // Transform buffer to chart data
  const chartData = useMemo(() => {
    return buffer.map(msg => {
      let value = msg.value

      // Extract nested property if specified
      if (property) {
        const keys = property.split('.')
        for (const key of keys) {
          value = value?.[key]
        }
      }

      return {
        timestamp: msg.timestamp,
        value: typeof value === 'number' ? value : 0
      }
    })
  }, [buffer, property])

  if (isLoading) return <Spinner />
  if (chartData.length === 0) return <NoData />

  return (
    <Card>
      <LineChart
        data={chartData}
        xKey="timestamp"
        yKey="value"
        xAxisFormatter={(ts) => new Date(ts).toLocaleTimeString()}
      />
    </Card>
  )
}

export function ChartWidgetDefinition(): WidgetDefinition {
  return {
    id: 'time-series-chart-v2',
    name: 'Time Series Chart',
    version: 2,
    schema: {
      type: 'object',
      required: ['datasourceId', 'topic'],
      properties: {
        datasourceId: { type: 'string' },
        topic: { type: 'string' },
        bufferSize: {
          type: 'number',
          default: 100,
          minimum: 10,
          maximum: 1000
        },
        property: {
          type: 'string',
          title: 'Property Path',
          description: 'e.g., "data.temperature"'
        }
      }
    },
    Component: ChartWidget
  }
}
```

### Image Viewer Widget

Displays camera images with transforms.

```typescript
// widgets/image-widget.tsx
import { useDataStream, useTransformTree } from '@workspace/ormi-core/v2'

interface ImageMessage {
  data: Uint8Array;
  encoding: string;
  width: number;
  height: number;
}

interface ImageWidgetProps {
  datasourceId: string;
  topic: string;
  targetFrame?: string;  // Transform to this frame
}

function ImageWidget({ datasourceId, topic, targetFrame }: ImageWidgetProps) {
  const { data, frameId, isLoading } = useDataStream<ImageMessage>(
    datasourceId,
    topic
  )

  const tfTree = useTransformTree(datasourceId)

  // Convert image data to displayable format
  const imageUrl = useMemo(() => {
    if (!data) return null

    const blob = new Blob([data.data], { type: 'image/jpeg' })
    return URL.createObjectURL(blob)
  }, [data])

  // Calculate transform if needed
  const transform = useMemo(() => {
    if (!tfTree || !targetFrame || !frameId) return null
    return calculateTransform(tfTree, frameId, targetFrame)
  }, [tfTree, targetFrame, frameId])

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  if (isLoading) return <Spinner />
  if (!imageUrl) return <NoData />

  return (
    <Card>
      <ImageContainer>
        <img
          src={imageUrl}
          alt="Camera feed"
          style={{
            transform: transform
              ? `matrix3d(${transform.join(',')})`
              : undefined
          }}
        />
        {frameId && (
          <FrameBadge>Frame: {frameId}</FrameBadge>
        )}
      </ImageContainer>
    </Card>
  )
}

export function ImageWidgetDefinition(): WidgetDefinition {
  return {
    id: 'image-viewer-v2',
    name: 'Image Viewer',
    version: 2,
    schema: {
      type: 'object',
      required: ['datasourceId', 'topic'],
      properties: {
        datasourceId: { type: 'string' },
        topic: { type: 'string' },
        targetFrame: {
          type: 'string',
          title: 'Target Frame',
          description: 'Transform image to this coordinate frame'
        }
      }
    },
    Component: ImageWidget
  }
}
```

### Point Cloud Viewer

3D visualization with multiple data sources.

```typescript
// widgets/pointcloud-widget.tsx
import { useMultiStream } from '@workspace/ormi-core/v2'
import { Canvas } from '@react-three/fiber'
import { PointCloudRenderer } from '@/components/3d'

interface PointCloudData {
  points: Float32Array;
  colors?: Float32Array;
  intensities?: Float32Array;
}

interface PointCloudWidgetProps {
  datasourceId: string;
  pointsTopic: string;
  colorTopic?: string;  // Optional color overlay
}

function PointCloudWidget({
  datasourceId,
  pointsTopic,
  colorTopic
}: PointCloudWidgetProps) {
  // Subscribe to multiple topics
  const streams = [
    { key: 'points', datasourceId, topic: pointsTopic }
  ]

  if (colorTopic) {
    streams.push({ key: 'colors', datasourceId, topic: colorTopic })
  }

  const { data, allConnected } = useMultiStream<{
    points: PointCloudData;
    colors?: any;
  }>(streams)

  // Merge point cloud with colors
  const mergedCloud = useMemo(() => {
    if (!data.points) return null

    return {
      ...data.points,
      colors: data.colors?.data || data.points.colors
    }
  }, [data])

  if (!allConnected) return <Connecting />
  if (!mergedCloud) return <NoData />

  return (
    <Card>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <PointCloudRenderer pointCloud={mergedCloud} />
        <OrbitControls />
        <ambientLight intensity={0.5} />
      </Canvas>
    </Card>
  )
}

export function PointCloudWidgetDefinition(): WidgetDefinition {
  return {
    id: 'pointcloud-viewer-v2',
    name: 'Point Cloud Viewer',
    version: 2,
    schema: {
      type: 'object',
      required: ['datasourceId', 'pointsTopic'],
      properties: {
        datasourceId: { type: 'string' },
        pointsTopic: { type: 'string', title: 'Points Topic' },
        colorTopic: { type: 'string', title: 'Color Topic (Optional)' }
      }
    },
    Component: PointCloudWidget
  }
}
```

### Multi-Sensor Fusion Widget

Combines data from multiple sensors.

```typescript
// widgets/fusion-widget.tsx
import { useMultiStream, useTopicStats } from '@workspace/ormi-core/v2'

interface FusionWidgetProps {
  sensors: Array<{
    id: string;
    datasourceId: string;
    topic: string;
    weight: number;
  }>;
}

function FusionWidget({ sensors }: FusionWidgetProps) {
  // Build stream configs
  const streamConfigs = sensors.map(s => ({
    key: s.id,
    datasourceId: s.datasourceId,
    topic: s.topic
  }))

  const { data, allConnected, errors } = useMultiStream(streamConfigs)

  // Get stats for each sensor
  const stats = sensors.map(s => ({
    id: s.id,
    stats: useTopicStats(s.datasourceId, s.topic)
  }))

  // Fuse sensor data
  const fusedData = useMemo(() => {
    if (!allConnected) return null

    // Weighted fusion
    let result = 0
    let totalWeight = 0

    sensors.forEach(sensor => {
      const value = data[sensor.id]
      if (typeof value === 'number') {
        result += value * sensor.weight
        totalWeight += sensor.weight
      }
    })

    return totalWeight > 0 ? result / totalWeight : null
  }, [data, sensors, allConnected])

  if (!allConnected) {
    return (
      <Card>
        <Alert>
          Waiting for sensors:
          {Object.entries(errors).map(([key, error]) => (
            error && <div key={key}>{key}: {error.message}</div>
          ))}
        </Alert>
      </Card>
    )
  }

  return (
    <Card>
      <Title>Fused Sensor Data</Title>
      <FusedValue>{fusedData?.toFixed(3)}</FusedValue>

      <SensorGrid>
        {sensors.map(sensor => {
          const sensorStats = stats.find(s => s.id === sensor.id)?.stats
          return (
            <SensorCard key={sensor.id}>
              <SensorName>{sensor.id}</SensorName>
              <SensorValue>{data[sensor.id]?.toFixed(3)}</SensorValue>
              <SensorFreq>{sensorStats?.frequency.toFixed(1)} Hz</SensorFreq>
            </SensorCard>
          )
        })}
      </SensorGrid>
    </Card>
  )
}

export function FusionWidgetDefinition(): WidgetDefinition {
  return {
    id: 'multi-sensor-fusion-v2',
    name: 'Multi-Sensor Fusion',
    version: 2,
    schema: {
      type: 'object',
      required: ['sensors'],
      properties: {
        sensors: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'datasourceId', 'topic', 'weight'],
            properties: {
              id: { type: 'string' },
              datasourceId: { type: 'string' },
              topic: { type: 'string' },
              weight: { type: 'number', minimum: 0, maximum: 1 }
            }
          }
        }
      }
    },
    Component: FusionWidget
  }
}
```

---

## Datasource Implementations

### WebSocket Datasource

**Key Implementation Points:**

- `subscribe()`: Track subscriber count, send subscription message on first subscriber
- `unsubscribe()`: Decrement count, send unsubscription on last subscriber
- `connect()`: Establish WebSocket, set up event handlers
- `handleMessage()`: Parse incoming messages, emit to DatasourceManager
- Auto-reconnect logic for connection failures

### REST API Datasource

**Key Implementation Points:**

- Poll-based approach using `setInterval()`
- `subscribe()`: Start polling interval for topic
- `unsubscribe()`: Clear polling interval
- `connect()`: Validate connection with health check
- Configurable poll rate and custom headers

### Random Data Generator

**Key Implementation Points:**

- Simple test datasource for development
- `subscribe()`: Start interval generating random data
- `generateData()`: Create mock data based on topic pattern
- Useful for testing widgets without real data sources

For complete Connection implementation examples, see the [Connection API documentation](../api/connection-api).

---

## Type Conversion in Datasources

V2 maintains the type conversion system from V1. Datasources work with native formats (`rawType`) while widgets use standardized internal types (`type`).

### Key Concepts

**Type Converter Interface:**

- `convertToWebapp()` - Convert datasource format to internal format
- `convertFromWebapp()` - Convert internal format to datasource format (for publishing)
- `getWebappTypeFromROSType()` - Map external type names to internal types

**Registration:**
Connections register their converters with `UnifiedConverterRegistry` during `connect()`:

```typescript
UnifiedConverterRegistry.registerConverter(
    "sensor_msgs/Image",
    ROSImageConverter
);
```

**Conversion Flow:**

1. Widget subscribes via `useDataStream<Image>(datasourceId, topic)`
2. DatasourceManager creates `DatasourceTopic` with both `rawType` and `type`
3. Connection receives native message, converts using registered converter
4. Widget receives data in standard internal format

For detailed converter examples, see the Type System documentation.

---

## Plugin Development

### Complete Plugin Example

```typescript
// plugins/my-plugin/src/index.ts
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { FloatWidgetDefinition } from "./widgets/float-widget";
import { ChartWidgetDefinition } from "./widgets/chart-widget";
import { WebSocketDatasourceDefinition } from "./datasources/websocket";

export class MyPlugin extends Plugin {
    constructor() {
        super();
        this.name = "My Plugin V2";
        this.version = "2.0.0";

        // Register V2 widgets
        this.addFilter(PluginsHooks.WIDGETS_LIST_V2, {
            id: "my-plugin-widgets-v2",
            priority: 10,
            filter: (widgets) => {
                widgets.push(FloatWidgetDefinition(), ChartWidgetDefinition());
                return widgets;
            },
        });

        // Register V2 datasource connections
        this.addFilter(PluginsHooks.DATASOURCE_CONNECTIONS_V2, {
            id: "my-plugin-datasources-v2",
            priority: 10,
            filter: (connections) => {
                connections.set("websocket", WebSocketDatasourceDefinition);
                return connections;
            },
        });

        // Register custom renderers
        this.addFilter(PluginsHooks.JSONFORMS_RENDERERS, {
            id: "my-plugin-renderers",
            priority: 10,
            filter: (renderers) => {
                renderers.push(
                    // Custom renderer for topic selection
                    {
                        tester: (uischema, schema) => {
                            return schema.format === "topic-selector" ? 10 : -1;
                        },
                        renderer: TopicSelectorRenderer,
                    }
                );
                return renderers;
            },
        });
    }
}

// Export plugin instance
export default new MyPlugin();
```

---

## Advanced Patterns

### Throttled Updates

```typescript
function ThrottledWidget({ topic }: Props) {
  const { data } = useDataStream(topic, {
    throttle: 100  // Max 10 updates per second
  })

  return <Display value={data} />
}
```

### Derived Data

```typescript
// Create derived atom
const fusedDataAtom = atom((get) => {
  const lidar = get(dataAtomFamily({
    datasourceId: 'ros-1',
    topic: '/lidar'
  }))
  const camera = get(dataAtomFamily({
    datasourceId: 'ros-1',
    topic: '/camera'
  }))

  return fuseLidarCamera(lidar?.value, camera?.value)
})

// Use in widget
function FusedWidget() {
  const fusedData = useAtomValue(fusedDataAtom)
  return <Display data={fusedData} />
}
```

### Conditional Subscriptions

```typescript
function ConditionalWidget({ datasourceId, topic, enabled }: Props) {
  const { data } = useDataStream(
    enabled ? datasourceId : '',
    enabled ? topic : '',
    { skip: !enabled }
  )

  if (!enabled) return <Disabled />

  return <Display data={data} />
}
```

### Error Boundaries

```typescript
function SafeWidget(props: WidgetProps) {
  return (
    <ErrorBoundary fallback={<ErrorDisplay />}>
      <MyWidget {...props} />
    </ErrorBoundary>
  )
}
```

---

## Testing Examples

### Widget Test

```typescript
import { render, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { dataAtomFamily } from '@workspace/ormi-core/v2/atoms'
import { FloatWidget } from './float-widget'

describe('FloatWidget', () => {
  it('displays data from stream', async () => {
    const store = createStore()

    // Set test data
    const atom = dataAtomFamily({
      datasourceId: 'test',
      topic: '/test'
    })
    store.set(atom, {
      value: 42.5,
      timestamp: Date.now(),
      frameId: 'test'
    })

    const { getByText } = render(
      <Provider store={store}>
        <FloatWidget
          datasourceId="test"
          topic="/test"
          precision={1}
        />
      </Provider>
    )

    await waitFor(() => {
      expect(getByText('42.5')).toBeInTheDocument()
    })
  })
})
```

### Connection Test

```typescript
import { WebSocketConnection } from "./websocket-connection";

describe("WebSocketConnection", () => {
    it("emits message events", async () => {
        const connection = new WebSocketConnection({
            id: "test",
            url: "ws://localhost:9090",
        });

        const messages: any[] = [];
        connection.on("message", (topic, data, metadata) => {
            messages.push({ topic, data, metadata });
        });

        await connection.connect();
        connection.subscribe("/test");

        // Simulate incoming message
        // ... trigger WebSocket message event

        expect(messages).toHaveLength(1);
        expect(messages[0].topic).toBe("/test");
    });
});
```

---

## Summary

These examples demonstrate:

✅ **Simple widgets** - Basic data display patterns
✅ **Complex widgets** - Multi-topic, 3D visualization
✅ **Datasources** - WebSocket, REST, testing
✅ **Plugins** - Complete plugin structure
✅ **Advanced patterns** - Throttling, derivation, errors
✅ **Testing** - Unit and integration tests

**Next:** Start implementation or ask questions!
