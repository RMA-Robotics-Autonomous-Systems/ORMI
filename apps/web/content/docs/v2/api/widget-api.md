---
title: "Widget API"
order: 3
---

# Widget API Reference

Complete reference for V2 widget development. **Key principle: Widget props and interfaces remain unchanged from V1 - only the data access mechanism changes.**

## WidgetDefinition Interface

The widget definition interface is **identical to V1**:

```typescript
interface WidgetDefinition {
    id: string; // Unique widget identifier
    name: string; // Display name
    description: string; // Short description
    icon?: JSX.Element; // Widget icon
    titleProp?: string; // Property for widget title
    schema: JsonSchema; // Configuration schema
    uischema: UISchemaElement; // UI layout schema
    data: any; // Default configuration
    Component: (data: any) => JSX.Element; // Widget component
}
```

**No changes from V1!** Same definition structure, same schema, same everything.

## Widget Component Signature

### V1 Component (Old)

```typescript
interface MyWidgetProps {
  // Widget configuration from schema
  title: string;
  showLegend: boolean;
  color: string;

  // Data binding (from schema)
  topic: SelectedTopic;
}

function MyWidget({ title, showLegend, color, topic }: MyWidgetProps) {
  // V1 data access
  const { sources, getSource } = useLocalDataSource()
  const data = getSource(topic.topic)?.data[0]

  return (
    <div>
      <h3>{title}</h3>
      <DataDisplay data={data} color={color} showLegend={showLegend} />
    </div>
  )
}

// V1 requires wrapper
export default function WrappedWidget(props: MyWidgetProps) {
  return (
    <LocalDataSourcesProvider SelectedTopics={[props.topic]} buffersSize={1}>
      <MyWidget {...props} />
    </LocalDataSourcesProvider>
  )
}
```

### V2 Component (New)

```typescript
interface MyWidgetProps {
  // Widget configuration - SAME AS V1
  title: string;
  showLegend: boolean;
  color: string;

  // Data binding - IDENTICAL TO V1
  topic: SelectedTopic;  // Same interface!
}

function MyWidget({ title, showLegend, color, topic }: MyWidgetProps) {
  // V2 data access - only this line changes
  const { data } = useDataStream(topic)

  return (
    <div>
      <h3>{title}</h3>
      <DataDisplay data={data} color={color} showLegend={showLegend} />
    </div>
  )
}

// V2 - no wrapper needed!
export default MyWidget
```

**Key differences:**

- ✅ Business logic props (`title`, `showLegend`, `color`) - **Identical**
- ✅ Data binding prop (`topic: SelectedTopic`) - **Identical**
- ✅ Component JSX structure - **Identical**
- ✅ Widget behavior and features - **Identical**
- ✨ Data access: `useLocalDataSource()` → `useDataStream(topic)` (cleaner, uses SelectedTopic object directly)
- ✨ No wrapper component needed## Data Binding: V1 vs V2

### V1 and V2 Use Same Interface

Both V1 and V2 use the **same `SelectedTopic` interface**:

```typescript
// Shared interface (V1 and V2)
interface DatasourceTopic {
    topic: string; // Topic path
    datasource_id: string; // Datasource instance ID
    source: DatasourceProviderSettings; // Full datasource config
    type: string; // Internal type (e.g., 'IMU', 'number')
    rawType: string; // Source-specific type
    bufferSize?: number; // Buffer size hint
}

interface SelectedTopic extends DatasourceTopic {
    property: string; // Property extraction path
}

// Widget receives same object in V1 and V2
interface WidgetProps {
    topic: SelectedTopic; // Identical in both versions
}
```

**Schema is identical:**

```typescript
// Same schema for V1 and V2
schema: {
  properties: {
    topic: {
      type: 'object',
      title: 'Topic'
    }
  }
}

// Same UI schema
uischema: {
  elements: [{
    type: "TopicSelect",
    scope: "#/properties/topic"
  }]
}
```

**Why keep SelectedTopic?**

- ✅ **No widget prop changes needed** - widgets already use this interface
- ✅ **Prevents conflicts** - `datasource_id + topic` combination is unique
- ✅ **Includes metadata** - type information, source config, property path
- ✅ **Backward compatible** - smooth migration from V1 to V2
- ✅ **Property extraction** - `property` field for nested data access

