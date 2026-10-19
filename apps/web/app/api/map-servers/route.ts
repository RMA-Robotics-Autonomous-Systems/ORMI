import type { NextRequest } from "next/server";
import { serverKey } from "@workspace/ormi-core/map-layers/model";
import type { MapServerSettings } from "@workspace/ormi-core/map-layers/model";

import { apiResponse, readJsonBody } from "@/lib/api-utils";
import { withNoStore } from "@/lib/map-servers/no-store";
import { withAuth } from "@/lib/with-auth";
import {
	createMapServer,
	listMapServers,
	logMapServerError,
} from "@/lib/data/prisma-map-servers";
import {
	MAP_SERVER_LIMITS,
	mapServerCreateSchema,
} from "@/lib/validations/map-server";

/**
 * `GET /api/map-servers`: the signed-in operator's map servers, in their
 * stored order, secrets included (owner's own read only).
 *
 * The owner is always the session user, never an id from the request.
 */
export const GET = withNoStore(
	withAuth(async (_request, session) => {
		try {
			return apiResponse(await listMapServers(session.user.id));
		} catch (error) {
			logMapServerError("Map servers list error", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	}),
);

/**
 * `POST /api/map-servers`: register a server, appended last. `serverKey` is
 * computed here from the adapter and URL; a server this user already has is
 * a 409, and so is a user already at `MAP_SERVER_LIMITS.serversPerUser`. A
 * body over `MAP_SERVER_LIMITS.bodyBytes` is a 413, refused before parsing.
 * Every response is `Cache-Control: no-store`.
 */
export const POST = withNoStore(
	withAuth(async (request: NextRequest, session) => {
		try {
			const read = await readJsonBody(
				request,
				MAP_SERVER_LIMITS.bodyBytes,
			);
			if (!read.ok) return read.response;
			const parsed = mapServerCreateSchema.safeParse(read.body);
			if (!parsed.success) {
				return apiResponse({ error: parsed.error.flatten() }, 400);
			}

			const { adapterId, title, catalog } = parsed.data;
			const settings = parsed.data.settings as MapServerSettings;
			const result = await createMapServer(session.user.id, {
				serverKey: serverKey(adapterId, settings.url),
				adapterId,
				title,
				settings,
				catalog,
				maxServers: MAP_SERVER_LIMITS.serversPerUser,
			});

			if (result.status === "conflict") {
				return apiResponse(
					{ error: "This server is already registered" },
					409,
				);
			}
			if (result.status === "limit") {
				return apiResponse(
					{
						error: `Map server limit reached (${MAP_SERVER_LIMITS.serversPerUser}). Remove one first.`,
						code: "map-server-limit",
					},
					409,
				);
			}
			if (result.status !== "ok") {
				return apiResponse({ error: "Internal server error" }, 500);
			}
			return apiResponse(result.server, 201);
		} catch (error) {
			logMapServerError("Map server create error", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	}),
);
