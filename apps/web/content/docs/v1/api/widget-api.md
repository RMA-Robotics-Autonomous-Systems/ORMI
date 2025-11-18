---
title: "Widget API"
order: 2
---

# Widget API Reference

Widgets are React components that visualize or interact with data in the dashboard. This reference covers the complete Widget API.

## WidgetDefinition Interface

The core interface that defines a widget:

```typescript
interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    icon?: JSX.Element;
    titleProp?: string;
    schema: JsonSchema;
    uischema: UISchemaElement;
    data: any;
    Component: (data: any) => JSX.Element;
}
```

### Properties

#### `id`

**Type:** `string` (required)  
**Unique identifier** for the widget. Must be unique across all plugins.

**Convention:** Use kebab-case with plugin prefix

```typescript
id: "my-plugin-chart-widget";
```

#### `name`

**Type:** `string` (required)  
**Display name** shown in the widget picker UI.

```typescript
name: "Time Series Chart";
```

#### `description`

**Type:** `string` (required)  
**Short description** of widget functionality, shown in widget picker.

```typescript
description: "Visualize numeric data over time with customizable line charts";
```

#### `icon`

**Type:** `JSX.Element` (optional)  
**Icon component** displayed in widget picker. Use Lucide React icons.

```typescript
import { LineChart } from 'lucide-react';

icon: <LineChart />
```

#### `titleProp`

**Type:** `string` (optional)  
**Property name** in the schema that contains the widget's title. Used for dashboard display.

```typescript
schema: {
  properties: {
    title: { type: 'string' },
    // ... other properties
  }
},
titleProp: 'title'
```

#### `schema`

