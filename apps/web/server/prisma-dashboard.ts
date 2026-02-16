/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { dashboardApi, type DashboardState } from "../lib/api/dashboard-api";

const handleSave = async (
	dashboardState: any,
	workspaceId: string,
): Promise<boolean> => {
	if (!workspaceId) {
		console.error("Workspace ID is required");
		return false;
	}

	const result = await dashboardApi.save(workspaceId, dashboardState);

	if (!result.ok) {
		console.error("Failed to save dashboard:", result.error);
		return false;
	}

	return true;
};

const handleLoad = async (
	workspaceId: string,
	setState: (state: any) => void,
) => {
	if (!workspaceId) {
		console.error("Workspace ID is required");
		return false;
	}

	const result = await dashboardApi.load(workspaceId);

	if (!result.ok) {
		console.error("Failed to load dashboard:", result.error);
		return false;
	}

	setState(result.data);
	return true;
};

export { handleSave, handleLoad };
