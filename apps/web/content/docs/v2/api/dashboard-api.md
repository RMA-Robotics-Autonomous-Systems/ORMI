---
title: "Dashboard API"
description: API for managing dashboard state, widgets, and layout
order: 8
---

# Dashboard API

## Overview

The Dashboard API provides functions and atoms for managing dashboard configuration, widget instances, and layout state.

**Use the Dashboard API to:**

- Add/remove widgets programmatically
- Manage widget layout and positions
- Configure dashboard settings
- Control panel visibility
- Manage workspace state

For architectural details on how dashboard state is managed with atoms, see **[Core - Dashboard Integration](../core/dashboard-integration)**.

## Dashboard Configuration

### `dashboardConfigAtom`

Global dashboard settings.

```typescript
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { dashboardConfigAtom } from '@workspace/ormi-core/v2'

// Read configuration
function DashboardSettings() {
  const config = useAtomValue(dashboardConfigAtom)

  return (
    <div>
      <p>Layout: {config.layout}</p>
      <p>Theme: {config.theme}</p>
      <p>Grid Size: {config.gridSize}</p>
    </div>
  )
}

// Update configuration
function ThemeToggle() {
  const setConfig = useSetAtom(dashboardConfigAtom)

  const toggleTheme = () => {
    setConfig(prev => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark'
    }))
  }

  return <button onClick={toggleTheme}>Toggle Theme</button>
}
```

**Configuration interface:**

```typescript
interface DashboardConfig {
    layout: "grid" | "freeform";
    gridSize: number;
    snapToGrid: boolean;
    showToolbar: boolean;
    theme: "light" | "dark";
    autoSave: boolean;
    autoSaveInterval: number; // milliseconds
}
```

## Widget Management

### `widgetsAtom`

List of active widgets in the dashboard.

```typescript
import { useAtom, useSetAtom } from 'jotai'
import { widgetsAtom } from '@workspace/ormi-core/v2'

// Add widget
function AddWidgetButton({ widgetDefinition }) {
  const setWidgets = useSetAtom(widgetsAtom)

  const addWidget = () => {
    const newWidget = {
      id: generateId(),
      definition: widgetDefinition,
      config: widgetDefinition.data, // default config
      createdAt: Date.now()
    }

    setWidgets(prev => [...prev, newWidget])
  }

  return <button onClick={addWidget}>Add Widget</button>
}

// Remove widget
function RemoveWidgetButton({ widgetId }) {
  const setWidgets = useSetAtom(widgetsAtom)

  const removeWidget = () => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId))
  }

  return <button onClick={removeWidget}>Remove</button>
}

// Update widget config
function UpdateWidgetConfig({ widgetId, newConfig }) {
  const setWidgets = useSetAtom(widgetsAtom)

  const updateConfig = () => {
    setWidgets(prev =>
      prev.map(w =>
        w.id === widgetId
          ? { ...w, config: newConfig }
          : w
      )
    )
  }

  return <button onClick={updateConfig}>Update Config</button>
}
```

**Widget instance interface:**

```typescript
interface WidgetInstance {
    id: string;
    definition: WidgetDefinition;
    config: unknown; // Widget-specific configuration
    createdAt: number;
}
```

## Layout Management

### `widgetLayoutAtom`

Widget positions and sizes for grid/freeform layouts.

```typescript
import { useAtom } from 'jotai'
import { widgetLayoutAtom } from '@workspace/ormi-core/v2'

// Update widget position
function MoveWidget({ widgetId, newX, newY }) {
  const [layout, setLayout] = useAtom(widgetLayoutAtom)

  const moveWidget = () => {
    setLayout(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        x: newX,
        y: newY
      }
    }))
  }

  return <button onClick={moveWidget}>Move Widget</button>
}

// Resize widget
function ResizeWidget({ widgetId, newWidth, newHeight }) {
  const setLayout = useSetAtom(widgetLayoutAtom)

  const resizeWidget = () => {
    setLayout(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        width: newWidth,
        height: newHeight
      }
    }))
  }

  return <button onClick={resizeWidget}>Resize</button>
}
```

**Layout interface:**

```typescript
interface WidgetLayout {
    x: number; // Grid X position or pixel X
    y: number; // Grid Y position or pixel Y
    width: number; // Grid columns or pixel width
    height: number; // Grid rows or pixel height
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
}
```

## Panel Management

### `panelsStateAtom`

Control visibility and size of dashboard panels.

```typescript
import { useAtom } from 'jotai'
import { panelsStateAtom } from '@workspace/ormi-core/v2'

// Toggle sidebar
function SidebarToggle() {
  const [panels, setPanels] = useAtom(panelsStateAtom)

  const toggleSidebar = () => {
    setPanels(prev => ({
      ...prev,
      leftSidebar: {
        ...prev.leftSidebar,
        open: !prev.leftSidebar.open
      }
    }))
  }

  return (
    <button onClick={toggleSidebar}>
      {panels.leftSidebar.open ? 'Hide' : 'Show'} Sidebar
    </button>
  )
}

// Resize panel
function ResizePanel({ panel, newSize }) {
  const setPanels = useSetAtom(panelsStateAtom)

  const resize = () => {
    setPanels(prev => ({
      ...prev,
      [panel]: {
        ...prev[panel],
        [panel.includes('Sidebar') ? 'width' : 'height']: newSize
      }
    }))
  }

  return <button onClick={resize}>Resize</button>
}
```

**Panels state interface:**

```typescript
interface PanelsState {
    leftSidebar: { open: boolean; width: number };
    rightSidebar: { open: boolean; width: number };
    bottomPanel: { open: boolean; height: number };
    topBar?: { visible: boolean; height: number };
}
```