## Complete Widget Example

### Temperature Display Widget

```typescript
import { useDataStream } from '@workspace/ormi-core/v2'
import { JsonSchema } from '@jsonforms/core'
import { WidgetDefinition } from '@workspace/ormi-core/widgets'
import { Thermometer } from 'lucide-react'

// Props interface - business logic unchanged
interface TemperatureWidgetProps {
  // Configuration (from schema)
  title: string;
  units: '°C' | '°F';
  warningThreshold?: number;
  criticalThreshold?: number;
  showHistory: boolean;

  // Data binding (SAME AS V1)
  topic: SelectedTopic;
}

// Component - business logic unchanged
function TemperatureWidget({
  title,
  units,
  warningThreshold = 80,
  criticalThreshold = 100,
  showHistory,
  topic
}: TemperatureWidgetProps) {
  // Only this line is V2-specific - extract datasource_id and topic
  const { data, buffer, isLoading, error } = useDataStream<number>(
    topic.datasource_id,
    topic.topic,
    { bufferSize: showHistory ? 100 : 0 }
  )  // Rest of logic identical to V1
  if (isLoading) return <Spinner />
  if (error) return <ErrorDisplay error={error} />

  const temp = data ?? 0
  const displayTemp = units === '°F' ? (temp * 9/5) + 32 : temp

  const getColor = () => {
    if (displayTemp >= criticalThreshold) return 'red'
    if (displayTemp >= warningThreshold) return 'orange'
    return 'green'
  }

  return (
    <div className="temperature-widget">
      <h3>{title}</h3>
      <div className="reading" style={{ color: getColor() }}>
        {displayTemp.toFixed(1)}{units}
      </div>
      {showHistory && (
        <MiniChart data={buffer.map(m => m.value)} />
      )}
    </div>
  )
}

// Widget definition - schema structure unchanged
export const TemperatureWidgetDefinition: WidgetDefinition = {
  id: 'temperature-widget',
  name: 'Temperature Display',
  description: 'Display temperature with thresholds and optional history',
  icon: <Thermometer />,
  titleProp: 'title',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Widget Title',
        default: 'Temperature'
      },
      units: {
        type: 'string',
        title: 'Units',
        enum: ['°C', '°F'],
        default: '°C'
      },
      warningThreshold: {
        type: 'number',
        title: 'Warning Threshold',
        default: 80
      },
      criticalThreshold: {
        type: 'number',
        title: 'Critical Threshold',
        default: 100
      },
      showHistory: {
        type: 'boolean',
        title: 'Show History Chart',
        default: false
      },
      datasourceId: {
        type: 'string',
        title: 'Data Source'
      },
      topic: {
        type: 'string',
        title: 'Topic'
      }
    },
    required: ['title', 'datasourceId', 'topic']
  },

  uischema: {
    type: 'VerticalLayout',
    elements: [
      {
        type: 'Control',
        scope: '#/properties/title'
      },
      {
        type: 'HorizontalLayout',
        elements: [
          {
            type: 'DatasourceSelect',
            scope: '#/properties/datasourceId'
          },
          {
            type: 'TopicSelect',
            scope: '#/properties/topic',
            options: {
              datasourceId: '#/datasourceId',
              dataType: 'number'  // Filter for number types
            }
          }
        ]
      },
      {
        type: 'Control',
        scope: '#/properties/units'
      },
      {
        type: 'HorizontalLayout',
        elements: [
          {
            type: 'Control',
            scope: '#/properties/warningThreshold'
          },
          {
            type: 'Control',
            scope: '#/properties/criticalThreshold'
          }
        ]
      },
      {
        type: 'Control',
        scope: '#/properties/showHistory'
      }
    ]
  },

  data: {
    title: 'Temperature',
    units: '°C',
    warningThreshold: 80,
    criticalThreshold: 100,
    showHistory: false,
    topic: null  // Set by user via TopicSelect
  },

  Component: (data: TemperatureWidgetProps) => <TemperatureWidget {...data} />
}
```

## Widget Patterns

### Pattern: Multiple Data Sources

Widget with multiple topics:

