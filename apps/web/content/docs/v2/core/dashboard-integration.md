---
title: Dashboard Integration with Atoms
description: How V2 dashboard state management uses Jotai atoms instead of nested providers
---

# Dashboard Integration with Atoms

## Overview

In V2, the dashboard completely removes the nested provider architecture that caused circular dependencies in V1. Instead, **each piece of dashboard state becomes an independent Jotai atom**.

This design:

- **Eliminates circular dependencies** between DashboardProvider and GlobalDataSourceProvider
- **Enables flat component hierarchy** - no provider nesting required
- **Improves performance** - components subscribe only to atoms they need
- **Simplifies state updates** - direct atom writes instead of context callbacks

## V1 vs V2 Architecture

### V1 Problem: Nested Providers with Circular Dependency

```tsx
// V1: Circular dependency
<GlobalDataSourceProvider>
    {" "}
    {/* Needs dashboard state */}
    <DashboardProvider>
        {" "}
        {/* Needs datasource state */}
        <TemplatesProvider>
            <App />
        </TemplatesProvider>
    </DashboardProvider>
</GlobalDataSourceProvider>

// Result: "Maximum update depth exceeded" errors
```

### V2 Solution: Flat Hierarchy with Atoms

```tsx
// V2: No providers needed, just atoms
<App />  {/* All state in atoms, no nesting */}
```

## Dashboard State Atoms

Each piece of dashboard state is stored in its own atom:

### Core Dashboard Atoms

```typescript
// Dashboard configuration atom
export const dashboardConfigAtom = atom({
    layout: "grid", // 'grid' | 'freeform'
    gridSize: 12,
    snapToGrid: true,
    showToolbar: true,
    theme: "dark",
});

// Active widgets atom
export const widgetsAtom = atom<WidgetInstance[]>([]);

// Widget layout positions (for grid/freeform layout)
export const widgetLayoutAtom = atom<Record<string, WidgetLayout>>({});

// Dashboard panels state (sidebar, toolbar, etc.)
export const panelsStateAtom = atom({
    leftSidebar: { open: true, width: 300 },
    rightSidebar: { open: false, width: 300 },
    bottomPanel: { open: false, height: 200 },
});

// Selected widget for editing
export const selectedWidgetAtom = atom<string | null>(null);
```

### Datasources Atom (Read by DatasourceManager)

```typescript
// Datasources configuration - the key atom read by DatasourceManager
export const datasourcesAtom = atom<DatasourceConfig[]>([]);

// DatasourceConfig includes settings for each datasource
interface DatasourceConfig {
    id: string;
    type: string; // 'rosbridge', 'rest', 'random', etc.
    enabled: boolean;
    name: string;
    config: Record<string, unknown>; // Type-specific config (URL, topics, etc.)
    priority: number;
}
```

## How Components Use Dashboard Atoms

### Reading Dashboard State

Components use Jotai's `useAtom` or `useAtomValue` hooks:

```typescript
import { useAtomValue } from 'jotai';
import { widgetsAtom, dashboardConfigAtom } from '@/atoms/dashboard';

function DashboardCanvas() {
  // Subscribe to widgets list
  const widgets = useAtomValue(widgetsAtom);

  // Subscribe to config
  const config = useAtomValue(dashboardConfigAtom);

  return (
    <div className={config.layout === 'grid' ? 'grid-layout' : 'freeform'}>
      {widgets.map(widget => (
        <WidgetCard key={widget.id} widget={widget} />
      ))}
    </div>
  );
}
```

### Updating Dashboard State

Components use `useSetAtom` to update atoms:

```typescript
import { useSetAtom } from 'jotai';
import { widgetsAtom } from '@/atoms/dashboard';

function WidgetToolbar() {
  const setWidgets = useSetAtom(widgetsAtom);

  const addWidget = (widgetDef: WidgetDefinition) => {
    setWidgets(prev => [...prev, {
      id: generateId(),
      definition: widgetDef,
      config: widgetDef.schema.default || {},
      createdAt: Date.now()
    }]);
  };

  return <button onClick={() => addWidget(selectedDef)}>Add Widget</button>;
}
```

## DatasourceManager Integration

The **DatasourceManager** is responsible for:

1. **Reading** the `datasourcesAtom`
2. **Creating/destroying** Connection instances based on atom state
3. **Providing abstraction layer** for plugins to interact with datasources

```typescript
// DatasourceManager reads datasources atom
import { useAtomValue } from "jotai";
import { datasourcesAtom } from "@/atoms/dashboard";

function DatasourceManager() {
    const datasources = useAtomValue(datasourcesAtom);

    useEffect(() => {
        // Create connections for enabled datasources
        const connections = datasources
            .filter((ds) => ds.enabled)
            .map((ds) => createConnection(ds));

        // Cleanup on unmount or when datasources change
        return () => connections.forEach((conn) => conn.disconnect());
    }, [datasources]);

    return null; // Manager is headless
}
```

See [DatasourceManager API](/docs/v2/core/datasource-manager.md) for complete details.

## Dashboard Settings Persistence

