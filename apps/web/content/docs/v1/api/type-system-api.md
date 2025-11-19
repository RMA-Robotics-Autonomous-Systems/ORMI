---
title: "Type System API"
description: API for type conversions and standardized data types
order: 9
---

# Type System API

## Overview

The Type System API provides utilities for converting external data types (ROS2, REST, etc.) to ORMI's standardized internal types, ensuring widgets can work with data from any source.

**Use Type System to:**

- Convert ROS messages to internal types
- Validate type compatibility
- Access type definitions
- Transform data structures

For architectural details on the dual type system and conversion mechanisms, see **[Core - Type System](../core/type-system)**.

## Type Definitions

### Primitive Types

```typescript
type InternalNumber = number;
type InternalBoolean = boolean;
type InternalString = string;
```

### Geometric Types

```typescript
interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

interface Pose {
    position: Vector3;
    orientation: Quaternion;
}

interface Transform {
    translation: Vector3;
    rotation: Quaternion;
}
```

### Sensor Types

```typescript
interface Image {
    width: number;
    height: number;
    encoding: string;
    data: Uint8Array;
}

interface LaserScan {
    angleMin: number;
    angleMax: number;
    angleIncrement: number;
    rangeMin: number;
    rangeMax: number;
    ranges: number[];
    intensities: number[];
}

interface PointCloud {
    points: Array<{
        x: number;
        y: number;
        z: number;
        rgb?: number;
    }>;
}
```

### Status Types

```typescript
interface BatteryState {
    voltage: number;
    current: number;
    percentage: number;
    charging: boolean;
}

interface NavSatFix {
    latitude: number;
    longitude: number;
    altitude: number;
}
```

## Type Conversion Functions

### convertRosToInternal

Convert ROS message type to internal type.

```typescript
function convertRosToInternal(
    rosType: string,
    data: any
): { type: string; data: any };
```

**Usage:**

```typescript
import { convertRosToInternal } from "@workspace/utils";

const rosMessage = {
    linear: { x: 1.0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0.5 },
};

const { type, data } = convertRosToInternal("geometry_msgs/Twist", rosMessage);

console.log(type); // "Movement"
console.log(data); // { linear: { x: 1.0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.5 } }
```

### convertInternalToRos

Convert internal type back to ROS message format.

```typescript
function convertInternalToRos(
    internalType: string,
    data: any,
    targetRosType: string
): any;
```

**Usage:**

```typescript
import { convertInternalToRos } from "@workspace/utils";

const internalData = {
    position: { x: 1, y: 2, z: 3 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
};

const rosMessage = convertInternalToRos(
    "Pose",
    internalData,
    "geometry_msgs/Pose"
);

console.log(rosMessage);
// { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }
```

### getInternalTypeForRos

Get internal type name for a ROS message type.

```typescript
function getInternalTypeForRos(rosType: string): string | null;
```

**Usage:**

```typescript
import { getInternalTypeForRos } from "@workspace/utils";

const internalType = getInternalTypeForRos("geometry_msgs/Twist");
console.log(internalType); // "Movement"

const imageType = getInternalTypeForRos("sensor_msgs/Image");
console.log(imageType); // "Image"
```

### isTypeCompatible

Check if two types are compatible.

```typescript
function isTypeCompatible(type1: string, type2: string): boolean;
```

**Usage:**

```typescript
import { isTypeCompatible } from "@workspace/utils";

// Check ROS to internal compatibility
const compatible = isTypeCompatible("geometry_msgs/Twist", "Movement");
console.log(compatible); // true

// Check incompatible types
const incompatible = isTypeCompatible("sensor_msgs/Image", "Movement");
console.log(incompatible); // false
```

## Common Patterns

### Type-Safe Data Consumer

