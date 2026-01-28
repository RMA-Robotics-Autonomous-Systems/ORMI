/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

const handleSave = async (dashboardState: any, wsId = ""): Promise<boolean> => {
	try {
		let workspaceId = wsId;
		if (!workspaceId) {
			const url = new URL(window.location.href);
			workspaceId = url.pathname.split("/")[3]!;
			if (!workspaceId) {
				throw new Error("Workspace ID is required");
			}
		}
		// Convert Maps to objects for serialization
		const dataToSave = {
			...dashboardState,
			widgets: Object.fromEntries(dashboardState.widgets),
			datasources: Object.fromEntries(dashboardState.datasources),
		};
		const response = await fetch(`/api/workspaces/${workspaceId}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ content: dataToSave }),
		});
		if (!response.ok) {
			throw new Error(`Error saving dashboard: ${response.statusText}`);
		}
		return true;
	} catch (error) {
		console.error("Failed to save dashboard:", error);
		return false;
	}
};

const handleLoad = async (setState: (state: any) => void) => {
	try {
		const url = new URL(window.location.href);
		const workspaceId = url.pathname.split("/")[3];
		if (!workspaceId) {
			throw new Error("Workspace ID is required");
		}
		const response = await fetch(`/api/workspaces/${workspaceId}`);
		if (!response.ok) {
			throw new Error(`Error loading dashboard: ${response.statusText}`);
		}
		const workspace = (await response.json()) as any;
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
		// check that the types are correct
		if (!(dashboardDefinition.widgets instanceof Map)) {
			dashboardDefinition.widgets = new Map(
				Object.entries(dashboardDefinition.widgets),
			);
		}
		if (!(dashboardDefinition.datasources instanceof Map)) {
			if (dashboardDefinition.datasources) {
				dashboardDefinition.datasources = new Map(
					Object.entries(dashboardDefinition.datasources),
				);
			} else {
				dashboardDefinition.datasources = new Map();
			}
		}
		setState({
			layouts: dashboardDefinition.layouts,
			widgets: dashboardDefinition.widgets,
			locked: dashboardDefinition.locked || false,
			datasources: dashboardDefinition.datasources,
			compactType: dashboardDefinition.compactType || null,
			forceReload: false,
		});
		return true;
	} catch (error) {
		console.error("Failed to load dashboard:", error);
		return false;
	}
};

export { handleSave, handleLoad };
