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
```

## Required Inputs (ask if missing)

- Feature goal and success criteria.
- Target area (core vs plugin) and expected impact.
- User story and UX expectations.
- Data contracts: inputs, outputs, formats, constraints, and validation rules.
- Data flow and logic flow (diagram or step list). If missing, request it and propose a solution.
- External dependencies, integrations, or API constraints.
- Non-functional requirements: performance, security, accessibility, and rollout constraints.

If documentation is incomplete or missing, request it explicitly before implementation.

## Placement Rules

- Detect whether the change belongs in packages or plugins based on intent and scope.
- Packages: internal logic and shared core capabilities.
- Plugins: features that extend the core.
- Core is treated as immutable; exceptions must be justified and explicitly agreed.
- If core is changed, update documentation in [apps/web/content/docs](apps/web/content/docs).
- No legacy support: if a breaking change is required, get explicit user approval, list all impacted code areas, and update them.

## Conventions and Guardrails

- Follow React/Next.js conventions for file structure, naming, and component patterns.
- Prefer idiomatic app router patterns for data fetching and rendering boundaries.
- Avoid anti-patterns: implicit shared mutable state, side effects in render, heavy logic inside components, and overly broad context providers.
- Keep public APIs typed and stable; add JSDoc for exported or shared modules.
- Respect existing repo formats, linting, and TypeScript configs.
- When user give an error message, don't fix it, explain what could be the cause, propose a solution

## Implementation Patterns (approved solutions)

This section captures the approved patterns for common problems. Use these instead of inventing alternatives.

### 1. API Responses — `apiResponse` helper

**Problem:** Inconsistent HTTP response construction across API routes.
**Solution:** Use a single `apiResponse(data, status)` helper that wraps `NextResponse.json()`.

```typescript
// packages/utils or apps/web/lib
export function apiResponse(data: unknown, status = 200) {
	return NextResponse.json(data, { status });
}
```

- Every route handler returns `apiResponse(...)`.
- Error responses use the same helper: `apiResponse({ error: "msg" }, 400)`.
- Do NOT use `new Response(JSON.stringify(...))` or raw `NextResponse.json()` directly.

### 2. Route Validation — Zod on every mutating endpoint

**Problem:** Some routes validate with Zod, others skip validation entirely.
**Solution:** All POST/PUT/PATCH/DELETE routes must parse the body with a Zod schema before processing.

```typescript
const schema = z.object({ name: z.string().min(1) });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return apiResponse({ error: parsed.error.flatten() }, 400);
```

- GET routes validate query params only when relevant.
- Zod schemas live next to the route or in a shared `validations/` folder.

### 3. Context Providers — `createSafeContext<T>(name)`

**Problem:** Providers use different defaults (`undefined`, `null`, `{}`), inconsistent hook guards, and inconsistent naming.
**Solution:** Use the `createSafeContext` factory for all new contexts.

```typescript
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

Rules:

- Default is always `undefined`.
- Hook always throws if used outside provider.
- Context name uses PascalCase: `DashboardContext`, `NavbarContext`.
- Split state + actions into two contexts only when the provider is complex (e.g., `DashboardProvider`).

### 4. Plugin Exports — Standard interface

**Problem:** Plugins export their content inconsistently (default export vs named, different shapes).
**Solution:** Every plugin exports a single `default` class extending `Plugin`, and uses the `export.tsx` / `widget-export.tsx` pattern for widget/datasource registration.

```typescript
// index.ts — every plugin
export default class MyPlugin extends Plugin {
	name = "my-plugin";
	register(pm: PluginsManager) {
		/* register hooks */
	}
}
```

- Widget definitions go in `export.tsx` → registered via `PluginsHooks.WIDGETS_LIST`.
- Datasource definitions go in `export.tsx` → registered via `PluginsHooks.DATASOURCES_LIST`.
- Do NOT register hooks outside the `register()` method.

### 5. Plugin Datasource Providers — Lifecycle components

**Problem:** Plugin datasource providers all create a React Context but pass `null` as the context value. Data flows through `PluginsManager` hooks, not through context.
**Solution:** Plugin datasource providers that pass `null`/empty context values should be plain lifecycle components, not context providers.

