import { describe, test, expect, mock, beforeEach } from "bun:test";

import type { ApiResult } from "../../http/client";
import type { DevlogRendered } from "../devlog-api";

// Pattern 9: the wrapper drives everything through the shared httpClient, so
// that module is replaced rather than `fetch`.
const getMock = mock<(url: string) => Promise<ApiResult<DevlogRendered[]>>>(
	async () => ({ ok: true as const, data: [] }),
);

mock.module("../../http/client", () => ({
	httpClient: { get: getMock },
}));

const { devlogApi } = await import("../devlog-api");

describe("devlogApi.getAll", () => {
	beforeEach(() => {
		getMock.mockClear();
		getMock.mockImplementation(async () => ({ ok: true, data: [] }));
	});

	test("requests the full history without a since id", async () => {
		await devlogApi.getAll();
		await devlogApi.getAll("");

		expect(getMock).toHaveBeenCalledTimes(2);
		expect(getMock).toHaveBeenNthCalledWith(1, "/api/devlogs");
		expect(getMock).toHaveBeenNthCalledWith(2, "/api/devlogs");
	});

	test("encodes the since id into the query", async () => {
		await devlogApi.getAll("2026-10-27 release&x");

		expect(getMock).toHaveBeenCalledWith(
			"/api/devlogs?since=2026-10-27%20release%26x",
		);
	});

	test("passes results through as an ApiResult, never throwing", async () => {
		const ok: ApiResult<DevlogRendered[]> = {
			ok: true,
			data: [{ id: "a", html: "<p>a</p>" }],
		};
		getMock.mockImplementation(async () => ok);
		expect(await devlogApi.getAll()).toBe(ok);

		getMock.mockImplementation(async () => ({ ok: false, error: "boom" }));
		const failed = await devlogApi.getAll();
		expect(failed.ok).toBe(false);
	});
});
