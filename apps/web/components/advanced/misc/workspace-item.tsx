import Link from "next/link"
import Image from "next/image"
import { Workspace } from "@prisma/client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { Card, CardContent, CardFooter, CardHeader } from "@workspace/ui/components/card"
import { WorkspaceOperations } from "@/components/advanced/misc/workspace-operations"

import moment from "moment"

interface WorkspaceItemProps {
    workspace: Pick<Workspace, "id" | "name" | "createdAT">
    onWorkspaceDeleted?: () => void;
}

export function WorkspaceItem({ workspace, onWorkspaceDeleted }: WorkspaceItemProps) {
    // Encode workspace name for use in URL
    const encodedName = encodeURIComponent(workspace.name);
    const avatarUrl = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodedName}`;

    return (
        <Card>
            <CardHeader className="pb-2">
                <Link
                    href={`/dashboard/ws/${workspace.id}`}
                    className="font-semibold hover:underline"
                >
                    <div className="w-full h-32 relative overflow-hidden rounded-t-lg">

                        <Image
                            src={avatarUrl}
                            alt={`${workspace.name} avatar`}
                            fill
                            style={{ objectFit: 'contain' }}
                            sizes="100"
                            priority
                        />
                    </div>

                    {workspace.name}
                </Link>
            </CardHeader>
            <CardContent className="py-1">
                <p className="text-sm text-muted-foreground">
                    {workspace.createdAT ? moment(workspace.createdAT).format('MMMM D, YYYY') : 'No date available'}
                </p>
            </CardContent>
            <CardFooter className="pt-1 flex justify-end">
                <WorkspaceOperations 
                    workspace={{ id: workspace.id, name: workspace.name }} 
                    onWorkspaceDeleted={onWorkspaceDeleted}
                />
            </CardFooter>
        </Card>
    )
}

WorkspaceItem.Skeleton = function WorkspaceItemSkeleton() {
    return (
        <Card>
            <div className="w-full h-32 bg-muted rounded-t-lg" />
            <CardHeader className="pb-2">
                <Skeleton className="h-5 w-2/5" />
            </CardHeader>
            <CardContent className="py-1">
                <Skeleton className="h-4 w-4/5" />
            </CardContent>
        </Card>
    )
}
