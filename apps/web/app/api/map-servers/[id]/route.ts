import type { NextRequest } from "next/server";
import { serverKey } from "@workspace/ormi-core/map-layers/model";

import { apiResponse, readJsonBody } from "@/lib/api-utils";
import { withNoStore } from "@/lib/map-servers/no-store";
import { withAuth } from "@/lib/with-auth";
import {
	deleteMapServer,
	logMapServerError,
	updateMapServer,
} from "@/lib/data/prisma-map-servers";
import {
	MAP_SERVER_LIMITS,
	mapServerDeleteBodySchema,
	mapServerIdSchema,
	mapServerUpdateSchema,
} from "@/lib/validations/map-server";

/** Dynamic segment of this route. */
type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Map server not found" } as const;

/**
 * `PUT /api/map-servers/:id`: change the title and/or settings of one of the
 * operator's servers. A secret omitted from an auth of the same kind keeps
 * the stored one, unless the URL names another server (a changed
 * `serverKey`): then the secret must be sent again. Another user's id is a
 * 404, like an id that does not exist. Every response is `no-store`.
 */
export const PUT = withNoStore(
	withAuth(async (request: NextRequest, session, { params }: Context) => {
		try {
			const parsedParams = mapServerIdSchema.safeParse(await params);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const read = await readJsonBody(
				request,
				MAP_SERVER_LIMITS.bodyBytes,
			);
			if (!read.ok) return read.response;
			const parsed = mapServerUpdateSchema.safeParse(read.body);
			if (!parsed.success) {
				return apiResponse({ error: parsed.error.flatten() }, 400);
			}

			const result = await updateMapServer(
				parsedParams.data.id,
				session.user.id,
				parsed.data,
				serverKey,
			);

			switch (result.status) {
				case "ok":
					return apiResponse(result.server);
				case "not-found":
					return apiResponse(NOT_FOUND, 404);
				case "conflict":
					return apiResponse(
						{ error: "This server is already registered" },
						409,
					);
				case "missing-secret":
					return apiResponse(
						{
							error: {
								formErrors: [],
								fieldErrors: {
									[`settings.${result.field}`]: ["Required"],
								},
							},
						},
						400,
					);
			}
		} catch (error) {
			logMapServerError("Map server update error", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	}),
);

/**
 * `DELETE /api/map-servers/:id`: remove one of the operator's servers.
 * Another user's id is a 404.
 */
export const DELETE = withNoStore(
	withAuth(async (request: NextRequest, session, { params }: Context) => {
		try {
			const parsedParams = mapServerIdSchema.safeParse(await params);
			if (!parsedParams.success) {
				return apiResponse(
					{ error: parsedParams.error.flatten() },
					400,
				);
			}

			const read = await readJsonBody(
				request,
				MAP_SERVER_LIMITS.bodyBytes,
			);
			if (!read.ok) return read.response;
			const parsedBody = mapServerDeleteBodySchema.safeParse(
				read.body ?? {},
			);
			if (!parsedBody.success) {
				return apiResponse({ error: parsedBody.error.flatten() }, 400);
			}

			const removed = await deleteMapServer(
				parsedParams.data.id,
				session.user.id,
			);
			if (!removed) return apiResponse(NOT_FOUND, 404);
			return apiResponse({ success: true });
		} catch (error) {
			logMapServerError("Map server delete error", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	}),
);
