/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { toast, Button, Input, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "ormi-components"
import { handleSave } from "@/server/prisma-dashboard"


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
        toast({
            title: "Invalid file",
            description: "Please select a valid JSON file.",
            variant: "destructive",
        })
        return false
    }

    if (await handleSave(parsedContent.content, wsId)) {
        toast({
            title: "Imported",
            description: "Your workspace was imported successfully.",
            variant: "default",
        })
        return true
    }

    toast({
        title: "Error",
        description: "Failed to import workspace. Please try again.",
        variant: "destructive",
    })
    return false
}

export default function WorkspaceImport(props: WorkspaceImportProps) {
    const [open, setOpen] = React.useState(false)
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null)

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!selectedFile) {
            toast({
                title: "No file selected",
                description: "Please select a file to import.",
                variant: "destructive",
            })
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
                                    toast({
                                        title: "Invalid file type",
                                        description: "Please select a JSON file to import.",
                                        variant: "destructive",
                                    })
                                    return
                                }
                                setSelectedFile(file)
                            }}
                            className="file-input file-input-bordered w-full max-w-xs"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">Import</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}