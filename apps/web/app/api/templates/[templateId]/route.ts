import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import {
	emptyBodySchema,
	templateIdSchema,
	templateUpdateSchema,
} from "@/lib/validations/template";

export const DELETE = withAuth(
	async (
		req: NextRequest,
		session,
		{ params }: { params: Promise<{ templateId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = templateIdSchema.safeParse(resolvedParams);
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

			const templateId = parsedParams.data.templateId;
			const template = await db.template.findUnique({
				where: { id: templateId },
				select: { createdById: true },
			});

			if (!template) {
				return apiResponse({ error: "Template not found" }, 404);
			}

			if (template.createdById !== session.user.id) {
				return apiResponse(
					{
						error: "You don't have permission to delete this template",
					},
					403,
				);
			}

			await db.template.delete({ where: { id: templateId } });

			return apiResponse(null, 204);
		} catch (error) {
			console.error("Template deletion error:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);

export const PUT = withAuth(
	async (
		req: NextRequest,
		session,
		{ params }: { params: Promise<{ templateId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = templateIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const body = await req.json();
			const parsedBody = templateUpdateSchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const templateId = parsedParams.data.templateId;
			const existingTemplate = await db.template.findUnique({
				where: { id: templateId },
				select: { createdById: true, type: true },
			});

			if (!existingTemplate) {
				return apiResponse({ error: "Template not found" }, 404);
			}

			if (existingTemplate.createdById !== session.user.id) {
				return apiResponse(
					{
						error: "You don't have permission to update this template",
					},
					403,
				);
			}

			const updateData = parsedBody.data;
			const templateType = (updateData.type ?? existingTemplate.type)
				.toString()
				.toLowerCase();

			if (templateType === "widget" && updateData.widget === undefined) {
				return apiResponse(
					{
						error: "Missing widget data for widget template update",
					},
					400,
				);
			}

			if (
				templateType === "datasource" &&
				updateData.datasource === undefined
			) {
				return apiResponse(
					{
						error: "Missing datasource data for datasource template update",
					},
					400,
				);
			}

			const contentData: Prisma.InputJsonValue = {
				...updateData,
				yours: true,
				type: templateType,
				...(templateType === "widget" && updateData.widget
					? { widget: updateData.widget }
					: {}),
				...(templateType === "datasource" && updateData.datasource
					? { datasource: updateData.datasource }
					: {}),
			} as Prisma.InputJsonValue;

			const updatedTemplate = await db.template.update({
				where: { id: templateId },
				data: {
					name: updateData.name,
					public: updateData.public,
					tags: updateData.tags,
					type: templateType.toUpperCase() as "WIDGET" | "DATASOURCE",
					content: contentData,
					updatedAT: new Date(),
				},
			});

			return apiResponse(updatedTemplate);
		} catch (error) {
			console.error("Template update error:", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);
