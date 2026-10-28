import { NextRequest } from "next/server";

import { resolveDashboardType } from "@workspace/ormi-core/dashboard/types";

import {
	createWorkspace,
	listWorkspaces,
	reorderWorkspaces,
} from "@/lib/data/prisma-workspaces";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import {
	createWorkspaceSchema,
	reorderWorkspacesSchema,
} from "@/lib/validations/workspace";

export const GET = withAuth(async (_req, session) => {
	try {
		const workspaces = await listWorkspaces(session.user.id);

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

		await reorderWorkspaces(session.user.id, updates);

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

		const workspace = await createWorkspace({
			name: payload.title,
			createdById: payload.userId,
			dashboardType: resolveDashboardType(payload.dashboardType),
		});

		return apiResponse(workspace);
	} catch (error) {
		console.error("Workspace creation error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});
