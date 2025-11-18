# Creating a Datasource

This comprehensive guide walks through creating a datasource from scratch. We'll build a **Temperature Sensor API** datasource that fetches data from a REST API.

## Step 1: Project Setup

### Create Plugin Directory

```bash
cd plugins
mkdir ormi-temperature-sensor
cd ormi-temperature-sensor
```

### Initialize Package

Create `package.json`:

```json
{
    "name": "ormi-temperature-sensor",
    "version": "1.0.0",
    "description": "Temperature sensor API datasource",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.js"
        }
    },
    "scripts": {
        "build": "tsc",
        "dev": "tsc --watch",
        "lint": "eslint .",
        "typecheck": "tsc --noEmit"
    },
    "devDependencies": {
        "@workspace/eslint-config": "workspace:*",
        "@workspace/typescript-config": "workspace:*",
        "typescript": "^5.7.3"
    },
    "dependencies": {
        "@workspace/ormi-core": "workspace:*",
        "@workspace/ormi-plugins": "workspace:*",
        "@workspace/ui": "workspace:*",
        "@jsonforms/core": "^3.6.0",
        "sonner": "^2.0.6"
    },
    "ormi_plugin": true
}
```

### Create TypeScript Config

Create `tsconfig.json`:

```json
{
    "extends": "@workspace/typescript-config/react-library.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src",
        "declarationDir": "./dist"
    },
    "include": ["src"],
    "exclude": ["node_modules", "dist"]
}
```

---

## Step 2: Define Settings Interface

Create `src/types.ts`:

```typescript
import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

export interface TemperatureSensorSettings extends DatasourceProviderSettings {
    apiUrl: string; // API endpoint
    refreshInterval: number; // Polling interval in seconds
    sensorIds: string[]; // List of sensor IDs to fetch
}
```

---

## Step 3: Create Datasource Definition

Create `src/definition.ts`:

```typescript
import { DatasourceDefinition } from "@workspace/ormi-core/datasources";
import { TemperatureSensorSettings } from "./types";
import { TemperatureSensorProvider } from "./provider";

export const TemperatureSensorDefinition: DatasourceDefinition<TemperatureSensorSettings> =
    {
        id: "temperature-sensor-api",
        name: "Temperature Sensor API",
        description: "Fetch temperature data from REST API",

        // JSON Schema for configuration UI
        schema: {
            title: "Temperature Sensor Configuration",
            type: "object",
            properties: {
                title: {
                    type: "string",
                    title: "Connection Name",
                    description: "Name for this datasource instance",
                },
                enable: {
                    type: "boolean",
                    title: "Enable",
                    description: "Enable or disable this datasource",
                },
                apiUrl: {
                    type: "string",
                    title: "API URL",
                    description: "Base URL of the temperature API",
                    default: "https://api.example.com/sensors",
                },
                refreshInterval: {
                    type: "number",
                    title: "Refresh Interval (seconds)",
                    description: "How often to poll the API",
                    minimum: 1,
                    maximum: 3600,
                    default: 5,
                },
                sensorIds: {
                    type: "array",
                    title: "Sensor IDs",
                    description: "List of sensor IDs to monitor",
                    items: {
                        type: "string",
                    },
                    default: ["sensor-1", "sensor-2"],
                },
            },
            required: ["title", "apiUrl", "refreshInterval", "sensorIds"],
        },

        // Default settings
        data: {
            id: "",
            title: "Temperature Sensors",
            enable: true,
            apiUrl: "https://api.example.com/sensors",
            refreshInterval: 5,
            sensorIds: ["sensor-1", "sensor-2"],
        },

        // Provider component
        Provider: ({ children, props }) =>
            TemperatureSensorProvider(children, props),
    };
```

---

## Step 4: Implement Provider Component

Create `src/provider.tsx`:

