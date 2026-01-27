---
title: "ButtonHolder API"
description: API for adding controls to widget title bars
order: 4
---

# ButtonHolder API

## Overview

The ButtonHolder API allows widgets to register interactive controls (buttons, dropdowns, etc.) that appear in the widget's title bar or header area, keeping the widget content area clean.

**Use ButtonHolder to:**

- Add toolbar buttons to widgets
- Provide quick actions in title bar
- Show dropdowns and toggles
- Register priority-ordered controls

For architectural details on how ButtonHolder works with portals and layout systems, see **[Core - ButtonHolder System](../core/button-holder)**.

## useButtonHolder Hook

Main hook for registering controls from within a widget.

### Signature

```typescript
function useButtonHolder(): {
  setButtonItem: (
    key: string,
    component: JSX.Element,
    priority?: number,
  ) => void;
  removeButtonItem: (key: string) => void;
};
```

### Basic Usage

```typescript
import { useButtonHolder } from '@workspace/ui'

function MyWidget() {
  const { setButtonItem, removeButtonItem } = useButtonHolder()

  useEffect(() => {
    // Register a button
    setButtonItem(
      'refresh',
      <button onClick={handleRefresh}>
        <RefreshIcon />
      </button>,
      10 // priority (higher = more left)
    )

    // Cleanup on unmount
    return () => {
      removeButtonItem('refresh')
    }
  }, [])

  return <div>Widget content...</div>
}
```

### Parameters

**`setButtonItem(key, component, priority)`**

- `key` (string): Unique identifier for this button
- `component` (JSX.Element): React component to render
- `priority` (number, optional): Display order (default: 5, higher values appear left)

**`removeButtonItem(key)`**

- `key` (string): Identifier of button to remove

## Common Patterns

### Refresh Button

```typescript
function DataWidget() {
  const { setButtonItem, removeButtonItem } = useButtonHolder()
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    await fetchData()
    setLoading(false)
  }

  useEffect(() => {
    setButtonItem(
      'refresh',
      <Button
        onClick={handleRefresh}
        disabled={loading}
        size="sm"
        variant="ghost"
      >
        <RefreshCw className={loading ? 'animate-spin' : ''} />
      </Button>,
      10
    )

    return () => removeButtonItem('refresh')
  }, [loading])

  return <div>{/* Widget content */}</div>
}
```

### Toggle Button

```typescript
function ChartWidget() {
  const { setButtonItem, removeButtonItem } = useButtonHolder()
  const [showLegend, setShowLegend] = useState(true)

  useEffect(() => {
    setButtonItem(
      'toggle-legend',
      <Button
        onClick={() => setShowLegend(prev => !prev)}
        size="sm"
        variant={showLegend ? 'default' : 'outline'}
      >
        Legend
      </Button>,
      8
    )

    return () => removeButtonItem('toggle-legend')
  }, [showLegend])

  return (
    <div>
      <Chart data={data} showLegend={showLegend} />
    </div>
  )
}
```

### Dropdown Menu

```typescript
function MapWidget() {
  const { setButtonItem, removeButtonItem } = useButtonHolder()
  const [mapStyle, setMapStyle] = useState('satellite')

  useEffect(() => {
    setButtonItem(
      'map-style',
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <LayersIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setMapStyle('satellite')}>
            Satellite
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMapStyle('terrain')}>
            Terrain
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMapStyle('streets')}>
            Streets
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
      7
    )

    return () => removeButtonItem('map-style')
  }, [])

  return <Map style={mapStyle} />
}
```

### Multiple Buttons with Priorities

```typescript
function CameraWidget() {
  const { setButtonItem, removeButtonItem } = useButtonHolder()

  useEffect(() => {
    // Take snapshot (priority 10 - leftmost)
    setButtonItem(
      'snapshot',
      <Button size="sm" onClick={takeSnapshot}>
        <Camera />
      </Button>,
      10
    )

    // Record video (priority 9)
    setButtonItem(
      'record',
      <Button size="sm" onClick={toggleRecording}>
        <Video />
      </Button>,
      9
    )

    // Settings (priority 5 - rightmost)
    setButtonItem(
      'settings',
      <Button size="sm" onClick={openSettings}>
        <Settings />
      </Button>,
      5
    )

    return () => {
      removeButtonItem('snapshot')
      removeButtonItem('record')
      removeButtonItem('settings')
    }
  }, [])

  return <VideoFeed />
}
```

