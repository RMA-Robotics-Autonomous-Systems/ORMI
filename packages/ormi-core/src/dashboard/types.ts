/**
 * Layout engine identifiers and the platform default.
 *
 * Deliberately free of React, icon and CSS imports: the workspace API route
 * resolves the default when persisting a new workspace, and a server route
 * must be able to import it without pulling in the dashboard barrel, which
 * reaches client components and `react-grid-layout`'s stylesheet.
 */

/** Layout engine ids the platform ships, in picker order. */
export const DASHBOARD_TYPE_IDS = ["FLEX", "GRID"] as const;

/** Union of the layout engine ids the platform ships. */
export type DashboardTypeId = (typeof DASHBOARD_TYPE_IDS)[number];

/**
 * Layout engine a workspace gets when nothing else says otherwise.
 *
 * Every fallback — the creation dialog, the workspace API, the dashboard page,
 * the workspace list — resolves through this constant so the default cannot
 * drift between them. Existing workspaces are unaffected: they persist their
 * own `dashboardType` and it is used verbatim.
 */
export const DEFAULT_DASHBOARD_TYPE = "FLEX" as const satisfies DashboardTypeId;

/**
 * Resolve a persisted or user-supplied dashboard type to an engine id.
 *
 * Only a missing or empty value falls back to {@link DEFAULT_DASHBOARD_TYPE}.
 * An unrecognised id is returned untouched: layout engines are registered
 * through the plugin system, so a workspace may legitimately carry an id this
 * module has never heard of.
 *
 * @param value - Persisted or user-supplied dashboard type.
 * @returns The engine id to render.
 */
export function resolveDashboardType(value?: string | null): string {
	return typeof value === "string" && value.length > 0
		? value
		: DEFAULT_DASHBOARD_TYPE;
}