```typescript
"use client"

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import {
    DatasourceTopic,
    SelectedTopic,
    DatasourceTopicFilter
} from '@workspace/ormi-core/datasources';
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from 'sonner';
import { TemperatureSensorSettings } from './types';

interface SensorData {
    sensorId: string;
    temperature: number;
    timestamp: string;
    unit: string;
}

export const TemperatureSensorProvider = (
    children: ReactNode,
    props: TemperatureSensorSettings
) => {
    const pluginsManager = usePluginsManager();
    const datasource_id = props.id;

    // State
    const [initialized, setInitialized] = useState(false);
    const [availableTopics, setAvailableTopics] = useState<DatasourceTopic[]>([]);

    // Refs for subscriptions and intervals
    const subscribersRef = useRef(new Map<string, number>());
    const pollIntervalsRef = useRef(new Map<string, NodeJS.Timeout>());

    // Hook names
    const subscribeHook = `${datasource_id}-subscribe`;
    const unsubscribeHook = `${datasource_id}-unsubscribe`;

    // Initialize: Build available topics
    useEffect(() => {
        if (!props.enable) {
            setInitialized(true);
            return;
        }

        const topics: DatasourceTopic[] = props.sensorIds.map(sensorId => ({
            topic: `/sensors/${sensorId}/temperature`,
            datasource_id: datasource_id,
            source: props,
            type: 'number',
            rawType: 'float64'
        }));

        setAvailableTopics(topics);
        setInitialized(true);
    }, [props, datasource_id]);

    // Register AVAILABLE_TOPICS filter
    useEffect(() => {
        if (!initialized) return;

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: `${datasource_id}-topics`,
            priority: 10,
            filter: async (
                topics: DatasourceTopic[],
                filter?: DatasourceTopicFilter
            ) => {
                if (!props.enable) return topics;

                if (filter) {
                    const filtered = availableTopics.filter(t => filter.filter(t));
                    topics.push(...filtered);
                } else {
                    topics.push(...availableTopics);
                }

                return topics;
            }
        });

        return () => {
            pluginsManager.removeFilter(
                PluginsHooks.AVAILABLE_TOPICS,
                `${datasource_id}-topics`
            );
        };
    }, [initialized, availableTopics, props, datasource_id, pluginsManager]);

    // Register subscription handlers
    useEffect(() => {
        if (!initialized) return;

        // Subscribe handler
        pluginsManager.addAction(subscribeHook, {
            id: `${datasource_id}-subscribe-handler`,
            priority: 10,
            action: async (topic: SelectedTopic) => {
                const count = subscribersRef.current.get(topic.topic) || 0;
                subscribersRef.current.set(topic.topic, count + 1);

                // Start polling on first subscriber
                if (count === 0) {
                    startPolling(topic);
                }
            }
        });

        // Unsubscribe handler
        pluginsManager.addAction(unsubscribeHook, {
            id: `${datasource_id}-unsubscribe-handler`,
            priority: 10,
            action: async (topic: SelectedTopic) => {
                const count = subscribersRef.current.get(topic.topic) || 0;
                if (count > 0) {
                    subscribersRef.current.set(topic.topic, count - 1);

                    // Stop polling on last unsubscribe
                    if (count === 1) {
                        stopPolling(topic.topic);
                    }
                }
            }
        });

        return () => {
            // Cleanup: stop all polling
            pollIntervalsRef.current.forEach(interval => clearInterval(interval));

            pluginsManager.removeAction(subscribeHook, `${datasource_id}-subscribe-handler`);
            pluginsManager.removeAction(unsubscribeHook, `${datasource_id}-unsubscribe-handler`);
        };
    }, [initialized, datasource_id, pluginsManager, subscribeHook, unsubscribeHook]);

    // Polling logic
    const startPolling = (topic: SelectedTopic) => {
        // Extract sensor ID from topic path
        const sensorId = topic.topic.split('/')[2]; // /sensors/SENSOR_ID/temperature

        const poll = async () => {
            try {
                const response = await fetch(`${props.apiUrl}/${sensorId}`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data: SensorData = await response.json();

                // Publish temperature value
                pluginsManager.doAction(
                    `${datasource_id}-${topic.topic}-published`,
                    data.temperature,
                    Date.now()
                );

            } catch (error) {
                console.error(`[Temperature Sensor] Failed to fetch ${sensorId}:`, error);
                toast.error(`Failed to fetch sensor ${sensorId}`);
            }
        };

        // Initial fetch
        poll();

        // Set up interval
        const interval = setInterval(poll, props.refreshInterval * 1000);
        pollIntervalsRef.current.set(topic.topic, interval);
    };

    const stopPolling = (topicName: string) => {
        const interval = pollIntervalsRef.current.get(topicName);
        if (interval) {
            clearInterval(interval);
            pollIntervalsRef.current.delete(topicName);
        }
    };

    // Render
    if (!initialized) {
        return (
            <div className="flex items-center justify-center p-4">
                <Spinner />
                <span className="ml-2">Initializing Temperature Sensors...</span>
            </div>
        );
    }

    return <>{children}</>;
};
```

