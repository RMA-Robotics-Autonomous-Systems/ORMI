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

### Losslessness is declared by the consumer, never guessed by the datasource

`DatasourceTopic.lossless` sits beside `bufferSize` and is the same kind of
thing: a transport hint that only the subscriber can supply. A coalescing
datasource delivers latest-per-drain-tick, which is correct for a widget showing
a live value and wrong for one accumulating the stream — a survey, a recorder,
an analyser is wrong by exactly the messages it never saw, and the result is
short rather than visibly coarse, so nothing on screen reports it. From the wire
a series of samples and a state to be observed are indistinguishable; the
datasource has no basis to decide and the operator has less.

A topic is **one wire shared by N subscribers**, and three properties follow.
The flag is the **OR** across live intents. It **only ever rises** — lowering it
when a lossy subscriber joins would start dropping samples underneath the
consumer that asked for them. And it is **not part of the wire key**, so two
subscribers that disagree still share one subscription instead of opening two.

Only a datasource that coalesces reads it: foxglove resolves it once per
subscriber and raises monotonically (`upgradeLossless`, both the worker and the
main-thread `ws://` path — they mirror each other and must stay in sync).
Rosbridge, the EMI bag replay and the REST bag reader already deliver every
message, so ignoring the field there is correct, not a gap.

The known limit: `-subscribe` fires once per wire, so an intent raising the
requirement on an already-subscribed wire lands at the next reconnect. Amending
a live subscription would mean an unsubscribe/subscribe cycle, charging every
consumer on that wire a delivery gap to serve a late joiner. Subscribe with the
flag from the start. The common case closes itself: two consumers binding
different `property` paths are two wire keys, so the second `-subscribe` does
reach the datasource, which raises the topic.

### History depth is declared by the widget, never asked of the operator

Every widget passes a `buffersSize` to `LocalDataSourcesProvider` — a gauge
passes `1`, a timeseries chart `2000`, a diagnostics table `256`. That number is
the widget's own statement of how much history it needs to render, so the topic
picker has **no** buffer-size input: there is nothing an operator could usefully
answer there, and a wrong answer is invisible.

A `SelectedTopic` may still carry `bufferSize`, and the provider resolves the
limit as:

```typescript
const bufferLimit = Math.max(topic?.bufferSize ?? 0, buffersSize);
```

**A per-topic depth is a FLOOR, never a cap.** A stored value may only ask for
_more_ history than the widget declared. Resolving it with `||` instead capped
the widget: dashboards saved by earlier builds carry `bufferSize: 1` stamped on
every picked topic, which pinned every chart in them to a single sample — a
silent, permanent live bug that looked like a broken datasource.

`topic.bufferSize` is only written when the widget author asked for it, via
`options.buffer` on the `TopicSelect` UI-schema element. `deriveTopicBufferSize`
(`ormi-core/renderers/topic-selection/topic-auto-select.ts`) honours a positive
integer verbatim and returns `undefined` for anything else (absent, zero,
negative, fractional, non-finite) — nonsense is rejected rather than clamped, so
the widget's own `buffersSize` governs.

## Bundled example datasources

| Plugin                              | Protocol                               |
| ----------------------------------- | -------------------------------------- |
| `plugins/ormi-randoms-datasources/` | Minimal worker + provider + definition |
| `plugins/ormi-rosbridge-suite/`     | ROS 2 via rosbridge                    |
| `plugins/ormi-foxglove/`            | Foxglove WebSocket protocol            |
| `plugins/ormi-rest-bags/`           | REST-backed data                       |

## Known configurations: reusing a datasource from another workspace

The add-datasource picker offers, above the catalogue, the datasource
configurations the operator already set up in their **other** workspaces.
Clicking one seeds a new instance with those settings.

**Read path.** `KnownDatasourcesProvider` (mounted in the workspace page beside
`TemplatesProvider`) calls `datasourceApi.getKnown()` →
`GET /api/datasources/known` → `withAuth` → `getKnownDatasourceConfigs(session.user.id)`
in `apps/web/lib/data/prisma-datasources.ts` → `db.workspace.findMany`
(`where: { createdById }`, select `id, name, updatedAT, content`) →
`groupKnownDatasources(rows)`. The owner is read from the session and **never**
accepted from the request — these payloads carry endpoints and credentials.
No body, no query params, so there is nothing to validate and no shape a caller
can widen.

`groupKnownDatasources` runs over arbitrary historical `Workspace.content`, so
it is **total over garbage**: null, an array, a missing `datasources` map, an
entry with no or non-object `settings` — each contributes nothing and nothing
throws. One malformed legacy row must not 500 that operator's endpoint forever.

**Identity key** (`packages/ormi-core/src/datasources/datasource-identity.ts`,
exposed as `@workspace/ormi-core/datasources/identity`): `datasource_id` plus
the canonical JSON of the settings with the `DatasourceProviderSettings` base
fields removed. The excluded set is derived from that interface through an
exhaustive mapped type, so identity is **what the plugin declared** and a base
field added later drops out without anyone remembering. Canonicalisation sorts
object keys **recursively** and **never sorts arrays** — over-splitting is
visible and harmless, over-merging offers the wrong configuration. `undefined`
is equivalent to an absent key.

