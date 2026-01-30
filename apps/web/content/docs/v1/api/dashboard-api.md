---
title: "Dashboard API"
description: API for managing dashboard state and widgets
order: 8
---

# Dashboard API

## Overview

The Dashboard API provides centralized state management for widgets, datasources, and layout configurations across different dashboard styles (Grid, Dock, Flex).

**Use Dashboard API to:**

- Add/remove/update widgets
- Manage datasources
- Control dashboard layout
- Save/load dashboard state
- Toggle edit/lock mode

For architectural details on dashboard state management and layout integration, see **[Core - Dashboard System](../core/dashboard-system)**.

## useDashboardManager Hook

Legacy hook for accessing the full dashboard state and operations.

### Signature

```typescript
function useDashboardManager(): {
	// State
	widgets: Map<string, Widget>;
	datasources: Map<string, Datasource>;
	layouts: Record<string, any>;
	locked: boolean;
	hasChanged: boolean;

	// Widget operations
	addWidget: (widget: Widget) => void;
	removeWidget: (widgetId: string) => void;
	updateWidget: (widgetId: string, updates: Partial<Widget>) => void;
	getComponents: () => WidgetComponent[];
	getDefinition: (widgetTypeId: string) => WidgetDefinition | undefined;

	// Layout operations
	updateLayouts: (layoutType: string, layout: any) => void;
	lockUnLockDashboard: () => void;

	// Datasource operations
	addDatasource: (datasource: Datasource) => void;
	removeDatasource: (datasourceId: string) => void;
	updateDatasource: (
		datasourceId: string,
		updates: Partial<Datasource>,
	) => void;

	// Persistence
	saveDashboard: () => Promise<void>;
};
```

### Widget Type

```typescript
interface Widget {
	id: string;
	type: string;
	settings: Record<string, any>;
	layout?: {
		x: number;
		y: number;
		w: number;
		h: number;
	};
}
```

### Datasource Type

```typescript
interface Datasource {
	id: string;
	type: string;
	config: Record<string, any>;
	connected: boolean;
}
```

## useDashboardActions Hook

Preferred hook for mutations without subscribing to full state.

### Signature

```typescript
function useDashboardActions(): {
	getDefinition: (widgetTypeId: string) => WidgetDefinition;
	addWidget: (widget: WidgetDefinition, settings: any) => void;
	removeWidget: (widgetId: string) => void;
	updateWidget: (widgetId: string, settings: any) => void;
	updateLayouts: (layouts: Record<string, any>) => void;
	lockUnLockDashboard: () => void;
	savesDashboard: () => Promise<void>;
	addDatasource: (
		datasourceId: string,
		settings?: DatasourceProviderSettings,
	) => void;
	removeDatasource: (datasourceId: string) => void;
	updateDatasource: (
		datasourceId: string,
		settings: DatasourceProviderSettings,
	) => void;
	dispatch: React.Dispatch<any>;
};
```

## Dashboard State Atoms

Preferred for rendering to avoid layout-driven rerenders.

```typescript
import { useAtomValue } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	hasChangedAtom,
	forceReloadAtom,
	datasourcesAtom,
	widgetAtomFamily,
} from "@workspace/ormi-core/dashboard/atoms";

const widgets = useAtomValue(widgetsAtom);
const layouts = useAtomValue(layoutsAtom);
const locked = useAtomValue(lockedAtom);
const hasChanged = useAtomValue(hasChangedAtom);
const datasources = useAtomValue(datasourcesAtom);

const widget = useAtomValue(widgetAtomFamily(widgetId));
```

## Basic Usage

### Add Widget

```typescript
import { useDashboardActions } from '@workspace/ormi-core/dashboard'

function AddWidgetButton() {
  const { addWidget } = useDashboardActions()

  const handleAdd = () => {
    addWidget({
      id: `widget-${Date.now()}`,
      type: 'camera-feed',
      settings: {
        topic: '/camera/image',
        quality: 'high',
      },
      layout: {
        x: 0,
        y: 0,
        w: 6,
        h: 4,
      },
    })
  }

  return <Button onClick={handleAdd}>Add Camera Widget</Button>
}
```

### Remove Widget

```typescript
function RemoveWidgetButton({ widgetId }: { widgetId: string }) {
  const { removeWidget } = useDashboardActions()

  const handleRemove = () => {
    if (confirm('Remove this widget?')) {
      removeWidget(widgetId)
    }
  }

  return (
    <Button variant="destructive" onClick={handleRemove}>
      Remove
    </Button>
  )
}
```

