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

Complete WebSocket datasource implementation:

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

interface WebSocketMessage {
    op: string;
    topic: string;
    data: any;
    timestamp?: number;
    frameId?: string;
}

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
    private availableTopics: TopicInfo[] = [];

    async connect(config: ConnectionConfig): Promise<void> {
        this.config = config;

        return new Promise((resolve, reject) => {
            this.status.state = "connecting";
            this.emit("status-changed", this.status);

            try {
                this.ws = new WebSocket(config.url!);

                this.ws.onopen = async () => {
                    this.status.state = "connected";
                    this.status.connectedAt = Date.now();
                    this.status.error = null;
                    this.emit("status-changed", this.status);
                    this.emit("connected");

                    // Discover topics
                    await this.discoverTopics();

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
                        this.handleDisconnect();
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

        // Unsubscribe from all
        for (const topic of this.activeSubscriptions) {
            this.unsubscribe(topic);
        }

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
        const previousSubs = Array.from(this.activeSubscriptions);
        await this.disconnect();

        if (this.config) {
            this.status.state = "reconnecting";
            this.emit("status-changed", this.status);

            await this.connect(this.config);

            // Re-subscribe
            for (const topic of previousSubs) {
                this.subscribe(topic);
            }
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

        // Send subscription request
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
        return this.availableTopics;
    }

    async getTopicType(topic: string): Promise<string | null> {
        const topicInfo = this.availableTopics.find((t) => t.topic === topic);
        return topicInfo?.type || null;
    }

    getStatus(): ConnectionStatus {
        return { ...this.status };
    }

    private async discoverTopics(): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        return new Promise((resolve) => {
            const handler = (event: MessageEvent) => {
                const message = JSON.parse(event.data);
                if (message.op === "topics_list") {
                    this.availableTopics = message.topics.map((t: any) => ({
                        topic: t.name,
                        type: t.type,
                        frequency: t.frequency,
                    }));

                    this.ws!.removeEventListener("message", handler);
                    resolve();
                }
            };

            this.ws.addEventListener("message", handler);
            this.ws.send(JSON.stringify({ op: "get_topics" }));

            setTimeout(() => {
                this.ws!.removeEventListener("message", handler);
                resolve();
            }, 5000);
        });
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const message: WebSocketMessage = JSON.parse(event.data);

            if (message.op === "publish") {
                this.status.lastDataAt = Date.now();

                const metadata: MessageMetadata = {
                    timestamp: message.timestamp || Date.now(),
                    frameId: message.frameId || "world",
                };

                // Emit to DatasourceManager (which writes to atoms)
                this.emit("message", message.topic, message.data, metadata);
            }
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

    private handleDisconnect(): void {
        this.status.state = "disconnected";
        this.emit("status-changed", this.status);
        this.emit("disconnected", "Connection closed unexpectedly");

        // Auto-reconnect logic
        if (
            this.config?.reconnectAttempts &&
            this.config.reconnectAttempts > 0
        ) {
            setTimeout(() => {
                this.reconnect();
            }, this.config.reconnectInterval || 3000);
        }
    }
}

export default WebSocketConnection;
```

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

Generic WebSocket connection.

```typescript
// datasources/websocket-connection.ts
import {
    Connection,
    TopicInfo,
    MessageMetadata,
} from "@workspace/ormi-core/v2";

interface WebSocketConfig {
    id: string;
    url: string;
    reconnectTimeout?: number;
    autoReconnect?: boolean;
}

export class WebSocketConnection implements Connection {
    private ws: WebSocket | null = null;
    private config: WebSocketConfig;
    private subscriptions = new Map<string, number>();
    private eventTarget = new EventTarget();
    private reconnectTimer?: NodeJS.Timeout;

    constructor(config: WebSocketConfig) {
        this.config = {
            reconnectTimeout: 5000,
            autoReconnect: true,
            ...config,
        };
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.config.url);

            this.ws.onopen = () => {
                this.emit("connected");
                resolve();
            };

            this.ws.onerror = (error) => {
                this.emit("error", new Error("WebSocket connection failed"));
                reject(error);
            };

            this.ws.onclose = () => {
                this.emit("disconnected");
                if (this.config.autoReconnect) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error("Failed to parse message:", error);
                }
            };
        });
    }

    async disconnect(): Promise<void> {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    subscribe(topic: string): void {
        const count = this.subscriptions.get(topic) || 0;
        this.subscriptions.set(topic, count + 1);

        if (count === 0 && this.ws) {
            // First subscriber - send subscribe message
            this.ws.send(
                JSON.stringify({
                    op: "subscribe",
                    topic: topic,
                })
            );
        }
    }

    unsubscribe(topic: string): void {
        const count = this.subscriptions.get(topic) || 0;

        if (count <= 1) {
            // Last subscriber - send unsubscribe message
            if (this.ws) {
                this.ws.send(
                    JSON.stringify({
                        op: "unsubscribe",
                        topic: topic,
                    })
                );
            }
            this.subscriptions.delete(topic);
        } else {
            this.subscriptions.set(topic, count - 1);
        }
    }

    async discoverTopics(): Promise<TopicInfo[]> {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject(new Error("Not connected"));
                return;
            }

            // Send discovery request
            const requestId = Math.random().toString(36);
            this.ws.send(
                JSON.stringify({
                    op: "get_topics",
                    id: requestId,
                })
            );

            // Wait for response
            const handler = (event: MessageEvent) => {
                const msg = JSON.parse(event.data);
                if (msg.op === "topics_list" && msg.id === requestId) {
                    this.ws?.removeEventListener("message", handler);
                    resolve(msg.topics);
                }
            };

            this.ws.addEventListener("message", handler);

            // Timeout after 5 seconds
            setTimeout(() => {
                this.ws?.removeEventListener("message", handler);
                reject(new Error("Topic discovery timeout"));
            }, 5000);
        });
    }

    async publish(topic: string, data: any): Promise<void> {
        if (!this.ws) {
            throw new Error("Not connected");
        }

        this.ws.send(
            JSON.stringify({
                op: "publish",
                topic: topic,
                msg: data,
            })
        );
    }

    on(event: string, callback: Function): void {
        this.eventTarget.addEventListener(event, ((e: CustomEvent) => {
            if (event === "message") {
                callback(e.detail.topic, e.detail.data, e.detail.metadata);
            } else {
                callback(e.detail);
            }
        }) as EventListener);
    }

    off(event: string, callback: Function): void {
        this.eventTarget.removeEventListener(event, callback as EventListener);
    }

    private handleMessage(message: any) {
        if (message.op === "publish") {
            this.emit("message", message.topic, message.msg, {
                timestamp: message.timestamp || Date.now(),
                frameId: message.frame_id,
            });
        }
    }

    private emit(event: string, ...args: any[]) {
        const detail =
            event === "message"
                ? { topic: args[0], data: args[1], metadata: args[2] }
                : args[0];

        this.eventTarget.dispatchEvent(new CustomEvent(event, { detail }));
    }

    private scheduleReconnect() {
        this.reconnectTimer = setTimeout(() => {
            console.log("Attempting to reconnect...");
            this.connect().catch(console.error);
        }, this.config.reconnectTimeout);
    }
}

