"use client";

/**
 * Client-side persistence glue for `DashboardShell`'s `onSave` (and the workspace import): unwraps the
 * domain API wrapper's `ApiResult` into the plain value the caller expects,
 * logging failures. HTTP itself stays in `lib/api/`.
 */
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
