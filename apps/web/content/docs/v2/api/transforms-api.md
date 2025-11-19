---
title: "Transforms API"
description: API for coordinate frame transformations (TF-like system)
order: 7
---

# Transforms API

## Overview

The Transforms API provides coordinate frame transformation functions for robotics applications, similar to ROS TF. Use transforms to convert points between different coordinate frames.

**Common use cases:**

- Transform sensor data to robot base frame
- Convert robot coordinates to map frame
- Transform points to GPS coordinates
- Visualize data in different reference frames

For architectural details on the transform system, see **[Core - Architecture](../core/architecture)**.

## API Functions

```typescript
// Transform points between frames
TransformPointToFrame(
  point: Vector3,
  originFrame: string,
  destinationFrame: string
): Vector3 | null

TransformPointsToFrame(
  points: Vector3[],
  originFrame: string,
  destinationFrame: string
): Vector3[] | null

// Convert to GPS coordinates
PointToGPS(
  point: Vector3,
  gpsOrigin: GPSReference,
  originFrame: string,
  destinationFrame: string
): Geolocation | null

PointsToGPS(
  points: Vector3[],
  gpsOrigin: GPSReference,
  originFrame: string,
  destinationFrame: string
): Geolocation[] | null

// Update transform tree
Update(tree: Map<string, TransformTree>): void
```

## Atoms

### `transformTreeAtom`

Stores **multiple independent transform trees**.

```typescript
export const transformTreeAtom = atom<Map<string, TransformTree> | null>(null);
```

**Why Map of Trees?**

- **Multiple robots**: Each robot has its own TF tree
- **Separate coordinate systems**: World, robot, sensor coordinates
- **Isolated transforms**: Changes to one tree don't affect others

**Example**: Multiple detached trees

```typescript
// Robot A tree: map -> odom -> base_link -> camera
// Robot B tree: map -> odom -> base_link -> lidar
// World tree: earth -> building -> room
```

## Usage Examples

### Transform Point Between Frames

```typescript
import { TransformPointToFrame } from "@/lib/transforms";

const cameraPoint = { x: 1, y: 2, z: 3 };
const mapPoint = TransformPointToFrame(cameraPoint, "camera", "map");

if (mapPoint) {
    console.log("Point in map frame:", mapPoint);
}
```

### Transform Multiple Points

```typescript
import { TransformPointsToFrame } from "@/lib/transforms";

const lidarPoints = [
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 5, z: 6 },
];

const mapPoints = TransformPointsToFrame(lidarPoints, "lidar", "map");
```

### Convert to GPS

```typescript
import { PointToGPS } from "@/lib/transforms";

// GPS origin from widget config
const gpsOrigin: GPSReference = {
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 0,
    timestamp: Date.now(),
};

const robotPosition = { x: 100, y: 200, z: 10 };
const gpsCoord = PointToGPS(robotPosition, gpsOrigin, "base_link", "map");

if (gpsCoord) {
    console.log("GPS:", gpsCoord.latitude, gpsCoord.longitude);
}
```

### Update Transform Tree (Plugin)

```typescript
import { Update } from "@/lib/transforms";

// Plugin receives TF data and updates tree
const newTree = new Map<string, TransformTree>();

newTree.set("map", {
    id: "map",
    parentId: "",
    transform: identityTransform,
    children: new Map([["odom", odomNode]]),
});

newTree.set("odom", {
    id: "odom",
    parentId: "map",
    transform: mapToOdom,
    children: new Map([["base_link", baseLinkNode]]),
});

// Update atom
Update(newTree);
```

## Widget Example

```typescript
import { TransformPointToFrame } from '@/lib/transforms';
import { useDataStream } from '@/hooks/useDataStream';

export function Viewer3DWidget({ config }) {
  const data = useDataStream(config.datasourceId, config.topic);

  const transformedPosition = TransformPointToFrame(
    data?.position,
    config.sourceFrame,
    config.targetFrame
  );

  if (!transformedPosition) {
    return <div>Waiting for transform...</div>;
  }

  return (
    <Canvas>
      <mesh position={[
        transformedPosition.x,
        transformedPosition.y,
        transformedPosition.z
      ]}>
        <sphereGeometry args={[0.1]} />
      </mesh>
    </Canvas>
  );
}
```

## Plugin Example

```typescript
export class ROSTFPlugin extends Plugin {
    private currentTree = new Map<string, TransformTree>();

    onLoad() {
        this.registerAction(
            PluginsHooks.DATASOURCE_MESSAGE,
            ({ topic, data }) => {
                if (topic !== "/tf") return;

                // Update tree with new transforms
                data.transforms.forEach((tf: any) => {
                    this.updateTreeNode(tf.child_frame_id, tf.header.frame_id, {
                        position: { ...tf.transform.translation, w: 1 },
                        rotation: tf.transform.rotation,
                    });
                });

                // Update atom
                Update(new Map(this.currentTree));
            }
        );
    }
}
```

## Types

```typescript
// From ormi-core/src/types/common.ts
interface TransformTree {
    id: string;
    parentId: string;
    transform: Transform;
    children: Map<string, TransformTree>;
}

interface Transform {
    position: Vector4;
    rotation: Quaternion;
}

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Vector4 extends Vector3 {
    w: number;
}

interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

interface GPSReference {
    latitude: number;
    longitude: number;
    altitude: number;
    timestamp: number;
}

interface Geolocation {
    latitude: number;
    longitude: number;
    altitude: number;
}
```

## API Reference

### Functions

| Function                                                        | Returns                 | Description                              |
| --------------------------------------------------------------- | ----------------------- | ---------------------------------------- |
| `TransformPointToFrame(point, originFrame, destinationFrame)`   | `Vector3 \| null`       | Transform single point between frames    |
| `TransformPointsToFrame(points, originFrame, destinationFrame)` | `Vector3[] \| null`     | Transform multiple points between frames |
| `PointToGPS(point, gpsOrigin, originFrame, destinationFrame)`   | `Geolocation \| null`   | Transform point to GPS coordinates       |
| `PointsToGPS(points, gpsOrigin, originFrame, destinationFrame)` | `Geolocation[] \| null` | Transform points to GPS coordinates      |
| `Update(tree)`                                                  | `void`                  | Update transform tree atom               |

### Atoms

| Atom                | Type                                 | Description              |
| ------------------- | ------------------------------------ | ------------------------ |
| `transformTreeAtom` | `Map<string, TransformTree> \| null` | Multiple transform trees |

## Best Practices

1. **Pass GPS origin as parameter**: Don't use global state - pass it in widget config
2. **Batch updates**: Update entire tree at once with `Update()`, not individual frames
3. **Handle null returns**: All functions return null if transform chain not found
4. **Use consistent frame names**: Follow ROS TF naming conventions (e.g., `map`, `base_link`)
5. **Support multiple trees**: Remember the atom stores a Map - different robots/systems can have separate trees

## Migration from V1

### V1: Polling-Based

```tsx
// V1: Poll at 30 Hz
<TransformSourcesProvider pollRate={30}>
    <App />
</TransformSourcesProvider>
```

### V2: Event-Driven

```tsx
// V2: No provider needed
<App />;

// Update when transforms change
Update(newTransformTree);
```

## Next Steps

- [Dashboard Integration](/docs/v2/core/dashboard-integration.md) - Dashboard atoms
- [Atoms API](/docs/v2/api/atoms-api.md) - Complete atoms reference
- [Widget API](/docs/v2/api/widget-api.md) - Using transforms in widgets
