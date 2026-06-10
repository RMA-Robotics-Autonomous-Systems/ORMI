import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";
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

			const workspace = await db.workspace.findUnique({
				where: {
					id: parsedParams.data.wsId,
					createdById: session.user.id,
				},
				select: {
					id: true,
					name: true,
					content: true,
					dashboardType: true,
				},
			});

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
			const existingWorkspace = await db.workspace.findUnique({
				where: { id: workspaceId },
				select: { createdById: true },
			});

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

			const updateData: {
				content?: Prisma.InputJsonValue;
				category?: { connect: { id: number } } | { disconnect: true };
			} = {};
			if (parsedBody.data.content !== undefined) {
				updateData.content = parsedBody.data
					.content as Prisma.InputJsonValue;
			}
			if (parsedBody.data.categoryId !== undefined) {
				updateData.category =
					parsedBody.data.categoryId === null
						? { disconnect: true }
						: { connect: { id: parsedBody.data.categoryId } };
			}

			const updatedWorkspace = await db.workspace.update({
				where: { id: workspaceId },
				data: updateData,
				select: { id: true, name: true, categoryId: true },
			});

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
			const existingWorkspace = await db.workspace.findUnique({
				where: { id: workspaceId },
				select: { createdById: true },
			});

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

			const updateData: {
				name?: string;
				content?: Prisma.InputJsonValue;
				dashboardType?: string;
				category?: { connect: { id: number } } | { disconnect: true };
			} = {};
			if (parsedBody.data.name !== undefined) {
				updateData.name = parsedBody.data.name;
			}
			if (parsedBody.data.content !== undefined) {
				updateData.content = parsedBody.data
					.content as Prisma.InputJsonValue;
			}
			if (parsedBody.data.dashboardType !== undefined) {
				updateData.dashboardType = parsedBody.data.dashboardType;
			}
			if (parsedBody.data.categoryId !== undefined) {
				updateData.category =
					parsedBody.data.categoryId === null
						? { disconnect: true }
						: { connect: { id: parsedBody.data.categoryId } };
			}

			const updatedWorkspace = await db.workspace.update({
				where: { id: workspaceId },
				data: updateData,
				select: {
					id: true,
					name: true,
					categoryId: true,
					dashboardType: true,
				},
			});

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
			const workspace = await db.workspace.findUnique({
				where: { id: workspaceId },
				select: { createdById: true },
			});

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

			await db.workspace.delete({ where: { id: workspaceId } });

			return apiResponse(null, 204);
		} catch (error) {
			console.error("Workspace deletion error:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);
