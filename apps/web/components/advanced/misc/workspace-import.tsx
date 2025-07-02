/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { handleSave } from "@/server/prisma-dashboard"

import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";


interface WorkspaceImportProps {
    wsId: string
}

async function importWorkspace(file: File, wsId: string) {

    // read the file as JSON
    const reader = new FileReader()
    const fileContent = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("Failed to read file"))
        reader.readAsText(file)
    })
    const parsedContent = JSON.parse(fileContent) as any;
    if (!parsedContent) {
        toast("Please select a valid JSON file.")
        return false
    }

    if (await handleSave(parsedContent.content, wsId)) {
        toast("Your workspace was imported successfully.")
        return true
    }

    toast("Failed to import workspace. Please try again.")
    return false
}

export default function WorkspaceImport(props: WorkspaceImportProps) {
    const [open, setOpen] = React.useState(false)
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null)

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!selectedFile) {
            toast("Please select a file to import.")
            return
        }

        const success = await importWorkspace(selectedFile, props.wsId)
        if (success) {
            setOpen(false)
            setSelectedFile(null)
        }
    }

    const handleTriggerClick = (e: React.MouseEvent) => {
        // Stop propagation to prevent DropdownMenuItem from closing the dropdown
        e.stopPropagation()
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger onClick={handleTriggerClick}>
                Import
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={handleImport}>
                    <DialogHeader>
                        <DialogTitle>Import Workspace</DialogTitle>
                        <DialogDescription>
                            Upload a JSON file to import your workspace.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="my-4">
                        <Input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (!file) return

                                if (file.type !== "application/json") {
                                    toast("Please select a JSON file to import.")
                                    return
                                }
                                setSelectedFile(file)
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit">Import</Button>
                        <DialogTrigger asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogTrigger>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}