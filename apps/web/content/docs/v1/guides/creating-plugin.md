---
title: "Creating a Plugin"
order: 1
---

# Creating a Plugin

This guide walks through creating a complete ORMI-CORE plugin with widgets and datasources.

## Overview

A plugin is a TypeScript/JavaScript package that extends ORMI-CORE functionality by:

- Registering custom widgets
- Providing datasources
- Adding JSON Forms renderers
- Extending transform systems

## Prerequisites

- Node.js 18+ and Bun installed
- ORMI-CORE monorepo cloned
- Basic TypeScript/React knowledge

## Step 1: Create Plugin Package

### Directory Structure

Create your plugin in the `plugins/` directory:

```bash
cd plugins/
mkdir my-awesome-plugin
cd my-awesome-plugin
```

### Initialize package.json

```json
{
    "name": "my-awesome-plugin",
    "version": "1.0.0",
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
        "dev": "tsc --watch"
    },
    "dependencies": {
        "@workspace/ormi-core": "workspace:*",
        "@workspace/ormi-plugins": "workspace:*",
        "@workspace/ui": "workspace:*"
    },
    "devDependencies": {
        "@workspace/typescript-config": "workspace:*",
        "typescript": "^5.7.3"
    }
}
```

### Create tsconfig.json

```json
{
    "extends": "@workspace/typescript-config/react-library.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src"
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
}
```

### Create src/ directory

```bash
mkdir src
```

## Step 2: Create Plugin Class

Create `src/index.ts`:

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";

class MyAwesomePlugin extends Plugin {
    constructor() {
        super({
            name: "My Awesome Plugin",
            description: "Adds custom widgets and datasources",
            version: "1.0.0",
            author: "Your Name",
            email: "your@email.com",
        });
    }

    protected initialize(): void {
        // Will add filters here
    }
}

export default MyAwesomePlugin;
```

## Step 3: Create a Simple Widget

Create `src/widgets/hello-world.tsx`:

```typescript
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { MessageCircle } from "lucide-react";

interface HelloWorldProps {
  title: string;
  message: string;
}

function HelloWorld({ message }: HelloWorldProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Hello ORMI!</h2>
        <p className="text-lg">{message}</p>
      </div>
    </div>
  );
}

export function HelloWorldDefinition(): WidgetDefinition {
  return {
    id: 'my-plugin-hello-world',
    name: 'Hello World',
    description: 'Simple greeting widget',
    icon: <MessageCircle />,
    titleProp: 'title',

    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Widget Title',
          default: 'Hello World'
        },
        message: {
          type: 'string',
          title: 'Message',
          default: 'Welcome to ORMI-CORE!'
        }
      },
      required: ['title', 'message']
    },

    uischema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/title"
        } as ControlElement,
        {
          type: "Control",
          scope: "#/properties/message",
          options: {
            multi: true
          }
        } as ControlElement
      ]
    } as VerticalLayout,

    data: {
      title: 'Hello World',
      message: 'Welcome to ORMI-CORE!'
    },

    Component: (data: HelloWorldProps) => <HelloWorld {...data} />
  };
}
```

## Step 4: Create a Data Widget

Create `src/widgets/number-display.tsx`:

```typescript
import { WidgetDefinition, LocalDataSourcesProvider, useLocalDataSource, SelectedTopic } from "@workspace/ormi-core";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { Gauge } from "lucide-react";

interface NumberDisplayProps {
  title: string;
  topic: SelectedTopic;
  unit: string;
  decimals: number;
}

function NumberDisplay({ unit, decimals, topic }: NumberDisplayProps) {
  const { getSource } = useLocalDataSource();

  if (!topic) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Please select a topic
      </div>
    );
  }

  const source = getSource(topic);
  if (!source || source.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Waiting for data...
      </div>
    );
  }

  // Get the most recent value
  const value = source.data[source.data.length - 1];

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-6xl font-bold">
        {typeof value === 'number' ? value.toFixed(decimals) : String(value)}
      </div>
      {unit && (
        <div className="text-xl text-gray-500 mt-2">
          {unit}
        </div>
      )}
    </div>
  );
}