```typescript
function TwistWidget({ topic }: { topic: string }) {
  const { subscribe } = useDataSources()
  const [movement, setMovement] = useState<Movement | null>(null)

  useEffect(() => {
    const unsubscribe = subscribe(topic, (rawType, data) => {
      // Convert to internal type
      const { type, data: converted } = convertRosToInternal(rawType, data)

      // Validate type
      if (type === 'Movement') {
        setMovement(converted as Movement)
      } else {
        console.error(`Expected Movement, got ${type}`)
      }
    })

    return unsubscribe
  }, [topic, subscribe])

  if (!movement) return <div>Waiting for data...</div>

  return (
    <div>
      <h3>Linear Velocity</h3>
      <p>X: {movement.linear.x.toFixed(2)} m/s</p>
      <p>Y: {movement.linear.y.toFixed(2)} m/s</p>
      <p>Z: {movement.linear.z.toFixed(2)} m/s</p>

      <h3>Angular Velocity</h3>
      <p>Z: {movement.angular.z.toFixed(2)} rad/s</p>
    </div>
  )
}
```

### Topic Type Validator

```typescript
function TopicSelector({ onSelect, requiredType }: Props) {
  const { getAllTopics } = useDataSources()
  const topics = getAllTopics()

  const compatibleTopics = topics.filter(topic => {
    const internalType = getInternalTypeForRos(topic.messageType)
    return internalType && isTypeCompatible(internalType, requiredType)
  })

  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select topic" />
      </SelectTrigger>
      <SelectContent>
        {compatibleTopics.map(topic => (
          <SelectItem key={topic.name} value={topic.name}>
            {topic.name}
            <span className="text-xs text-muted-foreground ml-2">
              {getInternalTypeForRos(topic.messageType)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

### Multi-Source Data Handler

```typescript
function UniversalPoseWidget() {
  const { subscribe } = useDataSources()
  const [pose, setPose] = useState<Pose | null>(null)
  const [topic, setTopic] = useState('/robot/pose')

  useEffect(() => {
    const unsubscribe = subscribe(topic, (rawType, rawData) => {
      // Handle multiple ROS types
      const { type, data } = convertRosToInternal(rawType, rawData)

      if (type === 'Pose') {
        setPose(data as Pose)
      } else if (type === 'Transform') {
        // Convert Transform to Pose
        const transform = data as Transform
        setPose({
          position: transform.translation,
          orientation: transform.rotation,
        })
      } else {
        console.warn(`Unexpected type: ${type}`)
      }
    })

    return unsubscribe
  }, [topic, subscribe])

  return (
    <div>
      <TopicSelector value={topic} onChange={setTopic} requiredType="Pose" />
      {pose && (
        <>
          <div>
            <h4>Position</h4>
            <p>X: {pose.position.x.toFixed(2)}</p>
            <p>Y: {pose.position.y.toFixed(2)}</p>
            <p>Z: {pose.position.z.toFixed(2)}</p>
          </div>
          <div>
            <h4>Orientation (Quaternion)</h4>
            <p>X: {pose.orientation.x.toFixed(3)}</p>
            <p>Y: {pose.orientation.y.toFixed(3)}</p>
            <p>Z: {pose.orientation.z.toFixed(3)}</p>
            <p>W: {pose.orientation.w.toFixed(3)}</p>
          </div>
        </>
      )}
    </div>
  )
}
```

### Type Registry Query

```typescript
function TypeExplorer() {
  const [rosTypes] = useState([
    'geometry_msgs/Twist',
    'geometry_msgs/Pose',
    'sensor_msgs/Image',
    'sensor_msgs/LaserScan',
    'nav_msgs/Odometry',
    'std_msgs/String',
  ])

  return (
    <div>
      <h3 className="font-semibold mb-2">ROS to Internal Type Mapping</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">ROS Type</th>
            <th className="text-left p-2">Internal Type</th>
          </tr>
        </thead>
        <tbody>
          {rosTypes.map(rosType => {
            const internalType = getInternalTypeForRos(rosType)
            return (
              <tr key={rosType} className="border-b">
                <td className="p-2 font-mono text-xs">{rosType}</td>
                <td className="p-2">
                  {internalType ? (
                    <span className="font-semibold text-green-600">{internalType}</span>
                  ) : (
                    <span className="text-red-500">Not mapped</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

### Data Type Display

```typescript
function DataInspector({ topic }: { topic: string }) {
  const { subscribe } = useDataSources()
  const [info, setInfo] = useState<{
    rawType: string
    internalType: string
    data: any
  } | null>(null)

  useEffect(() => {
    const unsubscribe = subscribe(topic, (rawType, rawData) => {
      const { type, data } = convertRosToInternal(rawType, rawData)
      setInfo({
        rawType,
        internalType: type,
        data,
      })
    })

    return unsubscribe
  }, [topic, subscribe])

  if (!info) return <div>Waiting for data...</div>

  return (
    <div className="space-y-4">
      <div>
        <Label>Raw Type</Label>
        <code className="block p-2 bg-muted rounded">{info.rawType}</code>
      </div>
      <div>
        <Label>Internal Type</Label>
        <code className="block p-2 bg-muted rounded">{info.internalType}</code>
      </div>
      <div>
        <Label>Data</Label>
        <pre className="p-2 bg-muted rounded text-xs overflow-auto">
          {JSON.stringify(info.data, null, 2)}
        </pre>
      </div>
    </div>
  )
}
```

## Type Guards

### Runtime Type Checking

```typescript
function isVector3(data: any): data is Vector3 {
    return (
        typeof data === "object" &&
        typeof data.x === "number" &&
        typeof data.y === "number" &&
        typeof data.z === "number"
    );
}

function isPose(data: any): data is Pose {
    return (
        typeof data === "object" &&
        isVector3(data.position) &&
        isQuaternion(data.orientation)
    );
}

function isQuaternion(data: any): data is Quaternion {
    return (
        typeof data === "object" &&
        typeof data.x === "number" &&
        typeof data.y === "number" &&
        typeof data.z === "number" &&
        typeof data.w === "number"
    );
}
```

**Usage:**

```typescript
const handleData = (rawType: string, rawData: any) => {
    const { type, data } = convertRosToInternal(rawType, rawData);

    if (isPose(data)) {
        // TypeScript knows data is Pose
        console.log(data.position.x);
    } else if (isVector3(data)) {
        // TypeScript knows data is Vector3
        console.log(data.x);
    }
};
```

## Best Practices

### 1. Always Convert External Data

```typescript
// Good: Convert to internal type
const { type, data } = convertRosToInternal(rosType, rosData);

// Bad: Use raw ROS data directly
const linearX = rosData.linear.x; // Couples widget to ROS structure
```

### 2. Validate Types at Runtime

```typescript
const { type, data } = convertRosToInternal(rawType, rawData);

if (type !== "Movement") {
    console.error(`Expected Movement, got ${type}`);
    return;
}
```

### 3. Use Type Guards

```typescript
if (isPose(data)) {
    // Type-safe access
    renderPose(data);
}
```

### 4. Check Compatibility Before Subscribe

```typescript
const topic = "/cmd_vel";
const topicType = getTopicType(topic); // e.g., 'geometry_msgs/Twist'
const internalType = getInternalTypeForRos(topicType);

if (internalType !== "Movement") {
    console.error("Incompatible topic type");
    return;
}
```

### 5. Document Expected Types

```typescript
/**
 * Widget that displays robot velocity
 * @param topic - Must publish Movement type (geometry_msgs/Twist)
 */
function VelocityWidget({ topic }: { topic: string }) {
    // ...
}
```

## Common Issues

### Type Conversion Fails

**Problem:** `convertRosToInternal` returns unexpected type

**Causes:**

- ROS type not mapped
- Data structure mismatch
- Custom message type

**Solutions:**

- Check type mapping with `getInternalTypeForRos()`
- Register custom type converter
- Verify message structure

### Data Structure Mismatch

**Problem:** Converted data missing expected fields

**Cause:** ROS message structure differs from internal type

**Solution:** Add field mapping:

```typescript
const { type, data } = convertRosToInternal(rawType, rawData);

// Map fields if needed
const normalized = {
    x: data.linear?.x ?? 0,
    y: data.linear?.y ?? 0,
    z: data.linear?.z ?? 0,
};
```

### Type Compatibility Issues

**Problem:** Widget expects one type but receives another

**Solution:** Use type validators:

```typescript
const { type, data } = convertRosToInternal(rawType, rawData);

if (!isTypeCompatible(type, "Movement")) {
    console.error(`Incompatible type: ${type}`);
    return;
}
```

## See Also

- **[Core - Type System](../core/type-system)** - Type system architecture and conversion details
- **[Datasource API](./datasource-api)** - Receiving typed data from sources
- **[Widget API](./widget-api)** - Consuming typed data in widgets