```typescript
interface MultiTopicWidgetProps {
  title: string;
  primaryTopic: SelectedTopic;
  secondaryTopic: SelectedTopic;
}

function MultiTopicWidget({ title, primaryTopic, secondaryTopic }: MultiTopicWidgetProps) {
  const primary = useDataStream(primaryTopic)
  const secondary = useDataStream(secondaryTopic)

  return (
    <div>
      <h3>{title}</h3>
      <div>Primary: {primary.data}</div>
      <div>Secondary: {secondary.data}</div>
    </div>
  )
}
```

### Pattern: Optional Data

Widget with optional data stream:

```typescript
interface OptionalDataWidgetProps {
  title: string;
  topic: SelectedTopic;
  showExtra: boolean;
  extraTopic?: SelectedTopic;
}

function OptionalDataWidget({
  title,
  topic,
  showExtra,
  extraTopic
}: OptionalDataWidgetProps) {
  const main = useDataStream(topic)

  // Conditional subscription
  const extra = useDataStream(
    showExtra && extraTopic ? extraTopic : null
  )

  return (
    <div>
      <h3>{title}</h3>
      <div>Main: {main.data}</div>
      {showExtra && extra.data && (
        <div>Extra: {extra.data}</div>
      )}
    </div>
  )
}
```

### Pattern: Data Transformation

Widget with transformed data:

```typescript
interface TransformWidgetProps {
  title: string;
  topic: SelectedTopic;
  scale: number;
  offset: number;
}

function TransformWidget({ title, topic, scale, offset }: TransformWidgetProps) {
  const { data } = useDataStream<number>(topic, {
    transform: (raw) => (raw * scale) + offset
  })

  return (
    <div>
      <h3>{title}</h3>
      <div>{data?.toFixed(2)}</div>
    </div>
  )
}
```

### Pattern: Cross-Datasource

Widget using data from multiple datasources:

```typescript
interface CrossDatasourceWidgetProps {
  title: string;
  topic1: SelectedTopic;
  topic2: SelectedTopic;
}

function CrossDatasourceWidget({
  title,
  topic1,
  topic2
}: CrossDatasourceWidgetProps) {
  const data1 = useDataStream(topic1)
  const data2 = useDataStream(topic2)

  return (
    <div>
      <h3>{title}</h3>
      <div>Source 1: {data1.data}</div>
      <div>Source 2: {data2.data}</div>
    </div>
  )
}
```

## Schema Patterns

### Basic Schema

```typescript
schema: {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      title: 'Widget Title'
    },
    topic: {
      type: 'object',
      title: 'Topic'
    }
  },
  required: ['title', 'topic']
}

uischema: {
  elements: [
    {
      type: 'Control',
      scope: '#/properties/title'
    },
    {
      type: 'TopicSelect',
      scope: '#/properties/topic'
    }
  ]
}
```

### Schema with Type Filtering

```typescript
schema: {
  properties: {
    topic: { type: 'object' },
    // ... other properties
  }
},
uischema: {
  elements: [
    {
      type: 'TopicSelect',
      scope: '#/properties/topic',
      options: {
        dataType: 'number',  // Only show number topics
        // or
        dataTypes: ['number', 'Vector3'],  // Multiple types
      }
    }
  ]
}
```

### Schema with Multiple Topics

```typescript
schema: {
  properties: {
    primaryTopic: {
      type: 'object',
      title: 'Primary Topic'
    },
    secondaryTopic: {
      type: 'object',
      title: 'Secondary Topic'
    }
  }
},
uischema: {
  elements: [
    {
      type: 'TopicSelect',
      scope: '#/properties/primaryTopic',
      options: {
        dataType: 'IMU'
      }
    },
    {
      type: 'TopicSelect',
      scope: '#/properties/secondaryTopic',
      options: {
        dataType: 'GPS'
      }
    }
  ]
}
```

## Migration from V1

### Step 1: Props Interface (NO CHANGE!)

```typescript
// V1 and V2 - IDENTICAL
interface Props {
    title: string;
    topic: SelectedTopic; // Same in both!
}
```

### Step 2: Update Data Access

```typescript
// V1
const { sources, getSource } = useLocalDataSource();
const data = getSource(topic.topic)?.data[0];

// V2
const { data } = useDataStream(topic);
```

