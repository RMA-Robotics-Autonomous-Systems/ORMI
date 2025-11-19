---
title: "Overview"
order: -1
---

# ORMI-CORE V2 Developer Documentation

Welcome to the V2 documentation for ORMI-CORE. V2 introduces a **complete architectural redesign** using Jotai atoms as an asynchronous topic transport layer, replacing the nested provider pattern and custom pub/sub system.

## What is V2?

V2 transforms ORMI-CORE into a **high-performance, data-source agnostic framework** where:

- **Atoms act as topic buffers** - Each datasource+topic combination has its own atom
- **Async pub/sub pattern** - Publishers write to atoms, subscribers read automatically
- **Zero coupling** - Widgets don't know or care where data comes from
- **Widget signatures unchanged** - Widgets receive props as before, just without wrapper providers

## What's New in V2?

### Major Changes

🎯 **Simplicity**: Widgets no longer need `LocalDataSourceProvider` wrapper  
⚡ **Parallel**: Datasources run independently with no nesting  
🔧 **Developer Experience**: Simple hooks, widgets keep same prop signatures  
🐛 **Debugging**: Better DevTools with Jotai integration  
📡 **Async Topics**: Atoms provide automatic pub/sub without manual routing  
🛠️ **Stability**: Eliminates circular dependency issues that caused "Maximum update depth exceeded" errors in V1

### Breaking Changes

V2 is **not backward compatible** with V1, but both systems can coexist during migration.

**What changes:**

- ❌ No more `LocalDataSourceProvider` wrapper around widgets
- ❌ No more `useLocalDataSource()` hook
- ❌ No more nested datasource providers
- ❌ No more `PluginManager` pub/sub for data routing
- ✅ Datasources are now Connection classes (not React Providers)
- ✅ Widgets use `useDataStream(topic)` hook with SelectedTopic object
- ✅ **Widget component props remain unchanged** (same interface, different data source)

## Quick Comparison: V1 vs V2

For detailed comparisons and migration examples, see:

- **[Architecture Comparison](./core/architecture#architecture-comparison)** - Full V1 vs V2 architecture diagrams and trade-offs
- **[Widget Examples](./examples#widget-conversions)** - Complete widget conversion examples with code
- **[Migration Guide](./migration-guide)** - Step-by-step migration instructions

**Key differences:**

- ❌ V1: Nested datasource providers + `LocalDataSourceProvider` wrappers + `PluginManager` pub/sub
- ✅ V2: Flat provider hierarchy + Jotai atoms + Connection classes + `useDataStream` hook
- 🎯 **Widget business logic props unchanged** - Only data binding mechanism changes

## Documentation Structure

### Core Concepts

- **[Architecture](./core/architecture)** - V2 architecture with Jotai atoms as topic transport
- **[Data Flow](./core/data-flow)** - Async pub/sub pattern, subscription lifecycle, atom updates

### API Reference

Complete API documentation for all V2 systems:

- **[Connection API](./api/connection-api)** - Implementing datasource connections
- **[Hooks API](./api/hooks-api)** - React hooks for data access (`useDataStream`, `useConnectionStatus`, etc.)
- **[Widget API](./api/widget-api)** - Creating widgets with WidgetDefinition interface
- **[Dashboard API](./api/dashboard-api)** - Managing dashboard state, widgets, and layout
- **[Atoms API](./api/atoms-api)** - Jotai atoms for state management
- **[DatasourceManager API](./api/datasource-manager-api)** - Managing connection lifecycle
- **[Templates API](./api/templates-api)** - Saving/loading widget and datasource configurations
- **[Transforms API](./api/transforms-api)** - Coordinate frame transformations

### Practical Guides

- **[Migration Guide](./migration-guide)** - Step-by-step migration from V1 to V2
- **[Examples](./examples)** - Real-world widget conversions and connection implementations
- **[Plugin Development](./plugin-development)** - Creating V2-compatible plugins

## Core Concept: Atoms as Topic Transport

V2 uses **Jotai atoms as an async topic transport layer**. Each datasource+topic combination has its own atom that acts as a message queue.

**Key properties:**

- **Automatic routing**: Publishers write to atoms, subscribers automatically receive updates
- **Type-safe**: Each atom carries typed data
- **Decoupled**: Publishers and subscribers don't know about each other
- **Efficient**: Only subscribed widgets re-render
- **Data-source agnostic**: Widgets don't know if data comes from ROS, WebSocket, REST, or elsewhere

For detailed architecture explanation with diagrams, see **[Core Architecture](./core/architecture)**.

## Architecture Overview

For comprehensive architecture diagrams and detailed comparisons, see **[Core Architecture](./core/architecture)**.

**V1:** Nested providers (5+ levels deep) → PluginManager broadcasts → LocalDataSourceProvider wrappers → circular dependency issues

**V2:** Flat hierarchy (3 levels) → Jotai atom store → Direct subscriptions → No circular dependencies

### Data Flow Pattern

See **[Data Flow Documentation](./core/data-flow)** for complete lifecycle diagrams and subscription management.

**Simplified flow:**

1. **Subscription**: Widget calls `useDataStream(topic)` → DatasourceManager → Connection.subscribe()
2. **Publishing**: Connection receives data → emits to atom → Widget re-renders automatically
3. **Cleanup**: Widget unmounts → unsubscribe from atom → Connection.unsubscribe()

**Key improvement:** No manual pub/sub routing. Atoms handle everything automatically.

## Getting Started

### Basic Setup

```bash
bun add jotai jotai-devtools
```

```typescript
// app/layout.tsx
import { Provider as JotaiProvider } from 'jotai'

export default function RootLayout({ children }) {
  return <JotaiProvider>{children}</JotaiProvider>
}
```

### Quick Examples

**Simple widget using V2:**

```typescript
import { useDataStream } from '@workspace/ormi-core/v2'

function TemperatureWidget({ datasourceId, topic, units = '°C' }) {
  const { data, isLoading, error } = useDataStream<number>(datasourceId, topic)

  if (isLoading) return <Spinner />
  if (error) return <Error message={error.message} />

  return <div>Temperature: {data}{units}</div>
}
```

**For complete examples with schemas, Connection implementations, and advanced patterns, see [Examples](./examples)**.

## Next Steps

1. **[Core Architecture](./core/architecture)** - Understand atoms as topic transport with diagrams
2. **[Data Flow](./core/data-flow)** - Learn subscription lifecycle and async patterns
3. **[Connection API](./api/connection-api)** - Complete Connection interface reference
4. **[Hooks API](./api/hooks-api)** - Full `useDataStream` and other hooks documentation
5. **[Examples](./examples)** - Real-world widget and connection implementations
6. **[Migration Guide](./migration-guide)** - Step-by-step V1 to V2 migration

## Performance & Trade-offs

For detailed performance comparison and architecture trade-offs, see **[Architecture](./core/architecture#benefits-and-trade-offs)**.

**Key benefits:**

- Eliminates circular dependency issues from V1
- Flatter component hierarchy (5+ levels → 3 levels)
- Better DevTools integration via Jotai
- Independent datasource execution

**Considerations:**

- Not backward compatible - requires migration
- New mental model (atoms vs React Context)
- Additional dependency (Jotai)

## Support and Contributing

- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions in GitHub Discussions
- **Contributing**: See CONTRIBUTING.md for development guidelines
- **Examples**: Check the `examples/` directory for more code samples

---

**Ready to dive deeper?** Continue to [Core Architecture](./core/architecture) to understand how atoms enable async topic transport, or jump to [Examples](./examples) to see real code!
