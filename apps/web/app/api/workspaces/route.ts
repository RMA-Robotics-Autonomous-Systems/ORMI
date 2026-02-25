import { NextRequest } from "next/server";

import { db } from "@/server/db";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import {
	createWorkspaceSchema,
	reorderWorkspacesSchema,
} from "@/lib/validations/workspace";

export const GET = withAuth(async (_req, session) => {
	try {
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

		return apiResponse(workspaces);
	} catch (error) {
		console.error("Workspace fetch error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});

export const PATCH = withAuth(async (req: NextRequest, session) => {
	try {
		const body = await req.json();
		const parsedBody = reorderWorkspacesSchema.safeParse(body);
		if (!parsedBody.success) {
			return apiResponse({ error: parsedBody.error.flatten() }, 400);
		}

		const { updates } = parsedBody.data;

		await db.$transaction(
			updates.map(({ id, order, categoryId }) => {
				const data: { order: number; categoryId?: number | null } = {
					order,
				};
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

		return apiResponse({ success: true });
	} catch (error) {
		console.error("Workspace reorder error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});

export const POST = withAuth(async (req: NextRequest, session) => {
	try {
		const body = await req.json();
		const parsedBody = createWorkspaceSchema.safeParse(body);
		if (!parsedBody.success) {
			return apiResponse({ error: parsedBody.error.flatten() }, 400);
		}

		const payload = parsedBody.data;

		if (payload.userId !== session.user.id) {
			return apiResponse({ error: "Forbidden" }, 403);
		}

		const workspace = await db.workspace.create({
			data: {
				name: payload.title,
				createdById: payload.userId,
				createdAT: new Date(),
				updatedAT: new Date(),
				dashboardType: payload.dashboardType || "GRID",
			},
		});

		return apiResponse(workspace);
	} catch (error) {
		console.error("Workspace creation error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});
