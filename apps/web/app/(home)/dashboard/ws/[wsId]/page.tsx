"use client";

import { useEffect, useState } from "react";
import {
	DashboardShell,
	DashboardEngine,
} from "@workspace/ormi-core/dashboard";
import { GlobalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { WidgetsDialog } from "@workspace/ormi-core/widgets";
import { TemplatesProvider } from "@workspace/ormi-core/templates";
import {
	handleLoad as tl,
	handleSave as ts,
	handleDelete as td,
	handleUpdate as tu,
} from "@/lib/data/prisma-templates";
import { handleLoad, handleSave } from "@/lib/data/prisma-dashboard";
import { useParams } from "next/navigation";

export default function Page() {
	const params = useParams();
	const workspaceId = params.wsId as string;
	const [dashboardType, setDashboardType] = useState<string>("GRID");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function fetchWorkspaceType() {
			if (!workspaceId) {
				setLoading(false);
				return;
			}
			try {
				const response = await fetch(`/api/workspaces/${workspaceId}`);
				if (response.ok) {
					const workspace = await response.json();
					setDashboardType(workspace?.dashboardType || "GRID");
				}
			} catch (e) {
				setDashboardType("GRID");
			} finally {
				setLoading(false);
			}
		}
		fetchWorkspaceType();
	}, [workspaceId]);

	// Wrapper functions that include workspaceId
	const wrappedHandleLoad = async (setState: (state: any) => void) => {
		return handleLoad(workspaceId, setState);
	};

	const wrappedHandleSave = async (dashboardState: any) => {
		return handleSave(dashboardState, workspaceId);
	};

	if (loading) return <div>Loading workspace...</div>;

	return (
		<DashboardShell
			dashboardType={dashboardType}
			onLoad={wrappedHandleLoad}
			onSave={wrappedHandleSave}
		>
			{({ widgetDefinitions }) => (
				<TemplatesProvider
					onLoad={tl}
					addTemplate={ts}
					removeTemplate={td}
					updateTemplate={tu}
				>
					<GlobalDataSourcesProvider>
						<DashboardEngine />
						<WidgetsDialog widgetDefinitions={widgetDefinitions} />
					</GlobalDataSourcesProvider>
				</TemplatesProvider>
			)}
		</DashboardShell>
	);
}
