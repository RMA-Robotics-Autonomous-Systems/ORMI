# ORMI Engineering Rules

## Purpose

Provide a clear, repeatable workflow for implementing features in the ORMI React/Next.js app while enforcing repo conventions, avoiding anti-patterns, and producing production-grade tests and documentation.

## Repo Outline (monorepo rules and project file systems)

### Monorepo rules

- apps/: product surfaces and runtime entrypoints.
- packages/: shared libraries and internal core capabilities; stable APIs.
- plugins/: feature extensions that plug into the core; keep scope isolated.
- Prefer changes in packages or plugins instead of apps when logic is reusable.
- Treat core as immutable unless explicitly approved; update docs if core changes.

### Project file systems (top-level map)

```
apps/
    web/                 Next.js app router, UI, and server integration
packages/
    ormi-core/           Core library
    ormi-jsonforms/      JSON forms integration
    ormi-plugins/        Plugin infrastructure
    ui/                  Shared UI components
    utils/               Shared utilities
plugins/
    ormi-*               Plugin implementations, ormi prefix used for included plugins
ormi-doc/                Internal architecture knowledge system (LikeC4 + markdown); local-only, not shipped
```

## Required Inputs

Split into two tiers. Start with must-haves; request nice-to-haves only if ambiguity blocks progress.

### Must-have before starting

- Feature goal and success criteria.
- Target area (core vs plugin) and expected impact.
- Data contracts: inputs, outputs, formats, constraints, and validation rules.

### Request if ambiguous or missing

- User story and UX expectations.
- Data flow and logic flow (diagram or step list). If missing, request it and propose a solution.
- External dependencies, integrations, or API constraints.
- Non-functional requirements: performance, security, accessibility, and rollout constraints.

If documentation is incomplete or missing, request it explicitly before implementation.

## Error Handling Rule

> **When the user provides an error message: do NOT fix it directly. Instead, explain the likely cause and propose a solution for the user to apply.**

This is a behavioral override — agents default to fixing immediately. This rule takes priority.

## Core Immutability Rule

**Core (`packages/ormi-core`) is treated as immutable.** Exceptions require:

1. Explicit user approval.
2. A listed impact analysis of all affected areas.
3. Updated documentation in [apps/web/content/docs](apps/web/content/docs).

All other sections reference this rule. Do not modify core without satisfying all three conditions above.

## Placement Rules

