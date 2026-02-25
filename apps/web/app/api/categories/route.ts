import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import {
	categoryCreateSchema,
	categoryReorderSchema,
} from "@/lib/validations/category";

// GET /api/categories - List user's categories
export const GET = withAuth(async (_request: NextRequest, session) => {
	try {
		const categories = await db.category.findMany({
			where: { createdById: session.user.id },
			orderBy: { order: "asc" },
			include: {
				_count: {
					select: { workspaces: true },
				},
			},
		});

		return apiResponse(categories);
	} catch (error) {
		console.error("Failed to fetch categories:", error);
		return apiResponse({ error: "Failed to fetch categories" }, 500);
	}
});

// POST /api/categories - Create new category
export const POST = withAuth(async (request: NextRequest, session) => {
	try {
		const body = await request.json();
		const parsedBody = categoryCreateSchema.safeParse(body);
		if (!parsedBody.success) {
			return apiResponse({ error: parsedBody.error.flatten() }, 400);
		}

		const { name } = parsedBody.data;

		const maxOrder = await db.category.findFirst({
			where: { createdById: session.user.id },
			orderBy: { order: "desc" },
			select: { order: true },
		});

		const category = await db.category.create({
			data: {
				name,
				order: (maxOrder?.order ?? -1) + 1,
				createdById: session.user.id,
			},
			include: {
				_count: {
					select: { workspaces: true },
				},
			},
		});

		return apiResponse(category, 201);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("Unique constraint")
		) {
			return apiResponse({ error: "Category name already exists" }, 409);
		}

		console.error("Failed to create category:", error);
		return apiResponse({ error: "Failed to create category" }, 500);
	}
});

// PATCH /api/categories/reorder - Reorder categories
export const PATCH = withAuth(async (request: NextRequest, session) => {
	try {
		const body = await request.json();
		const parsedBody = categoryReorderSchema.safeParse(body);
		if (!parsedBody.success) {
			return apiResponse({ error: parsedBody.error.flatten() }, 400);
		}

		const { updates } = parsedBody.data;

		await db.$transaction(
			updates.map(({ id, order }) =>
				db.category.updateMany({
					where: {
						id,
						createdById: session.user.id,
					},
					data: { order },
				}),
			),
		);

		return apiResponse({ success: true });
	} catch (error) {
		console.error("Failed to reorder categories:", error);
		return apiResponse({ error: "Failed to reorder categories" }, 500);
	}
});