**Type:** `JsonSchema` (required)  
**JSON Schema** defining widget configuration properties. Follows [JSON Schema specification](https://json-schema.org/).

```typescript
schema: {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      title: 'Widget Title'
    },
    updateRate: {
      type: 'number',
      title: 'Update Rate (Hz)',
      minimum: 1,
      maximum: 60,
      default: 10
    },
    showLegend: {
      type: 'boolean',
      title: 'Show Legend',
      default: true
    }
  },
  required: ['title']
}
```

**Supported Types:**

- `string`, `number`, `boolean`
- `object` (nested properties)
- `array` (lists of values)
- `enum` (predefined choices)

#### `uischema`

**Type:** `UISchemaElement` (required)  
**UI Schema** defining how to render the configuration form. Follows [JSON Forms UI Schema](https://jsonforms.io/docs/uischema).

```typescript
uischema: {
  type: "VerticalLayout",
  elements: [
    {
      type: "Control",
      scope: "#/properties/title"
    } as ControlElement,
    {
      type: "TopicSelect",
      scope: "#/properties/topic",
      options: {
        dataRequirements: {
          accepts: ["number"]
        }
      }
    } as TopicSelectElement,
    {
      type: "HorizontalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/updateRate"
        },
        {
          type: "Control",
          scope: "#/properties/showLegend"
        }
      ]
    }
  ]
}
```

**Layout Types:**

- `VerticalLayout` - Stack elements vertically
- `HorizontalLayout` - Arrange elements horizontally
- `Group` - Grouping with label
- `Categorization` - Tabs for complex forms

**Control Types:**

- `Control` - Standard input control
- `TopicSelect` - Custom topic selection (ORMI-specific)

#### `data`

**Type:** `any` (required)  
**Default values** for widget configuration. Should match schema structure.

```typescript
data: {
  title: 'My Chart',
  updateRate: 10,
  showLegend: true,
  topic: undefined  // Will be set by user
}
```

#### `Component`

**Type:** `(data: any) => JSX.Element` (required)  
**React component function** that renders the widget with given configuration.

```typescript
Component: (data: ChartWidgetProps) => {
  return <ChartWidget {...data} />;
}
```

## Widget Instance Interface

When a widget is added to a dashboard, it becomes a **Widget** instance:

```typescript
interface Widget {
    widget_id: string; // Reference to WidgetDefinition.id
    box_id: string; // Unique instance ID (auto-generated)
    title: string; // Instance title (from titleProp)
    settings: any; // Current configuration values
}
```

## Topic Selection

### TopicSelectElement

Custom UI element for selecting data topics:

```typescript
interface TopicSelectElement extends Omit<ControlElement, "type"> {
    type: "TopicSelect";
    options?: {
        dataRequirements?: DataRequirements;
    };
}
```

### DataRequirements

Specify which topic types the widget accepts:

```typescript
interface DataRequirements {
    accepts: string[]; // Array of internal type names
}
```

**Example:**

```typescript
{
  type: "TopicSelect",
  scope: "#/properties/velocityTopic",
  options: {
    dataRequirements: {
      accepts: ["Movement", "Vector3"]
    }
  }
} as TopicSelectElement
```

### SelectedTopic

When a user selects a topic, it becomes a `SelectedTopic`:

```typescript
interface SelectedTopic extends DatasourceTopic {
    property: string; // Optional sub-property path
}

interface DatasourceTopic {
    topic: string; // Topic name: "/robot/velocity"
    datasource_id: string; // Source: "foxglove-1"
    type: string; // Internal type: "Movement"
    rawType: string; // Raw type: "geometry_msgs/Twist"
    bufferSize?: number; // Optional buffer size override
    source: DatasourceProviderSettings;
}
```

## Data Access

### LocalDataSourcesProvider

Wrap your widget component to subscribe to topics:

```typescript
import { LocalDataSourcesProvider, useLocalDataSource } from '@workspace/ormi-core/datasources';

Component: (data: MyWidgetProps) => (
  <LocalDataSourcesProvider
    SelectedTopics={[data.topic]}
    buffersSize={10}
  >
    <MyWidgetComponent />
  </LocalDataSourcesProvider>
)
```

**Props:**

- `SelectedTopics` - Array of topics to subscribe to
- `buffersSize` - Number of messages to buffer per topic

### useLocalDataSource Hook

Access subscribed data within your component:

```typescript
function MyWidgetComponent() {
  const { sources } = useLocalDataSource();

  // sources: Map<string, any[]>
  // Key: topic name
  // Value: array of buffered data (oldest to newest)

  const data = sources.get('/robot/velocity') || [];
  const latestValue = data[data.length - 1];

  return <div>{/* render */}</div>;
}
```

**Returns:**

```typescript
interface LocalDataSourceContext {
    sources: Map<string, any[]>; // Buffered data by topic
}
```

## Complete Widget Example

### Simple Display Widget

```typescript
import { WidgetDefinition, LocalDataSourcesProvider, useLocalDataSource, SelectedTopic } from '@workspace/ormi-core';
import { Gauge } from 'lucide-react';

interface SpeedGaugeProps {
  title: string;
  velocityTopic: SelectedTopic;
  maxSpeed: number;
}

function SpeedGauge({ title, maxSpeed }: SpeedGaugeProps) {
  const { sources } = useLocalDataSource();
  const velocities = sources.get(velocityTopic?.topic) || [];
  const latest = velocities[velocities.length - 1];

  const speed = latest ? Math.sqrt(
    latest.linear.x ** 2 +
    latest.linear.y ** 2
  ) : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h3>{title}</h3>
      <div className="text-4xl font-bold">
        {speed.toFixed(2)} m/s
      </div>
      <div className="text-sm text-gray-500">
        Max: {maxSpeed} m/s
      </div>
    </div>
  );
}

export function SpeedGaugeDefinition(): WidgetDefinition {
  return {
    id: 'speed-gauge-widget',
    name: 'Speed Gauge',
    description: 'Display current speed from velocity topic',
    icon: <Gauge />,
    titleProp: 'title',

    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Widget Title'
        },
        velocityTopic: {
          type: 'object',
          title: 'Velocity Topic'
        },
        maxSpeed: {
          type: 'number',
          title: 'Maximum Speed (m/s)',
          default: 5.0,
          minimum: 0.1
        }
      },
      required: ['title', 'velocityTopic']
    },

    uischema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/title"
        },
        {
          type: "TopicSelect",
          scope: "#/properties/velocityTopic",
          options: {
            dataRequirements: {
              accepts: ["Movement", "Vector3"]
            }
          }
        } as TopicSelectElement,
        {
          type: "Control",
          scope: "#/properties/maxSpeed"
        }
      ]
    },

    data: {
      title: 'Speed Gauge',
      maxSpeed: 5.0
    },

    Component: (data: SpeedGaugeProps) => (
      <LocalDataSourcesProvider
        SelectedTopics={[data.velocityTopic]}
        buffersSize={1}
      >
        <SpeedGauge {...data} />
      </LocalDataSourcesProvider>
    )
  };
}
```

### Control Widget (Publishing)

```typescript
import { usePluginsManager } from '@workspace/ormi-plugins';

interface JoystickProps {
  title: string;
  commandTopic: SelectedTopic;
  maxSpeed: number;
}

function JoystickControl({ commandTopic, maxSpeed }: JoystickProps) {
  const pluginManager = usePluginsManager();

  const handleMove = (x: number, y: number) => {
    const movement: Movement = {
      linear: { x: x * maxSpeed, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: y * maxSpeed }
    };

    // Publish command
    pluginManager.doAction(
      `${commandTopic.datasource_id}-${commandTopic.topic}-published`,
      movement,
      Date.now()
    );
  };

  return (
    <div>
      {/* Joystick UI */}
      <VirtualJoystick onChange={handleMove} />
    </div>
  );
}

export function JoystickDefinition(): WidgetDefinition {
  return {
    id: 'joystick-control',
    name: 'Joystick Control',
    description: 'Send movement commands',

    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        commandTopic: { type: 'object' },
        maxSpeed: {
          type: 'number',
          default: 1.0,
          minimum: 0.1,
          maximum: 10.0
        }
      }
    },

    uischema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/title"
        },
        {
          type: "TopicSelect",
          scope: "#/properties/commandTopic",
          options: {
            dataRequirements: {
              accepts: ["Movement"]
            }
          }
        } as TopicSelectElement,
        {
          type: "Control",
          scope: "#/properties/maxSpeed"
        }
      ]
    },

    data: {
      title: 'Joystick',
      maxSpeed: 1.0
    },

    Component: (data: JoystickProps) => (
      <JoystickControl {...data} />
    )
  };
}
```

### Multi-Topic Widget

```typescript
interface RobotDashboardProps {
  title: string;
  poseTopic: SelectedTopic;
  velocityTopic: SelectedTopic;
  batteryTopic: SelectedTopic;
}

function RobotDashboard() {
  const { sources } = useLocalDataSource();

  const pose = sources.get(poseTopic?.topic)?.[0];
  const velocity = sources.get(velocityTopic?.topic)?.[0];
  const battery = sources.get(batteryTopic?.topic)?.[0];

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>Position: {pose?.x}, {pose?.y}</div>
      <div>Speed: {velocity?.linear.x} m/s</div>
      <div>Battery: {battery}%</div>
    </div>
  );
}

export function RobotDashboardDefinition(): WidgetDefinition {
  return {
    id: 'robot-dashboard',
    name: 'Robot Dashboard',
    description: 'Multi-sensor robot status',

    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        poseTopic: { type: 'object' },
        velocityTopic: { type: 'object' },
        batteryTopic: { type: 'object' }
      }
    },

    uischema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/title"
        },
        {
          type: "TopicSelect",
          scope: "#/properties/poseTopic",
          label: "Position Topic",
          options: {
            dataRequirements: {
              accepts: ["Vector3"]
            }
          }
        } as TopicSelectElement,
        {
          type: "TopicSelect",
          scope: "#/properties/velocityTopic",
          label: "Velocity Topic",
          options: {
            dataRequirements: {
              accepts: ["Movement"]
            }
          }
        } as TopicSelectElement,
        {
          type: "TopicSelect",
          scope: "#/properties/batteryTopic",
          label: "Battery Topic",
          options: {
            dataRequirements: {
              accepts: ["number"]
            }
          }
        } as TopicSelectElement
      ]
    },

    data: {
      title: 'Robot Status'
    },

    Component: (data: RobotDashboardProps) => (
      <LocalDataSourcesProvider
        SelectedTopics={[
          data.poseTopic,
          data.velocityTopic,
          data.batteryTopic
        ]}
        buffersSize={1}
      >
        <RobotDashboard />
      </LocalDataSourcesProvider>
    )
  };
}
```

## Widget Registration

Register widgets via plugin filter:

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

class MyPlugin extends Plugin {
    constructor() {
        super({
            name: "My Widgets Plugin",
            description: "Custom visualization widgets",
            version: "1.0.0",
        });

        this.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: "my-widgets",
            priority: 10,
            filter: (widgets: WidgetDefinition[]) => {
                widgets.push(SpeedGaugeDefinition());
                widgets.push(JoystickDefinition());
                widgets.push(RobotDashboardDefinition());
                return widgets;
            },
        });
    }
}

