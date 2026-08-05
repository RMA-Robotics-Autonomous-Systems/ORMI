# Datasources

> Internal source-of-truth knowledge base. When it disagrees with code, this file
> wins — update it and the LikeC4 model in lockstep on structural changes.

Datasources connect ORMI to external providers (ROS2/rosbridge, Foxglove, Tello,
REST, …). They run in **Web Workers** for non-blocking I/O and publish data to the
main thread. (Exception: `ws://` insecure robots run on the main thread — see
`../shared/coding-standards.md`.)

A datasource provides: connection management, topic discovery (`listTopics`) and
per-topic subscription, real-time streaming via `ctx.publish`, and cleanup on
`shutdown`/dispose.

## Three pieces

| Piece          | Role                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Worker**     | Created with `createDatasourceWorker`; runs off the main thread                                                   |
| **Provider**   | Plain lifecycle component: creates a `WorkerDatasourceHost`, registers hooks, disposes on unmount; renders `null` |
| **Definition** | A `DatasourceDefinition` registered on the `DATASOURCES_LIST` hook                                                |

Why workers: non-blocking network I/O, typed RPC, zero-copy transfers for large
arrays, and isolation (a worker crash doesn't take down the app).

## Definition

```typescript
interface DatasourceDefinition<T = DatasourceProviderSettings> {
	id: string;
	name: string;
	description: string;
	titleProp?: string;
	schema: JsonSchema; // provider settings schema
	uischema?: UISchemaElement;
	data: T; // default provider settings (required)
	Provider: FC<T>; // lifecycle component, no children
}
```

## Worker

```typescript
import { createDatasourceWorker } from "@workspace/ormi-core/datasources/worker";
import type {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";

createDatasourceWorker((ctx) => {
	const handles = new Map<string, () => void>();
	return {
		async init(settings) {
			/* open connection using settings */
		},
		listTopics(): DatasourceTopic[] {
			return [
				{
					topic: "/sensor/temperature",
					datasource_id: "my-datasource",
					source: {
						id: "my-datasource",
						title: "My Datasource",
						enable: true,
					},
					type: "number",
					rawType: "sensor_msgs/Temperature",
				},
			];
		},
		async subscribe(topic: SelectedTopic) {
			const stop = startStreaming(topic.topic, (v) =>
				ctx.publish(topic.topic, v, Date.now()),
			);
			handles.set(topic.topic, stop);
		},
		async unsubscribe(topic: SelectedTopic) {
			handles.get(topic.topic)?.();
			handles.delete(topic.topic);
		},
		async executeRemoteCall() {
			return { callId: "noop", status: "failed" as const };
		},
		cancelRemoteCall: async () => false,
		async shutdown() {
			handles.forEach((s) => s());
			handles.clear();
		},
	};
});
```

`ctx.publish(topic, data, time?, referenceFrameId?, transfer?)` is the **only** way
to push data out. `subscribe`/`unsubscribe` return `void`, so keep your own handle
map. There is no `ctx.publishError` or `ctx.onAction`.

> **`subscribe`/`advertise` must be idempotent under re-flush.** The subscription
> registry re-issues `-subscribe`/`-advertise` on every reconnect, so keep a
> per-topic **refcount**: a repeat subscribe for an already-subscribed topic
> increments and returns (never opens a second subscription); `unsubscribe` must
> tolerate an unsubscribed or in-flight topic as a no-op. Open/close the real
> subscription only on the 0↔1 transition. The bundled foxglove (worker) and the
> main-thread rosbridge and tello datasources all follow this. See
> `../shared/data-flow.md`.

## Message coalescing (all ingest paths)

Datasources ingest faster than the store or screen consumes. They funnel raw frames
through the **shared** coalescer in `@workspace/utils` —
`MessageCoalescer<T, K extends string | number>` — instead of each plugin
reimplementing one. It runs on the **main thread** for foxglove `ws://` (numeric
keys) and rosbridge (topic-string keys), **and inside the foxglove `wss://` worker**
via the opt-in `createCoalescedPublisher(sink, decode, opts)` wrapper — so decode
runs at the ~30 Hz drain rate off the wire-rate path in every case, and a 100 Hz
stream no longer decodes/clones/dispatches ~70 frames/s the store immediately drops.
Delta streams (TF, `DiagnosticArray`) use the **lossless queue**; state topics are
**lossy-latest**; PointCloud2 gets a 12 Hz decode cap. Coalescing is **opt-in at the
call site** — core `ctx.publish` stays a full-rate pipe (never a silent lossy
default). The engine owns the mechanism; a plugin supplies only its decode/convert
callback:

```typescript
import { MessageCoalescer } from "@workspace/utils";

// foxglove: numeric subscription keys; rosbridge: topic-string keys (K = string)
const coalescer = new MessageCoalescer<Raw, number>(
	(entry, key) => decodeAndPublish(entry, key),
	{ budgetMs: 5, metrics: { overwrites, decoded, dispatchMs } },
);
coalescer.push(key, raw, /* lossless */ false, /* minDecodeIntervalMs */ 0);
```

The engine coalesces to the latest raw frame per key before decode, caps per-topic
decode rate for heavy payloads (PointCloud2), time-budgets each drain tick with a
`setTimeout(0)` catch-up so a burst cannot starve the fanout/render loop, isolates a
throwing dispatch (`onError`), and reports `overwrites`/`decoded`/`dispatchMs`
through the `metrics` singleton so both plugins surface the produced-vs-delivered
drop ratio identically. `remove(key, flush?)` discards (default) or drains-then-drops;
`stop()` discards undrained work — rosbridge calls it on reconnect rather than
replaying a dead connection. See `../shared/coding-standards.md` for the decode
budgeting rule this enforces.

**Zero-copy handoff.** Worker datasources emitting binary payloads use the shared
`transferablesFor(payload)` helper (`@workspace/utils`) to transfer owned buffers
(PointsCloud `points`/`colors`/`intensities`, `ImageBitmap`, compressed image) via
`ctx.publish(…, transfer)` / `server.emit(…, transfer)` instead of structure-cloning
a full ~1.2 MB copy per message. The helper duck-types the payload and de-dupes by
backing buffer so a shared `ArrayBuffer` is never partially neutered; the worker must
not read those buffers after publishing (they are detached). The foxglove `wss://`
worker composes this into the coalescer drain: coalesce → decode → transfer-emit.

## Provider (plain lifecycle component)

```typescript
"use client";
import { useEffect, useRef } from "react";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { WorkerDatasourceHost } from "@workspace/ormi-core/datasources";
import type { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

function MyDatasourceProvider(props: DatasourceProviderSettings) {
	const pluginsManager = usePluginsManager();
	const hostRef = useRef<WorkerDatasourceHost | null>(null);

	useEffect(() => {
		const worker = new Worker(
			new URL("./my-datasource.worker", import.meta.url),
			{
				type: "module",
				name: `datasource:${props.id}`,
			},
		);
		const host = new WorkerDatasourceHost({
			worker,
			datasourceId: props.id,
			settings: props,
			pluginsManager,
		});
		hostRef.current = host;
		host.registerHooks();
		void host
			.init()
			.then(() =>
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_READY,
					props.id,
				),
			);
		return () => {
			pluginsManager.doAction(PluginsHooks.DATASOURCE_DISPOSED, props.id);
			host.dispose();
			hostRef.current = null;
		};
	}, [pluginsManager, props.id]);

	return null;
}
```

The `DATASOURCE_READY` action on `init()` completion is what lets the subscription
registry flush pending subscribe intents; `DATASOURCE_DISPOSED` on unmount tears
them down. Because a provider's context value here is null, it is a plain
lifecycle component, not a context provider (pattern 5).

## Registering the definition

```typescript
this.addFilter(PluginsHooks.DATASOURCES_LIST, {
	id: "my-datasources",
	priority: 10,
	filter: (datasources) => {
		datasources.push(myDatasourceDefinition);
		return datasources;
	},
});
```

## Consuming data in a widget

Widgets read **buffered** data with `useLocalDataSource()` inside a
`LocalDataSourcesProvider` — they never hold a datasource object directly:

```typescript
function Body({ topic }) {
	const { getSource } = useLocalDataSource();
	const source = getSource(topic); // { data, times, referenceFrameId } | undefined
	return <span>{String(source?.data.at(-1) ?? "—")}</span>;
}
```

`useLocalDataSource()` also exposes `health` and `getTopicHealth(topic)` for
offline gating — see `../widgets/knowledge.md`.

## Bundled example datasources

| Plugin                              | Protocol                               |
| ----------------------------------- | -------------------------------------- |
| `plugins/ormi-randoms-datasources/` | Minimal worker + provider + definition |
| `plugins/ormi-rosbridge-suite/`     | ROS 2 via rosbridge                    |
| `plugins/ormi-foxglove/`            | Foxglove WebSocket protocol            |
| `plugins/ormi-rest-bags/`           | REST-backed data                       |
