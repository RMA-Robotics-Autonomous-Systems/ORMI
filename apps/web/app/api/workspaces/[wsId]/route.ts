import { NextRequest } from "next/server";

import {
	deleteWorkspace,
	findOwnedWorkspace,
	findWorkspaceOwner,
	updateWorkspace,
	updateWorkspaceContent,
} from "@/lib/data/prisma-workspaces";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import {
	emptyBodySchema,
	workspaceIdSchema,
	workspacePutSchema,
	workspaceUpdateSchema,
} from "@/lib/validations/workspace";

export const GET = withAuth(
	async (
		_req: NextRequest,
		session,
		{ params }: { params: Promise<{ wsId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = workspaceIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const workspace = await findOwnedWorkspace(
				parsedParams.data.wsId,
				session.user.id,
			);

			return apiResponse(workspace);
		} catch (error) {
			console.error("Error fetching workspace:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);

export const PATCH = withAuth(
	async (
		req: NextRequest,
		session,
		{ params }: { params: Promise<{ wsId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = workspaceIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const body = await req.json();
			const parsedBody = workspaceUpdateSchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const workspaceId = parsedParams.data.wsId;
			const existingWorkspace = await findWorkspaceOwner(workspaceId);

			if (!existingWorkspace) {
				return apiResponse({ error: "Workspace not found" }, 404);
			}

			if (existingWorkspace.createdById !== session.user.id) {
				return apiResponse(
					{
						error: "You don't have permission to update this workspace",
					},
					403,
				);
			}

			const updatedWorkspace = await updateWorkspaceContent(
				workspaceId,
				parsedBody.data,
			);

			return apiResponse(updatedWorkspace);
		} catch (error) {
			console.error("Error updating workspace content:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);

export const PUT = withAuth(
	async (
		req: NextRequest,
		session,
		{ params }: { params: Promise<{ wsId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = workspaceIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const body = await req.json();
			const parsedBody = workspacePutSchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const workspaceId = parsedParams.data.wsId;
			const existingWorkspace = await findWorkspaceOwner(workspaceId);

			if (!existingWorkspace) {
				return apiResponse({ error: "Workspace not found" }, 404);
			}

			if (existingWorkspace.createdById !== session.user.id) {
				return apiResponse(
					{
						error: "You don't have permission to update this workspace",
					},
					403,
				);
			}

			const updatedWorkspace = await updateWorkspace(
				workspaceId,
				parsedBody.data,
			);

			return apiResponse(updatedWorkspace);
		} catch (error) {
			console.error("Error updating workspace:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);

export const DELETE = withAuth(
	async (
		req: NextRequest,
		session,
		{ params }: { params: Promise<{ wsId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = workspaceIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const body = await req.json().catch(() => ({}));
			const parsedBody = emptyBodySchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const workspaceId = parsedParams.data.wsId;
			const workspace = await findWorkspaceOwner(workspaceId);

			if (!workspace) {
				return apiResponse({ error: "Workspace not found" }, 404);
			}

			if (workspace.createdById !== session.user.id) {
				return apiResponse(
					{
						error: "You don't have permission to delete this workspace",
					},
					403,
				);
			}

			await deleteWorkspace(workspaceId);

			return apiResponse(null, 204);
		} catch (error) {
			console.error("Workspace deletion error:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);
