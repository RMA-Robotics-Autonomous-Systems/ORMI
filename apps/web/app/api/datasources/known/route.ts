import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import { getKnownDatasourceConfigs } from "@/lib/data/prisma-datasources";

/**
 * The datasource configurations the signed-in operator already has in their
 * own workspaces.
 *
 * Read-only, no body and no query parameters — so there is nothing to
 * validate and no shape for a caller to widen. The owner is read from the
 * session and is never accepted from the request: these payloads carry
 * datasource endpoints and, for some plugins, credentials.
 */
export const GET = withAuth(async (_req, session) => {
	try {
		const configs = await getKnownDatasourceConfigs(session.user.id);
		return apiResponse(configs);
	} catch (error) {
		console.error("Known datasource configs fetch error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});
