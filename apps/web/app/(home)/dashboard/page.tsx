"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

import { EmptyPlaceholder } from "@/components/advanced/misc/empty-placeholder"
import { DashboardHeader } from "@/components/advanced/misc/dashboard-header"
import { CreateWSButton } from "@/components/advanced/misc/workspace-button"
import { WorkspaceItem } from "@/components/advanced/misc/workspace-item"
import { DashboardShell } from "@/components/advanced/misc/dashboard-shell"
import { handleLoad, Workspace } from "@/server/prisma-workspaces"

export default function DashboardPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (status === "loading") return // Still loading

        if (!session?.user) {
            router.push("/signin")
            return
        }

        loadWorkspaces()
    }, [session, status, router])

    const loadWorkspaces = async () => {
        setIsLoading(true)
        try {
            const data = await handleLoad()
            setWorkspaces(data)
        } catch (error) {
            console.error("Failed to load workspaces:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleWorkspaceCreated = () => {
        // Refresh workspaces list when a new workspace is created
        loadWorkspaces()
    }

    const handleWorkspaceDeleted = () => {
        // Refresh workspaces list when a workspace is deleted
        loadWorkspaces()
    }

    if (status === "loading" || isLoading) {
        return (
            <DashboardShell className="container mx-auto mt-8">
                <DashboardHeader heading="Workspace" text="Loading...">
                </DashboardHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {[...Array(6)].map((_, i) => (
                        <WorkspaceItem.Skeleton key={i} />
                    ))}
                </div>
            </DashboardShell>
        )
    }

    if (!session?.user) {
        return null // Will redirect to signin
    }

    return (
        <DashboardShell className="container mx-auto mt-8">
            <DashboardHeader heading="Workspace" text="Click + to create new workspace">
                <CreateWSButton onWorkspaceCreated={handleWorkspaceCreated} />
            </DashboardHeader>
            <div>
                {workspaces?.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                        {workspaces.map((workspace: Workspace) => (
                            <WorkspaceItem 
                                key={workspace.id} 
                                workspace={workspace} 
                                onWorkspaceDeleted={handleWorkspaceDeleted}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyPlaceholder>
                        <EmptyPlaceholder.Title>No workspace available</EmptyPlaceholder.Title>
                        <EmptyPlaceholder.Description>
                            Create new workspace to get started.
                        </EmptyPlaceholder.Description>
                        <CreateWSButton onWorkspaceCreated={handleWorkspaceCreated} />
                    </EmptyPlaceholder>
                )}
            </div>
        </DashboardShell>
    )
}
