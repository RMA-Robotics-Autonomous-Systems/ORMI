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
- Subscribe to transform updates

For architectural details on TF tree storage and update mechanisms, see **[Core - Transforms System](../core/transforms)**.

## useTransformSource Hook

Main hook for accessing transform data and TF tree operations.

### Signature

```typescript
function useTransformSource(): {
    getTransform: (from: string, to: string, time?: number) => Transform | null;
    getFrameTree: () => FrameNode[];
    getAllFrames: () => string[];
    lookupTransform: (
        targetFrame: string,
        sourceFrame: string
    ) => TransformStamped | null;
    canTransform: (from: string, to: string) => boolean;
    isLoading: boolean;
};
```

### Transform Types

```typescript
interface Transform {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number }; // Quaternion
}

interface TransformStamped extends Transform {
    header: {
        frameId: string;
        stamp: number;
    };
    childFrameId: string;
}

interface FrameNode {
    name: string;
    parent: string | null;
    children: FrameNode[];
}
```

## Basic Usage

### Get Transform Between Frames

```typescript
import { useTransformSource } from '@workspace/ui'

function RobotVisualizer() {
  const { getTransform } = useTransformSource()

  const mapToBaseLinkTransform = getTransform('map', 'base_link')

  if (!mapToBaseLinkTransform) {
    return <div>Transform not available</div>
  }

  return (
    <div>
      <p>Position: {mapToBaseLinkTransform.translation.x},
         {mapToBaseLinkTransform.translation.y},
         {mapToBaseLinkTransform.translation.z}</p>
    </div>
  )
}
```

### Check Transform Availability

```typescript
function TransformStatus() {
  const { canTransform } = useTransformSource()

  const hasMapToOdom = canTransform('map', 'odom')

  return (
    <div>
      {hasMapToOdom ? (
        <span className="text-green-600">Map → Odom available</span>
      ) : (
        <span className="text-red-600">Map → Odom unavailable</span>
      )}
    </div>
  )
}
```

### List All Frames

```typescript
function FrameList() {
  const { getAllFrames } = useTransformSource()

  const frames = getAllFrames()

  return (
    <ul>
      {frames.map(frame => (
        <li key={frame}>{frame}</li>
      ))}
    </ul>
  )
}
```

## Common Patterns

### Frame Selector

