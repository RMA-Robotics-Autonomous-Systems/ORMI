"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { handleSave } from "@/lib/data/prisma-dashboard";
import { toDashboardState } from "@/lib/api/dashboard-api";
import { workspaceApi, type Workspace } from "@/lib/api/workspace-api";
import type { ApiResult } from "@/lib/http/client";
import { useParams } from "next/navigation";

export default function Page() {
	const params = useParams();
	const workspaceId = params.wsId as string;
	const [dashboardType, setDashboardType] = useState<string>("GRID");
	const [loading, setLoading] = useState(true);

	// One workspace fetch per navigation, shared by both consumers below
	// (the dashboardType effect and the shell's onLoad). The shell's effect
	// runs before this page's effect, so the fetch starts lazily on first
	// call rather than in an effect: whichever consumer runs first kicks it
	// off and the other awaits the same promise. Keyed by workspaceId so
	// navigating to another workspace re-fetches; strict-mode double effect
	// invocation reuses the same in-flight promise.
	const workspaceFetchRef = useRef<{
		key: string;
		promise: Promise<ApiResult<Workspace>>;
	} | null>(null);

	const getWorkspace = useCallback((): Promise<ApiResult<Workspace>> => {
		if (workspaceFetchRef.current?.key !== workspaceId) {
			const parsedWorkspaceId = Number(workspaceId);
			const promise = Number.isFinite(parsedWorkspaceId)
				? workspaceApi.getById(parsedWorkspaceId)
				: Promise.resolve<ApiResult<Workspace>>({
						ok: false,
						error: "Invalid workspace ID",
					});
			workspaceFetchRef.current = { key: workspaceId, promise };
		}
		return workspaceFetchRef.current.promise;
	}, [workspaceId]);

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
				const result = await getWorkspace();
				if (result.ok) {
					setDashboardType(result.data?.dashboardType || "GRID");
				}
			} catch {
				setDashboardType("GRID");
			} finally {
				setLoading(false);
			}
		}
		fetchWorkspaceType();
	}, [workspaceId, getWorkspace]);

	// Wrapper functions that include workspaceId
	const wrappedHandleLoad = async (setState: (state: any) => void) => {
		if (!workspaceId) {
			console.error("Workspace ID is required");
			return false;
		}

		const result = await getWorkspace();

		if (!result.ok) {
			console.error("Failed to load dashboard:", result.error);
			return false;
		}

		const workspace = result.data;
		if (!workspace) {
			console.error("Failed to load dashboard:", "Workspace not found");
			return false;
		}

		setState(toDashboardState(workspace.content));
		return true;
	};

	const wrappedHandleSave = async (dashboardState: any) => {
		return handleSave(dashboardState, workspaceId);
	};

	// The shell mounts immediately; its persistence load and the dashboardType
	// effect above both await the same shared workspace fetch, so one
	// navigation costs exactly one GET. Both feed the shell's single loading
	// skeleton; `dashboardType` is only read once the skeleton clears, by
	// which point the fetch has resolved the real value.
	return (
		<DashboardShell
			dashboardType={dashboardType}
			loading={loading}
			onLoad={wrappedHandleLoad}
			onSave={wrappedHandleSave}
		>
			{({ widgetDefinitions, widgetGroups }) => (
				<TemplatesProvider
					onLoad={tl}
					addTemplate={ts}
					removeTemplate={td}
					updateTemplate={tu}
				>
					<GlobalDataSourcesProvider>
						<DashboardEngine />
						<WidgetsDialog
							widgetDefinitions={widgetDefinitions}
							widgetGroups={widgetGroups}
						/>
					</GlobalDataSourcesProvider>
				</TemplatesProvider>
			)}
		</DashboardShell>
	);
}
