import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";

/** A devlog entry with its markdown already rendered to HTML by the API. */
export interface DevlogRendered {
	id: string;
	html: string;
}

/**
 * Devlog ("What's new") API client.
 */
export const devlogApi = {
	/**
	 * Get devlog entries, newest first.
	 *
	 * @param since - Id of the newest entry already read; only entries after it
	 * are returned. Omitted or empty returns the full history.
	 */
	async getAll(since?: string): Promise<ApiResult<DevlogRendered[]>> {
		return httpClient.get<DevlogRendered[]>(
			since
				? `/api/devlogs?since=${encodeURIComponent(since)}`
				: "/api/devlogs",
		);
	},
};
