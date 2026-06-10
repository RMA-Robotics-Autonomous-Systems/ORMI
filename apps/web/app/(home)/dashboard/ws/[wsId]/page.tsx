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
import { workspaceApi } from "@/lib/api/workspace-api";
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

			const parsedWorkspaceId = Number(workspaceId);
			if (!Number.isFinite(parsedWorkspaceId)) {
				if (typeof window !== "undefined") {
					const draft = window.sessionStorage.getItem(
						`workspace-draft:${workspaceId}`,
					);

					if (draft) {
						try {
							const parsedDraft = JSON.parse(draft) as {
								dashboardType?: string;
							};

							setDashboardType(
								parsedDraft.dashboardType || "GRID",
							);
						} catch {
							setDashboardType("GRID");
						}
					}
				}

				setLoading(false);
				return;
			}

			try {
				const result = await workspaceApi.getById(parsedWorkspaceId);
				if (result.ok) {
					setDashboardType(
						(result.data as any)?.dashboardType || "GRID",
					);
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

	// The shell mounts immediately so its persistence load runs in parallel with
	// the workspace fetch above; both feed the shell's single loading skeleton
	// (max of the two waits, not the sum). `dashboardType` is only read once the
	// skeleton clears, by which point the fetch has resolved the real value.
	return (
		<DashboardShell
			dashboardType={dashboardType}
			loading={loading}
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
