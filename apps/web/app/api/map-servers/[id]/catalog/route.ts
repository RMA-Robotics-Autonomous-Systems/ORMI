import type { NextRequest } from "next/server";
import type { MapLayerEntry } from "@workspace/ormi-core/map-layers/model";

import { apiResponse, readJsonBody } from "@/lib/api-utils";
import { withNoStore } from "@/lib/map-servers/no-store";
import { withAuth } from "@/lib/with-auth";
import {
	logMapServerError,
	updateMapServerCatalog,
} from "@/lib/data/prisma-map-servers";
import {
	MAP_SERVER_LIMITS,
	mapServerCatalogPutSchema,
	mapServerIdSchema,
} from "@/lib/validations/map-server";

/** Dynamic segment of this route. */
type Context = { params: Promise<{ id: string }> };

/**
 * `PUT /api/map-servers/:id/catalog`: replace a server's catalogue snapshot
 * (size-capped) and stamp `catalogFetchedAt`. Discovery itself runs in the
 * browser; the server never fetches a registered URL. Another user's id is
 * a 404.
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
			const parsed = mapServerCatalogPutSchema.safeParse(read.body);
			if (!parsed.success) {
				return apiResponse({ error: parsed.error.flatten() }, 400);
			}

			const server = await updateMapServerCatalog(
				parsedParams.data.id,
				session.user.id,
				parsed.data.catalog as MapLayerEntry[],
			);
			if (!server) {
				return apiResponse({ error: "Map server not found" }, 404);
			}
			return apiResponse(server);
		} catch (error) {
			logMapServerError("Map server catalogue error", error);
			return apiResponse({ error: "Internal server error" }, 500);
		}
	}),
);
