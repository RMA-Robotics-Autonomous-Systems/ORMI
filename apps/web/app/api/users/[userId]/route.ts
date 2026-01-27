/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { NextRequest } from "next/server";

import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { userNameSchema } from "@/lib/validations/user";

const routeContextSchema = z.object({
  params: z.object({
    userId: z.string(),
  }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    // wait for the params to resolve
    const resolvedParams = await params;

    // Validate the route context.
    routeContextSchema.parse({ params });

    // Ensure user is authentication and has access to this user.
    const session = await getServerSession(authOptions);
    if (!session?.user || resolvedParams.userId !== session?.user.id) {
      return new Response(null, { status: 403 });
    }

    // Get the request body and validate it.
    const body = (await req.json()) as any;
    const payload = userNameSchema.parse(body);

    // Update the user.
    await db.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name: payload.name,
      },
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify(error.issues), { status: 422 });
    }

    return new Response(null, { status: 500 });
  }
}
