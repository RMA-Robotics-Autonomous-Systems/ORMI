import { Loader2 } from "lucide-react"
import { cn } from "@/library/lib/utils"
import React from "react"

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: number
}

export function Spinner({ size = 24, className, ...props }: SpinnerProps) {
    return (
        <div className={cn("flex items-center justify-center gap-2 w-full h-full", className)} {...props}>
            <Loader2 className="animate-spin" size={size} />
            <span>Loading...</span>
        </div>
    )
}