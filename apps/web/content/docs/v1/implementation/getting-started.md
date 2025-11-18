# Getting Started

This guide will help you set up your development environment and understand the basics before creating your first datasource.

## Prerequisites

### Required Knowledge

- **TypeScript** - All code is written in TypeScript
- **React** - Datasource providers are React components
- **Hooks** - Familiarity with useState, useEffect, useRef
- **JSON Schema** - For configuration definitions

### Development Environment

- Node.js 18+ and pnpm
- VS Code (recommended) or similar IDE
- Git

---

## Workspace Structure

```
ORMI-CORE/
├── packages/
│   ├── ormi-core/          # Core interfaces and components
│   ├── ormi-plugins/       # Plugin system
│   └── ui/                 # UI components
├── plugins/
│   ├── ormi-foxglove/      # Example: WebSocket datasource
│   ├── ormi-randoms-datasources/  # Example: Random data
│   └── YOUR-PLUGIN/        # ← Your new plugin here
└── apps/
    └── web/                # Main Next.js application
```

---

## Creating a New Plugin

### 1. Copy Template Structure

```bash
cd plugins
mkdir ormi-my-datasource
cd ormi-my-datasource
```

### 2. Initialize package.json

```json
{
    "name": "ormi-my-datasource",
    "version": "1.0.0",
    "description": "My custom datasource",
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

### 3. Create tsconfig.json

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

### 4. Create Source Structure

```bash
mkdir src
touch src/index.ts
touch src/provider.tsx
touch src/definition.ts
```

---

## File Structure

```
ormi-my-datasource/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts           # Plugin class + exports
    ├── definition.ts      # Datasource definition
    └── provider.tsx       # Provider component
```

---

## Basic Implementation Checklist

Before diving into the full implementation, ensure you understand:

- [ ] **Core Interfaces** - `DatasourceDefinition`, `DatasourceTopic`
- [ ] **Plugin System** - How filters and actions work
- [ ] **Provider Pattern** - React Provider component requirements
- [ ] **Topic System** - Naming, types, publishing
- [ ] **Subscription Management** - Tracking subscribers
- [ ] **JSON Schema** - Configuration structure

---

## Development Workflow

### 1. Install Dependencies

```bash
# From workspace root
pnpm install
```

### 2. Start Dev Mode

```bash
# In your plugin directory
pnpm dev
```

This runs `tsc --watch` for live compilation.

### 3. Start Web App

```bash
# From workspace root or apps/web
pnpm dev
```

The web app will hot-reload when your plugin changes.

### 4. Test Your Plugin

1. Open the web app (usually http://localhost:3000)
2. Navigate to datasources configuration
3. Your datasource should appear in the list
4. Create an instance and configure it
5. Add widgets that use your datasource's topics

---

## Available Utilities

### From `@workspace/ormi-core`

```typescript
import {
    // Datasource
    DatasourceDefinition,
    DatasourceProviderSettings,
    Datasource,
    DatasourceTopic,
    SelectedTopic,
    DatasourceTopicFilter,

    // Dashboard (if needed)
    useDashboardManager,
} from "@workspace/ormi-core/datasources";
```

### From `@workspace/ormi-plugins`

```typescript
import {
    Plugin,
    PluginsHooks,
    PluginsManager,
    usePluginsManager,
} from "@workspace/ormi-plugins";
```

### From `@workspace/ui`

```typescript
import {
    Button,
    Dialog,
    Input,
    // ... many more UI components
} from "@workspace/ui";

import { Spinner } from "@workspace/ui/components/spinner";
```

### From Third-Party

```typescript
// JSON Forms (for configuration UI)
import { JsonSchema, UISchemaElement } from "@jsonforms/core";

// Toasts
import { toast } from "sonner";
```

---

## Common Patterns

### Settings Interface

```typescript
interface MyDatasourceSettings extends DatasourceProviderSettings {
    // Always extends DatasourceProviderSettings
    serverUrl: string;
    apiKey?: string;
    timeout: number;
}
```

### Plugin Class

```typescript
class MyDatasourcePlugin extends Plugin {
    constructor() {
        super();

        this.name = "My Datasource Plugin";
        this.description = "Description here";
        this.version = "1.0.0";
        this.author = "Your Name";

        // Register datasource
        this.addFilter(PluginsHooks.DATASOURCES_LIST, {
            id: "my-datasource-reg",
            priority: 10,
            filter: (datasources) => {
                datasources.push(MyDatasourceDefinition);
                return datasources;
            },
        });
    }
}

export default MyDatasourcePlugin;
```

---

## Debugging Tips

### Console Logging

```typescript
// Add to provider
console.log("[MyDatasource] Initializing...", props);
console.log("[MyDatasource] Received data:", data);
```

### React DevTools

- Check component tree
- Verify providers are mounted
- Inspect props and state

### Plugin Manager Inspection

```typescript
// In provider
const pluginsManager = usePluginsManager();

useEffect(() => {
    console.log(
        "Registered datasources:",
        pluginsManager.applyFilter(PluginsHooks.DATASOURCES_LIST, [])
    );
}, []);
```

### Topic Debugging

```typescript
// Check available topics
const topics = await pluginsManager.applyFilterAsync(
    PluginsHooks.AVAILABLE_TOPICS,
    []
);
console.log("All topics:", topics);
```

---

## Next Steps

Ready to build? Follow these guides in order:

1. **[Creating a Datasource](creating-datasource)** - Step-by-step tutorial
2. **[Random Data Example](example-random)** - Simple timer-based datasource
3. **[Foxglove Example](example-foxglove)** - WebSocket-based datasource
4. **[REST Bags Example](example-rest-bags)** - REST API datasource

Or jump to specific topics:

- [Core Interfaces](../datasources/core-interfaces)
- [Provider Pattern](../datasources/provider-pattern)
- [Plugin Integration](../plugins/integration)