### Step 3: Schema (NO CHANGE!)

```typescript
// V1 and V2 - IDENTICAL
schema: {
    properties: {
        topic: {
            type: "object";
        }
    }
}

uischema: {
    elements: [
        {
            type: "TopicSelect",
            scope: "#/properties/topic",
        },
    ];
}
```

### Step 4: Remove Wrapper

```typescript
// V1
export default function WrappedWidget(props) {
  return (
    <LocalDataSourcesProvider SelectedTopics={[props.topic]}>
      <MyWidget {...props} />
    </LocalDataSourcesProvider>
  )
}

// V2
export default MyWidget  // No wrapper!
```

**Summary: Only the data access hook changes!** Props, schema, and UI schema are identical.

## Migration from V1

### Step 1: Update Props Interface

```typescript
// V1
interface Props {
    title: string;
    topic: SelectedTopic; // ❌ Remove
}

// V2
interface Props {
    title: string;
    datasourceId: string; // ✅ Add
    topic: string; // ✅ Add
}
```

### Step 2: Update Data Access

```typescript
// V1
const { sources, getSource } = useLocalDataSource();
const data = getSource(topic.topic)?.data[0];

// V2
const topic = { datasource_id: datasourceId, topic: topicName };
const { data } = useDataStream(topic);
```

### Step 3: Update Schema

```typescript
// V1
schema: {
  properties: {
    topic: { type: 'object' }  // SelectedTopic
  }
}

// V2
schema: {
  properties: {
    datasourceId: { type: 'string' },
    topic: { type: 'string' }
  }
}
```

### Step 4: Remove Wrapper

```typescript
// V1
export default function WrappedWidget(props) {
  return (
    <LocalDataSourcesProvider SelectedTopics={[props.topic]}>
      <MyWidget {...props} />
    </LocalDataSourcesProvider>
  )
}

// V2
export default MyWidget  // No wrapper!
```

## Best Practices

### 1. Keep Business Logic Props Separate

```typescript
interface WidgetProps {
    // Data binding
    datasourceId: string;
    topic: string;

    // Business logic (unchanged from V1)
    title: string;
    showLegend: boolean;
    color: string;
    refreshRate: number;
}
```

### 2. Use TypeScript Generics

```typescript
const { data } = useDataStream<MyDataType>(topic);
// data is now typed as MyDataType | null
```

### 3. Handle Loading and Errors

```typescript
const { data, isLoading, error } = useDataStream(topic)

if (isLoading) return <Spinner />
if (error) return <ErrorDisplay error={error} />
if (!data) return <NoData />

return <Display data={data} />
```

### 4. Provide Good Defaults

```typescript
data: {
  title: 'My Widget',
  datasourceId: '',  // Empty, user must select
  topic: '',         // Empty, user must select
  showLegend: true,  // Sensible default
  color: '#3b82f6'   // Sensible default
}
```

### 5. Use Meaningful Prop Names

```typescript
// Good
interface Props {
    primaryDatasourceId: string;
    primaryTopic: string;
    secondaryDatasourceId: string;
    secondaryTopic: string;
}

// Bad
interface Props {
    ds1: string;
    t1: string;
    ds2: string;
    t2: string;
}
```

## Testing

### Unit Testing

```typescript
import { render } from '@testing-library/react'
import { Provider as JotaiProvider } from 'jotai'

test('renders with data', () => {
  const { getByText } = render(
    <JotaiProvider>
      <MyWidget
        title="Test Widget"
        datasourceId="test-ds"
        topic="/test/topic"
      />
    </JotaiProvider>
  )

  expect(getByText('Test Widget')).toBeInTheDocument()
})
```

### Mock Data Stream

```typescript
jest.mock("@workspace/ormi-core/v2", () => ({
    useDataStream: jest.fn(() => ({
        data: 42,
        isLoading: false,
        error: null,
    })),
}));
```

---

**Summary:** V2 widgets are nearly identical to V1 widgets. Business logic props stay the same, only data binding simplifies from `SelectedTopic` to `datasourceId` + `topic`, and data access changes from `useLocalDataSource()` to `useDataStream()`. No wrappers needed!

**Next:** See [Examples](../examples) for complete widget conversions and real-world patterns.
