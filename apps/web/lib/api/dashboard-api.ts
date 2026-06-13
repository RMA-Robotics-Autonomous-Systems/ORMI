import type { ApiResult } from "../http/client";
import { workspaceApi } from "./workspace-api";

/**
 * Dashboard state structure
 */
export interface DashboardState {
	layouts: {
		lg: unknown[];
		md: unknown[];
		sm: unknown[];
		xs: unknown[];
		xxs: unknown[];
	};
	widgets: Map<string, unknown>;
	datasources: Map<string, unknown>;
	locked?: boolean;
	compactType?: string | null;
	forceReload?: boolean;
}

/**
 * Convert raw workspace `content` (as stored in the DB / returned by the API)
 * into a usable `DashboardState`.
 *
 * - `null`/missing content yields a default empty dashboard (empty layouts,
 *   widgets, and datasources).
 * - `widgets`/`datasources` arrive serialized as plain objects and are
 *   converted to Maps; values that are already Maps pass through unchanged.
 * - `locked` defaults to `false`, `compactType` to `null`, and `forceReload`
 *   is always reset to `false`.
 */
export function toDashboardState(content: unknown): DashboardState {
	// If there's no content, use default empty dashboard
	const dashboardDefinition = content
		? (content as any)
		: {
				layouts: {
					lg: [],
					md: [],
					sm: [],
					xs: [],
					xxs: [],
				},
				widgets: {},
				datasources: {},
			};

	// Convert objects back to Maps
	const widgets =
		dashboardDefinition.widgets instanceof Map
			? dashboardDefinition.widgets
			: new Map(Object.entries(dashboardDefinition.widgets || {}));

	const datasources =
		dashboardDefinition.datasources instanceof Map
			? dashboardDefinition.datasources
			: new Map(Object.entries(dashboardDefinition.datasources || {}));

	return {
		layouts: dashboardDefinition.layouts,
		widgets,
		locked: dashboardDefinition.locked || false,
		datasources,
		compactType: dashboardDefinition.compactType || null,
		forceReload: false,
	};
}

/**
 * Dashboard API client
 */
export const dashboardApi = {
	/**
	 * Save dashboard state to workspace
	 */
	async save(
		workspaceId: string,
		dashboardState: DashboardState,
	): Promise<ApiResult<void>> {
		const parsedWorkspaceId = Number(workspaceId);
		if (!Number.isFinite(parsedWorkspaceId)) {
			return { ok: false, error: "Invalid workspace ID" };
		}

		// Convert Maps to objects for serialization. Tolerate plain objects too:
		// imported dashboards arrive as plain objects (the serialized shape), not Maps,
		// and Object.fromEntries() throws on a non-iterable plain object.
		const toRecord = (value: unknown): Record<string, unknown> =>
			value instanceof Map
				? (Object.fromEntries(value) as Record<string, unknown>)
				: ((value as Record<string, unknown>) ?? {});

		const dataToSave = {
			...dashboardState,
			widgets: toRecord(dashboardState.widgets),
			datasources: toRecord(dashboardState.datasources),
		};

		const result = await workspaceApi.patch(parsedWorkspaceId, {
			content: dataToSave,
		});

		if (!result.ok) {
			return result;
		}

		return { ok: true, data: undefined };
	},

	/**
	 * Load dashboard state from workspace
	 */
	async load(workspaceId: string): Promise<ApiResult<DashboardState>> {
		const parsedWorkspaceId = Number(workspaceId);
		if (!Number.isFinite(parsedWorkspaceId)) {
			return { ok: false, error: "Invalid workspace ID" };
		}

		const result = await workspaceApi.getById(parsedWorkspaceId);

		if (!result.ok) {
			return result;
		}

		const workspace = result.data;
		if (!workspace) {
			return { ok: false, error: "Workspace not found" };
		}

		return { ok: true, data: toDashboardState(workspace.content) };
	},
};
