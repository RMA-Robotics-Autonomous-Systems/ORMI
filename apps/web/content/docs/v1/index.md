---
title: "Overview"
order: -1
---

# ORMI-CORE Developer Documentation

Welcome to the ORMI-CORE developer documentation. This guide covers everything you need to extend the webapp through plugins, widgets, datasources, and custom renderers.

## What is ORMI-CORE?

ORMI-CORE is a **modular, plugin-based framework** for building real-time data visualization dashboards. It provides a flexible architecture where developers can:

- Create **custom widgets** for data visualization
- Implement **datasources** to connect to various data streams (ROS2, WebSocket, REST APIs)
- Build **plugins** that extend functionality through a powerful hooks system
- Add **custom JSON Forms renderers** for specialized UI components
- Define **templates** for reusable configurations
- Implement **data transforms** for coordinate system conversions

## Architecture Overview

For detailed architecture diagrams and provider chain explanation, see **[Plugin System](core/plugin-system)** and **[Data Flow](core/data-flow)**.

**V1 uses a nested provider pattern with pub/sub:**

1. **Application Level**: PluginsProvider wraps entire app, provides PluginManager
2. **Dashboard Level**: GlobalDataSourceProvider nests all datasource providers using `reduceRight()`
3. **Widget Level**: Each widget wrapped in LocalDataSourceProvider for independent subscriptions
4. **Data Flow**: Pub/sub pattern via PluginManager routes data from datasources to widgets

## Extension Points

ORMI-CORE provides multiple extension mechanisms:

### 1. **Plugins**

The foundation of extensibility. Plugins use a **hooks and filters** system to inject functionality.

**Use plugins to:**

- Register widgets and datasources
- Add custom JSON Forms renderers
- Extend transform systems
- Provide map visualizers
- Add any cross-cutting functionality

### 2. **Widgets**

React components that visualize or interact with data.

**Create widgets for:**

- Data visualization (charts, maps, 3D views)
- Control interfaces (joystick, keyboard)
- Status indicators
- Custom UI components

### 3. **Datasources**

React Providers that connect to data sources and publish to topics.

**Build datasources for:**

- WebSocket connections (ROS2, Foxglove)
- REST APIs
- Hardware interfaces
- Data generators
- File playback systems

### 4. **Custom Renderers**

JSON Forms renderers for specialized input controls.

**Add renderers for:**

- Topic selection
- Complex configuration UIs
- Custom data type editors

### 5. **Transforms**

Coordinate system transformations for robotics applications.

**Implement transforms for:**

- TF tree management
- Coordinate frame conversions
- Sensor fusion

## Quick Start

### Widget Example

```typescript
export function MyWidgetDefinition(): WidgetDefinition {
  return {
    id: 'my-widget',
    name: 'My Custom Widget',
    schema: { /* JSON Schema */ },
    uischema: { /* UI Schema */ },
    Component: (data) => <MyWidget {...data} />
  }
}
```

### Datasource Example

```typescript
export const MyDatasourceDefinition: DatasourceDefinition = {
  id: 'my-datasource',
  name: 'My Data Source',
  schema: { /* config schema */ },
  Provider: ({ children, props }) => (
    <MyDatasourceProvider {...props}>
      {children}
    </MyDatasourceProvider>
  )
}
```

### Plugin Example

```typescript
class MyPlugin extends Plugin {
    constructor() {
        super();
        this.name = "My Plugin";

        this.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: "my-widgets",
            filter: (widgets) => {
                widgets.push(MyWidgetDefinition());
                return widgets;
            },
        });
    }
}
```

For complete examples with implementation details, see the **[Guides](guides/creating-plugin)** section.

## Documentation Structure

### Core Concepts

- **[Plugin System](core/plugin-system)** - Hooks, filters, and the plugin architecture
- **[Data Flow](core/data-flow)** - How data moves from datasources to widgets
- **[Type System](core/type-system)** - Internal types and raw type conversions

### API Reference

- **[Plugin API](api/plugin-api)** - Plugin class and PluginManager reference
- **[Widget API](api/widget-api)** - Complete widget interface documentation
- **[Datasource API](api/datasource-api)** - Datasource implementation guide
- **[ButtonHolder API](api/button-holder-api)** - Adding controls to widget title bars
- **[Templates API](api/templates-api)** - Saving and loading dashboard configurations
- **[Transforms API](api/transforms-api)** - Coordinate transformations and TF tree management
- **[Renderers API](api/renderers-api)** - Custom JSON Forms renderers
- **[Dashboard API](api/dashboard-api)** - Dashboard state management
- **[Type System API](api/type-system-api)** - Type conversions and standardized data types

### Guides

- **[Creating a Plugin](guides/creating-plugin)** - Step-by-step plugin development
- **[Development Setup](guides/development-setup)** - Environment configuration
- **[Quick Reference](guides/quick-reference)** - Common patterns and code snippets

## Getting Started

1. **[Plugin System](core/plugin-system)** - Learn hooks, filters, and plugin architecture
2. **[Data Flow](core/data-flow)** - Understand how data moves from datasources to widgets
3. **[Widget API](api/widget-api)** - Complete widget interface documentation
4. **[Datasource API](api/datasource-api)** - Datasource implementation guide
5. **[Creating a Plugin](guides/creating-plugin)** - Step-by-step plugin development
6. **[Development Setup](guides/development-setup)** - Environment configuration

## Development Environment

ORMI-CORE is a monorepo using:

- **Turborepo** for build orchestration
- **TypeScript** for type safety
- **React** for UI components
- **JSON Forms** for configuration UIs
- **Bun** for package management

See [Development Setup](guides/development-setup) for complete environment configuration.
