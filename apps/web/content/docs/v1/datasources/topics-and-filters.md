# Topics and Filters

This document covers the topic system and filtering mechanisms in depth.

## Topic Naming

Topics are the identifiers for data streams. Choose names carefully based on your use case.

### Naming Conventions

#### ROS-Style Hierarchical

Best for robot/sensor systems with clear hierarchies:

```
/robot/position
/robot/velocity
/camera/front/image
/camera/front/info
/sensors/imu
/sensors/gps
```

**Pros:** Organized, searchable, familiar to ROS users  
**Cons:** More verbose

#### Flat Naming

Best for simple APIs or device-specific datasources:

```
temperature
humidity
battery_level
connection_status
```

**Pros:** Simple, concise  
**Cons:** Can become cluttered with many topics

#### Domain-Based

For multi-system environments:

```
robot1.sensors.imu
robot1.actuators.motor_left
robot2.sensors.camera
api.weather.current
```

**Pros:** Clear separation between domains  
**Cons:** Requires consistent naming discipline

### Recommendation

Use **ROS-style hierarchical** naming for most cases:

- Clear structure
- Easy filtering with regex
- Scales well
- Industry standard

---

## Topic Type System

Each topic has two type fields:

### `type` (Internal Type)

The type used **within the webapp**. Standard types:

```typescript
// Primitives
"number" | "string" | "boolean";

// Geometric
"GeolocationPosition" | "Vector3" | "Quaternion";

// Sensor
"IMU" | "PointsCloud" | "Image";

// Custom
"Movement" | "BatteryStatus" | "RobotState";
```

### `rawType` (External Type)

The type in the **external system**. Examples:

```typescript
// ROS2
"sensor_msgs/msg/NavSatFix";
"geometry_msgs/msg/Pose";
"std_msgs/msg/Float64";

// JSON API
"float64";
"object";
"array";

// Custom protocol
"TELLO_IMU";
"FOXGLOVE_POSE";
```

### Why Two Types?

This separation allows:

1. **Type mapping** - External types map to standard internal types
2. **Source tracking** - Know where data originated
3. **Compatibility checking** - Widgets can require specific raw types
4. **Type conversion** - Transform data between formats

### Example

```typescript
{
    topic: '/robot/position',
    type: 'GeolocationPosition',     // Widget understands this
    rawType: 'sensor_msgs/msg/NavSatFix', // Original ROS2 type
    // ... other fields
}
```

---

## DatasourceTopicFilter

The filtering system uses regex patterns to match topics.

### Constructor

```typescript
const filter = new DatasourceTopicFilter({
    name?: RegExp;       // Match topic name
    type?: RegExp;       // Match internal type
    rawType?: RegExp;    // Match raw type
    source_id?: RegExp;  // Match datasource ID
    strict?: boolean;    // Match mode
});
```

### Filter Method

```typescript
filter.filter(topic: DatasourceTopic): boolean
```

Returns `true` if topic matches, `false` otherwise.

---

## Filter Modes

### Non-Strict Mode (default)

Match if **ANY** specified pattern matches:

```typescript
const filter = new DatasourceTopicFilter({
    name: /position/,
    type: /IMU/,
    strict: false  // or omit (default)
});

// Matches:
{ topic: '/robot/position', type: 'GeolocationPosition' } // ✓ name matches
{ topic: '/sensors/gyro', type: 'IMU' }                  // ✓ type matches
{ topic: '/robot/position_imu', type: 'IMU' }            // ✓ both match

// Doesn't match:
{ topic: '/camera/image', type: 'Image' }                // ✗ neither match
```

### Strict Mode

Match only if **ALL** specified patterns match:

```typescript
const filter = new DatasourceTopicFilter({
    name: /position/,
    type: /GeolocationPosition/,
    strict: true
});

// Matches:
{ topic: '/robot/position', type: 'GeolocationPosition' }     // ✓ both match

// Doesn't match:
{ topic: '/robot/position', type: 'Vector3' }                 // ✗ type differs
{ topic: '/robot/velocity', type: 'GeolocationPosition' }     // ✗ name differs
```

---

## Common Filter Patterns

### 1. By Topic Name

```typescript
// All position topics
new DatasourceTopicFilter({
    name: /position/i, // Case-insensitive
});

// Topics from specific namespace
new DatasourceTopicFilter({
    name: /^\/robot\//,
});

// Specific topic
new DatasourceTopicFilter({
    name: /^\/robot\/position$/,
});
```

### 2. By Type

```typescript
// All sensor types
new DatasourceTopicFilter({
    type: /(IMU|GeolocationPosition|PointsCloud)/,
});

// Numeric data only
new DatasourceTopicFilter({
    type: /^number$/,
});
```

### 3. By Raw Type

```typescript
// All ROS2 sensor messages
new DatasourceTopicFilter({
    rawType: /^sensor_msgs\//,
});

// Specific message type
new DatasourceTopicFilter({
    rawType: /sensor_msgs\/msg\/NavSatFix/,
});
```

### 4. By Datasource

```typescript
// Topics from Foxglove datasources only
new DatasourceTopicFilter({
    source_id: /foxglove/,
});

// Exclude certain datasources
new DatasourceTopicFilter({
    source_id: /^(?!.*test).*$/, // Not containing 'test'
});
```

### 5. Combined Filters

