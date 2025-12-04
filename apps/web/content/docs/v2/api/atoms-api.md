---
title: Atoms API
description: Complete reference for Jotai atoms in V2 architecture
---

# Atoms API

## Overview

V2 uses [Jotai](https://jotai.org/) atoms as the primary state management system. This page documents all atoms used in the system, their structure, and usage patterns.

**Key Principle**: Atoms replace nested providers from V1, enabling:

- **Flat component hierarchy** - no provider nesting
- **Granular subscriptions** - components only re-render when their atoms change
- **Composability** - atoms can derive from other atoms
- **Testability** - atoms can be tested in isolation

## Atom Categories

### 1. Dashboard State Atoms

### 2. Datasource Atoms

### 3. Data Stream Atoms (Atom Families)

### 4. Widget State Atoms

### 5. Template Atoms

### 6. Transform Atoms

### 7. UI State Atoms

---

## 1. Dashboard State Atoms

Atoms for global dashboard configuration and state.

### `dashboardConfigAtom`

Global dashboard settings.

```typescript
import { atom } from "jotai";

export const dashboardConfigAtom = atom({
    layout: "grid" as "grid" | "freeform",
    gridSize: 12,
    snapToGrid: true,
    showToolbar: true,
    theme: "dark" as "light" | "dark",
    autoSave: true,
    autoSaveInterval: 30000, // 30 seconds
});

// Usage
const config = useAtomValue(dashboardConfigAtom);
const setConfig = useSetAtom(dashboardConfigAtom);

// Update single property
setConfig((prev) => ({ ...prev, theme: "light" }));
```

### `widgetsAtom`

List of active widgets in the dashboard.

```typescript
export const widgetsAtom = atom<WidgetInstance[]>([]);

interface WidgetInstance {
    id: string;
    definition: WidgetDefinition;
    config: unknown;
    createdAt: number;
}

// Usage
const widgets = useAtomValue(widgetsAtom);
const setWidgets = useSetAtom(widgetsAtom);

// Add widget
setWidgets((prev) => [...prev, newWidget]);

// Remove widget
setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
```

### `widgetLayoutAtom`

Position and size for each widget in grid/freeform layout.

```typescript
export const widgetLayoutAtom = atom<Record<string, WidgetLayout>>({});

interface WidgetLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
}

// Usage
const layout = useAtomValue(widgetLayoutAtom);
const setLayout = useSetAtom(widgetLayoutAtom);

// Update widget position
setLayout((prev) => ({
    ...prev,
    [widgetId]: { x: 10, y: 20, width: 400, height: 300 },
}));
```

### `panelsStateAtom`

UI panels visibility and sizing (sidebars, toolbars, etc.).

```typescript
export const panelsStateAtom = atom({
    leftSidebar: { open: true, width: 300 },
    rightSidebar: { open: false, width: 300 },
    bottomPanel: { open: false, height: 200 },
    toolbar: { visible: true },
});

// Usage
const panels = useAtomValue(panelsStateAtom);
const setPanels = useSetAtom(panelsStateAtom);

// Toggle sidebar
setPanels((prev) => ({
    ...prev,
    leftSidebar: { ...prev.leftSidebar, open: !prev.leftSidebar.open },
}));
```

### `selectedWidgetAtom`

Currently selected widget ID (for editing/focusing).

```typescript
export const selectedWidgetAtom = atom<string | null>(null);

// Usage
const selectedId = useAtomValue(selectedWidgetAtom);
const setSelectedId = useSetAtom(selectedWidgetAtom);

// Select widget
setSelectedId(widgetId);

// Deselect
setSelectedId(null);
```

---

## 2. Datasource Atoms

Atoms for managing datasource configurations and connections.

### `datasourcesAtom`

**Core atom read by DatasourceManager** - stores all datasource configurations.

```typescript
export const datasourcesAtom = atom<DatasourceConfig[]>([]);

interface DatasourceConfig {
    id: string;
    type: string; // 'rosbridge', 'rest', 'random', etc.
    enabled: boolean;
    name: string;
    config: Record<string, unknown>; // Type-specific config
    priority: number;
}

// Usage
const datasources = useAtomValue(datasourcesAtom);
const setDatasources = useSetAtom(datasourcesAtom);

// Add datasource
setDatasources((prev) => [...prev, newDatasource]);

// Toggle datasource
setDatasources((prev) =>
    prev.map((ds) => (ds.id === id ? { ...ds, enabled: !ds.enabled } : ds))
);
```

### `datasourceStatusAtomFamily`

Per-datasource connection status tracking (atom family).

```typescript
import { atomFamily } from "jotai/utils";

export const datasourceStatusAtomFamily = atomFamily((datasourceId: string) =>
    atom<ConnectionStatus>({
        state: "disconnected",
        connectedAt: null,
        error: null,
        stats: {
            messagesReceived: 0,
            bytesReceived: 0,
            messageRate: 0,
        },
    })
);

interface ConnectionStatus {
    state: "connected" | "connecting" | "disconnected" | "error";
    connectedAt: number | null;
    error: string | null;
    stats?: {
        messagesReceived: number;
        bytesReceived: number;
        messageRate: number;
    };
}

// Usage
const status = useAtomValue(datasourceStatusAtomFamily("rosbridge-1"));
```

### `availableTopicsAtomFamily`

Available topics per datasource (atom family).

```typescript
export const availableTopicsAtomFamily = atomFamily((datasourceId: string) =>
    atom<AvailableTopic[]>([])
);

interface AvailableTopic {
    name: string;
    type: string;
    datasourceId: string;
}

// Usage
const topics = useAtomValue(availableTopicsAtomFamily("rosbridge-1"));
```

---

## 3. Data Stream Atoms (Atom Families)

Atoms for real-time data streams from datasources - **the core of V2's data flow**.

### `dataAtomFamily`

**Per-topic data atom** - Connection writes here, widgets read from here.

```typescript
export const dataAtomFamily = atomFamily((key: string) =>
    atom<unknown | null>(null)
);

// Key format: `${datasourceId}:${topic}`
// Example: 'rosbridge-1:/robot/pose'

// Usage in Connection
const setData = useSetAtom(dataAtomFamily(`${datasourceId}:${topic}`));
setData(incomingData);

// Usage in Widget
const data = useAtomValue(dataAtomFamily(`${datasourceId}:${topic}`));
```

### `subscriptionAtomFamily`

Tracks active subscriptions per topic (used by Connection for lazy subscription).

```typescript
export const subscriptionAtomFamily = atomFamily((key: string) =>
    atom<Set<string>>(new Set())
);

// Key format: `${datasourceId}:${topic}`
// Value: Set of subscriber IDs

// Usage
const subscribers = useAtomValue(
    subscriptionAtomFamily("rosbridge-1:/robot/pose")
);

// Add subscriber
const setSubscribers = useSetAtom(subscriptionAtomFamily(key));
setSubscribers((prev) => new Set(prev).add(subscriberId));
```

### `lastUpdateAtomFamily`

Timestamp of last update per topic (for staleness detection).

```typescript
export const lastUpdateAtomFamily = atomFamily((key: string) =>
    atom<number | null>(null)
);

// Usage
const lastUpdate = useAtomValue(
    lastUpdateAtomFamily("rosbridge-1:/robot/pose")
);

// Check staleness
const isStale = lastUpdate ? Date.now() - lastUpdate > 5000 : false;
```

### `dataRateAtomFamily`

Message rate per topic (messages per second).

```typescript
export const dataRateAtomFamily = atomFamily((key: string) => atom<number>(0));

// Usage
const messageRate = useAtomValue(dataRateAtomFamily("rosbridge-1:/robot/pose"));
// Returns: messages per second (Hz)
```

---

## 4. Widget State Atoms

Per-widget state management using atom families.

### `widgetConfigAtomFamily`

Configuration for each widget instance (separate from widgetsAtom).

```typescript
export const widgetConfigAtomFamily = atomFamily((widgetId: string) =>
    atom<unknown | null>(null)
);

// Usage in widget
const [config, setConfig] = useAtom(widgetConfigAtomFamily(widgetId));

// Update config
setConfig({ topic: "/robot/pose", refreshRate: 30 });
```

### `widgetStateAtomFamily`

Runtime state for each widget (not persisted).

```typescript
export const widgetStateAtomFamily = atomFamily((widgetId: string) =>
    atom<WidgetState>({
        initialized: false,
        error: null,
        lastRender: null,
    })
);

interface WidgetState {
    initialized: boolean;
    error: string | null;
    lastRender: number | null;
}

// Usage
const state = useAtomValue(widgetStateAtomFamily(widgetId));
```

---

## 5. Template Atoms

Templates for saving/loading widget and datasource configurations.

### `widgetTemplatesAtom`

Stores widget templates (replaces TemplatesProvider from V1).

```typescript
export const widgetTemplatesAtom = atom<WidgetTemplate[]>([]);

interface WidgetTemplate {
    id: string;
    name: string;
    description?: string;
    widgetType: string;
    config: unknown;
    tags: string[];
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
}

// Usage
const templates = useAtomValue(widgetTemplatesAtom);
const setTemplates = useSetAtom(widgetTemplatesAtom);

// Add template
setTemplates((prev) => [...prev, newTemplate]);
```

### `datasourceTemplatesAtom`

Stores datasource templates.

```typescript
export const datasourceTemplatesAtom = atom<DatasourceTemplate[]>([]);

interface DatasourceTemplate {
    id: string;
    name: string;
    description?: string;
    datasourceType: string;
    config: unknown;
    tags: string[];
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
}

// Usage - same pattern as widgetTemplatesAtom
```

---

## 6. Transform Atoms

TF-like coordinate frame transforms (converted from polling to atoms in V2).

### `transformTreeAtom`

Complete transform tree structure (replaces TransformSourcesProvider polling).

```typescript
export const transformTreeAtom = atom<TransformTree | null>(null);

interface TransformTree {
    frames: Map<string, TransformNode>;
    root: string;
    updatedAt: number;
}

interface TransformNode {
    name: string;
    parent: string | null;
    transform: Transform;
    children: string[];
}

interface Transform {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number }; // quaternion
}

// Usage
const tree = useAtomValue(transformTreeAtom);
const setTree = useSetAtom(transformTreeAtom);
```

### `transformUpdateAtom`

Write-only atom for updating individual transforms (API).

```typescript
export const transformUpdateAtom = atom(
    null,
    (get, set, update: TransformUpdate) => {
        const tree = get(transformTreeAtom);
        if (!tree) return;

        const newTree = applyTransformUpdate(tree, update);
        set(transformTreeAtom, newTree);
    }
);

interface TransformUpdate {
    frame: string;
    parent: string;
    transform: Transform;
}

// Usage
const updateTransform = useSetAtom(transformUpdateAtom);
updateTransform({
    frame: "base_link",
    parent: "map",
    transform: {
        position: { x: 1, y: 2, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
});
```

---

## 7. UI State Atoms

Ephemeral UI state (not persisted).

### `dialogsAtom`

Open dialogs/modals state.

```typescript
export const dialogsAtom = atom<Record<string, boolean>>({});

// Usage
const dialogs = useAtomValue(dialogsAtom);
const setDialogs = useSetAtom(dialogsAtom);

// Open dialog
setDialogs((prev) => ({ ...prev, "widget-config": true }));

// Close dialog
setDialogs((prev) => ({ ...prev, "widget-config": false }));
```

### `notificationsAtom`

Notification/toast messages.

```typescript
export const notificationsAtom = atom<Notification[]>([]);

interface Notification {
    id: string;
    type: "info" | "success" | "warning" | "error";
    message: string;
    createdAt: number;
    duration?: number;
}

// Usage
const notifications = useAtomValue(notificationsAtom);
const setNotifications = useSetAtom(notificationsAtom);

// Add notification
setNotifications((prev) => [
    ...prev,
    {
        id: generateId(),
        type: "success",
        message: "Widget added",
        createdAt: Date.now(),
        duration: 3000,
    },
]);
```

---

## Derived Atoms

Atoms that compute values from other atoms.

### `enabledDatasourcesAtom`

Derived atom filtering only enabled datasources.

```typescript
export const enabledDatasourcesAtom = atom((get) =>
    get(datasourcesAtom).filter((ds) => ds.enabled)
);

// Usage - read-only
const enabledDatasources = useAtomValue(enabledDatasourcesAtom);
```

### `widgetCountAtom`

Derived atom counting widgets.

```typescript
export const widgetCountAtom = atom((get) => get(widgetsAtom).length);

// Usage
const count = useAtomValue(widgetCountAtom);
```

### `connectionHealthAtom`

Derived atom computing connection health summary.

```typescript
export const connectionHealthAtom = atom((get) => {
    const datasources = get(datasourcesAtom);
    const enabled = datasources.filter((ds) => ds.enabled);

    const statuses = enabled.map((ds) =>
        get(datasourceStatusAtomFamily(ds.id))
    );

    return {
        total: enabled.length,
        connected: statuses.filter((s) => s.state === "connected").length,
        errors: statuses.filter((s) => s.state === "error").length,
    };
});

// Usage
const health = useAtomValue(connectionHealthAtom);
```

---

## Atom Selectors

Use `selectAtom` from `jotai/utils` for fine-grained subscriptions.

```typescript
import { selectAtom } from "jotai/utils";

// Only re-render when theme changes
const themeAtom = selectAtom(dashboardConfigAtom, (config) => config.theme);

const theme = useAtomValue(themeAtom);

// Only re-render when layout changes
const layoutAtom = selectAtom(dashboardConfigAtom, (config) => config.layout);

const layout = useAtomValue(layoutAtom);
```

---

## Atom Persistence

Persist atoms to localStorage using Jotai's `atomWithStorage`.

```typescript
import { atomWithStorage } from "jotai/utils";

// Auto-persist to localStorage
export const dashboardConfigAtom = atomWithStorage("dashboard-config", {
    layout: "grid",
    gridSize: 12,
    theme: "dark",
});

// Works same as regular atom, but syncs with localStorage
const config = useAtomValue(dashboardConfigAtom);
const setConfig = useSetAtom(dashboardConfigAtom);
```

---

## Atom Debugging

Use Jotai DevTools for debugging atoms in development.

```typescript
import { useAtomDevtools } from 'jotai-devtools';

function App() {
  // Enable devtools in development
  useAtomDevtools(dashboardConfigAtom, 'dashboardConfig');
  useAtomDevtools(widgetsAtom, 'widgets');
  useAtomDevtools(datasourcesAtom, 'datasources');

  return <Dashboard />;
}
```

---

## Complete API Reference

### Dashboard Atoms

| Atom                  | Type                           | Description               |
| --------------------- | ------------------------------ | ------------------------- |
| `dashboardConfigAtom` | `DashboardConfig`              | Global dashboard settings |
| `widgetsAtom`         | `WidgetInstance[]`             | Active widgets list       |
| `widgetLayoutAtom`    | `Record<string, WidgetLayout>` | Widget positions/sizes    |
| `panelsStateAtom`     | `PanelsState`                  | UI panels state           |
| `selectedWidgetAtom`  | `string \| null`               | Selected widget ID        |

### Datasource Atoms

| Atom                             | Type                 | Description               |
| -------------------------------- | -------------------- | ------------------------- |
| `datasourcesAtom`                | `DatasourceConfig[]` | Datasource configurations |
| `datasourceStatusAtomFamily(id)` | `ConnectionStatus`   | Per-datasource status     |
| `availableTopicsAtomFamily(id)`  | `AvailableTopic[]`   | Per-datasource topics     |

### Data Stream Atoms (Families)

| Atom                          | Type              | Description                  |
| ----------------------------- | ----------------- | ---------------------------- |
| `dataAtomFamily(key)`         | `unknown \| null` | Per-topic data               |
| `subscriptionAtomFamily(key)` | `Set<string>`     | Active subscribers per topic |
| `lastUpdateAtomFamily(key)`   | `number \| null`  | Last update timestamp        |
| `dataRateAtomFamily(key)`     | `number`          | Message rate (Hz)            |

### Widget State Atoms (Families)

| Atom                         | Type              | Description              |
| ---------------------------- | ----------------- | ------------------------ |
| `widgetConfigAtomFamily(id)` | `unknown \| null` | Per-widget config        |
| `widgetStateAtomFamily(id)`  | `WidgetState`     | Per-widget runtime state |

### Template Atoms

| Atom                      | Type                   | Description          |
| ------------------------- | ---------------------- | -------------------- |
| `widgetTemplatesAtom`     | `WidgetTemplate[]`     | Widget templates     |
| `datasourceTemplatesAtom` | `DatasourceTemplate[]` | Datasource templates |

### Transform Atoms

| Atom                | Type                                 | Description              |
| ------------------- | ------------------------------------ | ------------------------ |
| `transformTreeAtom` | `Map<string, TransformTree> \| null` | Multiple transform trees |

### UI State Atoms

| Atom                | Type                      | Description        |
| ------------------- | ------------------------- | ------------------ |
| `dialogsAtom`       | `Record<string, boolean>` | Dialog open states |
| `notificationsAtom` | `Notification[]`          | Notification queue |

### Derived Atoms

| Atom                     | Type                 | Description                  |
| ------------------------ | -------------------- | ---------------------------- |
| `enabledDatasourcesAtom` | `DatasourceConfig[]` | Filtered enabled datasources |
| `widgetCountAtom`        | `number`             | Widget count                 |
| `connectionHealthAtom`   | `HealthSummary`      | Connection health summary    |

---

## Best Practices

1. **Use atom families** for per-item state (widgets, datasources, topics)
2. **Use derived atoms** instead of duplicating state in components
3. **Use selectAtom** for fine-grained subscriptions to prevent unnecessary re-renders
4. **Use atomWithStorage** for persisted state (config, templates)
5. **Avoid atom nesting** - keep atom structure flat
6. **Name atoms consistently** - use `*Atom` suffix for single atoms, `*AtomFamily` for families
7. **Document atom keys** - clearly specify key format for atom families (e.g., `datasourceId:topic`)

## Next Steps

- [Dashboard Integration](/docs/v2/core/dashboard-integration.md) - How dashboard uses atoms
- [DatasourceManager](/docs/v2/core/datasource-manager.md) - How DatasourceManager reads datasourcesAtom
- [Hooks API](/docs/v2/api/hooks-api.md) - React hooks built on atoms
- [Data Flow](/docs/v2/core/data-flow.md) - How data flows through atoms
