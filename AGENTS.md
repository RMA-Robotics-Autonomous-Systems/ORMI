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

## Implementation Patterns

This section captures the approved patterns for common problems. Use these instead of inventing alternatives.

### 1. API Responses — `apiResponse` helper

Use a single `apiResponse(data, status)` helper for all API responses.

```typescript
// packages/utils or apps/web/lib
export function apiResponse(data: unknown, status = 200) {
	return NextResponse.json(data, { status });
}
```

- Every route handler returns `apiResponse(...)`
- Error responses: `apiResponse({ error: "msg" }, 400)`
- Do NOT use `new Response(JSON.stringify(...))` or raw `NextResponse.json()` directly

### 2. Route Validation — Zod on every mutating endpoint

All POST/PUT/PATCH/DELETE routes must parse the body with a Zod schema before processing.

```typescript
const schema = z.object({ name: z.string().min(1) });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return apiResponse({ error: parsed.error.flatten() }, 400);
```

- GET routes validate query params only when relevant
- Zod schemas live next to the route or in a shared `validations/` folder

### 3. Context Providers — `createSafeContext<T>(name)`

Use the `createSafeContext` factory for all new contexts.

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

- Default is always `undefined`
- Hook always throws if used outside provider
- Context name uses PascalCase: `DashboardContext`, `NavbarContext`
- Split state + actions into two contexts only when the provider is complex (e.g., `DashboardProvider`)

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

		// Register hooks with imported or inline definitions
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

- Use `export.ts` (or `export.tsx` if JSX needed) for datasource/widget/renderer definitions
- Keep inline only for trivial 1-2 line callbacks
- Constructor registers hooks via `this.addFilter()` / `this.addAction()`
- Filter functions receive array, mutate it, return it

### 5. Plugin Datasource Providers — Lifecycle components

Plugin datasource providers that pass `null`/empty context values should be plain lifecycle components, not context providers.

**Use a Context provider when:**

- The provider holds shared reactive state that children consume directly (e.g., connection status, client instance)

**Use a plain component when:**

- Data flows solely through `PluginsManager.addFilter/addAction` hooks
- The context value is `null`, `{}`, or unused

### 6. Auth Route Wrappers — `withAuth` higher-order handler

Use `withAuth(handler)` wrapper for all authenticated routes.

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

Extract `filterWidgetsByDatasources(widgets, datasources)` into a shared utility. Widgets that require a specific datasource type declare their dependency in their definition.

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
	| { ok: true; data: T }
	| { ok: false; error: string; details?: unknown };

// apps/web/lib/api/workspace-api.ts
export const workspaceApi = {
	async getAll() {
		return httpClient.get<Workspace[]>("/api/workspaces");
	},
	async create(title: string, userId: string) {
		/* ... */
	},
	// ...
};
```

- Client-side HTTP code in `apps/web/server/prisma-*.ts` must use domain API wrappers, never raw `fetch()`
- All API wrappers return `ApiResult<T>` for consistent error handling
- Test API wrappers with Bun test using mocked `httpClient`
- Route handlers remain independent; this pattern is for client-side code only

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