```typescript
// Position topics from ROS2
new DatasourceTopicFilter({
    name: /position/,
    rawType: /^(sensor_msgs|geometry_msgs)/,
    strict: true,
});

// Any IMU data from any source
new DatasourceTopicFilter({
    type: /IMU/,
});

// Specific datasource + topic pattern
new DatasourceTopicFilter({
    source_id: /^datasource_1/,
    name: /^\/robot\//,
    strict: true,
});
```

---

## Using Filters in Providers

### Basic Usage

```typescript
pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
    id: `${datasource_id}-topics`,
    priority: 10,
    filter: async (
        topics: DatasourceTopic[],
        filter?: DatasourceTopicFilter
    ) => {
        // Your topics
        const myTopics = getMyTopics();

        // Apply filter if provided
        if (filter) {
            const filtered = myTopics.filter((topic) => filter.filter(topic));
            topics.push(...filtered);
        } else {
            topics.push(...myTopics);
        }

        return topics;
    },
});
```

### Optimized: Pre-filter

```typescript
filter: async (
    topics: DatasourceTopic[],
    topicFilter?: DatasourceTopicFilter
) => {
    if (!props.enable) return topics;

    // Quick exit if filter won't match any of our topics
    if (topicFilter?.source_id && !topicFilter.source_id.test(datasource_id)) {
        return topics;
    }

    const myTopics = getMyTopics();

    if (topicFilter) {
        const filtered = myTopics.filter((t) => topicFilter.filter(t));
        topics.push(...filtered);
    } else {
        topics.push(...myTopics);
    }

    return topics;
};
```

---

## Widget Topic Selection

Widgets use filters to specify required topics:

### Example: Widget Definition

```typescript
const MyWidgetDefinition: WidgetDefinition = {
    id: "my-position-widget",
    name: "Position Display",

    schema: {
        type: "object",
        properties: {
            topic: {
                type: "object",
                // This will show topic selector in UI
            },
        },
    },

    topicCompatibility: [
        // Accept GeolocationPosition or Vector3
        new DatasourceTopicFilter({
            type: /(GeolocationPosition|Vector3)/,
        }),
    ],

    // ...
};
```

### Runtime Topic Query

```typescript
// In widget component
const availableTopics = await pluginsManager.applyFilterAsync<
    DatasourceTopic[]
>(
    PluginsHooks.AVAILABLE_TOPICS,
    [],
    new DatasourceTopicFilter({
        type: /GeolocationPosition/,
    })
);
```

---

## Advanced: Dynamic Topics

Some datasources have dynamic topics that change at runtime:

```typescript
const [availableTopics, setAvailableTopics] = useState<DatasourceTopic[]>([]);

// Update when connection establishes
useEffect(() => {
    client.onConnected = () => {
        const topics = client.getTopicList().map((t) => ({
            topic: t.name,
            datasource_id: datasource_id,
            source: props,
            type: mapToInternalType(t.type),
            rawType: t.type,
        }));

        setAvailableTopics(topics);
    };
}, [client]);

// Filter returns current list
pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
    id: `${datasource_id}-topics`,
    filter: async (topics, filter) => {
        const filtered = filter
            ? availableTopics.filter((t) => filter.filter(t))
            : availableTopics;

        topics.push(...filtered);
        return topics;
    },
});
```

---

## Buffer Size

Topics can specify a buffer size for historical data:

```typescript
{
    topic: '/robot/position',
    type: 'GeolocationPosition',
    rawType: 'sensor_msgs/msg/NavSatFix',
    bufferSize: 100  // Keep last 100 messages
}
```

**Use cases:**

- Plotting historical data
- Computing running averages
- Replay functionality
- Temporal analysis

**Implementation:**

```typescript
const buffers = useRef(new Map<string, any[]>());

const publishData = (topic: string, data: any) => {
    const topicDef = getTopicDef(topic);

    if (topicDef.bufferSize) {
        let buffer = buffers.current.get(topic) || [];
        buffer.push(data);

        // Keep only last N items
        if (buffer.length > topicDef.bufferSize) {
            buffer = buffer.slice(-topicDef.bufferSize);
        }

        buffers.current.set(topic, buffer);
    }

    pluginsManager.doAction(
        `${datasource_id}-${topic}-published`,
        data,
        Date.now()
    );
};
```

---

## Best Practices

### ✅ Topic Naming

- Use consistent hierarchical structure
- Start with `/` for ROS-style topics
- Use lowercase with underscores: `sensor_data` not `sensorData`
- Be descriptive: `/robot/sensors/front_lidar` not `/r/s/fl`

### ✅ Type Mapping

- Map external types to standard internal types when possible
- Preserve original type in `rawType`
- Document type mappings in datasource docs

### ✅ Filtering

- Use non-strict mode for broad queries
- Use strict mode for specific requirements
- Optimize by checking source_id first
- Cache filter results when possible

### ✅ Buffer Management

- Only buffer when necessary (memory cost)
- Use reasonable buffer sizes (100-1000 items)
- Clear buffers on unsubscribe
- Consider circular buffers for efficiency

---

## Next Steps

- [Provider Pattern](provider-pattern) - Implement topic publishing
- [Creating a Datasource](../implementation/creating-datasource) - Build complete datasource
- [Plugin Integration](../plugins/integration) - Register topics with system