```typescript
function FrameSelector({ value, onChange }: Props) {
  const { getAllFrames, isLoading } = useTransformSource()

  const frames = getAllFrames()

  if (isLoading) {
    return <div>Loading frames...</div>
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select frame" />
      </SelectTrigger>
      <SelectContent>
        {frames.map(frame => (
          <SelectItem key={frame} value={frame}>
            {frame}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

### TF Tree Visualizer

```typescript
function TFTreeVisualizer() {
  const { getFrameTree } = useTransformSource()

  const tree = getFrameTree()

  const renderNode = (node: FrameNode, depth = 0) => (
    <div key={node.name} style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2">
        <span className="font-mono">{node.name}</span>
        {node.parent && (
          <span className="text-xs text-muted-foreground">
            ← {node.parent}
          </span>
        )}
      </div>
      {node.children.map(child => renderNode(child, depth + 1))}
    </div>
  )

  return (
    <div className="p-4 border rounded">
      <h3 className="font-semibold mb-2">TF Tree</h3>
      {tree.map(rootNode => renderNode(rootNode))}
    </div>
  )
}
```

### Transform Monitor

```typescript
function TransformMonitor({ sourceFrame, targetFrame }: Props) {
  const { lookupTransform, canTransform } = useTransformSource()
  const [transform, setTransform] = useState<TransformStamped | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      const tf = lookupTransform(targetFrame, sourceFrame)
      setTransform(tf)
    }, 100) // Update at 10Hz

    return () => clearInterval(interval)
  }, [sourceFrame, targetFrame, lookupTransform])

  if (!canTransform(sourceFrame, targetFrame)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Transform Unavailable</AlertTitle>
        <AlertDescription>
          No transform from {sourceFrame} to {targetFrame}
        </AlertDescription>
      </Alert>
    )
  }

  if (!transform) {
    return <div>Waiting for transform...</div>
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4 className="font-semibold">Translation</h4>
        <p>X: {transform.translation.x.toFixed(3)}</p>
        <p>Y: {transform.translation.y.toFixed(3)}</p>
        <p>Z: {transform.translation.z.toFixed(3)}</p>
      </div>
      <div>
        <h4 className="font-semibold">Rotation (Quaternion)</h4>
        <p>X: {transform.rotation.x.toFixed(3)}</p>
        <p>Y: {transform.rotation.y.toFixed(3)}</p>
        <p>Z: {transform.rotation.z.toFixed(3)}</p>
        <p>W: {transform.rotation.w.toFixed(3)}</p>
      </div>
    </div>
  )
}
```

### Point Transformer

```typescript
function PointTransformer() {
  const { getTransform } = useTransformSource()
  const [sourceFrame, setSourceFrame] = useState('base_link')
  const [targetFrame, setTargetFrame] = useState('map')
  const [point, setPoint] = useState({ x: 1, y: 0, z: 0 })

  const transformPoint = (
    point: { x: number; y: number; z: number },
    transform: Transform
  ) => {
    // Simplified transform (rotation not applied)
    return {
      x: point.x + transform.translation.x,
      y: point.y + transform.translation.y,
      z: point.z + transform.translation.z,
    }
  }

  const tf = getTransform(sourceFrame, targetFrame)
  const transformedPoint = tf ? transformPoint(point, tf) : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Source Frame</Label>
          <Input value={sourceFrame} onChange={e => setSourceFrame(e.target.value)} />
        </div>
        <div>
          <Label>Target Frame</Label>
          <Input value={targetFrame} onChange={e => setTargetFrame(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Input Point</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={point.x}
            onChange={e => setPoint({ ...point, x: parseFloat(e.target.value) })}
          />
          <Input
            type="number"
            value={point.y}
            onChange={e => setPoint({ ...point, y: parseFloat(e.target.value) })}
          />
          <Input
            type="number"
            value={point.z}
            onChange={e => setPoint({ ...point, z: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      {transformedPoint && (
        <div>
          <Label>Transformed Point</Label>
          <p>X: {transformedPoint.x.toFixed(3)}</p>
          <p>Y: {transformedPoint.y.toFixed(3)}</p>
          <p>Z: {transformedPoint.z.toFixed(3)}</p>
        </div>
      )}
    </div>
  )
}
```

### Frame Hierarchy Breadcrumb

```typescript
function FrameBreadcrumb({ frame }: { frame: string }) {
  const { getFrameTree } = useTransformSource()

  const findPath = (nodes: FrameNode[], target: string): string[] => {
    for (const node of nodes) {
      if (node.name === target) {
        return [target]
      }
      const childPath = findPath(node.children, target)
      if (childPath.length > 0) {
        return [node.name, ...childPath]
      }
    }
    return []
  }

  const tree = getFrameTree()
  const path = findPath(tree, frame)

  return (
    <div className="flex items-center gap-2">
      {path.map((frameName, i) => (
        <React.Fragment key={frameName}>
          {i > 0 && <ChevronRight className="h-4 w-4" />}
          <span className="font-mono">{frameName}</span>
        </React.Fragment>
      ))}
    </div>
  )
}
```

### Transform Validity Checker

```typescript
function TransformValidityDashboard() {
  const { canTransform } = useTransformSource()

  const criticalTransforms = [
    { from: 'map', to: 'odom', label: 'Localization' },
    { from: 'odom', to: 'base_link', label: 'Odometry' },
    { from: 'base_link', to: 'camera_link', label: 'Camera' },
    { from: 'base_link', to: 'lidar_link', label: 'LiDAR' },
  ]

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Transform Status</h3>
      {criticalTransforms.map(({ from, to, label }) => {
        const available = canTransform(from, to)
        return (
          <div key={`${from}-${to}`} className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${available ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm">{label}</span>
            <span className="text-xs text-muted-foreground">
              ({from} → {to})
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

## TransformSourcesProvider

Context provider that manages TF tree state and transform updates.

### Usage

```typescript
import { TransformSourcesProvider } from '@workspace/ui'

function App() {
  return (
    <TransformSourcesProvider>
      <Dashboard />
    </TransformSourcesProvider>
  )
}
```

**Note:** The dashboard automatically includes TransformSourcesProvider when working with ROS systems.

## Best Practices

### 1. Check Transform Availability

```typescript
// Always check before using
const tf = getTransform("map", "base_link");
if (!tf) {
    // Handle missing transform
    return;
}
```

### 2. Use canTransform for Validation

```typescript
// Validate before expensive operations
if (!canTransform(sourceFrame, targetFrame)) {
    toast.error(`Transform ${sourceFrame} → ${targetFrame} not available`);
    return;
}
```

### 3. Handle Missing Transforms

```typescript
function SafeTransformComponent() {
  const { getTransform, canTransform } = useTransformSource()

  if (!canTransform('map', 'base_link')) {
    return <Alert>Waiting for transforms...</Alert>
  }

  const tf = getTransform('map', 'base_link')
  // Safe to use tf
}
```

### 4. Cache Frame Lists

```typescript
// Don't call getAllFrames() on every render
const frames = useMemo(() => getAllFrames(), [getAllFrames]);
```

### 5. Throttle Updates

```typescript
// Throttle high-frequency updates
const [transform, setTransform] = useState<Transform | null>(null);

useEffect(() => {
    const interval = setInterval(() => {
        setTransform(getTransform("map", "base_link"));
    }, 100); // 10Hz instead of every render

    return () => clearInterval(interval);
}, []);
```

## Common Issues

### Transform Not Found

**Problem:** `getTransform()` returns `null`

**Causes:**

- Transform not yet published
- Frame names misspelled
- TF tree not connected

**Solutions:**

- Use `canTransform()` to check availability
- Verify frame names with `getAllFrames()`
- Check TF publisher is running

### Stale Transforms

**Problem:** Transforms don't update

**Causes:**

- TF publisher stopped
- Network connection lost
- Transform source not subscribed

**Solutions:**

- Check `isLoading` status
- Verify datasource connection
- Monitor TF topic activity

### Frame Name Typos

**Problem:** Wrong frame name

**Solution:** Use frame selector:

```typescript
// Instead of hardcoding
const tf = getTransform('base_link', 'map')

// Use dynamic selector
<FrameSelector value={targetFrame} onChange={setTargetFrame} />
```

### Quaternion Math

**Problem:** Need to convert quaternion to Euler angles

**Solution:** Use helper library:

```typescript
import { quaternionToEuler } from "@workspace/utils";

const { rotation } = transform;
const euler = quaternionToEuler(rotation);
console.log(`Roll: ${euler.roll}, Pitch: ${euler.pitch}, Yaw: ${euler.yaw}`);
```

## See Also

- **[Core - Transforms System](../core/transforms)** - TF tree architecture and update mechanisms
- **[Datasource API](./datasource-api)** - Subscribing to TF topics
- **[Widget API](./widget-api)** - Using transforms in widgets
