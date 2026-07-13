# Data Flow

> Internal source-of-truth knowledge base. When it disagrees with code, this file
> wins — update it and the LikeC4 model in lockstep on structural changes.

Data flows through isolated Web Workers over a typed RPC protocol:

```
Datasource → Worker → Host → PluginManager → Widget
```

## Pipeline stages

| #   | Stage                             | Role                                                                       |
| --- | --------------------------------- | -------------------------------------------------------------------------- |
| 1   | **Worker**                        | Runs the datasource, publishes via `ctx.publish()`                         |
| 2   | **Host** (`WorkerDatasourceHost`) | RPC client on the main thread; forwards to the PluginsManager              |
| 3   | **PluginsManager**                | Pub/sub broker; dispatches published data to subscribers                   |
| 4   | **Subscription registry**         | Owns subscribe/unsubscribe wiring; flushes intents on datasource readiness |
| 5   | **LocalDataSourcesProvider**      | Buffers updates at **30Hz** per widget                                     |
| 6   | **Widget**                        | Receives buffered data via props/hooks                                     |

## Subscription lifecycle

Widgets **never** issue `-subscribe`/`-unsubscribe` directly. A single
**subscription registry** — `getDatasourceSubscriptionRegistry(pluginsManager)`
from `@workspace/utils`, one per `PluginsManager` — owns all subscribe/unsubscribe
and advertise/unadvertise wire traffic.

1. A widget's `LocalDataSourcesProvider` declares a subscribe **intent** per
   selected topic: `registry.subscribe({ topic, onData })`.
2. The registry issues the real `-subscribe` only once the backing datasource is
   **ready** (`DATASOURCE_READY`). An intent declared before its datasource
   connects simply waits — no polling, no timeout.
3. On **every** `DATASOURCE_READY` the registry re-issues subscribe for its live
   intents, so subscriptions survive a late-connecting datasource and survive
   reconnects (`DATASOURCE_DISPOSED` → `DATASOURCE_READY`).
4. Intents are **refcounted** per wire key (`createTopicKey` →
   `dsId::topic[::property]`); `-unsubscribe` fires only when the last intent for
   a key is released.

Because each topic degrades independently, **one offline datasource never blocks
the others**. The dashboard mounts immediately — there is no "all datasources
connected" gate. Widgets degrade per-datasource (see `../widgets/knowledge.md`).

> **Idempotency contract.** Because the registry re-flushes on reconnect, worker
> `subscribe`/`advertise` must be idempotent: a repeat subscribe for an
> already-subscribed topic dedupes via refcount (never opens a second
> subscription), and `unsubscribe` must tolerate an in-flight or unknown
> subscribe as a no-op. Open/close the real subscription only on the 0↔1
> transition.

## Worker RPC protocol

**From worker:**

```typescript
ctx.publish(topic, data, timestamp, referenceFrameId?, [transferables]);
```

**To worker (via `WorkerDatasourceHost`)** — a single generic typed RPC envelope,
not per-verb message types:

```typescript
// request  → worker
{
	type: ("rpc/request", id, method, params);
}
//   method ∈ 'init' | 'listTopics' | 'subscribe' | 'unsubscribe'
//          | 'executeRemoteCall' | 'cancelRemoteCall' | 'shutdown'
//   subscribe/unsubscribe params: [SelectedTopic]  (unsubscribe also takes ignoreCount?)

// response ← worker
{
	type: ("rpc/response", id, ok, result);
} // ok:false carries `error`
// data event ← worker (from ctx.publish)
{
	type: ("rpc/event", event, payload);
}
```

There is no `ctx.publishError` or `ctx.onAction`.

## Performance contract

- **30Hz buffering** — `LocalDataSourcesProvider` batches updates per widget.
- **Zero-copy** — pass transferables for `Float32Array`/`ArrayBuffer` payloads.
- **Worker isolation** — I/O never blocks the main thread; a worker crash does
  not take down the app.
- **5s shutdown** — workers must respond to `shutdown` within 5 seconds.

For `ws://` (insecure) robots the datasource runs on the **main thread**, not a
worker — see `coding-standards.md` for why and the main-thread decode budgeting
rules that apply there.

## Transform (TF) data flow

TF data does **not** flow through the normal value pipeline; it has its own shared
store (see `../widgets/knowledge.md` for the full model):

```
TF topic (/tf, /tf_static)
  → datasource boundary: convert each transform ROS → THREE, tag isStatic
  → processTFMessage(datasourceId, msg, { isStatic })   // O(1) upsert per edge
  → TransformTable (flat Map<frameId, TransformEdge>, authoritative)
  → transformVersionAtom bump (leading-edge sync + trailing-coalesced ≤ ~60 Hz)
  → derived selectors: findTransformChain / selectWorldFrames / selectFrameDiagnostics
  → widgets via useTransformEdges / useWorldFrames / useTransformToGPS
```

The flat table keeps per-message updates O(1) (no tree clone), makes re-parenting
and idempotent `/tf_static` re-delivery free, and lets a 100Hz stream coalesce to
~one React render per ~16ms window.
