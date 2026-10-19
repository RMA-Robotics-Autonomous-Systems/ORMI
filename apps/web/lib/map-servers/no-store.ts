/**
 * `Cache-Control: no-store` on every response of a route handler.
 *
 * Map-server responses carry the owner's own secrets, so no browser or proxy
 * cache may keep one. Wraps the outermost handler (outside `withAuth`), so the
 * 401, every 4xx and the 500 carry it too, and every body is still built by
 * `apiResponse`.
 *
 * @param handler - A route handler.
 * @returns The same handler, its responses marked `no-store`.
 */
export function withNoStore<A extends unknown[]>(
	handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
	return async (...args: A) => {
		const response = await handler(...args);
		response.headers.set("Cache-Control", "no-store");
		return response;
	};
}
