import { NextRequest } from "next/server";

import { db } from "@/server/db";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import { userIdParamSchema, userNameSchema } from "@/lib/validations/user";

export const PATCH = withAuth(
	async (
		req: NextRequest,
		session,
		{ params }: { params: Promise<{ userId: string }> },
	) => {
		try {
			const resolvedParams = await params;
			const parsedParams = userIdParamSchema.safeParse(resolvedParams);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			if (parsedParams.data.userId !== session.user.id) {
				return apiResponse({ error: "Forbidden" }, 403);
			}

			const body = await req.json();
			const parsedBody = userNameSchema.safeParse(body);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			await db.user.update({
				where: {
					id: session.user.id,
				},
				data: {
					name: parsedBody.data.name,
				},
			});

			return apiResponse(null, 200);
		} catch (error) {
			return apiResponse({ error: "Internal server error" }, 500);
		}
	},
);
