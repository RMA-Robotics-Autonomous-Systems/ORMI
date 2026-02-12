# ORMI Engineering Agenda

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

## Reference Docs (review before changes)

- Data flow: [apps/web/content/docs/v1/core/data-flow.md](apps/web/content/docs/v1/core/data-flow.md)
- Plugin system: [apps/web/content/docs/v1/core/plugin-system.md](apps/web/content/docs/v1/core/plugin-system.md)
- Widgets system: [apps/web/content/docs/v1/core/widgets.md](apps/web/content/docs/v1/core/widgets.md)

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
