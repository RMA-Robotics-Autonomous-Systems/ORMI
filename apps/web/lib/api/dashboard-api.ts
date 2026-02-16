import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";
import type { Workspace } from "./workspace-api";

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
		// Convert Maps to objects for serialization
		const dataToSave = {
			...dashboardState,
			widgets: Object.fromEntries(dashboardState.widgets),
			datasources: Object.fromEntries(dashboardState.datasources),
		};

		return httpClient.patch<void>(`/api/workspaces/${workspaceId}`, {
			content: dataToSave,
		});
	},

	/**
	 * Load dashboard state from workspace
	 */
	async load(workspaceId: string): Promise<ApiResult<DashboardState>> {
		const result = await httpClient.get<Workspace>(
			`/api/workspaces/${workspaceId}`,
		);

		if (!result.ok) {
			return result;
		}

		const workspace = result.data;

		// If there's no content, use default empty dashboard
		const dashboardDefinition = workspace.content
			? (workspace.content as any)
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
				: new Map(
						Object.entries(dashboardDefinition.datasources || {}),
					);

		return {
			ok: true,
			data: {
				layouts: dashboardDefinition.layouts,
				widgets,
				locked: dashboardDefinition.locked || false,
				datasources,
				compactType: dashboardDefinition.compactType || null,
				forceReload: false,
			},
		};
	},
};
