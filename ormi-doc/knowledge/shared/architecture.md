# ORMI Architecture

> Internal, source-of-truth knowledge base (seeded from `apps/web/content/docs`).
> When it disagrees with nearby code, this file wins — code drifts, the recorded
> intent is authoritative. Update this file **and** the LikeC4 model in lockstep
> on any structural platform change.

ORMI (Open Robotic Management Interface) is a modular web platform for monitoring
and controlling heterogeneous robotics and autonomous systems in real time. A
Next.js dashboard renders user-configurable widgets fed by pluggable datasources
(ROS2/rosbridge, Foxglove, Tello, REST, …). Built by the Robotics and Autonomous
Systems Laboratory, Royal Military Academy of Belgium.

## Monorepo topology

| Layer            | Where                       | Contents                                                                     |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Web app          | `apps/web`                  | Next.js 16 app router, React 19, UI, server, Prisma, NextAuth                |
| Core library     | `packages/ormi-core`        | Widgets, datasources, transforms, types, store — **immutable**               |
| Plugin framework | `packages/ormi-plugins`     | `Plugin` base class, `PluginsHooks`, `PluginsManager`                        |
| Shared UI        | `packages/ui`               | Radix UI + shadcn/ui primitives, `DatasourceGate`                            |
| Utilities        | `packages/utils`            | `createSafeContext`, subscription registry, `MessageCoalescer`, metrics, CLI |
| API helper       | `apps/web/lib/api-utils.ts` | `apiResponse` — the single helper for all API responses                      |
| JSON Forms       | `packages/ormi-jsonforms`   | Widget/datasource config schema rendering                                    |
| Features         | `plugins/ormi-*`            | Datasource + widget plugin implementations                                   |

Rule of placement: reusable logic lives in `packages/` or `plugins/`, not `apps/`.
Prefer plugins for feature extensions, packages for shared core capabilities.
`packages/ormi-core` is immutable (see `coding-standards.md` and root `AGENTS.md`).

Tooling: **Bun** package manager, **Turbo** orchestration, **Bun test**, ESLint +
Prettier. The web app builds with `reactCompiler: true`.

## Runtime data path (one line)

```
Datasource (Web Worker) → WorkerDatasourceHost → PluginsManager → LocalDataSourcesProvider (30Hz) → Widget
```

See `data-flow.md` for the full protocol and subscription lifecycle,
`plugin-system.md` for the hook system, `../widgets/knowledge.md`,
`../datasources/knowledge.md`, and `../dashboard/knowledge.md` for each layer.

## Type system

ORMI normalizes all incoming data into a small, **fixed** set of _webapp types_.
There is no runtime `TypeRegistry` or pluggable `RawTypeConverter` — the set is
closed, each type has a JSON Schema, and datasources are responsible for
converting native messages into a declared webapp type before publishing.

### Webapp types

Canonical list `WebTypes`, exported from `@workspace/ormi-core/types`:

```
Vector2, Vector3, Vector4, Quaternion, Transform, Color,
PointsCloud, Movement, IMU, number, string, boolean, Image, Pose
```

TypeScript shapes for these (plus `PoseStamped`, `Path`, `MapGrid`,
`BatteryState`, `DiagnosticArray`, `CoordinateConvention`, …) are all exported
from `@workspace/ormi-core/types`.

### Topic typing

Every topic carries **both** its native type and its resolved webapp type:

```typescript
interface DatasourceTopic {
	topic: string; // "/sensor/temperature"
	datasource_id: string; // owning datasource instance
	source: DatasourceProviderSettings;
	type: string; // webapp type — one of WebTypes
	rawType: string; // datasource-native type — e.g. "sensor_msgs/Imu"
	bufferSize?: number; // estimated message size (bytes), when known
}
```

Widgets discover and bind topics by their webapp `type`. Normalization at the
datasource boundary is done by `UnifiedConverter` (ROS → webapp types).

### Schema resolution & compatibility

- `getSchemaFromStringName(name)` → JSON Schema for a known webapp type (used to
  build config forms and check compatibility).
- Widgets declare accepted types via a `TopicSelect` element's
  `options.dataRequirements.accepts` — **not** a `supportedTypes` field.
- Compatibility utilities live in `@workspace/ormi-core/widgets`:
  `isTopicCompatible`, `analyzeTopicCompatibility`, `filterCompatibleTopics`,
  `getWidgetDataSources`.

### Normalization edge cases (must-know)

- `BatteryState` (from `sensor_msgs/msg/BatteryState`) **preserves `NaN`** for
  unmeasured float fields — treat `NaN` as "no reading", never as `0`.
- `DiagnosticArray` (from `diagnostic_msgs/msg/DiagnosticArray`) flattens
  `header.stamp` to seconds and carries `status[]` of `DiagnosticStatus`. Each
  status `level` is normalized to a **number** enum: `0=OK, 1=WARN, 2=ERROR,
3=STALE` (a ROS `byte` may arrive as a number or a 1-char string under
  CBOR/rosbridge). `values[]` is a **dynamic** `{ key, value }` string array with
  no fixed schema — render generically.

## Deployment

Local / self-hosted. Config comes from `docker-compose.yml` / env vars — never
hardcode secrets. Backend is Prisma ORM + PostgreSQL with NextAuth. Server-side
Prisma access is only through `apps/web/lib/data/prisma-*.ts` helpers.
