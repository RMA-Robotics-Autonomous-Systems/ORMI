import type { SyncConfig } from "@workspace/ormi-sync";

/**
 * SyncConfig for the workspaces resource.
 *
 * Describes how each mutating method on workspaceApi maps to an offline Action.
 * urlTemplates must stay in sync with the URLs used in workspace-api.ts.
 */
export const workspaceSyncConfig: SyncConfig = {
	resource: "workspaces",
	primaryKey: "id",
	versionKey: "updatedAT",
	reads: {
		getAll: {
			mergeOnWrite: true,
		},
		getById: {
			query: (...args: unknown[]) => {
				const [workspaceId] = args as [number];
				return {
					filter: {
						id: workspaceId,
					},
					limit: 1,
				};
			},
			select: (result: unknown) => {
				if (!Array.isArray(result)) {
					return result;
				}

				return result[0] ?? null;
			},
		},
	},
	actions: {
		create: {
			urlTemplate: "/api/workspaces",
			actionMethod: "create",
			payload: (...args: unknown[]) => {
				const [title, userId, dashboardType] = args as [
					string,
					string,
					string | undefined,
				];
				return {
					title,
					userId,
					...(dashboardType ? { dashboardType } : {}),
				};
			},
		},

		update: {
			urlTemplate: "/api/workspaces/:id",
			actionMethod: "update",
			urlParams: (...args: unknown[]) => {
				const [workspaceId] = args as [number];
				return { id: workspaceId };
			},
			payload: (...args: unknown[]) => {
				const [, data] = args as [
					number,
					{ name?: string; content?: unknown },
				];
				return data;
			},
		},

		patch: {
			urlTemplate: "/api/workspaces/:id",
			actionMethod: "patch",
			urlParams: (...args: unknown[]) => {
				const [workspaceId] = args as [number, unknown];
				return { id: workspaceId };
			},
			payload: (...args: unknown[]) => {
				const [, data] = args as [number, unknown];
				return data;
			},
		},

		reorder: {
			urlTemplate: "/api/workspaces",
			actionMethod: "reorder",
			payload: (...args: unknown[]) => {
				const [updates] = args as [
					{ id: number; order: number; categoryId?: number | null }[],
				];
				return { updates };
			},
		},

		delete: {
			urlTemplate: "/api/workspaces/:id",
			actionMethod: "delete",
			urlParams: (...args: unknown[]) => {
				const [workspaceId] = args as [number];
				return { id: workspaceId };
			},
		},
	},
};
