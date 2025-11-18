---
title: "Development Setup"
order: 10
---

# Development Setup

Complete guide to setting up your development environment for ORMI-CORE.

## Prerequisites

### Required Software

- **Node.js** 18.0.0 or higher
- **Bun** 1.0.0 or higher (package manager and runtime)
- **Git** for version control
- Code editor (VS Code recommended)

### Installation

#### Install Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

#### Verify Installation

```bash
bun --version
node --version
```

## Repository Setup

### Clone Repository

```bash
git clone https://github.com/RMA-RAS-HMI/ORMI-CORE.git
cd ORMI-CORE
```

### Install Dependencies

```bash
bun install
```

This installs all dependencies for the monorepo.

### Build All Packages

```bash
bun run build
```

This compiles all TypeScript packages in the correct order.

## Monorepo Structure

```mermaid
graph TD
    A["ORMI-CORE/"] --> B["apps/"]
    A --> C["packages/"]
    A --> D["plugins/"]
    A --> E["turbo.json"]

    B --> B1["web/<br/>(Next.js webapp)"]

    C --> C1["ormi-core/<br/>(Core widgets, datasources, dashboard)"]
    C --> C2["ormi-plugins/<br/>(Plugin system)"]
    C --> C3["ormi-jsonforms/<br/>(JSON Forms extensions)"]
    C --> C4["ui/<br/>(UI components)"]
    C --> C5["utils/<br/>(Utilities and CLI)"]

    D --> D1["ormi-std-widgets/"]
    D --> D2["ormi-foxglove/"]
    D --> D3["ormi-rosbridge-suite/"]
    D --> D4["..."]

    style A fill:#e3f2fd
    style B fill:#fff3e0
    style C fill:#fff3e0
    style D fill:#fff3e0
    style E fill:#c8e6c9
```

## Development Workflow

### Start Development Server

```bash
cd apps/web
bun run dev
```

Opens webapp at `http://localhost:3000`

### Watch Mode for Packages

Terminal 1 - Core package:

```bash
cd packages/ormi-core
bun run dev
```

Terminal 2 - Your plugin:

```bash
cd plugins/my-plugin
bun run dev
```

Terminal 3 - Webapp:

```bash
cd apps/web
bun run dev
```

This enables hot reload across all packages.

### Build Individual Package

```bash
cd packages/ormi-core
bun run build
```

### Build All Packages

```bash
# From root
bun run build
```

## Creating a New Plugin

### Use the CLI (Recommended)

```bash
cd packages/utils
bun run dev  # Build CLI

ormi-plugins create my-plugin
```

### Manual Setup

```bash
cd plugins/
mkdir my-plugin
cd my-plugin

# Create package.json
cat > package.json << EOF
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@workspace/ormi-core": "workspace:*",
    "@workspace/ormi-plugins": "workspace:*"
  },
  "devDependencies": {
    "@workspace/typescript-config": "workspace:*",
    "typescript": "^5.7.3"
  }
}
EOF

# Create tsconfig.json
cat > tsconfig.json << EOF
{
  "extends": "@workspace/typescript-config/react-library.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
EOF

mkdir src
```

### Register Plugin

Edit `apps/web/ormi-plugins.ts`:

```typescript
const registry: PluginRegistry = {
    // ... existing plugins
    "my-plugin": import("my-plugin"),
};
```

Then rebuild:

```bash
bun install
bun run build
```

## Editor Setup (VS Code)

### Recommended Extensions

Install these extensions:

```json
{
    "recommendations": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-vscode.vscode-typescript-next"
    ]
}
```

### Settings

`.vscode/settings.json`:

```json
{
    "typescript.tsdk": "node_modules/typescript/lib",
    "typescript.enablePromptUseWorkspaceTsdk": true,
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    }
}
```

## TypeScript Configuration

### Base Config

From `packages/typescript-config/react-library.json`:

