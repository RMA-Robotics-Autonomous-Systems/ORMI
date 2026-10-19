import type {
	MapLayerEntry,
	MapServerRecord,
} from "@workspace/ormi-core/map-layers/model";

import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";
import type {
	MapServerCreateInput,
	MapServerUpdateInput,
} from "../validations/map-server";

/** Single source of the map-servers endpoint. */
const MAP_SERVERS_URL = "/api/map-servers";

/**
 * URL of one record.
 *
 * @param id - The record id.
 * @returns The record's URL.
 */
function serverUrl(id: string): string {
	return `${MAP_SERVERS_URL}/${encodeURIComponent(id)}`;
}

/**
 * Client-side map-server registry API (Settings > Map servers and the
 * `MapServersProvider`). Every call returns an `ApiResult` and never throws.
 */
export const mapServerApi = {
	/**
	 * Read the signed-in operator's servers, in their stored order.
	 *
	 * @returns The records, or a normalized error.
	 */
	async list(): Promise<ApiResult<MapServerRecord[]>> {
		return httpClient.get<MapServerRecord[]>(MAP_SERVERS_URL);
	},

	/**
	 * Register a server. A server already registered fails with a 409.
	 *
	 * @param input - Adapter, title, settings and an optional first snapshot.
	 * @returns The stored record.
	 */
	async create(
		input: MapServerCreateInput,
	): Promise<ApiResult<MapServerRecord>> {
		return httpClient.post<MapServerRecord>(MAP_SERVERS_URL, input);
	},

	/**
	 * Change a server's title and/or settings. Omit a secret (or send it
	 * blank) to keep the stored one.
	 *
	 * @param id - The record id.
	 * @param patch - The fields to change.
	 * @returns The stored record.
	 */
	async update(
		id: string,
		patch: MapServerUpdateInput,
	): Promise<ApiResult<MapServerRecord>> {
		return httpClient.put<MapServerRecord>(serverUrl(id), patch);
	},

	/**
	 * Remove a server.
	 *
	 * @param id - The record id.
	 * @returns `{ success: true }`.
	 */
	async remove(id: string): Promise<ApiResult<{ success: true }>> {
		return httpClient.delete<{ success: true }>(serverUrl(id));
	},

	/**
	 * Replace a server's catalogue snapshot after a discovery.
	 *
	 * @param id - The record id.
	 * @param catalog - The discovered layers.
	 * @returns The stored record, with `catalogFetchedAt` stamped.
	 */
	async putCatalog(
		id: string,
		catalog: MapLayerEntry[],
	): Promise<ApiResult<MapServerRecord>> {
		return httpClient.put<MapServerRecord>(`${serverUrl(id)}/catalog`, {
			catalog,
		});
	},
};

export type { MapServerCreateInput, MapServerUpdateInput };