When to use a Context provider for a datasource:

- The provider holds **shared reactive state** that children consume directly (e.g., connection status, client instance).

When to use a plain component:

- Data flows solely through `PluginsManager.addFilter/addAction` hooks.
- The context value is `null`, `{}`, or unused.

Current plugin datasource providers that are lifecycle-only (no real context value):

- `RandomDataSourceProvider` → context value `null`
- `RosBridgeSuiteSourceProvider` → context value `null`
- `TelloSourceProvider` → context value `null`
- `RestBagDataSourceProvider` → context value `null`
- `FoxgloveDataHandler` → context value `{client, channels, isConnected}`, but **only consumed by internal sub-managers** (SubscriptionManager, PublisherManager, ServiceManager, TypeSystemManager). No dashboard component or widget reads it. From the dashboard perspective it is a lifecycle component; the context is plugin-internal plumbing.

### 6. Storage Wrappers — Plain hooks, not providers

**Problem:** `LocalStorageProvider` and `CookiesProvider` wrap browser APIs in a Context but hold no reactive state. The get/set/remove functions never change.
**Solution:** Replace with plain hooks or module-level functions. No provider needed.

```typescript
// Preferred: simple hook
export function useLocalStorage() {
	return {
		get: (key: string) => {
			/* ... */
		},
		set: (key: string, value: any) => {
			/* ... */
		},
		remove: (key: string) => {
			/* ... */
		},
	};
}
```

Use a provider only when the underlying storage needs to be swapped for testing or the state must be reactive.

### 7. Auth Route Wrappers — `withAuth` higher-order handler

**Problem:** Every API route repeats the same `getServerSession` + null-check pattern.
**Solution:** Use a `withAuth(handler)` wrapper that extracts the session and returns 401 automatically.

```typescript
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

### 8. Widget Gating — Utility function

**Problem:** Widget availability filtering is inline in `global-datasource-provider.tsx`.
**Solution:** Extract `filterWidgetsByDatasources(widgets, datasources)` into a shared utility. Widgets that require a specific datasource type declare their dependency in their definition.

## Reference Docs (review before changes)

- Data flow: [apps/web/content/docs/v1/core/data-flow.md](apps/web/content/docs/v1/core/data-flow.md)
- Plugin system: [apps/web/content/docs/v1/core/plugin-system.md](apps/web/content/docs/v1/core/plugin-system.md)
- Widgets system: [apps/web/content/docs/v1/core/widgets.md](apps/web/content/docs/v1/core/widgets.md)
- Harmonization report: [HARMONIZATION_REPORT.md](HARMONIZATION_REPORT.md)

## Workflow

1. Discovery and clarification
    - Ask for missing documentation.
    - Ask for logic and data flow; propose at least one solution if absent.
    - Detect whether the change belongs in packages or plugins.
    - Treat core as immutable by default; confirm exception and scope if core changes are needed.
    - If breaking changes are required, ask the user to decide and provide an impact list.

2. Design and API preparation
    - Draft data models, types, and interfaces.
    - Prepare API shape (inputs, outputs, errors) with example usage.
    - Validate the plan against the data flow and plugin system.

3. Implementation plan
    - Map file-level changes and confirm module boundaries.
    - Ensure naming and patterns match existing codebase conventions.
    - Include JSDoc for exported or shared modules.
    - For breaking changes, enumerate and update every impacted area in the codebase.

4. Testing plan (production-oriented)
    - Write tests that mirror production data and realistic workflows.
    - Prefer tests that can detect broken logic and integration regressions.
    - Include error-path and edge-case coverage where applicable.
    - If a testing framework is missing, flag it and propose a minimal setup.

5. Documentation and validation
    - Update core docs if core changes are introduced.
    - Verify formatting and linting rules.
    - Ensure docs reflect final API and data flow.

## Definition of Done

- Requirements clarified; missing docs requested or provided.
- Data flow and logic flow captured.
- API prepared and validated.
- Implementation adheres to conventions and patterns.
- Tests added (or a testing gap is documented).
- Documentation updated for any core changes.
- Any approved breaking changes implemented with all impacted areas updated.

## Next Step

Collect missing requirements and confirm the logic/data flow, then proceed to API prep and solution implementation.
