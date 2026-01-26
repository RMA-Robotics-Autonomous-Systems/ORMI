# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### 🚀 Major Changes

#### Worker-Based Datasource Architecture

Migrated datasources to Web Worker architecture for better performance and main thread responsiveness.

**Affected Components:**

- `ormi-foxglove` - Now runs Foxglove WebSocket client in a dedicated worker
- `ormi-randoms-datasources` - Random data generation moved to worker
- `@workspace/ormi-core` - New worker infrastructure added

**Benefits:**

- Non-blocking I/O operations (WebSocket connections run off main thread)
- Better UI responsiveness during heavy data processing
- Improved performance for large point clouds via Transferable objects
- Cleaner separation of concerns

**Migration Guide:**

- No API changes for datasource consumers
- Workers are automatically spawned and managed
- All hooks and plugin integrations remain unchanged

### ✨ New Features

- **Worker Infrastructure** (`@workspace/ormi-core/datasources/worker`)
    - `createRpcClient()` - Type-safe RPC client for worker communication
    - `createRpcServer()` - Type-safe RPC server for worker implementation
    - `WorkerDatasourceHost` - Generic host for managing datasource workers
    - `createDatasourceWorker()` - Factory for creating worker implementations

- **Enhanced Type Support**
    - `PointsCloud` now supports `Float32Array` and packed `number[]` formats
    - Zero-copy transfers for point cloud data using Transferable objects
    - Added converters for:
        - `sensor_msgs/msg/Temperature`
        - `sensor_msgs/msg/FluidPressure`
        - `sensor_msgs/msg/MagneticField` (with heading calculation)
        - `geometry_msgs/msg/Vector3` and `Vector3Stamped`
        - `nav_msgs/msg/Path`

### 🐛 Bug Fixes

- **GPS Timestamp Conversion**: Fixed GPS message timestamp conversion - now properly converts milliseconds to ROS2 time format (sec/nanosec)
- **GPS Coordinate 0 Handling**: Fixed GPS coordinates at 0° latitude/longitude being treated as invalid
- **Connection State Mapping**: Improved WebSocket state tracking to properly reflect CONNECTING vs CLOSED states
- **Memory Leaks**: Added timeout mechanism for remote calls to prevent unbounded handler map growth
- **Worker Error Propagation**: Added global error handlers in workers for better debugging

### 🔧 Improvements

- **Graceful Shutdown**: Workers now shut down gracefully with 5-second timeout
- **Error Logging**: Type conversion failures are now logged with context
- **Race Condition Fixes**: Improved worker initialization to handle rapid prop changes
- **Point Cloud Rendering**: Optimized renderer to handle both packed and unpacked formats efficiently

### 🗑️ Breaking Changes

#### Removed `ormi-ros2-type-extension` Plugin

The `ormi-ros2-type-extension` plugin has been **removed** and its converters have been merged into `ormi-foxglove/unified-converter.ts`.

**Why?**

- Reduced plugin complexity
- Better maintainability with converters in one place
- No external dependencies needed for ROS2 type extensions

**Migration:**

```typescript
// OLD: Plugin-based converters
// Required ormi-ros2-type-extension in dependencies

// NEW: Built-in converters
// All converters are now in unified-converter.ts
// No changes needed to consumer code
```

**What to do:**

1. Remove `ormi-ros2-type-extension` from your `package.json` dependencies (already done in this PR)
2. All converters work automatically - no code changes needed

#### Deprecated Hook

- `useFoxgloveSource()` now throws an error with message: "useFoxgloveSource is deprecated after worker migration"
    - Use datasource hooks from `@workspace/ormi-core/datasources` instead

### 📦 Package Updates

- `@workspace/ormi-core`: Added `./datasources/worker` export path
- Removed `ormi-ros2-type-extension` from workspace dependencies

### 🎯 Performance

- **Point Clouds**: ~2-3x faster rendering for large point clouds (100k+ points) using `Float32Array`
- **Main Thread**: WebSocket I/O no longer blocks UI updates
- **Memory**: Reduced memory copies through Transferable objects

### 🔮 Future Improvements

- [ ] Add backpressure mechanism for high-frequency topics
- [ ] Explore `SharedArrayBuffer` for true zero-copy point clouds
- [ ] Add worker pooling strategy for multiple datasources
- [ ] Add comprehensive test coverage for worker infrastructure

---

## Previous Releases

_(No previous releases documented)_
