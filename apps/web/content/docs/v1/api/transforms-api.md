---
title: "Transforms API"
description: API for coordinate transformations and TF tree management
order: 6
---

# Transforms API

## Overview

The Transforms API provides coordinate transformation capabilities for robotics applications, managing TF (Transform) trees and converting coordinates between reference frames.

**Use Transforms to:**

- Access robot coordinate transformations
- Convert between reference frames
- Query TF tree structure
- Subscribe to transform updates (event-driven via Jotai atoms)

For architectural details on TF tree storage and update mechanisms, see **[Core - Transforms System](../core/transforms)**.

## Jotai Atoms

The transforms system uses Jotai atoms for reactive state management. No provider wrapper is needed.

### transformTreesAtom

Main atom holding all transform trees:

```typescript
import { transformTreesAtom } from "@workspace/ormi-core/transforms";
import { useAtomValue } from "jotai";

// In a React component
const transformsTrees = useAtomValue(transformTreesAtom);
```

### transformFrameCountAtom

Derived atom for total frame count:

```typescript
import { transformFrameCountAtom } from "@workspace/ormi-core/transforms";
import { useAtomValue } from "jotai";

const frameCount = useAtomValue(transformFrameCountAtom);
```

## useTransformSource Hook

Main hook for accessing transform data. **No provider wrapper needed** - works anywhere in your app.

### Signature

```typescript
function useTransformSource(): {
  transformsTrees: Map<string, TransformTree>;
};
```

### Basic Usage

```typescript
import { useTransformSource } from '@workspace/ormi-core/transforms';

function MyComponent() {
    const { transformsTrees } = useTransformSource();

    // List all root frames
    const rootFrames = Array.from(transformsTrees.keys());

    return (
        <ul>
            {rootFrames.map(frame => (
                <li key={frame}>{frame}</li>
            ))}
        </ul>
    );
}
```

## useTransformFrameCount Hook

Get the total number of frames across all transform trees:

```typescript
import { useTransformFrameCount } from '@workspace/ormi-core/transforms';

function FrameStatus() {
    const frameCount = useTransformFrameCount();

    return <div>Total frames in TF tree: {frameCount}</div>;
}
```

## Transform Types

```typescript
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

interface Transform {
  position: Vector4;
  rotation: Quaternion;
  convention: CoordinateConvention;
}

interface TransformTree {
  id: string;
  parentId: string;
  transform: Transform;
  children: Map<string, TransformTree>;
  convention?: CoordinateConvention;
}

type CoordinateConvention = "ROS" | "THREE" | "UNITY" | "UNREAL" | "CUSTOM";
```

## Transform Chain Functions

### findTransformChain

Find the transform chain between two frames:

```typescript
import { findTransformChain, useTransformSource } from '@workspace/ormi-core/transforms';

function TransformChecker() {
    const { transformsTrees } = useTransformSource();

    const chain = findTransformChain(transformsTrees, 'camera', 'map');

    if (chain === null) {
        return <div>No transform path found</div>;
    }

    return <div>Transform chain has {chain.length} steps</div>;
}
```

### applyTransformChain

Apply a transform chain to a point:

```typescript
import {
    findTransformChain,
    applyTransformChain,
    useTransformSource
} from '@workspace/ormi-core/transforms';

function PointTransformer() {
    const { transformsTrees } = useTransformSource();

    const pointInCamera = { x: 0, y: 0, z: 1 };
    const chain = findTransformChain(transformsTrees, 'camera', 'map');

    if (!chain) {
        return <div>Transform unavailable</div>;
    }

    const pointInMap = applyTransformChain(pointInCamera, chain);

    return (
        <div>
            Point in map: ({pointInMap.x.toFixed(2)}, {pointInMap.y.toFixed(2)}, {pointInMap.z.toFixed(2)})
        </div>
    );
}
```

### applyTransform

Apply a single transform to a point:

```typescript
import { applyTransform } from "@workspace/ormi-core/transforms";

const point = { x: 1, y: 0, z: 0 };
const transform = {
  position: { x: 5, y: 0, z: 0, w: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  convention: "ROS" as const,
};

const transformed = applyTransform(point, transform);
// Result: { x: 6, y: 0, z: 0 }
```

## Pushing Transforms (Datasource Side)

### processTFMessage

Push TF messages to the transform atom:

```typescript
import { processTFMessage } from "@workspace/ormi-core/transforms";

// When receiving a TF message from ROS/Foxglove
function onTFMessage(message: TFMessage) {
  processTFMessage(datasourceId, message);
}
```

### clearTransformsFromDatasource

Clear transforms when a datasource disconnects:

```typescript
import { clearTransformsFromDatasource } from "@workspace/ormi-core/transforms";

// On cleanup
clearTransformsFromDatasource(datasourceId);
```

### clearAllTransforms

Clear all transforms:

```typescript
import { clearAllTransforms } from "@workspace/ormi-core/transforms";

clearAllTransforms();
```

## Non-React Usage

For use outside React components:

### getTransformTrees

```typescript
import { getTransformTrees } from "@workspace/ormi-core/transforms";

const trees = getTransformTrees();
console.log("Current trees:", trees.size);
```

### subscribeToTransforms

```typescript
import {
  subscribeToTransforms,
  getTransformTrees,
} from "@workspace/ormi-core/transforms";

const unsubscribe = subscribeToTransforms(() => {
  const trees = getTransformTrees();
  console.log("Transforms updated!", trees.size, "trees");
});

// Later: cleanup
unsubscribe();
```

## GPS Conversion

### localToGPS

Convert local ENU coordinates to GPS:

