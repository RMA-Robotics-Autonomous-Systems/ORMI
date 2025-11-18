"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2, Plus } from "lucide-react"

import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { DASHBOARD_TYPES } from "@workspace/ormi-core/dashboard"

interface CreateWSButtonProps {
    onWorkspaceCreated?: (workspaceId: number) => void;
}

export function CreateWSButton({ onWorkspaceCreated }: CreateWSButtonProps = {}) {
    const router = useRouter()
    const [isLoading, setIsLoading] = React.useState<boolean>(false)
    const [open, setOpen] = React.useState<boolean>(false)
    const [workspaceName, setWorkspaceName] = React.useState<string>("")
    const { data: session } = useSession();

    const availableTypes = DASHBOARD_TYPES
    const [dashboardType, setDashboardType] = React.useState<string>(availableTypes[0]?.id || "GRID");

    function handleOpenDialog() {
        if (!session?.user?.id) {
            return toast("You must be signed in to create a workspace.")
        }
        setOpen(true)
    }

    function resetForm() {
        setWorkspaceName("")
        setDashboardType(availableTypes[0]?.id || "GRID")
        setIsLoading(false)
    }

    function handleDialogChange(isOpen: boolean) {
        setOpen(isOpen)
        if (!isOpen) {
            resetForm()
        }
    }

    async function handleCreateWorkspace(e?: React.FormEvent) {
        if (e) e.preventDefault()

        if (!workspaceName.trim()) {
            toast("Please enter a workspace name")
            return
        }

        setIsLoading(true)

        try {
            const response = await fetch("/api/workspaces", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: workspaceName.trim(),
                    userId: session!.user.id,
                    dashboardType,
                }),
            })

            const workspace = await response.json() as any

            if (!workspace) {
                throw new Error("Failed to create workspace")
            }

            toast(`Workspace "${workspaceName}" created successfully!`)
            handleDialogChange(false)
            router.refresh()
            router.push(`/dashboard/ws/${workspace.id}`)
            onWorkspaceCreated?.(workspace.id)
        } catch (error) {
            toast(error instanceof Error ? error.message : "An unknown error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
                <Button onClick={handleOpenDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Workspace
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Create New Workspace
                    </DialogTitle>
                    <DialogDescription>
                        Choose a name and dashboard type for your new workspace. You can change these settings later.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateWorkspace} className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="workspace-name">
                                Workspace Name
                            </Label>
                            <Input
                                id="workspace-name"
                                value={workspaceName}
                                placeholder="My Dashboard"
                                onChange={(e) => setWorkspaceName(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-sm font-medium">
                                Dashboard Type
                            </Label>
                            <div className="grid gap-3">
                                {availableTypes.map(type => {
                                    const Icon = type.icon;
                                    return (
                                        <Card
                                            key={type.id}
                                            className={`cursor-pointer transition-all hover:shadow-md ${dashboardType === type.id
                                                ? 'ring-2 ring-primary bg-primary/5'
                                                : 'hover:bg-muted/50'
                                                }`}
                                            onClick={() => setDashboardType(type.id)}
                                        >
                                            <CardHeader className="pb-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-3">
                                                        <Icon className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <CardTitle className="text-base">{type.name}</CardTitle>
                                                        </div>
                                                    </div>
                                                </div>
                                                <CardDescription className="text-sm">
                                                    {type.description}
                                                </CardDescription>
                                            </CardHeader>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDialogChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading || !workspaceName.trim()}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Workspace
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
