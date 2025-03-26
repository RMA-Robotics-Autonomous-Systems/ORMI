"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { ButtonProps, buttonVariants } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { Loader2, Plus } from "lucide-react"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CreateWSButtonProps extends ButtonProps { }

export function CreateWSButton({
    className,
    variant,
    ...props
}: CreateWSButtonProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = React.useState<boolean>(false)

    async function onClick() {
        setIsLoading(true)

        const response = await fetch("/api/workspaces", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: "Untitled Connection",
            }),
        })

        setIsLoading(false)

        if (!response?.ok) {
            if (response.status === 402) {
                return toast({
                    title: "Unable to create workspace",
                    description: "Please contact RAS-APP admin",
                    variant: "destructive",
                })
            }

            return toast({
                title: "Work in progress",
                description: "Please contact RAS-APP admin.",
                variant: "destructive",
            })
        }

        const workspace = await response.json()

        // This forces a cache invalidation.
        router.refresh()

        router.push(`/dashboard/ws/${workspace.id}`)
    }

    return (
        <button
            onClick={onClick}
            className={cn(
                buttonVariants({ variant }),
                {
                    "cursor-not-allowed opacity-60": isLoading,
                },
                className
            )}
            disabled={isLoading}
            {...props}
        >
            {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <Plus className="mr-2 h-4 w-4" />
            )}
            New Workspace
        </button>
    )
}
