---
title: "Overview"
order: -1
---

# ORMI : Open Robotic Management Interfaces (V3 Architecture)

## Architecture Overview

V3 introduces a **Service-Oriented Architecture** decoupled from the UI framework. The core logic resides in framework-agnostic managers, while the UI (React) interacts with them via hooks and signals. This separation ensures that the robotic connectivity logic is robust, testable, and independent of UI rendering cycles.

## User Stories & Requirements

The V3 architecture is driven by the following core user stories, ensuring the system meets the needs of developers, integrators, and operators.

| Actor                  | User Story                                                                                                       | Key Requirements                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Robotics Engineer**  | I want to visualize high-bandwidth sensor data (Lidar, Cameras) in real-time to debug perception algorithms.     | • Zero-copy data handling where possible<br />• Support for binary data (ArrayBuffers)<br />• 60Hz+ rendering performance |
| **Operator**           | I want to manually control the robot using a joystick or keyboard with immediate feedback.                       | • Low-latency input transmission<br />• Configurable input mapping<br />• Safety watchdogs (auto-stop on disconnect)      |
| **Frontend Developer** | I want to build custom widgets using standard React hooks without knowing the underlying communication protocol. | • `useDataStream` hook abstraction<br />• TypeScript type safety for topics<br />• Decoupled from ROS/WebSocket logic     |
| **System Integrator**  | I want to connect to multiple heterogeneous systems (ROS2, REST API, MQTT) simultaneously in one dashboard.      | • Unified `IDatasource` interface<br />• Protocol-agnostic data normalization<br />• Dynamic connection management        |
| **Plugin Author**      | I want to extend the system with new datasources or transformers without forking the core codebase.              | • Stable Plugin API<br />• Dynamic loading of modules<br />• Access to core managers via Kernel                           |

## Class Diagram

The following diagram illustrates the core relationships between the Kernel, Managers, Datasources, and Widgets.

```mermaid
---
title: ORMI-CORE V3 Class Diagram
---
classDiagram
    namespace Core {
        class OrmiKernel {
            +PluginManager plugins
            +DatasourceManager datasources
            +WidgetManager widgets
            +LayoutManager layout
            +TransformationManager transforms
            +initialize()
        }

        class PluginManager {
            +registerPlugin(plugin)
            +loadPlugins()
        }

        class DatasourceManager {
            -Map~string, IDatasource~ activeDatasources
            -Map~string, Topic~ activeTopics
            +registerDatasourceDefinition(def)
            +createDatasource(config)
            +getDatasource(id)
            +subscribe(topicRequest)
            +publish(topic, data)
        }

        class WidgetManager {
            -Map~string, WidgetDefinition~ definitions
            +registerWidget(def)
            +getWidget(type)
        }

        class TransformationManager {
            +registerTransform(transform)
            +transform(data, sourceFrame, targetFrame)
        }
    }

    namespace DatasourceAPI {
        class IDatasource {
            <<interface>>
            +string id
            +DatasourceConfig config
            +connect()
            +disconnect()
            +subscribe(topic)
            +unsubscribe(topic)
            +publish(topic, data)
            +getAvailableTopics()
        }

        class BaseDatasource {
            <<abstract>>
            #EventEmitter emitter
            +emitData(topic, data)
        }

        class Topic {
            +string name
            +string type
            +string rawType
            +IDatasource source
        }

        class TopicRequest {
            +string datasourceId
            +string topicName
            +string propertyPath
        }
    }

    namespace WidgetAPI {
        class WidgetDefinition {
            +string type
            +string name
            +JsonSchema configSchema
            +Component component
        }

        class WidgetInstance {
            +string id
            +string type
            +object config
            +TopicRequest[] inputs
        }
    }

    OrmiKernel *-- DatasourceManager
    OrmiKernel *-- WidgetManager
    OrmiKernel *-- PluginManager
    OrmiKernel *-- TransformationManager

    DatasourceManager o-- IDatasource
    IDatasource <|-- BaseDatasource
    BaseDatasource <|-- Ros2Datasource
    BaseDatasource <|-- RestDatasource

    WidgetManager o-- WidgetDefinition

    IDatasource ..> Topic : produces
    WidgetInstance ..> TopicRequest : requests
    DatasourceManager ..> Topic : manages
```

## Data Flow Diagram

This diagram shows how data flows from an external source to the UI widget.

```mermaid
---
title: V3 Data Flow
---
flowchart LR
    subgraph External
        ROS2[ROS2 Network]
        REST[REST API]
    end

    subgraph DatasourceLayer
        Driver[Datasource Driver]
        Normalizer[Type Normalizer]
    end

    subgraph CoreLayer
        Atom["Topic State (Atom/Signal)"]
        Transform[Transformation Engine]
    end

    subgraph UILayer
        Hook[useDataStream Hook]
        Widget[Widget Component]
    end

    ROS2 -->|Raw Data| Driver
    REST -->|JSON| Driver
    Driver -->|Raw Data| Normalizer
    Normalizer -->|Standardized Type| Atom
    Atom -->|Update| Transform
    Transform -->|Transformed Data| Hook
    Hook -->|Re-render| Widget
```

## Sequence Diagrams

### 1. Application Initialization

```mermaid
sequenceDiagram
    participant App
    participant Kernel
    participant PluginMgr
    participant DSMgr as DatasourceManager

    App->>Kernel: initialize()
    activate Kernel
    Kernel->>PluginMgr: loadPlugins()
    activate PluginMgr
    PluginMgr-->>Kernel: Plugins Loaded
    deactivate PluginMgr

    Kernel->>DSMgr: restoreConnections(savedConfig)
    activate DSMgr
    loop For each saved connection
        DSMgr->>DSMgr: createDatasource(config)
        DSMgr->>IDatasource: connect()
    end
    deactivate DSMgr

    Kernel-->>App: Ready
    deactivate Kernel
```

### 2. Widget Subscription Flow

```mermaid
sequenceDiagram
    participant User
    participant Widget
    participant Hook as useDataStream
    participant DSMgr as DatasourceManager
    participant DS as IDatasource

    User->>Widget: Mounts Widget
    Widget->>Hook: useDataStream(topicReq)
    activate Hook
    Hook->>DSMgr: subscribe(topicReq)
    activate DSMgr
    DSMgr->>DSMgr: resolveDatasource(topicReq)
    DSMgr->>DS: subscribe(topic)
    activate DS
    DS-->>DSMgr: Subscription Confirmed
    deactivate DS
    DSMgr-->>Hook: Return Observable/Atom
    deactivate DSMgr

    loop Data Stream
        DS->>DS: Receive Data
        DS->>DSMgr: emit(topic, data)
        DSMgr->>Hook: update(data)
        Hook->>Widget: re-render(data)
    end
    deactivate Hook
```
