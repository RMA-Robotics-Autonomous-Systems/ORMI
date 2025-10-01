/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { NextRequest } from "next/server";

import { authOptions } from "@/server/auth";
import { db } from "@/server/db";

// Create a schema for workspace creation
const createWorkspaceSchema = z.object({
  title: z.string(),
  userId: z.string(),
  dashboardType: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Ensure user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response(null, { status: 401 });
    }

    // Get the request body and validate it
    const body = (await req.json()) as any;
    const payload = createWorkspaceSchema.parse(body);

    // Verify the userId in the request matches the authenticated user
    if (payload.userId !== session.user.id) {
      return new Response(null, { status: 403 });
    }

    // Create the workspace
    const workspace = await db.workspace.create({
      data: {
        name: payload.title,
        createdById: payload.userId,
        createdAT: new Date(),
        updatedAT: new Date(),
        dashboardType: payload.dashboardType || "GRID",
      },
    });

    return new Response(JSON.stringify(workspace), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify(error.issues), { status: 422 });
    }

    console.error("Workspace creation error:", error);
    return new Response(null, { status: 500 });
  }
}
