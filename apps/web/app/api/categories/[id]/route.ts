import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { z } from "zod";

const categoryUpdateSchema = z.object({
	name: z.string().min(1).max(50).optional(),
	order: z.number().optional(),
});

// PUT /api/categories/:id - Update category
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const session = await getServerSession(authOptions);
		if (!session?.user?.id) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 },
			);
		}

		const { id } = await params;
		const categoryId = parseInt(id);

		if (isNaN(categoryId)) {
			return NextResponse.json(
				{ error: "Invalid category ID" },
				{ status: 400 },
			);
		}

		const body = await request.json();
		const data = categoryUpdateSchema.parse(body);

		// Check if category belongs to user
		const existingCategory = await db.category.findFirst({
			where: {
				id: categoryId,
				createdById: session.user.id,
			},
		});

		if (!existingCategory) {
			return NextResponse.json(
				{ error: "Category not found" },
				{ status: 404 },
			);
		}

		const category = await db.category.update({
			where: { id: categoryId },
			data,
			include: {
				_count: {
					select: { workspaces: true },
				},
			},
		});

		return NextResponse.json(category);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: "Invalid input", details: error.errors },
				{ status: 400 },
			);
		}

		console.error("Failed to update category:", error);
		return NextResponse.json(
			{ error: "Failed to update category" },
			{ status: 500 },
		);
	}
}

// DELETE /api/categories/:id - Delete category
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const session = await getServerSession(authOptions);
		if (!session?.user?.id) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 },
			);
		}

		const { id } = await params;
		const categoryId = parseInt(id);

		if (isNaN(categoryId)) {
			return NextResponse.json(
				{ error: "Invalid category ID" },
				{ status: 400 },
			);
		}

		// Check if category belongs to user
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
			return NextResponse.json(
				{ error: "Category not found" },
				{ status: 404 },
			);
		}

		// Delete category (workspaces will be set to null via onDelete: SetNull)
		await db.category.delete({
			where: { id: categoryId },
		});

		return NextResponse.json({
			success: true,
			workspacesAffected: existingCategory._count.workspaces,
		});
	} catch (error) {
		console.error("Failed to delete category:", error);
		return NextResponse.json(
			{ error: "Failed to delete category" },
			{ status: 500 },
		);
	}
}
