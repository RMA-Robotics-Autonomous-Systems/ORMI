# API Reference

Complete TypeScript API reference for the datasource system.

## Core Interfaces

See [Core Interfaces](../datasources/core-interfaces) for detailed documentation of:

- `DatasourceDefinition<T>`
- `Datasource`
- `DatasourceProviderSettings`
- `DatasourceTopic`
- `SelectedTopic`
- `DatasourceTopicFilter`

## Plugin Hooks

See [Plugin Hooks Reference](../plugins/hooks) for documentation of:

- `DATASOURCES_LIST`
- `AVAILABLE_TOPICS`
- `WIDGETS_LIST`
- `WIDGET_LIST_WITH_DATASOURCE`
- Custom datasource hooks

## PluginsManager Methods

### Filter Methods

```typescript
// Add filter
pluginsManager.addFilter(
    hookName: string,
    config: {
        id: string;
        priority: number;
        filter: (value: T, ...args: any[]) => T;
    }
): void

// Remove filter
pluginsManager.removeFilter(
    hookName: string,
    filterId: string
): void

// Apply filter (sync)
pluginsManager.applyFilter<T>(
    hookName: string,
    initialValue: T,
    ...args: any[]
): T

// Apply filter (async)
pluginsManager.applyFilterAsync<T>(
    hookName: string,
    initialValue: T,
    ...args: any[]
): Promise<T>
```

### Action Methods

```typescript
// Add action
pluginsManager.addAction(
    hookName: string,
    config: {
        id: string;
        priority: number;
        action: (data: any, ...args: any[]) => void | Promise<void>;
    }
): void

// Remove action
pluginsManager.removeAction(
    hookName: string,
    actionId: string
): void

// Trigger action (sync)
pluginsManager.doAction(
    hookName: string,
    data: any,
    ...args: any[]
): void

// Trigger action (async)
pluginsManager.doActionAsync(
    hookName: string,
    data: any,
    ...args: any[]
): Promise<void>
```

## React Hooks

### usePluginsManager

```typescript
const pluginsManager = usePluginsManager();
// Returns: PluginsManager instance
```

### useDashboardManager

```typescript
const {
    layouts,
    widgets,
    datasources,
    addDatasource,
    removeDatasource,
    updateDatasource,
    // ... more methods
} = useDashboardManager();
```

## Utility Classes

### DatasourceTopicFilter

```typescript
class DatasourceTopicFilter {
    constructor(props: {
        name?: RegExp;
        type?: RegExp;
        rawType?: RegExp;
        source_id?: RegExp;
        strict?: boolean;
    });

    filter(topic: DatasourceTopic): boolean;
}
```

## JSON Schema Types

```typescript
import { JsonSchema, UISchemaElement } from "@jsonforms/core";

// Use for datasource configuration schemas
const schema: JsonSchema = {
    type: "object",
    properties: {
        /* ... */
    },
    required: [
        /* ... */
    ],
};

const uischema: UISchemaElement = {
    type: "VerticalLayout",
    elements: [
        /* ... */
    ],
};
```

## Common Patterns

### Subscribe to Topic

```typescript
useEffect(() => {
    const topic: SelectedTopic = {
        topic: "/my/topic",
        datasource_id: "datasource_id",
        property: "data",
        // ... other DatasourceTopic fields
    };

    // Subscribe
    pluginsManager.doActionAsync(`${topic.datasource_id}-subscribe`, topic);

    // Listen for data
    pluginsManager.addAction(
        `${topic.datasource_id}-${topic.topic}-published`,
        {
            id: "my-listener",
            priority: 10,
            action: (data, timestamp) => {
                setMyData(data);
            },
        }
    );

    return () => {
        // Unsubscribe
        pluginsManager.doActionAsync(
            `${topic.datasource_id}-unsubscribe`,
            topic
        );
        pluginsManager.removeAction(
            `${topic.datasource_id}-${topic.topic}-published`,
            "my-listener"
        );
    };
}, [topic]);
```

### Query Available Topics

```typescript
const getTopics = async () => {
    const filter = new DatasourceTopicFilter({
        type: /GeolocationPosition/,
    });

    const topics = await pluginsManager.applyFilterAsync<DatasourceTopic[]>(
        PluginsHooks.AVAILABLE_TOPICS,
        [],
        filter
    );

    return topics;
};
```

### Publish Data

```typescript
// In provider component
const publishData = (topicName: string, data: any) => {
    pluginsManager.doAction(
        `${datasource_id}-${topicName}-published`,
        data,
        Date.now()
    );
};
```

## Type Guards

```typescript
// Check if value is DatasourceDefinition
function isDatasourceDefinition(obj: any): obj is DatasourceDefinition {
    return (
        obj &&
        typeof obj.id === "string" &&
        typeof obj.name === "string" &&
        typeof obj.schema === "object" &&
        typeof obj.Provider === "function"
    );
}

// Check if value is DatasourceTopic
function isDatasourceTopic(obj: any): obj is DatasourceTopic {
    return (
        obj &&
        typeof obj.topic === "string" &&
        typeof obj.datasource_id === "string" &&
        typeof obj.type === "string" &&
        typeof obj.rawType === "string"
    );
}
```

## Error Handling

```typescript
// In provider
try {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    publishData(topic, data);
} catch (error) {
    console.error("[MyDatasource] Error:", error);
    toast.error(`Failed to fetch data: ${error.message}`);
}

// In filter
filter: (datasources) => {
    try {
        datasources.push(MyDefinition);
        return datasources;
    } catch (error) {
        console.error("Failed to register datasource:", error);
        return datasources; // Return original array
    }
};
```

## Performance Tips

### Use Refs for Mutable State

```typescript
// ❌ Bad - causes re-renders
const [intervals, setIntervals] = useState(new Map());

// ✅ Good - no re-renders
const intervalsRef = useRef(new Map());
```

### Memoize Expensive Computations

```typescript
const availableTopics = useMemo(() => {
    return channels.map((channel) => ({
        topic: channel.topic,
        datasource_id: datasource_id,
        // ... expensive mapping
    }));
}, [channels, datasource_id]);
```

### Debounce Frequent Updates

```typescript
import { debounce } from "lodash";

const debouncedPublish = useMemo(
    () =>
        debounce((topic, data) => {
            pluginsManager.doAction(
                `${datasource_id}-${topic}-published`,
                data,
                Date.now()
            );
        }, 100),
    [datasource_id, pluginsManager]
);
```

---

## See Also

- [Core Interfaces](../datasources/core-interfaces)
- [Plugin Hooks](../plugins/hooks)
- [Provider Pattern](../datasources/provider-pattern)
