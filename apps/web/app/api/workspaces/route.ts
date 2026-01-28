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

const reorderWorkspacesSchema = z.object({
	updates: z.array(
		z.object({
			id: z.number(),
			order: z.number(),
			categoryId: z.number().nullable().optional(),
		}),
	),
});

export async function GET() {
	try {
		// Ensure user is authenticated
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return new Response(null, { status: 401 });
		}

		// Get all workspaces for the current user
		const workspaces = await db.workspace.findMany({
			where: {
				createdById: session.user.id,
			},
			select: {
				id: true,
				name: true,
				createdAT: true,
				updatedAT: true,
				categoryId: true,
				order: true,
				category: {
					select: {
						id: true,
						name: true,
						order: true,
					},
				},
			},
			orderBy: [{ order: "asc" }, { updatedAT: "desc" }],
		});

		return new Response(JSON.stringify(workspaces), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (error) {
		console.error("Workspace fetch error:", error);
		return new Response(null, { status: 500 });
	}
}

export async function PATCH(req: NextRequest) {
	try {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return new Response(null, { status: 401 });
		}

		const body = await req.json();
		const { updates } = reorderWorkspacesSchema.parse(body);

		// Update all workspaces in a transaction
		await db.$transaction(
			updates.map(({ id, order, categoryId }) => {
				const data: any = { order };
				if (categoryId !== undefined) {
					data.categoryId = categoryId;
				}
				return db.workspace.updateMany({
					where: {
						id,
						createdById: session.user.id,
					},
					data,
				});
			}),
		);

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify(error.issues), { status: 422 });
		}
		console.error("Workspace reorder error:", error);
		return new Response(null, { status: 500 });
	}
}

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
