# Existing Datasources

Overview of all datasources currently available in ORMI-CORE.

## Production Datasources

### ormi-foxglove

**Purpose:** Foxglove WebSocket protocol support  
**Status:** ✅ Production Ready  
**Location:** `plugins/ormi-foxglove/`

**Features:**

- WebSocket connection with auto-reconnect
- Dynamic topic discovery
- ROS2 message serialization/deserialization
- Transform tree (TF) support
- Publisher support
- Multiple data type support

**Configuration:**

```typescript
{
    url: string;              // ws://localhost:8765
    reconnectTimeout: number; // seconds
    toasts: boolean;          // show notifications
    transformTreeTopics: string[]; // TF topics
}
```

**Use Cases:**

- ROS2 integration via Foxglove Studio
- Real-time robotics data
- Sensor visualization
- 3D transform visualization

---

### ormi-rosbridge-suite

**Purpose:** ROSBridge WebSocket connection  
**Status:** ✅ Production Ready  
**Location:** `plugins/ormi-rosbridge-suite/`

**Features:**

- ROSBridge protocol support
- ROS2 topic subscription
- Service call support
- Action client support
- Message publishing

**Configuration:**

```typescript
{
    url: string; // ws://localhost:9090
    reconnectTimeout: number;
    topics: Array<{
        topic: string;
        frequency: number;
    }>;
}
```

**Use Cases:**

- Direct ROS2 connection
- Alternative to Foxglove
- Legacy ROS systems
- Custom ROS applications

---

### ormi-rest-bags

**Purpose:** REST API for ROS2 bag playback  
**Status:** ✅ Production Ready  
**Location:** `plugins/ormi-rest-bags/`

**Features:**

- Bag file listing
- Playback control (play/pause/stop)
- Recording support
- Topic filtering
- Playback speed control

**Configuration:**

```typescript
{
    url: string; // http://localhost:8000
}
```

**Includes Widgets:**

- **Bag List** - Browse and play bags
- **Bag Recorder** - Record new bags

**Use Cases:**

- Replaying recorded data
- Testing without live robot
- Data analysis
- Demo presentations

---

### ormi-randoms-datasources

**Purpose:** Generate random test data  
**Status:** ✅ Production Ready  
**Location:** `plugins/ormi-randoms-datasources/`

**Features:**

- Configurable topics
- Multiple data types
- Adjustable frequencies
- No external dependencies

**Configuration:**

```typescript
{
    topics: Array<{
        topic: string;
        frequency: number;  // Hz
        type: 'number' | 'boolean' | 'IMU' | 'GeolocationPosition' | /* ... */;
    }>;
}
```

**Supported Types:**

- `number` - Random float
- `boolean` - Random true/false
- `string` - Random string
- `GeolocationPosition` - GPS data
- `IMU` - Inertial measurement
- `Movement` - Motion vectors
- `PointsCloud` - 3D points

**Use Cases:**

- Development without hardware
- Testing widgets
- Performance testing
- Demos and prototypes

---

### ormi-tello

**Purpose:** DJI Tello drone control  
**Status:** ✅ Production Ready  
**Location:** `plugins/ormi-tello/`

**Features:**

- Drone telemetry subscription
- Command sending
- Video stream (planned)
- Battery monitoring

**Configuration:**

```typescript
{
    ip: string; // 192.168.10.1 (default)
}
```

**Includes Widgets:**

- **Tello Commands** - Control drone

**Exposes Topics:**

- `/tello/battery` - Battery level
- `/tello/position` - Current position
- `/tello/status` - Flight status

**Use Cases:**

- Drone control interfaces
- Telemetry monitoring
- Autonomous flight
- Educational projects

---

## Experimental Datasources

### ormi-ros2-type-extension

**Purpose:** Extended ROS2 type support  
**Status:** 🚧 Experimental  
**Location:** `plugins/ormi-ros2-type-extension/`

**Features:**

- Additional ROS2 message types
- Type conversion utilities
- Schema extensions

**Use Cases:**

- Custom ROS2 message types
- Type system extensions

---

## Domain-Specific Extensions

### teodor-emi-extension

**Purpose:** TEODOR EMI system integration  
**Status:** 🏢 Internal Use  
**Location:** `plugins/teodor-emi-extension/`

**Features:**

- Custom protocol support
- Domain-specific widgets
- Specialized data types

---

## Datasource Comparison

| Datasource  | Protocol     | Realtime    | Dynamic Topics | Complexity  |
| ----------- | ------------ | ----------- | -------------- | ----------- |
| Foxglove    | WebSocket    | ✅ Yes      | ✅ Yes         | ⭐⭐⭐ High |
| ROSBridge   | WebSocket    | ✅ Yes      | ✅ Yes         | ⭐⭐ Medium |
| REST Bags   | REST/Polling | ⚠️ Playback | ✅ Yes         | ⭐⭐ Medium |
| Random Data | Internal     | ✅ Yes      | ❌ No          | ⭐ Simple   |
| Tello       | Socket.IO    | ✅ Yes      | ❌ No          | ⭐⭐ Medium |

---

## Common Data Types

### Standard Types

```typescript
"number"; // Float/int values
"string"; // Text data
"boolean"; // True/false
```

### Geometric Types

```typescript
"Vector3"; // 3D vector (x, y, z)
"Quaternion"; // Rotation quaternion
"Pose"; // Position + orientation
"Transform"; // Coordinate transform
```

### Sensor Types

```typescript
"GeolocationPosition"; // GPS coordinates
"IMU"; // Inertial measurement
"Image"; // Camera image
"PointsCloud"; // 3D point cloud
"LaserScan"; // LIDAR data
```

### Robot Types

```typescript
"Movement"; // Velocity/acceleration
"BatteryStatus"; // Battery info
"RobotState"; // General robot state
```

---

## Creating New Datasources

To add a new datasource, see:

- [Getting Started](../implementation/getting-started)
- [Creating a Datasource](../implementation/creating-datasource)
- [Examples](../implementation/example-random)

---

## Plugin Dependencies

### Core Dependencies

All datasources depend on:

```json
{
    "@workspace/ormi-core": "workspace:*",
    "@workspace/ormi-plugins": "workspace:*",
    "@workspace/ui": "workspace:*"
}
```

### Common Optional Dependencies

```json
{
    "@jsonforms/core": "^3.6.0", // Configuration UI
    "sonner": "^2.0.6", // Toast notifications
    "react-use-websocket": "^4.13.0" // WebSocket support
}
```

### Protocol-Specific

**Foxglove:**

```json
{
    "@foxglove/cdr": "^3.4.0",
    "@foxglove/message-definition": "^0.4.0",
    "@foxglove/rosmsg2-serialization": "^3.0.0",
    "@foxglove/ws-protocol": "^0.8.0"
}
```

**ROSBridge:**

```json
{
    "roslib": "^1.4.1",
    "@types/roslib": "^1.3.5"
}
```

**Tello:**

```json
{
    "socket.io-client": "^4.8.1"
}
```

---

## Installation

All plugins are part of the monorepo and installed via:

```bash
pnpm install
```

Individual plugins can be built with:

```bash
cd plugins/plugin-name
pnpm build
```

---

## Next Steps

- [Creating a Datasource](../implementation/creating-datasource)
- [Plugin Integration](../plugins/integration)
- [Core Interfaces](../datasources/core-interfaces)
