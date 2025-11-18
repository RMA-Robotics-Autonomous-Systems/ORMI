---
title: "Overview"
order: -1
---

# ORMI-CORE Documentation

Welcome to the ORMI-CORE documentation. This documentation focuses on the **Datasource System** architecture and implementation.

## What is ORMI-CORE?

ORMI-CORE is a modular plugin-based system for creating real-time data visualization dashboards. The datasource system is the foundation that enables widgets to subscribe to and publish data from various sources like ROS2, WebSocket connections, REST APIs, and more.

## Quick Links

- **[Datasource Overview](datasources/overview)** - Understand the datasource system architecture
- **[Core Interfaces](datasources/core-interfaces)** - Reference for TypeScript interfaces
- **[Creating a Datasource](implementation/creating-datasource)** - Step-by-step guide
- **[Plugin Integration](plugins/integration)** - How datasources integrate with the plugin system

## System Architecture

```ascii
┌─────────────────────────────────────────────────────┐
│                   Dashboard                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Widget 1 │  │ Widget 2 │  │ Widget 3 │           │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘           │
│        │             │             │                │
│        └─────────────┴─────────────┘                │
│                      │                              │
│            ┌─────────▼─────────┐                    │
│            │   Plugin Manager  │                    │
│            │   (Pub/Sub Hub)   │                    │
│            └─────────┬─────────┘                    │
│                      │                              │
│        ┌─────────────┼─────────────┐                │
│        │             │             │                │
│  ┌─────▼─────┐ ┌────▼─────┐ ┌────▼─────┐            │
│  │Datasource │ │Datasource│ │Datasource│            │
│  │ Foxglove  │ │ Random   │ │REST Bags │            │
│  └───────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

## Key Concepts

### Datasource

A datasource is a **data provider** that exposes topics (data streams) to the system. Each datasource:

- Implements a React Provider component
- Publishes data to topics via the plugin manager
- Manages subscriptions and connections
- Can be configured via JSON Schema

### Topic

A topic represents a **data stream** with:

- A unique name (e.g., `/robot/position`)
- Type information (both internal and raw)
- Source datasource reference
- Optional buffer size

### Plugin Integration

Datasources integrate through the **PluginsHooks** system:

- `DATASOURCES_LIST` - Register datasource definitions
- `AVAILABLE_TOPICS` - Expose available topics
- Topic-specific hooks for pub/sub

## Current Datasources

| Plugin                     | Description                         | Status        |
| -------------------------- | ----------------------------------- | ------------- |
| `ormi-foxglove`            | Foxglove WebSocket protocol support | ✅ Production |
| `ormi-rosbridge-suite`     | ROSBridge websocket connection      | ✅ Production |
| `ormi-rest-bags`           | REST API for ROS2 bag playback      | ✅ Production |
| `ormi-randoms-datasources` | Random test data generator          | ✅ Production |
| `ormi-tello`               | Tello drone control/telemetry       | ✅ Production |

## Next Steps

1. Read the [Datasource Overview](datasources/overview) to understand the architecture
2. Review [Core Interfaces](datasources/core-interfaces) for the TypeScript definitions
3. Follow the [Creating a Datasource](implementation/creating-datasource) guide to build your own
4. Check out [Example implementations](implementation/example-random) for reference