- Detect whether the change belongs in packages or plugins based on intent and scope.
- Packages: internal logic and shared core capabilities.
- Plugins: features that extend the core.
- Core is immutable — see [Core Immutability Rule](#core-immutability-rule).
- No legacy support: if a breaking change is required, get explicit user approval, list all impacted code areas, and update them.

## Conventions and Guardrails

- Follow React/Next.js conventions for file structure, naming, and component patterns.
- Prefer idiomatic app router patterns for data fetching and rendering boundaries.
- Avoid anti-patterns: implicit shared mutable state, side effects in render, heavy logic inside components, and overly broad context providers.
- Keep public APIs typed and stable; add JSDoc for exported or shared modules.
- Respect existing repo formats, linting, and TypeScript configs.
- Datasource subscribe idempotency: Datasource `-subscribe`/`-advertise` actions must be idempotent under re-flush — re-issuing subscribe for an already-subscribed topic must dedupe via refcount, and the action must tolerate an unsubscribe for an in-flight subscribe (the subscription registry re-issues subscribe on reconnect).
- Widget offline gating: Single-topic data-display widgets gate their body with `DatasourceGate` (`@workspace/ui`) so an offline datasource shows a clear offline card, not a misleading empty/zero value. Multi-topic widgets degrade per-series via `getTopicHealth`; control/publisher and last-known-value widgets do not blank on offline.
- Page-scoped widgets: a plugin whose widgets only mean anything on its own page registers them from **that page** (an effect that `addFilter`s `WIDGETS_LIST` and `removeFilter`s on unmount), not from the plugin constructor. `WIDGETS_LIST` is global, so a constructor-time filter offers every panel to every workspace in the app, where each resolves no source and renders an offline card. The page must hold `DashboardShell`'s `loading` until the filter is in place — the shell reads `WIDGETS_LIST` during **render**, so an ungated first render resolves an empty registry and a restored layout comes back as "widget not found" tiles. Widgets that are genuinely useful anywhere (and gate themselves on a datasource type per pattern 8) still register from the constructor.
- Registry-before-READY: a datasource provider must call `getDatasourceSubscriptionRegistry(pluginsManager)` **before** it fires `DATASOURCE_READY`. The registry learns which datasources are ready from its own `DATASOURCE_READY` listener, registered in its constructor — a READY fired before the registry existed is one it never hears, and `subscribe` for an unknown-ready datasource parks the intent waiting for a READY that has already happened. The wire then stays idle forever: the datasource connects, enumerates its topics, and delivers nothing. Never rely on a _consumer_ to build the registry first — a consumer that needs a resolved topic list is guaranteed to be later than `init`, which is what fires READY. The call is memoised per manager, so building it eagerly in the provider costs nothing.
- Worker entrypoint imports: a `*.worker.ts` may import **runtime values** only from worker-safe subpaths — `@workspace/ormi-core/datasources/worker`, `@workspace/utils/<subpath>` — never from a barrel that re-exports React components. `@workspace/ormi-core/datasources` re-exports `global-datasource-provider`, which reaches the dashboard barrel, which imports `react-grid-layout/css/styles.css`; the stylesheet then lands in the worker's chunk list and the chunk loader `importScripts()` it, which cannot execute CSS. The worker dies before `init` — every panel reads offline and no load guard can fire, because they all live downstream of a worker that runs. **This is invisible in dev** (source aliases, no CSS chunk split) and fatal only in a production build, so it survives every local check. `import type` from any barrel is fine — it is erased. To verify: `grep '^import' <plugin>/dist/**/*.worker.js` must show no React-barrel specifier.
- HTTPS + `ws://` robots — the main-thread fallback is intentional: production serves the dashboard over HTTPS while robots expose plain `ws://` endpoints. The browser's site-level insecure-content exception applies to the document only, **not to web workers**, so a worker WebSocket to a `ws://` robot is impossible in this deployment. The foxglove plugin's insecure-URL → main-thread routing is deliberate; do not "fix" it by forcing the worker path. Performance work for `ws://` datasources must optimize the main-thread path instead (e.g. coalesce-to-latest per topic before decode/dispatch); the worker path remains for `wss://` / HTTP-served deployments.
- Main-thread decode budgeting: coalesce-to-latest-before-decode only relieves topics faster than the drain rate; expensive payloads (e.g. PointCloud2) additionally require a per-topic decode-rate cap (coalesce to LATEST above the ceiling, never drop the newest) and a per-tick decode time budget that yields the event loop, so a heavy burst cannot starve the main-thread fanout/render loop. Shed frames stay visible via the produced-vs-delivered drop ratio — never hide them.
- Single shared Jotai store: the app has exactly one Jotai store, `appStore` (`packages/ormi-core/src/store.ts`). The React tree is wrapped in `<Provider store={appStore}>`, and every atom writer that runs **outside** React — transforms (`processTFMessage`), remote calls (`setRemoteCalls`), and any future subsystem — must target `appStore`. Never call `getDefaultStore()` or `createStore()` for app state: a write that lands in a store the `<Provider>` does not bind is invisible to `useAtomValue`, which then silently reports empty/stale state (this stranded both the remote-call explorer and the rostainer buttons — writes went to the default store while the tree read from a separate transform store). Hooks reading these atoms pin the store explicitly: `useAtomValue(atom, { store: appStore })`.
- React Compiler + external mutable stores: the web app builds with `reactCompiler: true`, which infers memo dependencies from the callback **body** and drops no-op reads. Never key a `useMemo` on a version counter while the body reads a module-level store (`void version; …, [version]`) — the compiler strips the dead read and freezes the memo on its first result (this stranded every TF widget on stale data in production while the store was fully populated). Hooks over external mutable state must use `useSyncExternalStore` with an identity-stable, change-fresh snapshot, and derived memos must consume that snapshot as a real dependency (reference: `packages/ormi-core/src/transforms/transform-hooks.tsx`).
- Commit messages: do **not** add `Co-Authored-By` trailers or any other agent/tool attribution (no "Generated with", no co-author lines) to commits. Keep the message to the change itself.
- Rolling TODO: keep a bare-minimum `TODO.md` at the repo root as a rolling worklog — what's in flight and what's next, terse, newest first — so work can resume after a pause. Update it as work starts and finishes; it points at the detailed plan docs rather than duplicating them.
- Architecture knowledge system lockstep: [ormi-doc/](ormi-doc/) is the internal, local-only architecture knowledge base (a LikeC4 model + markdown under `ormi-doc/knowledge/`) and is source-of-truth for platform architecture — when it disagrees with nearby code, it wins. On any structural platform change (new or changed container, component, datasource, plugin, or data-flow edge), update the owning `ormi-doc/knowledge/` file **and** the LikeC4 model in the same change. It is browsed locally (`cd ormi-doc && bun run dev`) and is never built into or shipped with the web app.

## Implementation Patterns

This section captures the approved patterns for common problems. Use these instead of inventing alternatives.

### 1. API Responses — `apiResponse` helper

Use a single `apiResponse(data, status)` helper for all API responses.

```typescript
// apps/web/lib/api-utils.ts
export function apiResponse(data: unknown, status = 200) {
	return NextResponse.json(data, { status });
}
```

```typescript
// ✅ Correct
return apiResponse({ error: "Not found" }, 404);

// ❌ Wrong — never use raw response constructors
return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
return NextResponse.json({ error: "Not found" }, { status: 404 });
```

### 2. Route Validation — Zod on every mutating endpoint

All POST/PUT/PATCH/DELETE routes must parse the body with a Zod schema before processing.

```typescript
const schema = z.object({ name: z.string().min(1) });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return apiResponse({ error: parsed.error.flatten() }, 400);
```

```typescript
// ❌ Wrong — never trust the body without parsing
const body = await request.json();
await db.create({ name: body.name });
```

- GET routes validate query params only when relevant.
- Zod schemas live next to the route or in a shared `validations/` folder.

### 3. Context Providers — `createSafeContext<T>(name)`

Use the `createSafeContext` factory (located at `packages/utils/src/create-safe-context.ts`) for all new contexts. Import it — do not reimplement it.

```typescript
import { createSafeContext } from "@ormi/utils/create-safe-context";

const [DashboardProvider, useDashboard] =
	createSafeContext<DashboardState>("Dashboard");
```

Factory reference:

```typescript
// packages/utils/src/create-safe-context.ts
function createSafeContext<T>(name: string) {
	const Context = createContext<T | undefined>(undefined);
	const useCtx = () => {
		const ctx = useContext(Context);
		if (ctx === undefined)
			throw new Error(`use${name} must be within ${name}Provider`);
		return ctx;
	};
	return [Context.Provider, useCtx] as const;
}
```

- Default is always `undefined`.
- Hook always throws if used outside provider.
- Context name uses PascalCase: `DashboardContext`, `NavbarContext`.
- Split state + actions into two contexts only when the provider is complex (e.g., `DashboardProvider`).

### 4. Plugin Exports — Standard file naming

Standardize on `export.ts` for all definition exports.

```typescript
// export.ts — definitions
export const datasourceDefinition = { id, name, schema, data, Provider };
export const widgetDefinitions = [{ id, name, component, ... }];
export const rendererDefinitions = [{ tester, renderer }];

// index.ts — plugin class
export default class MyPlugin extends Plugin {
	constructor() {
		super();
		this.name = "my-plugin";

		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "my-plugin-datasource",
			priority: 10,
			filter: (datasources) => {
				datasources.push(datasourceDefinition);
				return datasources;
			},
		});
	}
}
```

- Use `export.ts` (or `export.tsx` if JSX needed) for datasource/widget/renderer definitions.
- Keep inline only for trivial 1-2 line callbacks.
- Constructor registers hooks via `this.addFilter()` / `this.addAction()`.
- Filter functions receive array, mutate it, return it.

### 5. Plugin Datasource Providers — Lifecycle components

Plugin datasource providers that pass `null`/empty context values should be plain lifecycle components, not context providers.

**Use a Context provider when:**

- The provider holds shared reactive state that children consume directly (e.g., connection status, client instance).

**Use a plain component when:**

- Data flows solely through `PluginsManager.addFilter/addAction` hooks.
- The context value is `null`, `{}`, or unused.

### 6. Auth Route Wrappers — `withAuth` higher-order handler

Use `withAuth(handler)` wrapper for all authenticated routes.

```typescript
// apps/web/lib/auth/with-auth.ts
export function withAuth(
	handler: (req: Request, session: Session) => Promise<Response>,
) {
	return async (req: Request) => {
		const session = await getServerSession(authOptions);
		if (!session) return apiResponse({ error: "Unauthorized" }, 401);
		return handler(req, session);
	};
}
```

```typescript
// ❌ Wrong — never inline auth checks in route handlers
export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	if (!session) return apiResponse({ error: "Unauthorized" }, 401);
	// ...
}
```

### 7. Server-Side Data Access — Prisma helpers

All Prisma calls must go through dedicated helper files in `apps/web/lib/data/prisma-*.ts`. Do not call Prisma directly from route handlers or components.

```typescript
// ✅ Correct — call a server helper
import { getWorkspaceById } from "@/lib/data/prisma-workspaces";

// ❌ Wrong — never call prisma directly from a route
import { prisma } from "@/lib/prisma";
const workspace = await prisma.workspace.findUnique({ where: { id } });
```

### 8. Widget Gating — Utility function

Extract `filterWidgetsByDatasources(widgets, datasources)` into a shared utility (located at `packages/utils/src/filter-widgets.ts`). Widgets that require a specific datasource type declare their dependency in their definition.

### 9. Client-Side HTTP Requests — Domain API wrappers

Use the shared HTTP client and domain-specific API wrappers for all client-side HTTP operations.

```typescript
// apps/web/lib/http/client.ts
export class HttpClient {
	async get<T>(url: string): Promise<ApiResult<T>> {
		/* ... */
	}
	async post<T>(url: string, data: unknown): Promise<ApiResult<T>> {
		/* ... */
	}
	// ... put, patch, delete
}

export type ApiResult<T> =
	{ ok: true; data: T } | { ok: false; error: string; details?: unknown };

// apps/web/lib/api/workspace-api.ts
export const workspaceApi = {
	async getAll() {
		return httpClient.get<Workspace[]>("/api/workspaces");
	},
	async create(title: string, userId: string) {
		/* ... */
	},
};
```

```typescript
// ❌ Wrong — never use raw fetch() on the client
const res = await fetch("/api/workspaces");
const data = await res.json();
```

- All API wrappers return `ApiResult<T>` for consistent error handling.
- Test API wrappers with Bun test using mocked `httpClient`.
- Route handlers remain independent; this pattern is for client-side code only.

### 10. Widget `Component` — Stable module-level reference

A `WidgetDefinition.Component` must be a **stable, module-level function reference**. The dashboard re-invokes every widget definition factory on each render (intentionally not memoized, since factories may call hooks), and the widget host uses `definition.Component` **directly as the React component type**. An inline arrow in the factory's return produces a new component identity on every render, so React remounts the widget — resetting state, re-running effects, and tearing down any connections/timers it holds.

```typescript
// ✅ Correct — hoisted component, identity stable across factory calls
const MyWidget: React.FC<MyWidgetProps> = (props) => {
	/* ... */
};

export function MyWidgetDefinition(): WidgetDefinition<MyWidgetProps> {
	return {
		id: "my-widget",
		/* ...schema, uischema, data... */
		Component: MyWidget,
	};
}
```

```typescript
// ❌ Wrong — new function identity every render → remounts the widget
Component: (data: MyWidgetProps) => <MyWidget {...data} />;
```

- If props need remapping, do it inside the hoisted component or a module-scope wrapper — never an inline arrow in the factory.
- Rule of thumb: nothing inside a definition factory's `return { … }` may create a new function/component identity per call.

## Reference Docs (review before changes)

- Data flow: [apps/web/content/docs/Data-Flow.md](apps/web/content/docs/Data-Flow.md)
- Plugin system: [apps/web/content/docs/Plugin-System.md](apps/web/content/docs/Plugin-System.md)
- Widgets system: [apps/web/content/docs/Widgets.md](apps/web/content/docs/Widgets.md)
- Harmonization report: [HARMONIZATION_REPORT.md](HARMONIZATION_REPORT.md)
- Architecture knowledge system (internal, local-only): [ormi-doc/](ormi-doc/) — LikeC4 model + `ormi-doc/knowledge/` base

## Workflow

1. **Discovery**
    - Confirm must-have inputs are present; request missing ones before proceeding.
    - Detect whether the change belongs in packages or plugins.
    - If core changes are needed, confirm approval and scope per the [Core Immutability Rule](#core-immutability-rule).
    - If breaking changes are required, present an impact list and get user sign-off.

2. **Design and API preparation**
    - Draft data models, types, and interfaces.
    - Prepare API shape (inputs, outputs, errors) with example usage.
    - Validate the plan against the data flow and plugin system docs.

3. **Implementation plan**
    - Map file-level changes and confirm module boundaries.
    - Ensure naming and patterns match existing conventions.
    - Include JSDoc for exported or shared modules.
    - For breaking changes, enumerate and update every impacted area.

4. **Testing plan (production-oriented)**
    - Write tests that mirror production data and realistic workflows.
    - Prefer tests that detect broken logic and integration regressions.
    - Include error-path and edge-case coverage.
    - If a testing framework is missing, flag it and propose a minimal setup.

5. **Documentation and validation**
    - Update core docs if core changes are introduced.
    - Verify formatting and linting rules.
    - Ensure docs reflect final API and data flow.

## Definition of Done

- Must-have requirements confirmed; ambiguous inputs resolved.
- Data flow and logic flow captured.
- API prepared and validated against patterns.
- Implementation adheres to conventions and all 9 patterns.
- Tests added (or testing gap is documented with a reason).
- Documentation updated for any core changes.
- Any approved breaking changes implemented with all impacted areas updated.
