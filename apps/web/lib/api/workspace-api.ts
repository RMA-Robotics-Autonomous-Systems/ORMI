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

/** Single source of the workspace-list endpoint. */
const WORKSPACES_URL = "/api/workspaces";

/**
 * Pending eager preload of the workspace list, or `null` when none is in
 * flight / unconsumed. This is an in-flight request handed off once to the
 * next {@link workspaceApi.getAll} call — NOT a TTL cache.
 */
let preloadPromise: Promise<ApiResult<Workspace[]>> | null = null;

/**
 * Start fetching the workspace list eagerly so a later
 * {@link workspaceApi.getAll} can consume the in-flight request instead of
 * starting its own. Intended to be fired when an authenticated user enters
 * the site (the splash) ahead of navigating to the dashboard.
 *
 * Idempotent: if a preload is already pending (and not yet consumed), this is
 * a no-op and does not start a second request. The promise is consumed exactly
 * once by the next `getAll()`; there is no TTL and nothing to invalidate.
 */
export function preloadWorkspaces(): void {
	if (preloadPromise !== null) return;
	preloadPromise = httpClient.get<Workspace[]>(WORKSPACES_URL);
}

/**
 * Workspace API client
 */
export const workspaceApi = {
	/**
	 * Get all workspaces.
	 *
	 * Consume-once preload: if a {@link preloadWorkspaces} request is pending,
	 * this returns that in-flight promise and clears the slot so the next call
	 * fetches fresh. Otherwise it fetches fresh immediately. This applies even
	 * to a preloaded `{ ok: false }` — the failure is returned once, then the
	 * next `getAll()` retries with a fresh request.
	 */
	async getAll(): Promise<ApiResult<Workspace[]>> {
		if (preloadPromise !== null) {
			const pending = preloadPromise;
			preloadPromise = null;
			return pending;
		}
		return httpClient.get<Workspace[]>(WORKSPACES_URL);
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
	 * Update workspace via `PUT`. All fields optional; only the provided ones
	 * are persisted. Powers Rename (`name`), layout-engine switching
	 * (`dashboardType`), category reassignment, and full-content saves.
	 */
	async update(
		workspaceId: number,
		data: {
			name?: string;
			content?: unknown;
			categoryId?: number | null;
			dashboardType?: "GRID" | "FLEX";
		},
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
