# Plugin Hooks Reference

Complete reference for all plugin hooks in the ORMI-CORE system.

## System-Wide Hooks

### `DATASOURCES_LIST`

**Type:** Filter  
**Purpose:** Register datasource definitions  
**Called:** During system initialization

#### Signature

```typescript
(datasources: DatasourceDefinition[]) => DatasourceDefinition[]
```

#### Example

```typescript
pluginsManager.addFilter(PluginsHooks.DATASOURCES_LIST, {
	id: "my-datasource-registration",
	priority: 10,
	filter: (datasources) => {
		datasources.push(MyDatasourceDefinition);
		return datasources;
	},
});
```

---

### `AVAILABLE_TOPICS`

**Type:** Async Filter  
**Purpose:** Provide available topics to widgets  
**Called:** When widgets query for topics

#### Signature

```typescript
async (topics: DatasourceTopic[], filter?: DatasourceTopicFilter) =>
	Promise<DatasourceTopic[]>;
```

#### Example

```typescript
pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
	id: `${datasource_id}-topics`,
	priority: 10,
	filter: async (topics, filter) => {
		const myTopics = getMyTopics();

		if (filter) {
			topics.push(...myTopics.filter((t) => filter.filter(t)));
		} else {
			topics.push(...myTopics);
		}

		return topics;
	},
});
```

---

### `WIDGETS_LIST`

**Type:** Filter  
**Purpose:** Register widget definitions  
**Called:** During system initialization

#### Signature

```typescript
(widgets: WidgetDefinition[]) => WidgetDefinition[]
```

#### Example

```typescript
pluginsManager.addFilter(PluginsHooks.WIDGETS_LIST, {
	id: "my-widgets-registration",
	priority: 10,
	filter: (widgets) => {
		widgets.push(MyWidgetDefinition);
		return widgets;
	},
});
```

---

### `WIDGET_LIST_WITH_DATASOURCE`

**Type:** Filter  
**Purpose:** Filter widgets based on available datasources  
**Called:** When user opens widget selector

#### Signature

```typescript
(
    widgets: WidgetDefinition[],
    datasources: Datasource[]
) => WidgetDefinition[]
```

#### Example

```typescript
pluginsManager.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
	id: "datasource-dependent-widgets",
	priority: 10,
	filter: (widgets, datasources) => {
		const hasMyDatasource = datasources.some(
			(ds) => ds.datasource_id === "my-datasource",
		);

		if (!hasMyDatasource) {
			return widgets.filter((w) => w.id !== "my-widget");
		}

		return widgets;
	},
});
```

---

## Datasource-Specific Hooks

### Subscribe Hook

**Pattern:** `${datasource_id}-subscribe`  
**Type:** Async Action  
**Purpose:** Handle new subscriptions to topics

#### Signature

```typescript
async (topic: SelectedTopic) => Promise<void>;
```

#### Example

```typescript
pluginsManager.addAction(`${datasource_id}-subscribe`, {
	id: `${datasource_id}-subscribe-handler`,
	priority: 10,
	action: async (topic: SelectedTopic) => {
		console.log(`Subscribe to ${topic.topic}`);

		const count = subscriberCount.get(topic.topic) || 0;
		subscriberCount.set(topic.topic, count + 1);

		if (count === 0) {
			startPublishing(topic);
		}
	},
});
```

---

### Unsubscribe Hook

**Pattern:** `${datasource_id}-unsubscribe`  
**Type:** Async Action  
**Purpose:** Handle unsubscriptions from topics

#### Signature

```typescript
async (topic: SelectedTopic) => Promise<void>;
```

#### Example

```typescript
pluginsManager.addAction(`${datasource_id}-unsubscribe`, {
	id: `${datasource_id}-unsubscribe-handler`,
	priority: 10,
	action: async (topic: SelectedTopic) => {
		console.log(`Unsubscribe from ${topic.topic}`);

		const count = subscriberCount.get(topic.topic) || 0;
		if (count > 0) {
			subscriberCount.set(topic.topic, count - 1);

			if (count === 1) {
				stopPublishing(topic);
			}
		}
	},
});
```

---

### Topic Publish Hook

**Pattern:** `${datasource_id}-${topic_name}-published`  
**Type:** Action  
**Purpose:** Broadcast data to subscribers

#### Signature

```typescript
(data: any, timestamp: number) => void
```

#### Publishing

```typescript
// From provider when data arrives
pluginsManager.doAction(
	`${datasource_id}-${topic.topic}-published`,
	data,
	Date.now(),
);
```

#### Subscribing

```typescript
// In widget component
useEffect(() => {
	const hookName = `${datasource_id}-${topic.topic}-published`;

	pluginsManager.addAction(hookName, {
		id: `${widget_id}-subscriber`,
		priority: 10,
		action: (data, timestamp) => {
			console.log("Received data:", data, "at", timestamp);
			setWidgetData(data);
		},
	});

	return () => {
		pluginsManager.removeAction(hookName, `${widget_id}-subscriber`);
	};
}, [topic]);
```

---

### Definition Hook

**Pattern:** `${datasource_id}-definition`  
**Type:** Filter  
**Purpose:** Provide datasource-specific utilities or info

#### Signature

```typescript
(definition: any) => any;
```

#### Example