### Button with State Updates

```typescript
function SensorWidget() {
  const { setButtonItem, removeButtonItem } = useButtonHolder()
  const [isPaused, setIsPaused] = useState(false)

  // Re-register button when state changes
  useEffect(() => {
    setButtonItem(
      'pause',
      <Button
        size="sm"
        onClick={() => setIsPaused(prev => !prev)}
        variant={isPaused ? 'destructive' : 'default'}
      >
        {isPaused ? <Play /> : <Pause />}
      </Button>,
      10
    )

    return () => removeButtonItem('pause')
  }, [isPaused]) // Re-run when isPaused changes

  return <SensorDisplay paused={isPaused} />
}
```

## ButtonHolder Component

The component that renders registered buttons in the title bar. Used by layout systems.

### Usage in Layout Systems

```typescript
import { ButtonHolder } from '@workspace/ui'

// In widget title bar
function WidgetHeader({ widgetId }) {
  return (
    <div className="widget-header">
      <h3>Widget Title</h3>
      <div className="widget-actions">
        <ButtonHolder />
      </div>
    </div>
  )
}
```

**Note:** Layout systems (React-Grid-Layout, RC-Dock, FlexLayout) already integrate ButtonHolder. You typically don't need to use this component directly unless creating a custom layout.

## ButtonHolderProvider

Context provider that manages button registration state. Wraps the widget component.

### Usage

```typescript
import { ButtonHolderProvider } from '@workspace/ui'

// Wrap your widget
function WrappedWidget(props) {
  return (
    <ButtonHolderProvider>
      <MyWidget {...props} />
    </ButtonHolderProvider>
  )
}
```

**Note:** The dashboard automatically wraps widgets with ButtonHolderProvider. You only need this if rendering widgets outside the dashboard context.

## Best Practices

### 1. Always Cleanup

```typescript
useEffect(() => {
  setButtonItem('my-button', <Button>Click</Button>)

  // REQUIRED: Remove on unmount
  return () => {
    removeButtonItem('my-button')
  }
}, [])
```

### 2. Update on State Changes

```typescript
// Re-register when dependencies change
useEffect(() => {
  setButtonItem('my-button', <Button disabled={loading}>Action</Button>)
  return () => removeButtonItem('my-button')
}, [loading]) // Update when loading changes
```

### 3. Use Meaningful Keys

```typescript
// Good: Descriptive keys
setButtonItem('refresh-data', ...)
setButtonItem('toggle-legend', ...)
setButtonItem('export-csv', ...)

// Bad: Generic keys
setButtonItem('button1', ...)
setButtonItem('btn', ...)
```

### 4. Set Appropriate Priorities

```typescript
// Higher priority = more left
setButtonItem('primary-action', <Button />, 10)  // Leftmost
setButtonItem('secondary-action', <Button />, 8)
setButtonItem('settings', <Button />, 5)          // Rightmost
```

### 5. Keep Buttons Small

```typescript
// Use small size for title bar buttons
<Button size="sm" variant="ghost">
  <Icon className="h-4 w-4" />
</Button>
```

## Common Issues

### Buttons Not Appearing

**Problem:** Buttons don't show in title bar

**Solutions:**

- Ensure widget is wrapped in `ButtonHolderProvider`
- Check that layout system supports ButtonHolder
- Verify button registration happens after mount

### Buttons Not Updating

**Problem:** Button state doesn't change

**Solution:** Re-register button in useEffect with state dependencies:

```typescript
useEffect(() => {
  setButtonItem('my-button', <Button disabled={loading}>Act</Button>)
  return () => removeButtonItem('my-button')
}, [loading]) // Add dependencies
```

### Memory Leaks

**Problem:** Buttons remain after widget unmounts

**Solution:** Always return cleanup function:

```typescript
useEffect(() => {
  setButtonItem(...)
  return () => removeButtonItem(...) // Required!
}, [])
```

## See Also

- **[Core - ButtonHolder System](../core/button-holder)** - Architecture and implementation details
- **[Widget API](./widget-api)** - Creating widgets
- **[Dashboard System](../core/dashboard-system)** - How widgets integrate with dashboard
