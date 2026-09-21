import type { KnownDatasourceConfig } from "@workspace/ormi-core/datasources/identity";

import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";

/** Single source of the known-configurations endpoint. */
const KNOWN_DATASOURCES_URL = "/api/datasources/known";

/**
 * Client-side datasource API.
 */
export const datasourceApi = {
	/**
	 * Read the datasource configurations the signed-in operator already has in
	 * their other workspaces.
	 *
	 * @returns The configurations, or a normalized error.
	 */
	async getKnown(): Promise<ApiResult<KnownDatasourceConfig[]>> {
		return httpClient.get<KnownDatasourceConfig[]>(KNOWN_DATASOURCES_URL);
	},
};

export type { KnownDatasourceConfig };
