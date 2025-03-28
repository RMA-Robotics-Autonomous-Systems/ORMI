"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, ButtonProps, buttonVariants } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type CreateWSButtonProps = ButtonProps

export function CreateWSButton({
    className,
    variant,
    ...props
}: CreateWSButtonProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = React.useState<boolean>(false)
    const [open, setOpen] = React.useState<boolean>(false)
    const [workspaceName, setWorkspaceName] = React.useState<string>("")
    const { data: session } = useSession();

    function handleOpenDialog() {
        if (!session?.user?.id) {
            return toast({
                title: "Authentication required",
                description: "You must be signed in to create a workspace.",
                variant: "destructive",
            })
        }
        setOpen(true)
    }

    async function handleCreateWorkspace(e?: React.FormEvent) {
        if (e) e.preventDefault()
        setIsLoading(true)

        try {
            const response = await fetch("/api/workspaces", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: workspaceName,
                    userId: session!.user.id,
                }),
            })

            if (!response.ok) {
                if (response.status === 402) {
                    throw new Error("Please contact ORMI admin")
                }
                throw new Error("Please contact ORMI admin.")
            }

            const workspace = await response.json()
            setOpen(false)
            router.refresh()
            router.push(`/dashboard/ws/${workspace.id}`)
        } catch (error) {
            toast({
                title: "Unable to create workspace",
                description: error instanceof Error ? error.message : "An unknown error occurred",
                variant: "destructive",
            })
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