### Update Widget Settings

```typescript
function WidgetSettings({ widgetId }: { widgetId: string }) {
  const { updateWidget } = useDashboardActions()
  const widget = useAtomValue(widgetAtomFamily(widgetId))

  if (!widget) return null

  const handleUpdateTopic = (topic: string) => {
    updateWidget(widgetId, {
      settings: {
        ...widget.settings,
        topic,
      },
    })
  }

  return (
    <div>
      <Label>Topic</Label>
      <Input
        value={widget.settings.topic}
        onChange={e => handleUpdateTopic(e.target.value)}
      />
    </div>
  )
}
```

## Common Patterns

### Widget Gallery

```typescript
function WidgetGallery() {
  const { addWidget, getDefinition } = useDashboardActions()
  const availableWidgets = useAtomValue(widgetsAtom)

  const handleAddWidget = (widgetType: string) => {
    addWidget({
      id: `widget-${Date.now()}`,
      type: widgetType,
      settings: {},
      layout: { x: 0, y: 0, w: 4, h: 3 },
    })
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {availableWidgets.map(({ id, name, description, icon }) => (
        <Card key={id} className="cursor-pointer" onClick={() => handleAddWidget(id)}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle>{name}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

### Dashboard Lock Toggle

```typescript
function DashboardLockToggle() {
  const locked = useAtomValue(lockedAtom)
  const { lockUnLockDashboard } = useDashboardActions()

  return (
    <Button
      variant={locked ? 'default' : 'outline'}
      onClick={lockUnLockDashboard}
    >
      {locked ? (
        <>
          <Lock className="mr-2 h-4 w-4" />
          Locked
        </>
      ) : (
        <>
          <Unlock className="mr-2 h-4 w-4" />
          Unlocked
        </>
      )}
    </Button>
  )
}
```

### Save Dashboard Button

```typescript
function SaveDashboardButton() {
  const hasChanged = useAtomValue(hasChangedAtom)
  const { savesDashboard } = useDashboardActions()
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await savesDashboard()
      toast.success('Dashboard saved')
    } catch (error) {
      toast.error('Failed to save dashboard')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Button
      onClick={handleSave}
      disabled={!hasChanged || saving}
    >
      {saving ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Save className="mr-2 h-4 w-4" />
          Save Dashboard
        </>
      )}
    </Button>
  )
}
```

### Widget List Manager

```typescript
function WidgetListManager() {
  const { widgets, removeWidget, updateWidget } = useDashboard()

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Active Widgets</h3>
      {Array.from(widgets.entries()).map(([id, widget]) => (
        <div key={id} className="flex items-center justify-between p-2 border rounded">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{widget.type}</span>
            <span className="text-xs text-muted-foreground">({id})</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                /* Open settings */
              }}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => removeWidget(id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Datasource Manager

```typescript
function DatasourceManager() {
  const { datasources, addDatasource, removeDatasource, updateDatasource } = useDashboard()
  const [newDatasource, setNewDatasource] = useState({
    type: 'rosbridge',
    url: 'ws://localhost:9090',
  })

  const handleAdd = () => {
    addDatasource({
      id: `datasource-${Date.now()}`,
      type: newDatasource.type,
      config: { url: newDatasource.url },
      connected: false,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold mb-2">Add Datasource</h3>
        <div className="flex gap-2">
          <Select value={newDatasource.type} onValueChange={type => setNewDatasource({ ...newDatasource, type })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rosbridge">ROS Bridge</SelectItem>
              <SelectItem value="rest">REST API</SelectItem>
              <SelectItem value="websocket">WebSocket</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="URL"
            value={newDatasource.url}
            onChange={e => setNewDatasource({ ...newDatasource, url: e.target.value })}
          />
          <Button onClick={handleAdd}>Add</Button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Active Datasources</h3>
        {Array.from(datasources.entries()).map(([id, datasource]) => (
          <div key={id} className="flex items-center justify-between p-2 border rounded mb-2">
            <div>
              <span className="font-medium">{datasource.type}</span>
              <div className="text-xs text-muted-foreground">{datasource.config.url}</div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  datasource.connected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <Button size="sm" variant="destructive" onClick={() => removeDatasource(id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Layout Persistence

```typescript
function DashboardWithAutosave() {
  const { hasChanged, saveDashboard } = useDashboard()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Auto-save when changes detected
  useEffect(() => {
    if (!hasChanged) return

    const timeout = setTimeout(async () => {
      await saveDashboard()
      setLastSaved(new Date())
    }, 5000) // Save after 5 seconds of inactivity

    return () => clearTimeout(timeout)
  }, [hasChanged, saveDashboard])

  return (
    <div>
      {lastSaved && (
        <div className="text-xs text-muted-foreground">
          Auto-saved at {lastSaved.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
```

### Widget Definition Lookup

```typescript
function WidgetInfo({ widgetTypeId }: { widgetTypeId: string }) {
  const { getDefinition } = useDashboard()
  const definition = getDefinition(widgetTypeId)

  if (!definition) {
    return <div>Widget type not found</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{definition.name}</CardTitle>
        <CardDescription>{definition.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <span className="font-medium">Category:</span> {definition.category}
          </div>
          <div>
            <span className="font-medium">Settings Schema:</span>
            <pre className="text-xs">{JSON.stringify(definition.settingsSchema, null, 2)}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

## DashboardProvider

Context provider that manages all dashboard state.

### Usage

```typescript
import { DashboardProvider } from '@workspace/ui'

function App() {
  return (
    <DashboardProvider>
      <Dashboard />
    </DashboardProvider>
  )
}
```

**Note:** The main app already wraps your dashboard with DashboardProvider.

## Best Practices

### 1. Use Unique Widget IDs

```typescript
// Good: Timestamp-based unique ID
const widgetId = `widget-${Date.now()}-${Math.random()}`;

// Bad: Sequential numbers (conflicts possible)
const widgetId = `widget-${widgets.size + 1}`;
```

### 2. Validate Before Adding Widgets

```typescript
const handleAddWidget = (widgetType: string) => {
	const definition = getDefinition(widgetType);
	if (!definition) {
		toast.error("Widget type not found");
		return;
	}

	addWidget({
		id: generateId(),
		type: widgetType,
		settings: definition.defaultSettings || {},
	});
};
```

### 3. Confirm Destructive Actions

```typescript
const handleRemove = (widgetId: string) => {
	if (confirm("Remove this widget? This action cannot be undone.")) {
		removeWidget(widgetId);
	}
};
```

### 4. Handle Save Errors

```typescript
const handleSave = async () => {
	try {
		await saveDashboard();
		toast.success("Dashboard saved");
	} catch (error) {
		toast.error("Failed to save dashboard");
		console.error(error);
	}
};
```

### 5. Update Settings Immutably

```typescript
// Good: Create new settings object
updateWidget(widgetId, {
	settings: {
		...widget.settings,
		topic: newTopic,
	},
});

// Bad: Mutate existing object
widget.settings.topic = newTopic;
```

## Common Issues

### Widget Not Appearing

**Problem:** Widget added but doesn't render

**Causes:**

- Widget type not registered
- Missing required settings
- Layout position off-screen

**Solutions:**

- Verify widget type exists with `getDefinition()`
- Check required settings in widget schema
- Set valid layout coordinates

### Layout Not Persisting

**Problem:** Layout resets after refresh

**Causes:**

- `saveDashboard()` not called
- localStorage quota exceeded
- Browser privacy mode

**Solutions:**

- Call `saveDashboard()` after layout changes
- Check for storage errors
- Implement server-side persistence

### Settings Not Updating

**Problem:** Widget settings don't reflect changes

**Cause:** Not updating widget properly

**Solution:** Use `updateWidget()` with complete settings:

```typescript
updateWidget(widgetId, {
	settings: {
		...currentSettings,
		newField: newValue,
	},
});
```

### Multiple Dashboard Instances

**Problem:** Multiple dashboards interfere

**Solution:** Use separate DashboardProvider for each:

```typescript
<DashboardProvider key="dashboard-1">
  <Dashboard />
</DashboardProvider>

<DashboardProvider key="dashboard-2">
  <Dashboard />
</DashboardProvider>
```

## See Also

- **[Core - Dashboard System](../core/dashboard-system)** - Dashboard architecture and state management
- **[Widget API](./widget-api)** - Creating and configuring widgets
- **[Datasource API](./datasource-api)** - Managing data connections
- **[Templates API](./templates-api)** - Saving/loading dashboard templates