export default MyPlugin;
```

## Best Practices

### 1. Type Safety

Define TypeScript interfaces for widget props:

```typescript
interface MyWidgetProps {
  title: string;
  topic: SelectedTopic;
  updateRate: number;
}

Component: (data: MyWidgetProps) => <MyWidget {...data} />
```

### 2. Null Checks

Always check if topic data exists:

```typescript
const data = sources.get(topic?.topic);
if (!data || data.length === 0) {
  return <div>Waiting for data...</div>;
}
```

### 3. Performance

Use appropriate buffer sizes:

```typescript
// Single value widgets
buffersSize={1}

// Time series (only keep what you display)
buffersSize={100}

// ❌ Avoid excessive buffering
buffersSize={10000}
```

### 4. Error Handling

Handle invalid or missing topics gracefully:

```typescript
if (!velocityTopic) {
  return <div>Please select a velocity topic</div>;
}

const data = sources.get(velocityTopic.topic);
if (!data) {
  return <div>No data available</div>;
}
```

### 5. Responsive Design

Use Tailwind classes for responsive layouts:

```typescript
<div className="h-full w-full flex flex-col p-4">
  {/* Widget content */}
</div>
```

### 6. Widget Title

Use titleProp for dynamic dashboard titles:

```typescript
schema: {
  properties: {
    title: { type: 'string', title: 'Widget Title' }
  }
},
titleProp: 'title',  // Dashboard will display this property
data: {
  title: 'My Widget'
}
```

## Common Patterns

### Pattern: Loading State

```typescript
function MyWidget() {
  const { sources } = useLocalDataSource();
  const data = sources.get(topic?.topic);

  if (!topic) {
    return <EmptyState message="Configure topic" />;
  }

  if (!data || data.length === 0) {
    return <LoadingSpinner />;
  }

  return <DataVisualization data={data} />;
}
```

### Pattern: Derived Data

```typescript
function SpeedWidget() {
  const { sources } = useLocalDataSource();
  const velocities = sources.get(topic?.topic) || [];

  // Compute derived values
  const speeds = velocities.map(v =>
    Math.sqrt(v.linear.x ** 2 + v.linear.y ** 2)
  );
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  return <div>Average: {avgSpeed.toFixed(2)} m/s</div>;
}
```

### Pattern: Conditional Rendering

```typescript
schema: {
  properties: {
    showLegend: { type: 'boolean', default: true },
    showGrid: { type: 'boolean', default: false }
  }
}

Component: (data) => (
  <Chart
    data={chartData}
    legend={data.showLegend}
    grid={data.showGrid}
  />
)
```

## Next Steps

- **[Creating a Widget Guide](../guides/creating-widget)** - Step-by-step tutorial
- **[Datasource API](datasource-api)** - Understanding data sources
- **[Widget Examples](../examples/simple-widget)** - Real implementations
