import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/server/auth";
import { apiResponse } from "@/lib/api-utils";

type Handler<TContext = unknown> = (
	request: NextRequest,
	session: Session,
	context: TContext,
) => Promise<Response>;

export function withAuth<TContext = unknown>(handler: Handler<TContext>) {
	return async (request: NextRequest, context: TContext) => {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return apiResponse({ error: "Unauthorized" }, 401);
		}

		return handler(request, session, context);
	};
}