// Registration
export const WebSocketDatasourceDefinition = {
    id: "websocket",
    name: "WebSocket",
    version: 2,
    createConnection: (config: WebSocketConfig) =>
        new WebSocketConnection(config),
    schema: {
        type: "object",
        required: ["id", "url"],
        properties: {
            id: { type: "string", title: "ID" },
            url: { type: "string", title: "WebSocket URL" },
            reconnectTimeout: {
                type: "number",
                title: "Reconnect Timeout (ms)",
                default: 5000,
            },
            autoReconnect: {
                type: "boolean",
                title: "Auto Reconnect",
                default: true,
            },
        },
    },
};
```

### REST API Datasource

Polling-based REST API connection.

```typescript
// datasources/rest-connection.ts
import { Connection, TopicInfo } from "@workspace/ormi-core/v2";

interface RESTConfig {
    id: string;
    baseUrl: string;
    pollRate?: number; // milliseconds
    headers?: Record<string, string>;
}

export class RESTConnection implements Connection {
    private config: RESTConfig;
    private pollIntervals = new Map<string, NodeJS.Timer>();
    private eventTarget = new EventTarget();
    private connected = false;

    constructor(config: RESTConfig) {
        this.config = {
            pollRate: 1000, // Default 1 Hz
            ...config,
        };
    }