```typescript
import { localToGPS } from "@workspace/ormi-core/transforms";

const origin = { latitude: 37.7749, longitude: -122.4194, altitude: 10 };
const localPoint = { x: 100, y: 50, z: 5 };

const gps = localToGPS(localPoint, origin);
```

### gpsToLocal

Convert GPS to local ENU coordinates:

```typescript
import { gpsToLocal } from "@workspace/ormi-core/transforms";

const origin = { latitude: 37.7749, longitude: -122.4194, altitude: 10 };
const target = { latitude: 37.775, longitude: -122.4193, altitude: 15 };

const local = gpsToLocal(target, origin);
```

### useTransformToGPS Hook

Convenience hook for GPS transformations:

```typescript
import { useTransformToGPS } from '@workspace/ormi-core/transforms';

function GPSWidget({ sourceFrame, gpsFrame, gpsOriginData }) {
    const {
        transformPointToGPS,
        hasTransform,
        transformError
    } = useTransformToGPS(sourceFrame, gpsFrame, gpsOriginData);

    if (!hasTransform) {
        return <div>Error: {transformError}</div>;
    }

    const point = { x: 10, y: 20, z: 0 };
    const gps = transformPointToGPS(point);

    return <div>GPS: {gps?.latitude}, {gps?.longitude}</div>;
}
```

## Coordinate System Conversion

### createPositionConverter

Create a converter between coordinate systems:

```typescript
import { createPositionConverter } from "@workspace/ormi-core/transforms";

// ROS: X forward, Y left, Z up
// THREE: X right, Y up, Z out

const rosToThree = createPositionConverter("ROS", "THREE");
const threeToRos = createPositionConverter("THREE", "ROS");

const rosPoint = { x: 1, y: 2, z: 3 };
const threePoint = rosToThree(rosPoint);
```

## Common Patterns

### TF Tree Visualizer

```typescript
import { useTransformSource } from '@workspace/ormi-core/transforms';
import { TransformTree } from '@workspace/ormi-core/types';

function TFTreeVisualizer() {
    const { transformsTrees } = useTransformSource();

    const renderNode = (node: TransformTree, depth = 0) => (
        <div key={node.id} style={{ marginLeft: depth * 20 }}>
            <span className="font-mono">{node.id}</span>
            {Array.from(node.children.values()).map(child =>
                renderNode(child, depth + 1)
            )}
        </div>
    );

    return (
        <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">TF Tree</h3>
            {Array.from(transformsTrees.values()).map(tree =>
                renderNode(tree)
            )}
        </div>
    );
}
```

### Frame Selector

```typescript
import { useTransformSource } from '@workspace/ormi-core/transforms';
import { TransformTree } from '@workspace/ormi-core/types';

function FrameSelector({ value, onChange }) {
    const { transformsTrees } = useTransformSource();

    // Collect all frame IDs
    const frames: string[] = [];
    const collectFrames = (node: TransformTree) => {
        frames.push(node.id);
        for (const child of node.children.values()) {
            collectFrames(child);
        }
    };

    for (const tree of transformsTrees.values()) {
        collectFrames(tree);
    }

    return (
        <select value={value} onChange={e => onChange(e.target.value)}>
            <option value="">Select frame</option>
            {frames.map(frame => (
                <option key={frame} value={frame}>{frame}</option>
            ))}
        </select>
    );
}
```

### Transform Status Indicator

```typescript
import { useTransformSource, findTransformChain } from '@workspace/ormi-core/transforms';

function TransformStatus({ sourceFrame, targetFrame }) {
    const { transformsTrees } = useTransformSource();

    const chain = findTransformChain(transformsTrees, sourceFrame, targetFrame);
    const available = chain !== null;

    return (
        <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${available ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{sourceFrame} → {targetFrame}</span>
            <span className="text-xs text-muted-foreground">
                {available ? `${chain.length} steps` : 'unavailable'}
            </span>
        </div>
    );
}
```

## Best Practices

### 1. Check Transform Availability

```typescript
const chain = findTransformChain(transformsTrees, source, target);
if (!chain) {
  // Handle missing transform
  return;
}
```

### 2. Memoize Transform Chains

```typescript
const chain = useMemo(
  () => findTransformChain(transformsTrees, source, target),
  [transformsTrees, source, target],
);
```

### 3. Handle Frame Updates

```typescript
// Transforms update automatically via Jotai
// Your component re-renders when transforms change
const { transformsTrees } = useTransformSource();

useEffect(() => {
  console.log("Transforms updated:", transformsTrees.size);
}, [transformsTrees]);
```

### 4. Debug Transform Issues

```typescript
const { transformsTrees } = useTransformSource();

// Log all available frames
const logFrames = (tree: TransformTree, path = "") => {
  console.log(path + tree.id);
  for (const child of tree.children.values()) {
    logFrames(child, path + "  ");
  }
};

transformsTrees.forEach((tree, rootId) => {
  console.log(`=== Tree: ${rootId} ===`);
  logFrames(tree);
});
```

## Common Issues

### Transform Not Found

**Problem:** `findTransformChain()` returns `null`

**Causes:**

- Transform not yet published
- Frame names misspelled
- Frames in different trees

**Solutions:**

- Log available frames to verify names
- Check if datasource is connected
- Verify TF publisher is running

### Stale Transforms

**Problem:** Transforms don't seem to update

**Causes:**

- Datasource not calling `processTFMessage`
- TF publisher stopped

**Solutions:**

- Add logging in datasource TF handler
- Check datasource connection status

## See Also

- **[Core - Transforms System](../core/transforms)** - Architecture and implementation details
- **[Datasource API](./datasource-api)** - Subscribing to TF topics
- **[Widget API](./widget-api)** - Using transforms in widgets
