"use client";

import { dashboardApi, type DashboardState } from "../api/dashboard-api";

const handleSave = async (
	dashboardState: DashboardState,
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
	setState: (state: DashboardState) => void,
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
