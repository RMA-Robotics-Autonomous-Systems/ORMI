import {
	groupKnownDatasources,
	type KnownDatasourceConfig,
} from "@workspace/ormi-core/datasources/identity";

import { db } from "@/server/db";

/**
 * Read every datasource configuration a user has set up across their own
 * workspaces, collapsed into one entry per configuration.
 *
 * Sole Prisma caller for this read. The user id is always the caller's own
 * session id — the endpoint above this never accepts one from the request,
 * because a datasource configuration carries endpoints and credentials.
 *
 * `select` is deliberately narrow: this needs a workspace's identity, its
 * freshness and its content, and nothing else.
 *
 * Grouping is imported from the React-free
 * `@workspace/ormi-core/datasources/identity` subpath rather than the
 * datasources barrel, which would pull client components (and a stylesheet)
 * into the server bundle.
 *
 * @param userId - The owner whose workspaces are read.
 * @returns Configurations, most recently used first.
 */
export async function getKnownDatasourceConfigs(
	userId: string,
): Promise<KnownDatasourceConfig[]> {
	const workspaces = await db.workspace.findMany({
		where: { createdById: userId },
		select: {
			id: true,
			name: true,
			updatedAT: true,
			content: true,
		},
		orderBy: { updatedAT: "desc" },
	});

	return groupKnownDatasources(workspaces);
}
