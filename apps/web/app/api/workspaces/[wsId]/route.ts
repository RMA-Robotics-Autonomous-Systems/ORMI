/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";

import { authOptions } from "@/server/auth";
import { db } from "@/server/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const resolvedParams = await params;
    const wsId = resolvedParams.wsId;

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const workspaceId = parseInt(wsId);

    const workspace = await db.workspace.findUnique({
      where: {
        id: workspaceId,
        createdById: session.user.id,
      },
      select: { id: true, name: true, content: true, dashboardType: true },
    });

    return new Response(JSON.stringify(workspace), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const resolvedParams = await params;
    const wsId = resolvedParams.wsId;

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Parse request body
    const body = (await req.json()) as any;

    // Validate workspace ID
    const workspaceId = parseInt(wsId);
    if (isNaN(workspaceId)) {
      return new Response(
        JSON.stringify({ error: "Invalid workspace ID format" }),
        {
          status: 400,
        }
      );
    }

    // Check if workspace exists and belongs to user
    const existingWorkspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { createdById: true },
    });

    if (!existingWorkspace) {
      return new Response(JSON.stringify({ error: "Workspace not found" }), {
        status: 404,
      });
    }

    if (existingWorkspace.createdById !== session.user.id) {
      return new Response(
        JSON.stringify({
          error: "You don't have permission to update this workspace",
        }),
        {
          status: 403,
        }
      );
    }

    // Update workspace with dashboard content
    const updatedWorkspace = await db.workspace.update({
      where: { id: workspaceId },
      data: {
        content: body.content,
      },
      select: { id: true, name: true },
    });

    return new Response(JSON.stringify(updatedWorkspace), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error updating workspace content:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const resolvedParams = await params;
    const wsId = resolvedParams.wsId;

    if (!wsId) {
      return new Response(
        JSON.stringify({ error: "Workspace ID is required" }),
        {
          status: 400,
        }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Use the wsId from the URL params
    const workspaceId = parseInt(wsId);

    if (isNaN(workspaceId)) {
      return new Response(
        JSON.stringify({ error: "Invalid workspace ID format" }),
        {
          status: 400,
        }
      );
    }

    console.log(
      `Attempting to delete workspace ${workspaceId} for user ${session.user.id}`
    );

    // Check if the workspace belongs to the user
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { createdById: true },
    });

    if (!workspace) {
      return new Response(JSON.stringify({ error: "Workspace not found" }), {
        status: 404,
      });
    }

    if (workspace.createdById !== session.user.id) {
      return new Response(
        JSON.stringify({
          error: "You don't have permission to delete this workspace",
        }),
        {
          status: 403,
        }
      );
    }

    // Delete the workspace
    await db.workspace.delete({ where: { id: workspaceId } });
    console.log(`Successfully deleted workspace ${workspaceId}`);

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Workspace deletion error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}
