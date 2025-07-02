/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation"

import { authOptions } from "@/server/auth"
import { db } from "@/server/db"
import { getCurrentUser } from "@/server/session"
import { EmptyPlaceholder } from "@/components/advanced/misc/empty-placeholder"
import { DashboardHeader } from "@/components/advanced/misc/dashboard-header"
import { CreateWSButton } from "@/components/advanced/misc/workspace-button"
import { WorkspaceItem } from "@/components/advanced/misc/workspace-item"
import { DashboardShell } from "@/components/advanced/misc/dashboard-shell"

export const metadata = {
    title: "Dashboard",
}

export default async function DashboardPage() {
    const user = await getCurrentUser()

    if (!user) {
        redirect(authOptions?.pages?.signIn || "/signin")
    }

    const workspaces: any = await db.workspace.findMany({
        where: {
            createdById: user.id,
        },
        select: {
            id: true,
            name: true,
            createdAT: true,
        },
        orderBy: {
            updatedAT: "desc",
        },
    })

    return (
        <DashboardShell className="container mx-auto mt-8">
            <DashboardHeader heading="Workspace" text="Click + to create new workspace">
                <CreateWSButton />
            </DashboardHeader>
            <div>
                {workspaces?.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                        {workspaces.map((workspace: any) => (
                            <WorkspaceItem key={workspace.id} workspace={workspace} />
                        ))}
                    </div>
                ) : (
                    <EmptyPlaceholder>
                        <EmptyPlaceholder.Title>No workspace available</EmptyPlaceholder.Title>
                        <EmptyPlaceholder.Description>
                            Create new workspace to get started.
                        </EmptyPlaceholder.Description>
                        <CreateWSButton />
                    </EmptyPlaceholder>
                )}
            </div>
        </DashboardShell>
    )
}
