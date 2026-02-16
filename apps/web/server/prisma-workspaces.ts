"use client";

import { workspaceApi, type Workspace } from "../lib/api/workspace-api";

const handleCreate = async (
	title: string,
	userId: string,
): Promise<Workspace | null> => {
	const result = await workspaceApi.create(title, userId);

	if (!result.ok) {
		console.error("Failed to create workspace:", result.error);
		return null;
	}

	return result.data;
};

const handleDelete = async (workspaceId: number): Promise<boolean> => {
	const result = await workspaceApi.delete(workspaceId);

	if (!result.ok) {
		console.error("Failed to delete workspace:", result.error);
		return false;
	}

	return true;
};

const handleLoad = async (): Promise<Workspace[]> => {
	const result = await workspaceApi.getAll();

	if (!result.ok) {
		console.error("Failed to load workspaces:", result.error);
		return [];
	}

	return result.data;
};

const handleUpdate = async (
	workspaceId: number,
	name: string,
): Promise<boolean> => {
	const result = await workspaceApi.update(workspaceId, { name });

	if (!result.ok) {
		console.error("Failed to update workspace:", result.error);
		return false;
	}

	return true;
};

export { handleCreate, handleDelete, handleLoad, handleUpdate };
export type { Workspace };
