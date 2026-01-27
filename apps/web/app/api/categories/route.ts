import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1).max(50),
});

const reorderSchema = z.object({
  updates: z.array(
    z.object({
      id: z.number(),
      order: z.number(),
    }),
  ),
});

// GET /api/categories - List user's categories
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categories = await db.category.findMany({
      where: { createdById: session.user.id },
      orderBy: { order: "asc" },
      include: {
        _count: {
          select: { workspaces: true },
        },
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

// POST /api/categories - Create new category
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = categorySchema.parse(body);

    // Get current max order
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

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Category name already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
}

// PATCH /api/categories/reorder - Reorder categories
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Check if this is a reorder request
    if (body.updates && Array.isArray(body.updates)) {
      const { updates } = reorderSchema.parse(body);

      // Update all categories in a transaction
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

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Failed to reorder categories:", error);
    return NextResponse.json(
      { error: "Failed to reorder categories" },
      { status: 500 },
    );
  }
}
