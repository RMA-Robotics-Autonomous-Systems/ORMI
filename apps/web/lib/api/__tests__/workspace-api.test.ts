import { describe, test, expect, mock, beforeEach } from "bun:test";

import type { ApiResult } from "../../http/client";
import type { Workspace } from "../workspace-api";

// workspace-api drives all HTTP through httpClient.get; replace that module so
// the test stays Node-safe and we can count/observe every request. Pattern 9:
// mock the shared httpClient, never raw fetch.
const getMock = mock<(url: string) => Promise<ApiResult<Workspace[]>>>(
	async () => ({ ok: true as const, data: [] }),
);

mock.module("../../http/client", () => ({
	httpClient: { get: getMock },
}));

// Each test imports a fresh copy of the module so the module-level
// `preloadPromise` starts as null, isolating consume-once behavior.
async function freshModule() {
	return import(`../workspace-api?${Math.random()}`);
}

const okList = (data: Workspace[]): ApiResult<Workspace[]> => ({
	ok: true,
	data,
});

describe("workspaceApi preload", () => {
	beforeEach(() => {
		getMock.mockClear();
		getMock.mockImplementation(async () => okList([]));
	});

	test("getAll() with no preload calls httpClient.get once and returns its result", async () => {
		const result = okList([{ id: 1, name: "a", createdAT: new Date() }]);
		getMock.mockImplementation(async () => result);

		const { workspaceApi } = await freshModule();
		const got = await workspaceApi.getAll();

		expect(getMock).toHaveBeenCalledTimes(1);
		expect(getMock).toHaveBeenCalledWith("/api/workspaces");
		expect(got).toBe(result);
	});

	test("preloadWorkspaces() then getAll() issues exactly one request and returns the preloaded result", async () => {
		const result = okList([{ id: 2, name: "b", createdAT: new Date() }]);
		getMock.mockImplementation(async () => result);

		const { workspaceApi, preloadWorkspaces } = await freshModule();
		preloadWorkspaces();
		const got = await workspaceApi.getAll();

		expect(getMock).toHaveBeenCalledTimes(1);
		expect(got).toBe(result);
	});

	test("preloadWorkspaces() called twice while pending is idempotent (one request)", async () => {
		const { preloadWorkspaces } = await freshModule();
		preloadWorkspaces();
		preloadWorkspaces();

		expect(getMock).toHaveBeenCalledTimes(1);
	});

	test("consume-once: preload + two getAll() => 2 requests total (1 preload + 1 fresh)", async () => {
		const { workspaceApi, preloadWorkspaces } = await freshModule();
		preloadWorkspaces();
		await workspaceApi.getAll(); // consumes the preload (no new request)
		await workspaceApi.getAll(); // preload gone -> fresh request

		expect(getMock).toHaveBeenCalledTimes(2);
	});

	test("a preloaded {ok:false} is returned once, then the next getAll fetches fresh", async () => {
		const failure: ApiResult<Workspace[]> = {
			ok: false,
			error: "boom",
		};
		const success = okList([{ id: 3, name: "c", createdAT: new Date() }]);
		getMock
			.mockImplementationOnce(async () => failure)
			.mockImplementationOnce(async () => success);

		const { workspaceApi, preloadWorkspaces } = await freshModule();
		preloadWorkspaces();

		const first = await workspaceApi.getAll();
		expect(first.ok).toBe(false);
		expect(getMock).toHaveBeenCalledTimes(1);

		const second = await workspaceApi.getAll();
		expect(second.ok).toBe(true);
		expect(getMock).toHaveBeenCalledTimes(2);
		expect(second).toBe(success);
	});
});
