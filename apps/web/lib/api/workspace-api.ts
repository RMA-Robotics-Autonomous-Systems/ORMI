import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";

/**
 * Workspace data structure
 */
export interface Workspace {
	id: number;
	name: string;
	createdAT: Date;
	updatedAT?: Date;
	dashboardType?: string;
	categoryId?: number | null;
	order?: number;
	content?: unknown;
}

/**
 * Workspace API client
 */
export const workspaceApi = {
	/**
	 * Get all workspaces
	 */
	async getAll(): Promise<ApiResult<Workspace[]>> {
		return httpClient.get<Workspace[]>("/api/workspaces");
	},

	/**
	 * Get workspace by ID
	 */
	async getById(workspaceId: number): Promise<ApiResult<Workspace>> {
		return httpClient.get<Workspace>(`/api/workspaces/${workspaceId}`);
	},

	/**
	 * Create new workspace
	 */
	async create(
		title: string,
		userId: string,
		dashboardType?: string,
	): Promise<ApiResult<Workspace>> {
		return httpClient.post<Workspace>("/api/workspaces", {
			title,
			userId,
			...(dashboardType ? { dashboardType } : {}),
		});
	},

	/**
	 * Update workspace
	 */
	async update(
		workspaceId: number,
		data: { name?: string; content?: unknown },
	): Promise<ApiResult<Workspace>> {
		return httpClient.put<Workspace>(
			`/api/workspaces/${workspaceId}`,
			data,
		);
	},

	/**
	 * Bulk reorder workspaces (update order and categoryId)
	 */
	async reorder(
		updates: { id: number; order: number; categoryId?: number | null }[],
	): Promise<ApiResult<{ success: boolean }>> {
		return httpClient.patch<{ success: boolean }>("/api/workspaces", {
			updates,
		});
	},

	/**
	 * Patch workspace (partial update)
	 */
	async patch(
		workspaceId: number,
		data: Partial<Workspace>,
	): Promise<ApiResult<Workspace>> {
		return httpClient.patch<Workspace>(
			`/api/workspaces/${workspaceId}`,
			data,
		);
	},

	/**
	 * Delete workspace
	 */
	async delete(workspaceId: number): Promise<ApiResult<void>> {
		return httpClient.delete<void>(`/api/workspaces/${workspaceId}`);
	},
};