    async connect(): Promise<void> {
        // Test connection
        try {
            const response = await fetch(`${this.config.baseUrl}/health`);
            if (!response.ok) {
                throw new Error("Health check failed");
            }
            this.connected = true;
            this.emit("connected");
        } catch (error) {
            this.emit("error", error as Error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        // Stop all polling
        this.pollIntervals.forEach(clearInterval);
        this.pollIntervals.clear();
        this.connected = false;
        this.emit("disconnected");
    }

    isConnected(): boolean {
        return this.connected;
    }

    subscribe(topic: string): void {
        if (this.pollIntervals.has(topic)) {
            return; // Already polling
        }

        const interval = setInterval(async () => {
            try {
                const response = await fetch(`${this.config.baseUrl}${topic}`, {
                    headers: this.config.headers,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                this.emit("message", topic, data, {
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.emit("error", error as Error);
            }
        }, this.config.pollRate);

        this.pollIntervals.set(topic, interval);
    }

    unsubscribe(topic: string): void {
        const interval = this.pollIntervals.get(topic);
        if (interval) {
            clearInterval(interval);
            this.pollIntervals.delete(topic);
        }
    }

    async discoverTopics(): Promise<TopicInfo[]> {
        const response = await fetch(`${this.config.baseUrl}/topics`);
        const topics = await response.json();
        return topics;
    }

    async publish(topic: string, data: any): Promise<void> {
        await fetch(`${this.config.baseUrl}${topic}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.config.headers,
            },
            body: JSON.stringify(data),
        });
    }

    on(event: string, callback: Function): void {
        this.eventTarget.addEventListener(event, ((e: CustomEvent) => {
            if (event === "message") {
                callback(e.detail.topic, e.detail.data, e.detail.metadata);
            } else {
                callback(e.detail);
            }
        }) as EventListener);
    }

    off(event: string, callback: Function): void {
        this.eventTarget.removeEventListener(event, callback as EventListener);
    }

    private emit(event: string, ...args: any[]) {
        const detail =
            event === "message"
                ? { topic: args[0], data: args[1], metadata: args[2] }
                : args[0];

        this.eventTarget.dispatchEvent(new CustomEvent(event, { detail }));
    }
}

export const RESTDatasourceDefinition = {
    id: "rest-api",
    name: "REST API",
    version: 2,
    createConnection: (config: RESTConfig) => new RESTConnection(config),
    schema: {
        type: "object",
        required: ["id", "baseUrl"],
        properties: {
            id: { type: "string" },
            baseUrl: { type: "string", title: "Base URL" },
            pollRate: {
                type: "number",
                title: "Poll Rate (ms)",
                default: 1000,
            },
            headers: {
                type: "object",
                title: "Custom Headers",
                additionalProperties: { type: "string" },
            },
        },
    },
};
```

### Random Data Generator

Test datasource for development.

```typescript
// datasources/random-connection.ts
import { Connection, TopicInfo } from "@workspace/ormi-core/v2";

interface RandomConfig {
    id: string;
    updateRate?: number; // Hz
}

export class RandomConnection implements Connection {
    private config: RandomConfig;
    private intervals = new Map<string, NodeJS.Timer>();
    private eventTarget = new EventTarget();

    constructor(config: RandomConfig) {
        this.config = {
            updateRate: 10, // Default 10 Hz
            ...config,
        };
    }

    async connect(): Promise<void> {
        // Instant "connection" for random data
        this.emit("connected");
    }

    async disconnect(): Promise<void> {
        this.intervals.forEach(clearInterval);
        this.intervals.clear();
        this.emit("disconnected");
    }

    isConnected(): boolean {
        return true;
    }

    subscribe(topic: string): void {
        if (this.intervals.has(topic)) return;

        const interval = setInterval(() => {
            const data = this.generateData(topic);
            this.emit("message", topic, data, {
                timestamp: Date.now(),
                frameId: "random",
            });
        }, 1000 / this.config.updateRate!);

        this.intervals.set(topic, interval);
    }

    unsubscribe(topic: string): void {
        const interval = this.intervals.get(topic);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(topic);
        }
    }

    async discoverTopics(): Promise<TopicInfo[]> {
        return [
            { topic: "/random/float", type: "std_msgs/Float64" },
            { topic: "/random/int", type: "std_msgs/Int32" },
            { topic: "/random/string", type: "std_msgs/String" },
            { topic: "/random/bool", type: "std_msgs/Bool" },
            { topic: "/random/array", type: "std_msgs/Float64MultiArray" },
        ];
    }

    on(event: string, callback: Function): void {
        this.eventTarget.addEventListener(event, ((e: CustomEvent) => {
            if (event === "message") {
                callback(e.detail.topic, e.detail.data, e.detail.metadata);
            } else {
                callback(e.detail);
            }
        }) as EventListener);
    }

    off(event: string, callback: Function): void {
        this.eventTarget.removeEventListener(event, callback as EventListener);
    }

    private generateData(topic: string): any {
        if (topic.includes("float")) {
            return Math.random() * 100;
        } else if (topic.includes("int")) {
            return Math.floor(Math.random() * 100);
        } else if (topic.includes("string")) {
            return `Random string ${Math.random().toString(36).substr(2, 9)}`;
        } else if (topic.includes("bool")) {
            return Math.random() > 0.5;
        } else if (topic.includes("array")) {
            return Array.from({ length: 10 }, () => Math.random());
        }
        return Math.random();
    }

    private emit(event: string, ...args: any[]) {
        const detail =
            event === "message"
                ? { topic: args[0], data: args[1], metadata: args[2] }
                : args[0];

        this.eventTarget.dispatchEvent(new CustomEvent(event, { detail }));
    }
}

export const RandomDatasourceDefinition = {
    id: "random-generator",
    name: "Random Data Generator",
    version: 2,
    createConnection: (config: RandomConfig) => new RandomConnection(config),
    schema: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string" },
            updateRate: {
                type: "number",
                title: "Update Rate (Hz)",
                default: 10,
                minimum: 1,
                maximum: 100,
            },
        },
    },
};
```

---

## Type Conversion in Datasources

The V2 API maintains V1's type conversion system. Datasources work with native formats (rawType) while widgets use standardized internal types (type).

### Implementing Type Converters

Example from ROS datasource showing bidirectional type conversion:

```typescript
// datasources/rosbridge/type-converters.ts
import { TypeConverter } from "@workspace/ormi-core/v2";

export const ROSImageConverter: TypeConverter = {
    // Convert from ROS format to internal format
    convertToWebapp(rosmsg: any, rosType: string, internalType: string): any {
        if (rosType !== "sensor_msgs/Image") return rosmsg;

        // Convert ROS Image message to internal Image format
        return {
            width: rosmsg.width,
            height: rosmsg.height,
            encoding: rosmsg.encoding,
            data: rosmsg.data,
            step: rosmsg.step,
            header: {
                frameId: rosmsg.header.frame_id,
                timestamp:
                    rosmsg.header.stamp.sec * 1000 +
                    rosmsg.header.stamp.nsec / 1e6,
            },
        };
    },

    // Convert from internal format to ROS format (for publishing)
    convertFromWebapp(
        webappData: any,
        rosType: string,
        internalType: string
    ): any {
        if (rosType !== "sensor_msgs/Image") return webappData;

        // Convert internal Image to ROS format
        return {
            width: webappData.width,
            height: webappData.height,
            encoding: webappData.encoding,
            data: webappData.data,
            step: webappData.step,
            header: {
                frame_id: webappData.header.frameId,
                stamp: {
                    sec: Math.floor(webappData.header.timestamp / 1000),
                    nsec: (webappData.header.timestamp % 1000) * 1e6,
                },
            },
        };
    },

    // Map ROS types to internal types
    getWebappTypeFromROSType(rosType: string): string | undefined {
        const typeMap: Record<string, string> = {
            "sensor_msgs/Image": "Image",
            "sensor_msgs/PointCloud2": "PointCloud",
            "geometry_msgs/PoseStamped": "Pose",
            "std_msgs/Float64": "number",
            "std_msgs/String": "string",
        };
        return typeMap[rosType];
    },
};
```

### Registering Type Converters

Datasources register their converters with the UnifiedConverterRegistry:

```typescript
// datasources/rosbridge/rosbridge-connection.ts
import {
    Connection,
    DatasourceTopic,
    UnifiedConverterRegistry,
} from "@workspace/ormi-core/v2";
import { ROSImageConverter } from "./type-converters";

export class RosbridgeConnection implements Connection {
    private ws: WebSocket | null = null;

    async connect(): Promise<void> {
        // Register type converters on connection
        UnifiedConverterRegistry.registerConverter(
            "sensor_msgs/Image",
            ROSImageConverter
        );
        UnifiedConverterRegistry.registerConverter(
            "sensor_msgs/PointCloud2",
            ROSImageConverter
        );
        // ... register other converters

        // Connect to ROS bridge
        this.ws = new WebSocket(this.config.url);
        // ... connection setup
    }

    subscribe(topicConfig: DatasourceTopic): void {
        // Subscribe to ROS topic
        this.ws?.send(
            JSON.stringify({
                op: "subscribe",
                topic: topicConfig.topic,
                type: topicConfig.rawType, // Use ROS type for subscription
            })
        );
    }

    private handleMessage(topic: string, msg: any, rosType: string): void {
        // Get the topic configuration
        const topicConfig = this.getTopicConfig(topic);

        // Convert from ROS format to internal format
        const converted = UnifiedConverterRegistry.convertToWebapp(
            msg,
            topicConfig.rawType, // sensor_msgs/Image
            topicConfig.type // Image
        );

        // Emit converted message
        this.emit("message", topicConfig, converted, {
            timestamp: Date.now(),
            frameId: msg.header?.frame_id,
        });
    }
}
```

### Type Conversion Flow

1. **Widget subscribes** via `useDataStream`:

    ```typescript
    const { data } = useDataStream<Image>(datasourceId, topic);
    ```

2. **DatasourceManager** creates `DatasourceTopic` with type info:

    ```typescript
    {
      topic: "/camera/image",
      datasource_id: "ros-1",
      source: "rosbridge",
      rawType: "sensor_msgs/Image",  // ROS format
      type: "Image"                   // Internal format
    }
    ```

3. **Connection** receives native message and converts:

    ```typescript
    // ROS sends sensor_msgs/Image
    const rosmsg = { width: 640, height: 480, ... }

    // Convert to internal format
    const webappmsg = converter.convertToWebapp(rosmsg, rawType, type)
    ```

4. **Widget receives** converted data in standard format:
    ```typescript
    // data is now in internal Image format
    <ImageRenderer data={data} />
    ```

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
