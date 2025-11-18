/* eslint-disable @typescript-eslint/no-explicit-any */
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
} from "@workspace/ui/components/alert-dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { toast } from "sonner";

import { MoreVertical, Loader2, Trash } from "lucide-react"
import WorkspaceImport from "./workspace-import"


import { handleDelete } from "@/server/prisma-workspaces"

async function deleteWorkspace(wsId: number) {
    return await handleDelete(wsId)
}

async function exportWorkspace(wsId: number) {
    // download the workspace as a json file
    const response = await fetch(`/api/workspaces/${wsId}`, {
        method: "GET",
    })

    if (!response.ok) {
        toast("Your workspace was not exported. Please try again.")
        return false
    }

    const workspace = await response.json() as any
    if (!workspace) {
        toast("Failed to export workspace. Please try again.")
        return false
    }

    const workspaceTitle = workspace.name || "workspace"

    // get the blob from the response
    const blob = new Blob([JSON.stringify(workspace)], {
        type: "application/json",
    })
    // create a link element
    const link = document.createElement("a")
    // create a url for the blob
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = `${workspaceTitle}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // revoke the object url
    URL.revokeObjectURL(url)
    toast("Your workspace was exported successfully.")
    return true
}



interface WorkspaceOperationsProps {
    workspace: Pick<Workspace, "id" | "name">
    onWorkspaceDeleted?: () => void;
}

export function WorkspaceOperations({ workspace, onWorkspaceDeleted }: WorkspaceOperationsProps) {
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
                    <DropdownMenuItem onSelect={() => exportWorkspace(workspace.id)}>
                        Export
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => {
                        // Prevent the dropdown from closing when selecting import
                        e.preventDefault();
                    }}>
                        <WorkspaceImport wsId={workspace.id.toString()} />
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

                                const deleted = await deleteWorkspace(workspace.id)

                                if (deleted) {
                                    setIsDeleteLoading(false)
                                    setShowDeleteAlert(false)
                                    if (onWorkspaceDeleted) {
                                        onWorkspaceDeleted()
                                    }
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
