import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DashboardShellProps extends React.HTMLAttributes<HTMLDivElement> { }

export function DashboardShell({
    children,
    className,
    ...props
}: DashboardShellProps) {
    return (
        <div className={cn(" items-start gap-8", className)} {...props}>
            {children}
        </div>
    )
}