The module is deliberately React-, icon- and barrel-free and has **its own
subpath** because a server route imports it; reaching it through the
datasources barrel would drag the dashboard barrel — and
`react-grid-layout/css/styles.css` — into the server bundle. Same hazard class
as the worker-entrypoint rule, verified the same way, against built output.
It is not `datasource-configured.ts`, which answers "has anybody touched this
instance yet?" and keeps its own comparison and ignored keys.

**Grouping is by configuration only.** The same endpoint titled differently in
two dashboards is one row: the primary title comes from the most recently
updated workspace, the rest are listed as `also: …` (deduped, newest first).
Grouping by name would merge configurations that connect to different robots.

**The definition filter is client-side, and it omits silently.** The server has
no `DATASOURCES_LIST` — the registry is a client-side plugin registry and
dev-only plugins are gated out of it at registry generation — so the UI drops
any configuration whose `datasource_id` resolves to no live definition. This is
deliberately the opposite of the missing-definition rule below, which governs
_restoring_ committed work and names what it cannot honour. A surface that only
_proposes_ must not manufacture an unsupported card out of a clean click.

**Already-in-this-dashboard is marked, never hidden**: a disabled row with a
badge, sorted after the actionable rows, compared against **live** state rather
than the saved copy. Same reasoning as the topic-routing `kind: "present"`
decision — "it is already on screen" and "nothing can show this" are different
answers.

**The settings blob is displayed through a declared allowlist, and through
nothing else.** A row prints the values of the settings keys its definition
lists in `DatasourceDefinition.summaryProps` — the url, the ip, the recording
name — as one muted line under the title, because two rovers on two endpoints
are otherwise indistinguishable. Everything else on the row is identity and
usage: alternates, definition name, how many dashboards, when, which ones.

The allowlist is declared by the plugin that owns the schema, because only it
knows which of its fields are safe: `c2-control-source` declares
`missionControlUrl` and persists `missionControlToken` one prefix away from it.
That prefix is the whole argument against a heuristic — `/token|secret|
password/i` works by luck today and fails silently the day a plugin names a
field `pw` or `c2Auth`, and the failure is a leak rather than an error.
**There is no fallback**: a definition that declares nothing shows nothing,
which is the right answer for a datasource with no remote to name (the loadgen
and randoms fixtures declare nothing, deliberately).

`resolveDatasourceSummary(settings, definition)` (pure, beside the list
component) reads only the declared keys, in declaration order, and skips an
absent key, a non-`string`/non-finite-`number` value and an empty string —
an unconfigured instance renders no line rather than a blank one. Values are
verbatim; the row truncates in CSS and keeps the full value in a `title`.

The banned heuristic survives as a **repo-wide test** over `DATASOURCES_LIST`
(`apps/web/__tests__/datasource-summary-props.test.tsx`) that rejects any
declared key reading as a credential, or absent from the definition's own
`data`. At runtime such a filter fails **open**; as a test it fails **closed**,
which is why it belongs there and nowhere else. The row test renders the real
C2 shape carrying both a sentinel token and a real url, and asserts the url IS
rendered while the sentinel is NOT — a regression that swaps the two fields has
to break a test to land.

**The state is a discriminated union**, `idle | loading | ready | error`, never
a nullable array: "still loading" rendered as "you have none" sends the
operator off to retype a configuration that was about to appear. A failed read
never breaks the dialog — the catalogue renders unchanged plus a quiet retry.

**Mounting the provider is optional.** `useKnownDatasources` reads the context
through the third, optional hook `createSafeContext` now returns
(`[Provider, useCtx, useCtxOptional]`) and answers `idle` when there is none,
so plugin pages that assemble their own shell (C2, EMI) render the picker
exactly as before — and `GlobalDataSourcesProvider` needed no change at all.

## A missing definition is a state, not an exception

A workspace persists a `datasource_id`, not the definition behind it, and
dev-only plugins are gated out of production builds. `GlobalDataSourcesProvider`
therefore resolves every configured datasource through one pure pass,
`resolveDatasourceEntries(datasources, definitions)`, which returns
`{ kind: "supported", datasource, definition }` or
`{ kind: "unsupported", datasource }`. The same pass feeds the mounted providers
and the cards in the datasources dialog, so the two can never disagree.

An `unsupported` entry mounts no provider and renders a card naming the missing
`datasource_id`, keeping the saved settings and offering **Remove**. Resolution
must never `throw`: the card list is built during the provider's own render, and
`WidgetErrorBoundary` only wraps widget hosts — a throw there takes down the
entire dashboard tree, not one card.

## Route back from the symptom to the settings

`DatasourceOffline` (`@workspace/ui`) offers a **Check configuration** action.
`@workspace/ui` cannot depend on `@workspace/ormi-core`, so the action dispatches
`DATASOURCE_CONFIGURE_EVENT` on `window`; `GlobalDataSourcesProvider` listens and
opens the datasources dialog. Pass `onConfigure` to route somewhere more
specific.

## The picker is operator-facing

`DatasourceDefinition.description` is rendered in the inline picker inside the
datasources dialog (no nested dialog). Write it so an operator can tell two
similarly named integrations apart.
