import Link from "next/link"
import { Workspace } from "@prisma/client"

import { formatDate } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkspaceOperations } from "@/components/advanced/misc/workspace-operations"

interface WorkspaceItemProps {
  workspace: Pick<Workspace, "id" | "name" | "createdAT">
}

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/ws/${workspace.id}`}
          className="font-semibold hover:underline"
        >
          {workspace.name}
        </Link>
        <div>
          <p className="text-sm text-muted-foreground">
            {formatDate(workspace.createdAT?.toDateString())}
          </p>
        </div>
      </div>
      <WorkspaceOperations workspace={{ id: workspace.id, name: workspace.name }} />
    </div>
  )
}

WorkspaceItem.Skeleton = function WorkspaceItemSkeleton() {
  return (
    <div className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}
