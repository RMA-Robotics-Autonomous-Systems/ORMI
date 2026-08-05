# ORMI — Agent Guide

ORMI (Open Robotic Management Interface) is a modular web platform for monitoring and controlling heterogeneous robotics and autonomous systems in real time. A Next.js dashboard renders customizable widgets fed by pluggable datasources (ROS2/ROSBridge, Foxglove, Tello, REST, …). Developed by the Robotics and Autonomous Systems Laboratory, Royal Military Academy of Belgium.

This file is the entry point for any agent working in this repo. Read it first, then let the task route you into the engineering rules and the right subagent.

---

## Source of Truth: `AGENTS.md`

@AGENTS.md

The full engineering rulebook is imported above and is **authoritative**. It owns: the monorepo placement rules, the Core Immutability Rule, the 9 required implementation patterns, the workflow, and the Definition of Done. When `AGENTS.md` and nearby code disagree, `AGENTS.md` wins — code can drift, the rules are the recorded intent. Keep it current: if a durable rule is introduced or confirmed during a task, update `AGENTS.md` in the same change.

Two behavioral rules from `AGENTS.md` are easy to forget and apply on **every** task:

1. **Error Handling Rule** — when the user pastes an error message, do **not** fix it directly. Explain the likely cause and propose a solution for the user to apply. This overrides the default instinct to patch immediately.
2. **Core Immutability Rule** — `packages/ormi-core` is immutable. Touching it requires (1) explicit user approval, (2) a listed impact analysis, (3) updated docs in `apps/web/content/docs`. Do not modify core without all three.

---

## Stack

| Layer            | Tech                                                   | Where                             |
| ---------------- | ------------------------------------------------------ | --------------------------------- |
| Web app          | Next.js 16 (app router) + React 19 + TypeScript        | `apps/web`                        |
| Core library     | Widgets, datasources, transformations (immutable)      | `packages/ormi-core`              |
| Plugin framework | `Plugin` base class, `PluginsHooks`                    | `packages/ormi-plugins`           |
| Shared UI        | Radix UI + shadcn/ui primitives                        | `packages/ui`                     |
| Utilities        | `createSafeContext`, `filterWidgetsByDatasources`, CLI | `packages/utils`                  |
| API helper       | `apiResponse` (all API responses)                      | `apps/web/lib/api-utils.ts`       |
| JSON Forms       | Widget config schema rendering                         | `packages/ormi-jsonforms`         |
| Features         | Datasource + widget plugins (`ormi-*`)                 | `plugins/`                        |
| Backend          | Prisma ORM + PostgreSQL, NextAuth                      | `apps/web/server`, `apps/web/lib` |

Tooling: **Bun** package manager, **Turbo** monorepo orchestration, **Bun test**, ESLint + Prettier, simple-git-hooks. Config comes from `docker-compose.yml` / env vars — never hardcode secrets.

---

## Subagents

Specialized agents live in `.claude/agents/`. Delegate work to the matching agent rather than doing everything inline — each one already knows the ORMI rules and risk areas to watch.

| Agent            | Use it for                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architect`      | Design decisions, new plugins/packages, placement (packages vs plugins vs apps), cross-cutting patterns, **and UI/UX critique** of the dashboard. Design only — no implementation. |
| `implement`      | Building, fixing, or extending widgets, datasources, plugins, server helpers, routes, or UI against the 9 patterns. Minimal, standards-compliant changes.                          |
| `code-review`    | Reviewing code against `AGENTS.md`, the 9 patterns, Core Immutability, and plugin/package boundaries.                                                                              |
| `security-audit` | Adversarial review of the web app: auth wrappers, Zod validation, Prisma access, secret exposure, injection, OWASP Top 10.                                                         |

**Routing:**

- Design / "should we…" / new plugin or package / "does this screen work?" → `architect`
- Write or change code → `implement`
- "Is this code correct / safe to merge?" → `code-review`
- "Can an attacker break this?" → `security-audit`

A non-trivial feature often chains them: `architect` (decide + place) → `implement` (build) → `code-review` + `security-audit` (verify).

---

## Skills

On-demand procedural workflows live in `.claude/skills/`. They load only when invoked, so they cost no context until needed.

| Skill           | Use it for                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-plugin` | Scaffolding a new `ormi-*` plugin (datasource and/or widgets): directory layout, `Plugin` class, `export.ts`, hook registration, and wiring it into the monorepo. |

---

## Working Agreement

1. **Rules first.** The imported `AGENTS.md` is authoritative; the 9 patterns beat local improvisation when they conflict.
2. **Delegate.** Route work to the subagent that owns it instead of doing everything inline.
3. **Stay minimal.** Change only what the task requires; avoid unrelated refactors. No legacy shims — if a breaking change is needed, list impacted areas and get sign-off.
4. **Ask when it's architectural.** Core change, new package/app/top-level structure, schema/migration change, multiple approaches that change API shape or UX → confirm before proceeding.
5. **Keep rules current.** When a durable rule is introduced or confirmed, update `AGENTS.md` in the same change.
6. **Verify.** After code changes, run targeted `turbo` checks — `bun run typecheck`, `bun run lint`, `bun run test` — and fix what your change broke.

---

## High-Sensitivity Areas (always extra care)

Core immutability (`packages/ormi-core`), the Error Handling Rule (explain, don't auto-fix pasted errors), Zod validation on every mutating route, `withAuth` on protected routes, Prisma access only through `apps/web/lib/data/prisma-*.ts` helpers, `apiResponse` for all API responses, and secret handling (never logged or committed). See `AGENTS.md` for the full pattern set.