```typescript
pluginsManager.addFilter(`${datasource_id}-definition`, {
	id: `${datasource_id}-def`,
	priority: 10,
	filter: (def) => {
		return {
			...def,
			getConnectionStatus: () => connectionStatus,
			getTopicList: () => availableTopics,
		};
	},
});
```

---

## Custom Hooks

You can create custom hooks for specific functionality.

### API URL Hook Example

```typescript
// Provider registers
pluginsManager.addFilter(`${datasource_id}-api-url`, {
	id: `${datasource_id}-url-provider`,
	priority: 10,
	filter: () => apiUrl,
});

// Widget queries
const apiUrl = pluginsManager.applyFilter(`${datasource_id}-api-url`, null);
```

### Connection Status Hook

```typescript
// Provider registers
pluginsManager.addFilter(`${datasource_id}-status`, {
	id: `${datasource_id}-status-provider`,
	priority: 10,
	filter: () => ({
		connected: isConnected,
		error: lastError,
		reconnectAttempt: reconnectCount,
	}),
});

// Widget queries
const status = pluginsManager.applyFilter(`${datasource_id}-status`, {
	connected: false,
	error: null,
	reconnectAttempt: 0,
});
```

---

## Hook Lifecycle

### 1. Plugin Load Phase

```
Plugin Constructor
    ↓
addFilter(DATASOURCES_LIST)
    ↓
System scans all plugins
    ↓
Datasource definitions collected
```

### 2. Datasource Instantiation

```
User creates datasource
    ↓
Provider component mounts
    ↓
addFilter(AVAILABLE_TOPICS)
addAction(subscribe/unsubscribe)
    ↓
Datasource ready
```

### 3. Widget Interaction

```
Widget queries topics
    ↓
applyFilterAsync(AVAILABLE_TOPICS)
    ↓
User selects topic
    ↓
doActionAsync(subscribe)
    ↓
Provider starts publishing
    ↓
doAction(topic-published)
    ↓
Widget receives data
```

### 4. Cleanup

```
Widget unmounts
    ↓
doActionAsync(unsubscribe)
    ↓
Provider stops publishing (if no subscribers)
    ↓
Datasource removed
    ↓
Provider component unmounts
    ↓
removeFilter(AVAILABLE_TOPICS)
removeAction(subscribe/unsubscribe)
```

---

## Priority Ranges

| Range | Purpose               | Example              |
| ----- | --------------------- | -------------------- |
| 1-5   | Core system           | Dashboard management |
| 10-20 | Standard datasources  | Foxglove, ROS        |
| 30-40 | Extension datasources | Custom APIs          |
| 50+   | Decorative/optional   | Debug logging        |

**Rule:** Lower priority = runs first

---

## Async vs Sync

### Synchronous

```typescript
// Adding
pluginsManager.addFilter(hook, { /*...*/ filter: (val) => val });
pluginsManager.addAction(hook, { /*...*/ action: (val) => {} });

// Calling
const result = pluginsManager.applyFilter(hook, initial);
pluginsManager.doAction(hook, data);
```

### Asynchronous

```typescript
// Adding
pluginsManager.addFilter(hook, { /*...*/ filter: async (val) => val });
pluginsManager.addAction(hook, { /*...*/ action: async (val) => {} });

// Calling
const result = await pluginsManager.applyFilterAsync(hook, initial);
await pluginsManager.doActionAsync(hook, data);
```

---

## Debugging Hooks

### List All Hooks

```typescript
// In browser console
window.pluginsManager._filters; // All registered filters
window.pluginsManager._actions; // All registered actions
```

### Monitor Hook Calls

```typescript
// Add logging filter/action
pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
	id: "debug-logger",
	priority: Infinity, // Run last
	filter: (topics) => {
		console.log("Available topics:", topics);
		return topics;
	},
});
```

### Test Hook Execution

```typescript
// Manually trigger
const result = pluginsManager.applyFilter(PluginsHooks.DATASOURCES_LIST, []);
console.log("Registered datasources:", result);
```

---

## Common Patterns

### Conditional Registration

```typescript
filter: (datasources) => {
	// Only register in development
	if (process.env.NODE_ENV === "development") {
		datasources.push(DebugDatasource);
	}
	return datasources;
};
```

### Datasource Detection

```typescript
filter: (widgets, datasources) => {
	const hasFoxglove = datasources.some((ds) =>
		ds.datasource_id.includes("foxglove"),
	);

	if (!hasFoxglove) {
		return widgets.filter((w) => !w.id.includes("foxglove"));
	}

	return widgets;
};
```

### Multiple Priorities

```typescript
// High priority: Add datasource
this.addFilter(PluginsHooks.DATASOURCES_LIST, {
	id: "my-datasource",
	priority: 10,
	filter: (ds) => {
		ds.push(MyDS);
		return ds;
	},
});

// Low priority: Log all datasources
this.addFilter(PluginsHooks.DATASOURCES_LIST, {
	id: "my-logger",
	priority: 100,
	filter: (ds) => {
		console.log(ds);
		return ds;
	},
});
```

---

## Next Steps

- [Plugin API](../api/plugin-api) - Complete plugin API reference
- [Creating a Plugin](../guides/creating-plugin) - Step-by-step plugin development guide
- [Data Flow](../core/data-flow) - Understanding data flow in ORMI-CORE