```json
{
    "compilerOptions": {
        "target": "ES2020",
        "lib": ["ES2020", "DOM"],
        "module": "ESNext",
        "moduleResolution": "bundler",
        "jsx": "react-jsx",
        "declaration": true,
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "resolveJsonModule": true
    }
}
```

### Plugin tsconfig.json

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

## Environment Variables

### Development

Create `apps/web/.env.local`:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ormi"

# Auth (if using NextAuth)
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Optional: External services
FOXGLOVE_URL="ws://localhost:8765"
```

### Production

Set environment variables in your deployment platform.

## Common Tasks

### Add a Dependency to a Plugin

```bash
cd plugins/my-plugin
bun add lucide-react
bun add -D @types/node
```

### Lint Code

```bash
# Lint all
bun run lint

# Lint specific package
cd packages/ormi-core
bun run lint
```

### Type Check

```bash
# Check all
bun run typecheck

# Check specific package
cd packages/ormi-core
bun run typecheck
```

### Clean Build Artifacts

```bash
# Remove all dist/ folders
find . -name "dist" -type d -prune -exec rm -rf {} \;

# Reinstall dependencies
rm -rf node_modules
bun install
```

## Debugging

### Debug in VS Code

Create `.vscode/launch.json`:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Next.js: debug server-side",
            "type": "node-terminal",
            "request": "launch",
            "command": "bun run dev",
            "cwd": "${workspaceFolder}/apps/web"
        },
        {
            "name": "Next.js: debug client-side",
            "type": "chrome",
            "request": "launch",
            "url": "http://localhost:3000"
        }
    ]
}
```

### Browser DevTools

- Open browser console (F12)
- React DevTools extension
- Check Network tab for WebSocket connections

### Debug Plugin Loading

Add logging to your plugin:

```typescript
class MyPlugin extends Plugin {
    constructor() {
        super({ name: "My Plugin" });
        console.log("[MyPlugin] Initializing...");
    }

    protected initialize(): void {
        console.log("[MyPlugin] Registering hooks");
        // ...
    }
}
```

## Testing

### Run Tests

```bash
# All tests
bun test

# Specific package
cd packages/ormi-core
bun test
```

### Watch Mode

```bash
bun test --watch
```

## Build for Production

```bash
# Build all packages
bun run build

# Build webapp
cd apps/web
bun run build

# Preview production build
bun run start
```

## Troubleshooting

### "Cannot find module" errors

```bash
# Rebuild packages
bun run build

# Clear cache
rm -rf node_modules/.cache
rm -rf apps/web/.next
```

### TypeScript errors in workspace packages

```bash
# Ensure all packages are built
cd packages/ormi-core
bun run build

cd packages/ormi-plugins
bun run build
```

### Hot reload not working

```bash
# Restart dev servers
# Ctrl+C all terminals
bun run build
cd apps/web
bun run dev
```

### Plugin not appearing

1. Check `apps/web/ormi-plugins.ts` includes your plugin
2. Rebuild: `bun run build`
3. Check browser console for errors
4. Verify plugin exports `default MyPlugin`

## Performance Tips

### Parallel Builds

Turborepo automatically parallelizes builds:

```bash
bun run build  # Builds all packages in parallel
```

### Incremental Compilation

TypeScript's incremental compilation is enabled by default:

```json
{
    "compilerOptions": {
        "incremental": true
    }
}
```

### Skip Type Checking for Faster Builds

Development only:

```bash
TSC_NO_CHECK=1 bun run dev
```

## Resources

- **Turborepo Docs**: https://turbo.build/repo/docs
- **Bun Docs**: https://bun.sh/docs
- **Next.js Docs**: https://nextjs.org/docs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/

## Getting Help

- Check documentation: [ORMI-CORE Docs](/)
- GitHub Issues: Report bugs or request features
- Discord/Slack: Ask questions (if available)

## Next Steps

- **[Creating a Plugin](creating-plugin)** - Build your first plugin
- **[Plugin System](../core/plugin-system)** - Understanding the architecture
- **[Widget API](../api/widget-api)** - Creating widgets
