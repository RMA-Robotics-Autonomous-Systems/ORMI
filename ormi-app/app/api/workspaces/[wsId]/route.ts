import { getServerSession } from "next-auth/next"
import { z } from "zod"
import { NextRequest } from "next/server"

import { authOptions } from "@/server/auth"
import { db } from "@/server/db"
import { userNameSchema } from "@/lib/validations/user"

const routeContextSchema = z.object({
  params: z.object({
    userId: z.string(),
  }),
})

// export async function PATCH(
//   req: NextRequest,
//   { params }: { params: Promise<{ userId: string }> }
// ) {
//   try {

//     // wait for the params to resolve
//     const resolvedParams = await params;

//     // Validate the route context.
//     routeContextSchema.parse({ params })

//     // Ensure user is authentication and has access to this user.
//     const session = await getServerSession(authOptions)
//     if (!session?.user || resolvedParams.userId !== session?.user.id) {
//       return new Response(null, { status: 403 })
//     }

//     // Get the request body and validate it.
//     const body = await req.json()
//     const payload = userNameSchema.parse(body)

//     // Update the user.
//     await db.user.update({
//       where: {
//         id: session.user.id,
//       },
//       data: {
//         name: payload.name,
//       },
//     })

//     return new Response(null, { status: 200 })
//   } catch (error) {
//     if (error instanceof z.ZodError) {
//       return new Response(JSON.stringify(error.issues), { status: 422 })
//     }

//     return new Response(null, { status: 500 })
//   }
// }

const deleteContextSchema = z.object({
    params: z.object({
      wsId: z.string(),
    }),
  })
  
export async function DELETE(
      req: NextRequest,
      { params }: { params: { wsId: string } }
    ){
    try {
        // We'll directly use the wsId instead of validation
        // to simplify the process
        const wsId = params.wsId;
        
        if (!wsId) {
            return new Response(JSON.stringify({ error: "Workspace ID is required" }), { 
                status: 400 
            })
        }
        
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { 
                status: 401 
            })
        }
        
        // Use the wsId from the URL params
        const workspaceId = parseInt(wsId)
        
        if (isNaN(workspaceId)) {
            return new Response(JSON.stringify({ error: "Invalid workspace ID format" }), { 
                status: 400 
            })
        }
        
        console.log(`Attempting to delete workspace ${workspaceId} for user ${session.user.id}`);
        
        // Check if the workspace belongs to the user
        const workspace = await db.workspace.findUnique({
            where: { id: workspaceId },
            select: { createdById: true },
        })
    
        if (!workspace) {
            return new Response(JSON.stringify({ error: "Workspace not found" }), { 
                status: 404 
            })
        }
        
        if (workspace.createdById !== session.user.id) {
            return new Response(JSON.stringify({ error: "You don't have permission to delete this workspace" }), { 
                status: 403 
            })
        }
    
        // Delete the workspace
        await db.workspace.delete({ where: { id: workspaceId } })
        console.log(`Successfully deleted workspace ${workspaceId}`);
    
        return new Response(null, { status: 204 })
    } catch (error) {
        console.error("Workspace deletion error:", error)
        return new Response(JSON.stringify({ error: "Internal server error" }), { 
            status: 500 
        })
    }
}