## Selected Widget

### `selectedWidgetAtom`

Track currently selected widget for editing.

```typescript
import { useAtom, useAtomValue } from 'jotai'
import { selectedWidgetAtom } from '@workspace/ormi-core/v2'

// Select widget
function WidgetCard({ widget }) {
  const [selected, setSelected] = useAtom(selectedWidgetAtom)

  return (
    <div
      className={selected === widget.id ? 'selected' : ''}
      onClick={() => setSelected(widget.id)}
    >
      {widget.definition.name}
    </div>
  )
}

// Clear selection
function ClearSelection() {
  const setSelected = useSetAtom(selectedWidgetAtom)

  return <button onClick={() => setSelected(null)}>Clear Selection</button>
}

// Show config panel for selected widget
function ConfigPanel() {
  const selectedId = useAtomValue(selectedWidgetAtom)
  const widgets = useAtomValue(widgetsAtom)

  const selectedWidget = widgets.find(w => w.id === selectedId)

  if (!selectedWidget) return <div>No widget selected</div>

  return (
    <div>
      <h3>Configure: {selectedWidget.definition.name}</h3>
      {/* Widget config form */}
    </div>
  )
}
```

## Workspace Management

### `workspaceAtom`

Manage multiple dashboard workspaces.

```typescript
import { useAtom } from 'jotai'
import { workspaceAtom } from '@workspace/ormi-core/v2'

// Save current workspace
function SaveWorkspace() {
  const widgets = useAtomValue(widgetsAtom)
  const layout = useAtomValue(widgetLayoutAtom)
  const config = useAtomValue(dashboardConfigAtom)

  const saveWorkspace = () => {
    const workspace = {
      id: generateId(),
      name: 'My Workspace',
      widgets,
      layout,
      config,
      createdAt: Date.now()
    }

    // Save to localStorage or backend
    localStorage.setItem('workspace', JSON.stringify(workspace))
  }

  return <button onClick={saveWorkspace}>Save Workspace</button>
}

// Load workspace
function LoadWorkspace({ workspaceId }) {
  const setWidgets = useSetAtom(widgetsAtom)
  const setLayout = useSetAtom(widgetLayoutAtom)
  const setConfig = useSetAtom(dashboardConfigAtom)

  const loadWorkspace = () => {
    const workspace = JSON.parse(localStorage.getItem('workspace'))

    setWidgets(workspace.widgets)
    setLayout(workspace.layout)
    setConfig(workspace.config)
  }

  return <button onClick={loadWorkspace}>Load Workspace</button>
}
```

**Workspace interface:**

```typescript
interface Workspace {
    id: string;
    name: string;
    description?: string;
    widgets: WidgetInstance[];
    layout: Record<string, WidgetLayout>;
    config: DashboardConfig;
    datasources?: DatasourceConfig[];
    createdAt: number;
    updatedAt: number;
}
```

## Common Patterns

### Initialize Dashboard

```typescript
function DashboardInitializer() {
    const setWidgets = useSetAtom(widgetsAtom);
    const setConfig = useSetAtom(dashboardConfigAtom);

    useEffect(() => {
        // Load saved workspace or use defaults
        const savedWorkspace = localStorage.getItem("lastWorkspace");

        if (savedWorkspace) {
            const workspace = JSON.parse(savedWorkspace);
            setWidgets(workspace.widgets);
            setConfig(workspace.config);
        } else {
            // Set defaults
            setConfig({
                layout: "grid",
                gridSize: 12,
                snapToGrid: true,
                showToolbar: true,
                theme: "dark",
                autoSave: true,
                autoSaveInterval: 30000,
            });
        }
    }, []);

    return null;
}
```

### Auto-save Workspace

```typescript
function AutoSave() {
    const widgets = useAtomValue(widgetsAtom);
    const layout = useAtomValue(widgetLayoutAtom);
    const config = useAtomValue(dashboardConfigAtom);

    useEffect(() => {
        if (!config.autoSave) return;

        const interval = setInterval(() => {
            const workspace = { widgets, layout, config };
            localStorage.setItem("lastWorkspace", JSON.stringify(workspace));
        }, config.autoSaveInterval);

        return () => clearInterval(interval);
    }, [widgets, layout, config]);

    return null;
}
```

### Widget Drag and Drop

```typescript
function WidgetGrid() {
  const [widgets, setWidgets] = useAtom(widgetsAtom)
  const [layout, setLayout] = useAtom(widgetLayoutAtom)

  const onLayoutChange = (newLayout) => {
    // Convert react-grid-layout format to our format
    const layoutMap = {}
    newLayout.forEach(item => {
      layoutMap[item.i] = {
        x: item.x,
        y: item.y,
        width: item.w,
        height: item.h
      }
    })
    setLayout(layoutMap)
  }

  return (
    <GridLayout
      layout={Object.entries(layout).map(([id, pos]) => ({
        i: id,
        x: pos.x,
        y: pos.y,
        w: pos.width,
        h: pos.height
      }))}
      onLayoutChange={onLayoutChange}
    >
      {widgets.map(widget => (
        <div key={widget.id}>
          <widget.definition.Component {...widget.config} />
        </div>
      ))}
    </GridLayout>
  )
}
```

## See Also

- **[Core - Dashboard Integration](../core/dashboard-integration)** - Architecture and design patterns
- **[Atoms API](./atoms-api)** - All available atoms
- **[Widget API](./widget-api)** - Creating widgets
- **[Templates API](./templates-api)** - Saving/loading configurations
