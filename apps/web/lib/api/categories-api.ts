import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";

/**
 * Category data structure
 */
export interface Category {
	id: number;
	name: string;
	order: number;
	createdById: string;
	_count?: { workspaces: number };
}

/**
 * Categories API client
 */
export const categoriesApi = {
	/**
	 * Get all categories for the current user
	 */
	async getAll(): Promise<ApiResult<Category[]>> {
		return httpClient.get<Category[]>("/api/categories");
	},

	/**
	 * Create a new category
	 */
	async create(name: string): Promise<ApiResult<Category>> {
		return httpClient.post<Category>("/api/categories", { name });
	},

	/**
	 * Reorder categories
	 */
	async reorder(
		updates: { id: number; order: number }[],
	): Promise<ApiResult<{ success: boolean }>> {
		return httpClient.patch<{ success: boolean }>("/api/categories", {
			updates,
		});
	},

	/**
	 * Update a category
	 */
	async update(
		categoryId: number,
		name: string,
	): Promise<ApiResult<Category>> {
		return httpClient.put<Category>(`/api/categories/${categoryId}`, {
			name,
		});
	},

	/**
	 * Delete a category
	 */
	async delete(categoryId: number): Promise<ApiResult<void>> {
		return httpClient.delete<void>(`/api/categories/${categoryId}`);
	},
};
