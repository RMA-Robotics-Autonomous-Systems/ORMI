import { NextRequest } from "next/server";

import { db } from "@/server/db";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import {
	categoryIdSchema,
	categoryUpdateSchema,
	emptyBodySchema,
} from "@/lib/validations/category";

// PUT /api/categories/:id - Update category
export const PUT = withAuth(
	async (
		request: NextRequest,
		session,
		{ params }: { params: Promise<{ id: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = categoryIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const body = await request.json();
			const parsedBody = categoryUpdateSchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const categoryId = parsedParams.data.id;
			const existingCategory = await db.category.findFirst({
				where: {
					id: categoryId,
					createdById: session.user.id,
				},
			});

			if (!existingCategory) {
				return apiResponse({ error: "Category not found" }, 404);
			}

			const category = await db.category.update({
				where: { id: categoryId },
				data: parsedBody.data,
				include: {
					_count: {
						select: { workspaces: true },
					},
				},
			});

			return apiResponse(category);
		} catch (error) {
			console.error("Failed to update category:", error);
			return apiResponse({ error: "Failed to update category" }, 500);
		}
	},
);

// DELETE /api/categories/:id - Delete category
export const DELETE = withAuth(
	async (
		request: NextRequest,
		session,
		{ params }: { params: Promise<{ id: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = categoryIdSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const body = await request.json().catch(() => ({}));
			const parsedBody = emptyBodySchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const categoryId = parsedParams.data.id;
			const existingCategory = await db.category.findFirst({
				where: {
					id: categoryId,
					createdById: session.user.id,
				},
				include: {
					_count: {
						select: { workspaces: true },
					},
				},
			});

			if (!existingCategory) {
				return apiResponse({ error: "Category not found" }, 404);
			}

			await db.category.delete({ where: { id: categoryId } });

			return apiResponse({
				success: true,
				workspacesAffected: existingCategory._count.workspaces,
			});
		} catch (error) {
			console.error("Failed to delete category:", error);
			return apiResponse({ error: "Failed to delete category" }, 500);
		}
	},
);
