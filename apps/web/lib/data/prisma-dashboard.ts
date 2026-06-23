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

export { handleSave };