export function NumberDisplayDefinition(): WidgetDefinition {
  return {
    id: 'my-plugin-number-display',
    name: 'Number Display',
    description: 'Large numeric value display',
    icon: <Gauge />,
    titleProp: 'title',

    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Title'
        },
        topic: {
          type: 'object',
          title: 'Data Topic'
        },
        unit: {
          type: 'string',
          title: 'Unit',
          default: ''
        },
        decimals: {
          type: 'number',
          title: 'Decimal Places',
          default: 2,
          minimum: 0,
          maximum: 10
        }
      },
      required: ['title', 'topic']
    },

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
              scope: "#/properties/unit"
            },
            {
              type: "Control",
              scope: "#/properties/decimals"
            }
          ]
        }
      ]
    } as VerticalLayout,

    data: {
      title: 'Number Display',
      unit: '',
      decimals: 2
    },

    Component: (data: NumberDisplayProps) => (
      <LocalDataSourcesProvider
        SelectedTopics={[data.topic]}
        buffersSize={1}
      >
        <NumberDisplay {...data} />
      </LocalDataSourcesProvider>
    )
  };
}
```

## Step 5: Create Widget Export

Create `src/widgets/index.ts`:

```typescript
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { HelloWorldDefinition } from "./hello-world";
import { NumberDisplayDefinition } from "./number-display";

export function widgetExport(widgets: WidgetDefinition[]): WidgetDefinition[] {
    widgets.push(HelloWorldDefinition());
    widgets.push(NumberDisplayDefinition());
    return widgets;
}
```

## Step 6: Register Widgets in Plugin

Update `src/index.ts`:

```typescript
import { Plugin, PluginsHooks } from "@workspace/ormi-plugins";
import { widgetExport } from "./widgets";

class MyAwesomePlugin extends Plugin {
    constructor() {
        super({
            name: "My Awesome Plugin",
            description: "Adds custom widgets and datasources",
            version: "1.0.0",
            author: "Your Name",
            email: "your@email.com",
        });
    }

    protected initialize(): void {
        // Register widgets
        this.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: `${this.name}-widgets`,
            priority: 10,
            filter: widgetExport,
        });
    }
}

export default MyAwesomePlugin;
```

## Step 7: Build Plugin

```bash
bun run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Step 8: Register Plugin in App

Edit `apps/web/ormi-plugins.ts`:

```typescript
import { PluginRegistry } from "@workspace/ormi-plugins";

const registry: PluginRegistry = {
    // ... existing plugins
    "my-awesome-plugin": import("my-awesome-plugin"),
};

export default registry;
```

## Step 9: Update Workspace

Add to root `package.json` if not auto-detected:

```json
{
    "workspaces": ["apps/*", "packages/*", "plugins/*"]
}
```

## Step 10: Install and Test

```bash
# From repository root
bun install

# Build everything
bun run build

# Start dev server
cd apps/web
bun run dev
```

Open the app and your widgets should appear in the widget picker!

## Adding a Datasource

Create `src/datasources/counter-datasource.tsx`:

```typescript
import { DatasourceDefinition, DatasourceProviderSettings, DatasourceTopic, SelectedTopic } from "@workspace/ormi-core/datasources";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { ReactNode, useEffect, useRef, useState } from "react";

interface CounterDatasourceSettings extends DatasourceProviderSettings {
  frequency: number;
  maxCount: number;
}

function CounterProvider(children: ReactNode, props: CounterDatasourceSettings) {
  const pluginManager = usePluginsManager();
  const datasource_id = props.id;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);
  const [initialized, setInitialized] = useState(false);

  // Hook names
  const available_topics_hook = `${datasource_id}-available-topics`;
  const subscribe_hook = `${datasource_id}-subscribe`;
  const unsubscribe_hook = `${datasource_id}-unsubscribe`;
  const definition_hook = `${datasource_id}-definition`;

  // Register available topics
  useEffect(() => {
    pluginManager.addFilter(available_topics_hook, {
      id: datasource_id,
      priority: 10,
      filter: (topics: DatasourceTopic[]) => {
        topics.push({
          topic: '/counter',
          datasource_id,
          source: props,
          type: 'number',
          rawType: 'number',
          bufferSize: 10
        });
        return topics;
      }
    });

    return () => pluginManager.removeFilter(available_topics_hook);
  }, []);

  // Subscribe hook - track subscriber count
  useEffect(() => {
    const subscribersCountRef = useRef(new Map<string, number>());

    pluginManager.addAction(subscribe_hook, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic) => {
        // Track subscriber count
        const count = subscribersCountRef.current.get(topic.topic) || 0;
        subscribersCountRef.current.set(topic.topic, count + 1);

        console.log(`Subscribed to ${topic.topic} (count: ${count + 1})`);
      }
    });

    return () => pluginManager.removeAction(subscribe_hook);
  }, []);

  // Unsubscribe hook - decrement subscriber count
  useEffect(() => {
    pluginManager.addAction(unsubscribe_hook, {
      id: datasource_id,
      priority: 10,
      action: (topic: SelectedTopic, ignoreCount = false) => {
        if (ignoreCount) {
          subscribersCountRef.current.delete(topic.topic);
          console.log(`Force unsubscribed from ${topic.topic}`);
          return;
        }

        const count = subscribersCountRef.current.get(topic.topic) || 0;
        const newCount = Math.max(0, count - 1);
        subscribersCountRef.current.set(topic.topic, newCount);

        console.log(`Unsubscribed from ${topic.topic} (count: ${newCount})`);
      }
    });

    return () => pluginManager.removeAction(unsubscribe_hook);
  }, []);

  // Definition hook
  useEffect(() => {
    pluginManager.addFilter(definition_hook, {
      id: datasource_id,
      priority: 10,
      filter: () => props
    });

    return () => pluginManager.removeFilter(definition_hook);
  }, [props]);

  // Counter logic
  useEffect(() => {
    if (!props.enable) {
      setInitialized(false);
      return;
    }

    setInitialized(true);
    countRef.current = 0;

    intervalRef.current = setInterval(() => {
      countRef.current++;

      if (countRef.current > props.maxCount) {
        countRef.current = 0;
      }

      // Publish count to all registered callbacks
      pluginManager.doAction(
        `${datasource_id}-/counter-published`,
        countRef.current,        // data
        Date.now(),             // timestamp
        "counter_frame"         // referenceFrameId (optional)
      );
    }, 1000 / props.frequency);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [props.enable, props.frequency, props.maxCount]);

  return <>{initialized && children}</>;
}

export const CounterDatasourceDefinition: DatasourceDefinition<CounterDatasourceSettings> = {
  id: 'my-plugin-counter-datasource',
  name: 'Counter Data Source',
  description: 'Generates incrementing counter',
  titleProp: 'title',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Name'
      },
      enable: {
        type: 'boolean',
        title: 'Enable',
        default: true
      },
      frequency: {
        type: 'number',
        title: 'Frequency (Hz)',
        default: 1,
        minimum: 0.1,
        maximum: 100
      },
      maxCount: {
        type: 'number',
        title: 'Max Count',
        default: 100,
        minimum: 1
      }
    },
    required: ['title']
  },

  data: {
    id: '',
    title: '',
    enable: true,
    frequency: 1,
    maxCount: 100
  },

  Provider: ({ children, props }) => CounterProvider(children, props)
};
```

Register datasource in `src/index.ts`:

```typescript
import { CounterDatasourceDefinition } from "./datasources/counter-datasource";

// In initialize():
this.addFilter(PluginsHooks.DATASOURCES_LIST, {
    id: `${this.name}-datasources`,
    priority: 10,
    filter: (datasources) => {
        datasources.push(CounterDatasourceDefinition);
        return datasources;
    },
});
```

## Testing Your Plugin

1. **Rebuild:**

    ```bash
    bun run build
    ```

2. **Start app:**

    ```bash
    cd apps/web
    bun run dev
    ```

3. **Add datasource:**
    - Open dashboard
    - Add Counter datasource
    - Configure frequency and max count

4. **Add widget:**
    - Add Number Display widget
    - Select `/counter` topic
    - Watch the counter increment

## Next Steps

- **[Widget API](../api/widget-api)** - Advanced widget features
- **[Datasource API](../api/datasource-api)** - Complex datasources
- **[Plugin Examples](../examples/plugin-bundle)** - Real-world plugins