---

## Step 5: Create Plugin Class

Create `src/index.ts`:

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { DatasourceDefinition } from "@workspace/ormi-core/datasources";
import { TemperatureSensorDefinition } from "./definition";
import { TemperatureSensorSettings } from "./types";

class TemperatureSensorPlugin extends Plugin {
    constructor() {
        super();

        this.name = "Temperature Sensor Plugin";
        this.description = "Fetch temperature data from REST API";
        this.version = "1.0.0";
        this.author = "Your Name";
        this.email = "your.email@example.com";

        // Register datasource definition
        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "temperature-sensor-registration",
            priority: 10,
            filter: (datasources: DatasourceDefinition[]) => {
                datasources.push(TemperatureSensorDefinition);
                return datasources;
            },
        });
    }
}

// Default export: Plugin class
export default TemperatureSensorPlugin;

// Named exports
export { TemperatureSensorProvider } from "./provider";
export { TemperatureSensorDefinition } from "./definition";
export type { TemperatureSensorSettings } from "./types";
```

---

## Step 6: Build and Test

### Build the Plugin

```bash
# In plugin directory
pnpm install
pnpm build
```

### Start Development

```bash
# Terminal 1: Plugin dev mode
pnpm dev

# Terminal 2: Web app (from workspace root)
cd ../..
pnpm dev
```

### Test in Browser

1. Open http://localhost:3000
2. Navigate to Datasources configuration
3. Click "Add Datasource"
4. Select "Temperature Sensor API"
5. Configure settings:
    - API URL
    - Refresh interval
    - Sensor IDs
6. Save and enable
7. Add a widget that displays numbers
8. Select a temperature topic
9. Data should start flowing!

---

## Common Issues

### Plugin Not Appearing

**Check:**

- `"ormi_plugin": true` in package.json
- Default export is Plugin class
- Plugin builds without errors
- Web app restarted after adding plugin

### Topics Not Showing

**Check:**

- `props.enable` is true
- `AVAILABLE_TOPICS` filter registered
- Filter ID is unique
- Topics array properly populated

### No Data Received

**Check:**

- Subscription handler registered
- Polling started on subscribe
- API URL is correct
- Network requests succeeding
- `doAction` called with correct hook name

### Memory Leaks

**Check:**

- Intervals cleared in cleanup
- Hooks removed in return functions
- Refs used instead of state for intervals
- Polling stopped when subscribers reach zero

---

## Enhancement Ideas

### Add Caching

```typescript
const cacheRef = useRef(new Map<string, SensorData>());

// In poll function
const cached = cacheRef.current.get(sensorId);
if (cached && Date.now() - new Date(cached.timestamp).getTime() < 1000) {
    // Use cached data
    return;
}
```

### Add Error Retry

```typescript
const retryCountRef = useRef(new Map<string, number>());

catch (error) {
    const retries = retryCountRef.current.get(sensorId) || 0;
    if (retries < 3) {
        retryCountRef.current.set(sensorId, retries + 1);
        setTimeout(poll, 1000); // Retry after 1 second
    }
}
```

### Add Historical Data

```typescript
const historyRef = useRef(new Map<string, number[]>());

// After publishing
const history = historyRef.current.get(topic.topic) || [];
history.push(data.temperature);
if (history.length > 100) history.shift();
historyRef.current.set(topic.topic, history);
```

---

## Next Steps

- **[Random Data Example](example-random)** - Timer-based datasource
- **[Foxglove Example](example-foxglove)** - WebSocket datasource
- **[Provider Pattern](../datasources/provider-pattern)** - Deep dive
- **[Plugin Integration](../plugins/integration)** - Advanced topics
