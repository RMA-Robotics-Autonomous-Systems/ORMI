# Workspace browser views

This directory holds the **workspace browser** views — the different ways
`/dashboard` can list the user's _workspaces_ (List and Board).

The current view set is **LIST** (default) and **BOARD**. An earlier **GRID**
view was removed: its card grid was redundant with BOARD, which renders the
same cards but adds category grouping and drag-and-drop. LIST replaced it with
a dense, sortable table.

> Do not confuse this with the **in-workspace layout engine** (`GRID`/`FLEX`,
> `DASHBOARD_TYPES` in `packages/ormi-core`), which controls how _widgets_ lay
> out inside an open workspace. That is a different axis and lives in immutable
> core. These browser views are **app-local** — not plugins, not core.

## Registry pattern

`registry.ts` exports `WORKSPACE_VIEWS: WorkspaceViewDefinition[]`. The dashboard
page maps over it to render a view switcher and to resolve the active view's
component. To add a view, add a `WorkspaceViewDefinition` to that array.

Each definition is:

```ts
interface WorkspaceViewDefinition {
	id: "LIST" | "BOARD";
	name: string;
	icon: LucideIcon;
	description?: string;
	Component: React.FC<WorkspaceViewProps>;
	/** Optional per-view loading skeleton (falls back to the card grid). */
	Skeleton?: React.FC;
}
```

`Component` and the optional `Skeleton` **must be stable, module-level
references** (Pattern 10) — never inline arrows — so switching views never
remounts the view tree.

## Loading skeletons

Each view may provide a `Skeleton` matching its layout; the dashboard page
renders the active view's `Skeleton` while data is fetching. LIST ships a
table-row skeleton (`ListViewSkeleton`, mirroring its Name / Category /
Datasources / Actions columns) and BOARD ships a card-column skeleton
(`KanbanViewSkeleton`). If a view omits `Skeleton`, the page falls back to the
generic card-grid of `WorkspaceItem.Skeleton`.

## Data flow

The dashboard page (`app/(home)/dashboard/page.tsx`) is the single owner of the
fetched data. It fetches workspaces + categories once (via the `workspaceApi` /
`categoriesApi` wrappers, Pattern 9) and passes everything down through
`WorkspaceViewProps`:

- `workspaces`, `categories` — the fetched data.
- `setWorkspaces`, `setCategories` — let presentational views apply optimistic
  local updates (e.g. the board's drag-and-drop) without re-fetching.
- `onWorkspaceDeleted` — asks the page to re-fetch.
- `onWorkspaceUpdate` — persists a reorder/recategorize.

Switching views does **not** refetch. View selection is a pure UI preference
persisted in `localStorage` under `ormi.workspaceView` (default `LIST`); there
is no schema change and no new route. A previously persisted `GRID` value is no
longer a registered view id, so it fails the stored-value validation and falls
back to the `LIST` default automatically.

## List view sorting

The List view (`views/list-view.tsx`) keeps a local `useState` sort over the
props-provided workspaces — no refetch, no new deps. It has two modes:

- **Default (no header clicked, `sort === null`):** a stable composite
  comparator orders rows by **Category → Type (GRID/FLEX) → Name**, all
  ascending and case-insensitive. "Uncategorized" workspaces sort **last**.
- **Single-column (after a header click):** clicking a sortable header toggles
  asc/desc on that one column, replacing the composite order. Name and Category
  are the sortable columns.

The table columns are **Name** (prefixed with the dashboard type GRID/FLEX
icon), **Category** (editable — see below), **Datasources** (one badge per
configured datasource, read from each workspace's persisted
`content.datasources` as `settings.title`) and the trailing **Actions** cell.
There is no longer a standalone Type or Updated column.

Clicking a row navigates to `/dashboard/ws/${id}`. The trailing actions cell
stops event propagation, and inside the Category cell only a **tight wrapper
around the Select control** stops propagation — so clicking the Category cell's
padding, accent dot, or any non-control area still opens the workspace, while
operating the Select (mouse or keyboard) never triggers navigation.

## List view per-category color

Rows are colored by category for readability — not background striping. Each row
gets a **deterministic accent color** derived from its category id by a small
pure helper (`views/category-color.ts`): a stable hash of the id indexes a
fixed, module-level OKLCH palette (~9 muted, theme-friendly colors that read in
both light and dark mode — the theme is authored in OKLCH, see
`packages/ui/src/styles/globals.css`). The same category id always maps to the
same color across renders and sessions; **no schema/migration and no color
field** are involved.

The accent shows as a **3px colored left strip** on the row's Name cell (an
`inset` box-shadow) plus a **matching colored dot** before the Category Select.
**Uncategorized** rows get a neutral hollow treatment — no left strip and an
outlined (hollow) dot — and still sort last. Because the default order groups
rows by category, the **first row of each new category group** carries a subtle
top divider so groups breathe while the table stays one continuous table (no
group-header rows). The divider only appears in the default composite order;
single-column sorts are not grouped.

## List view category editing

The List view's Category cell is an inline shadcn `Select` listing all
categories plus an "Uncategorized" option. Selecting a different category
reassigns the workspace's `categoryId`: it applies an optimistic local update
via `setWorkspaces`, then persists through `onWorkspaceUpdate` — the **same API
path the board uses** for drag-and-drop recategorization
(`workspaceApi.reorder`, Pattern 9). On failure the page-level handler refetches,
restoring the correct state.
