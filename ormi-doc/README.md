# ormi-doc — ORMI architecture knowledge system

Internal, **local-only** architecture documentation for ORMI. It is **not** part
of the web app and is never served or exposed — you run it on your machine to
browse the architecture. Modeled after Raven's `raven-doc`.

It combines two things:

- **C4 diagrams** — a [LikeC4](https://likec4.dev) model (`.c4` DSL). There are no
  other diagramming tools in this repo.
- **Markdown knowledge base** (`knowledge/`) — the source-of-truth prose the model
  links into.

## Layout

```
spec.c4        specification: element/relationship kinds, styling, tags
model/         the model (people, ormi system, containers, components, deployment)
views/         diagram views (structure, flows, states)
knowledge/     markdown knowledge base, organized by area
```

## Running

Uses **Bun**. From this directory:

```bash
bun install
bun run dev        # likec4 start — interactive diagram browser at http://localhost:5173
bun run validate   # likec4 validate — type-check the model (run before commit)
bun run build      # likec4 build --output dist — static site (git-ignored)
```

## Conventions

- **Knowledge base is source of truth.** When it disagrees with nearby code, the
  knowledge base wins — code drifts, the recorded intent is authoritative.
- **Update in lockstep.** Any structural platform change updates both the owning
  `knowledge/` file **and** the LikeC4 model in the same change.
- **Nested references are fully qualified** (e.g. `ormi.web.dashboard`).
- **Element `link`s are file-relative** — the model links into the knowledge base
  via `link ../knowledge/…`; preserve the `model/` ↔ `knowledge/` layout or links break.
- Coding standards are **not duplicated here** — see the repo's `AGENTS.md` (the 9
  patterns) as the single source of truth.
- LikeC4 versions are **pinned** for reproducible validation and icon resolution.
