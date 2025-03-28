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

    const workspaces = await db.workspace.findMany({
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
        <DashboardShell className="container mx-auto pt-10">
            <DashboardHeader heading="Workspace" text="Click + to create new workspace">
                <CreateWSButton />
            </DashboardHeader>
            <div>
                {workspaces?.length ? (
                    <div className="divide-y divide-border rounded-md border">
                        {workspaces.map((workspace) => (
                            <WorkspaceItem key={workspace.id} workspace={workspace} />
                        ))}
                    </div>
                ) : (
                    <EmptyPlaceholder>
                        <EmptyPlaceholder.Title>No workspace available</EmptyPlaceholder.Title>
                        <EmptyPlaceholder.Description>
                            Create new workspace to get started.
                        </EmptyPlaceholder.Description>
                        <CreateWSButton variant="outline" />
                    </EmptyPlaceholder>
                )}
            </div>
        </DashboardShell>
    )
}
