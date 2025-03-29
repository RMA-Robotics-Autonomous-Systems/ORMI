"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Workspace } from "@prisma/client"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/hooks/use-toast"
import { MoreVertical, Loader2, Trash } from "lucide-react"


async function deleteWorkspace(wsId: string) {
    try {
        const response = await fetch(`/api/workspaces/${wsId}`, {
            method: "DELETE",
        })

        if (!response?.ok) {
            toast({
                title: "Something went wrong.",
                description: "Your workspace was not deleted. Please try again.",
                variant: "destructive",
            })
            return false
        }

        return true
    } catch (error) {
        console.error("Error deleting workspace:", error)
        toast({
            title: "Error",
            description: "Failed to delete workspace. Please try again.",
            variant: "destructive",
        })
        return false
    }
}

async function exportWorkspace(wsId: string) {
    // download the workspace as a json file
    const response = await fetch(`/api/workspaces/${wsId}`, {
        method: "GET",
    })

    if (!response.ok) {
        toast({
            title: "Something went wrong.",
            description: "Your workspace was not exported. Please try again.",
            variant: "destructive",
        })
        return false
    }

    // get the blob from the response
    const blob = await response.blob()
    // create a link element
    const link = document.createElement("a")
    // create a url for the blob
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = `${wsId}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // revoke the object url
    URL.revokeObjectURL(url)
    toast({
        title: "Exported",
        description: "Your workspace was exported successfully.",
        variant: "default",
    })
    return true
}

interface WorkspaceOperationsProps {
    workspace: Pick<Workspace, "id" | "name">
}

export function WorkspaceOperations({ workspace }: WorkspaceOperationsProps) {
    const router = useRouter()
    const [showDeleteAlert, setShowDeleteAlert] = React.useState<boolean>(false)
    const [isDeleteLoading, setIsDeleteLoading] = React.useState<boolean>(false)

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Open</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                        <Link href={`/dashboard/ws/${workspace.id}`} className="flex w-full">
                            Edit
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => exportWorkspace(workspace.id.toString())}>
                        Export
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                        Import
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="flex cursor-pointer items-center text-destructive focus:text-destructive"
                        onSelect={() => setShowDeleteAlert(true)}
                    >
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Are you sure you want to delete this workspace?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async (event) => {
                                event.preventDefault()
                                setIsDeleteLoading(true)

                                const deleted = await deleteWorkspace(workspace.id.toString())

                                if (deleted) {
                                    setIsDeleteLoading(false)
                                    setShowDeleteAlert(false)
                                    router.refresh()
                                }
                            }}
                            className="bg-red-600 focus:ring-red-600"
                        >
                            {isDeleteLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash className="mr-2 h-4 w-4" />
                            )}
                            <span>Delete</span>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