### Saving Dashboard State

```typescript
import { useAtomValue } from "jotai";
import {
    dashboardConfigAtom,
    widgetsAtom,
    datasourcesAtom,
} from "@/atoms/dashboard";

function useSaveDashboard() {
    const config = useAtomValue(dashboardConfigAtom);
    const widgets = useAtomValue(widgetsAtom);
    const datasources = useAtomValue(datasourcesAtom);

    const saveDashboard = async (name: string) => {
        const snapshot = {
            name,
            config,
            widgets,
            datasources,
            savedAt: Date.now(),
        };

        await fetch("/api/dashboards", {
            method: "POST",
            body: JSON.stringify(snapshot),
        });
    };

    return { saveDashboard };
}
```

### Loading Dashboard State

```typescript
import { useSetAtom } from "jotai";
import {
    dashboardConfigAtom,
    widgetsAtom,
    datasourcesAtom,
} from "@/atoms/dashboard";

function useLoadDashboard() {
    const setConfig = useSetAtom(dashboardConfigAtom);
    const setWidgets = useSetAtom(widgetsAtom);
    const setDatasources = useSetAtom(datasourcesAtom);

    const loadDashboard = async (id: string) => {
        const snapshot = await fetch(`/api/dashboards/${id}`).then((r) =>
            r.json()
        );

        // Restore all dashboard state from snapshot
        setConfig(snapshot.config);
        setWidgets(snapshot.widgets);
        setDatasources(snapshot.datasources);
    };

    return { loadDashboard };
}
```

## Dashboard Actions API

V2 provides a set of composable actions for dashboard manipulation:

```typescript
import { useSetAtom } from "jotai";
import { widgetsAtom, widgetLayoutAtom } from "@/atoms/dashboard";

export function useDashboardActions() {
    const setWidgets = useSetAtom(widgetsAtom);
    const setLayout = useSetAtom(widgetLayoutAtom);

    return {
        // Add widget
        addWidget(definition: WidgetDefinition, config?: unknown) {
            setWidgets((prev) => [
                ...prev,
                {
                    id: generateId(),
                    definition,
                    config: config || definition.schema.default || {},
                    createdAt: Date.now(),
                },
            ]);
        },

        // Remove widget
        removeWidget(id: string) {
            setWidgets((prev) => prev.filter((w) => w.id !== id));
            setLayout((prev) => {
                const { [id]: _, ...rest } = prev;
                return rest;
            });
        },

        // Update widget config
        updateWidgetConfig(id: string, config: unknown) {
            setWidgets((prev) =>
                prev.map((w) => (w.id === id ? { ...w, config } : w))
            );
        },

        // Move widget (grid/freeform)
        moveWidget(id: string, layout: WidgetLayout) {
            setLayout((prev) => ({ ...prev, [id]: layout }));
        },

        // Clone widget
        cloneWidget(id: string) {
            setWidgets((prev) => {
                const widget = prev.find((w) => w.id === id);
                if (!widget) return prev;

                return [
                    ...prev,
                    {
                        ...widget,
                        id: generateId(),
                        createdAt: Date.now(),
                    },
                ];
            });
        },
    };
}
```

## Datasource Configuration UI

The datasource configuration UI reads/writes the `datasourcesAtom`:

```typescript
import { useAtom } from 'jotai';
import { datasourcesAtom } from '@/atoms/dashboard';

function DatasourceSettings() {
  const [datasources, setDatasources] = useAtom(datasourcesAtom);

  const addDatasource = (type: string) => {
    setDatasources(prev => [...prev, {
      id: generateId(),
      type,
      enabled: true,
      name: `${type}-${Date.now()}`,
      config: {},
      priority: 0
    }]);
  };

  const toggleDatasource = (id: string) => {
    setDatasources(prev => prev.map(ds =>
      ds.id === id ? { ...ds, enabled: !ds.enabled } : ds
    ));
  };

  const removeDatasource = (id: string) => {
    setDatasources(prev => prev.filter(ds => ds.id !== id));
  };

  return (
    <div>
      <h2>Datasources</h2>
      {datasources.map(ds => (
        <DatasourceCard
          key={ds.id}
          datasource={ds}
          onToggle={() => toggleDatasource(ds.id)}
          onRemove={() => removeDatasource(ds.id)}
        />
      ))}
      <button onClick={() => addDatasource('rosbridge')}>
        Add ROSBridge
      </button>
    </div>
  );
}
```

## Performance Considerations

### Selective Subscriptions

Components only re-render when atoms they subscribe to change:

```typescript
// Only re-renders when config.theme changes
const theme = useAtomValue(
    useMemo(() => selectAtom(dashboardConfigAtom, (c) => c.theme), [])
);

// Only re-renders when widget count changes
const widgetCount = useAtomValue(
    useMemo(() => selectAtom(widgetsAtom, (w) => w.length), [])
);
```

### Atom Families for Widget State

For per-widget state, use atom families:

```typescript
import { atomFamily } from "jotai/utils";

// Each widget gets its own atom
export const widgetConfigAtomFamily = atomFamily((widgetId: string) =>
    atom<WidgetConfig | null>(null)
);

// Usage in widget
function WidgetCard({ id }: { id: string }) {
    const [config, setConfig] = useAtom(widgetConfigAtomFamily(id));
    // Only this widget re-renders when its config changes
}
```

## Migration from V1

### Before (V1 - Nested Providers)

```tsx
function App() {
    return (
        <GlobalDataSourceProvider>
            <DashboardProvider>
                <TemplatesProvider>
                    <Dashboard />
                </TemplatesProvider>
            </DashboardProvider>
        </GlobalDataSourceProvider>
    );
}
```

### After (V2 - Atoms)

```tsx
function App() {
    return (
        <>
            <DatasourceManager /> {/* Reads datasourcesAtom */}
            <Dashboard /> {/* Uses dashboard atoms directly */}
        </>
    );
}
```

## Complete Example: Dashboard State Management

```typescript
// atoms/dashboard.ts
import { atom } from 'jotai';

export const dashboardConfigAtom = atom({
  layout: 'grid' as 'grid' | 'freeform',
  gridSize: 12,
  snapToGrid: true
});

export const widgetsAtom = atom<WidgetInstance[]>([]);

export const datasourcesAtom = atom<DatasourceConfig[]>([
  {
    id: 'rosbridge-1',
    type: 'rosbridge',
    enabled: true,
    name: 'Local ROS',
    config: { url: 'ws://localhost:9090' },
    priority: 0
  }
]);

// components/Dashboard.tsx
import { useAtomValue } from 'jotai';
import { widgetsAtom, dashboardConfigAtom } from '@/atoms/dashboard';

export function Dashboard() {
  const widgets = useAtomValue(widgetsAtom);
  const config = useAtomValue(dashboardConfigAtom);

  return (
    <div className={`dashboard-${config.layout}`}>
      {widgets.map(widget => (
        <WidgetCard key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

// components/DatasourceManager.tsx
import { useAtomValue } from 'jotai';
import { datasourcesAtom } from '@/atoms/dashboard';
import { useConnections } from '@/hooks/useConnections';

export function DatasourceManager() {
  const datasources = useAtomValue(datasourcesAtom);

  // Creates/destroys connections based on datasources atom
  useConnections(datasources);

  return null; // Headless component
}

// App.tsx
export default function App() {
  return (
    <>
      <DatasourceManager />
      <Dashboard />
    </>
  );
}
```

## API Reference

### Dashboard Atoms

| Atom                  | Type                           | Description                                           |
| --------------------- | ------------------------------ | ----------------------------------------------------- |
| `dashboardConfigAtom` | `DashboardConfig`              | Global dashboard settings (layout, theme, etc.)       |
| `widgetsAtom`         | `WidgetInstance[]`             | List of active widgets in dashboard                   |
| `widgetLayoutAtom`    | `Record<string, WidgetLayout>` | Position/size for each widget                         |
| `datasourcesAtom`     | `DatasourceConfig[]`           | Datasource configurations (read by DatasourceManager) |
| `panelsStateAtom`     | `PanelsState`                  | UI panels visibility/sizing                           |
| `selectedWidgetAtom`  | `string \| null`               | Currently selected widget ID                          |

### Hooks

| Hook                    | Description                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `useDashboardActions()` | Returns actions for manipulating dashboard (add/remove/update widgets) |
| `useSaveDashboard()`    | Saves current dashboard state to persistence                           |
| `useLoadDashboard(id)`  | Loads dashboard state from persistence                                 |

### Types

```typescript
interface DashboardConfig {
    layout: "grid" | "freeform";
    gridSize: number;
    snapToGrid: boolean;
    showToolbar: boolean;
    theme: "light" | "dark";
}

interface WidgetInstance {
    id: string;
    definition: WidgetDefinition;
    config: unknown;
    createdAt: number;
}

interface WidgetLayout {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface DatasourceConfig {
    id: string;
    type: string;
    enabled: boolean;
    name: string;
    config: Record<string, unknown>;
    priority: number;
}

interface PanelsState {
    leftSidebar: { open: boolean; width: number };
    rightSidebar: { open: boolean; width: number };
    bottomPanel: { open: boolean; height: number };
}
```

## Best Practices

1. **Use selective subscriptions**: Use `selectAtom` to subscribe to specific parts of atoms
2. **Batch updates**: Use `set()` callback form for atomic updates: `setAtom(prev => ({ ...prev, newValue }))`
3. **Avoid derived state**: Use derived atoms instead of duplicating state
4. **Persist carefully**: Only persist user-facing state, not runtime state
5. **Initialize wisely**: Set sensible defaults in atom definitions

## Next Steps

- [DatasourceManager API](/docs/v2/core/datasource-manager.md) - How DatasourceManager reads atoms
- [Atoms API](/docs/v2/api/atoms-api.md) - Complete atom families reference
- [Templates System](/docs/v2/core/templates.md) - Templates using atoms
- [Connection API](/docs/v2/api/connection-api.md) - How Connections are created
