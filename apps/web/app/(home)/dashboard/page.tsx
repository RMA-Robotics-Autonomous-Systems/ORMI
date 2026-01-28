"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DashboardHeader } from "@/components/advanced/misc/dashboard-header";
import { CreateWSButton } from "@/components/advanced/misc/workspace-button";
import { DashboardShell } from "@/components/advanced/misc/dashboard-shell";
import { KanbanView } from "@/components/advanced/misc/kanban";

export default function DashboardPage() {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [refreshKey, setRefreshKey] = useState(0);

	useEffect(() => {
		if (status === "loading") return;

		if (!session?.user) {
			router.push("/signin");
			return;
		}
	}, [session, status, router]);

	const handleWorkspaceUpdate = useCallback(
		async (
			updates: {
				id: number;
				order: number;
				categoryId?: number | null;
			}[],
		) => {
			try {
				const response = await fetch("/api/workspaces", {
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ updates }),
				});

				if (!response.ok) {
					throw new Error("Failed to update workspaces");
				}

				toast("Workspaces updated");
			} catch (error) {
				console.error("Error updating workspaces:", error);
				toast("Failed to update workspaces");
				// Refresh to restore the correct state
				setRefreshKey((prev) => prev + 1);
			}
		},
		[],
	);

	const handleWorkspaceDeleted = useCallback(() => {
		setRefreshKey((prev) => prev + 1);
	}, []);

	const handleWorkspaceCreated = useCallback(() => {
		setRefreshKey((prev) => prev + 1);
	}, []);

	if (status === "loading") {
		return (
			<DashboardShell className="container mx-auto mt-8">
				<DashboardHeader heading="Workspaces" text="Loading..." />
			</DashboardShell>
		);
	}

	if (!session?.user) {
		return null;
	}

	return (
		<DashboardShell className="container mx-auto mt-8">
			<div className="flex items-center justify-between mb-6">
				<DashboardHeader
					heading="Workspaces"
					text="Organize your projects"
				/>
				<CreateWSButton onWorkspaceCreated={handleWorkspaceCreated} />
			</div>

			<KanbanView
				key={refreshKey}
				onWorkspaceDeleted={handleWorkspaceDeleted}
				onWorkspaceUpdate={handleWorkspaceUpdate}
			/>
		</DashboardShell>
	);
}
