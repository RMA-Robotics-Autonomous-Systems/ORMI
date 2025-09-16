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
import { handleCreate } from "@/server/prisma-workspaces"

interface CreateWSButtonProps {
    onWorkspaceCreated?: () => void;
}

export function CreateWSButton({ onWorkspaceCreated }: CreateWSButtonProps = {}) {
    const router = useRouter()
    const [isLoading, setIsLoading] = React.useState<boolean>(false)
    const [open, setOpen] = React.useState<boolean>(false)
    const [workspaceName, setWorkspaceName] = React.useState<string>("")
    const { data: session } = useSession();

    function handleOpenDialog() {
        if (!session?.user?.id) {
            return toast("You must be signed in to create a workspace.")
        }
        setOpen(true)
    }

    async function handleCreateWorkspace(e?: React.FormEvent) {
        if (e) e.preventDefault()
        setIsLoading(true)

        try {
            const workspace = await handleCreate(workspaceName, session!.user.id)

            if (!workspace) {
                throw new Error("Failed to create workspace")
            }

            setOpen(false)
            setWorkspaceName("")
            if (onWorkspaceCreated) {
                onWorkspaceCreated()
            }
            router.push(`/dashboard/ws/${workspace.id}`)
        } catch (error) {
            toast(error instanceof Error ? error.message : "An unknown error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button onClick={handleOpenDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Workspace
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New Workspace</DialogTitle>
                    <DialogDescription>
                        Enter a name for your new workspace.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateWorkspace}>
                    <div className="flex items-center gap-4 mb-3">
                        <Label htmlFor="workspace-name" className="text-right">
                            Name
                        </Label>
                        <Input
                            id="workspace-name"
                            value={workspaceName}
                            placeholder="Workspace Name"
                            onChange={(e) => setWorkspaceName(e.target.value)}
                            className="col-span-3"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Create
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
