import { describe, test, expect, mock, beforeEach } from "bun:test";

import type { ApiResult } from "../../http/client";
import type { KnownDatasourceConfig } from "@workspace/ormi-core/datasources/identity";

// Pattern 9: the wrapper drives everything through the shared httpClient, so
// that module is replaced rather than `fetch`. Keeps the test Node-safe and
// lets us assert the exact URL requested.
const getMock = mock<
	(url: string) => Promise<ApiResult<KnownDatasourceConfig[]>>
>(async () => ({ ok: true as const, data: [] }));

mock.module("../../http/client", () => ({
	httpClient: { get: getMock },
}));

const { datasourceApi } = await import("../datasource-api");

/** A configuration as the endpoint returns it. */
const config: KnownDatasourceConfig = {
	key: "foxglove\u0000{}",
	datasource_id: "foxglove",
	settings: { id: "", title: "Rover", enable: true },
	title: "Rover",
	alternateTitles: [],
	workspaceCount: 2,
	workspaceNames: ["Lab", "Field"],
	lastUsedAt: "2026-05-01T00:00:00.000Z",
};

describe("datasourceApi.getKnown", () => {
	beforeEach(() => {
		getMock.mockClear();
		getMock.mockImplementation(async () => ({ ok: true, data: [] }));
	});

	test("requests the known-configurations endpoint once", async () => {
		await datasourceApi.getKnown();

		expect(getMock).toHaveBeenCalledTimes(1);
		expect(getMock).toHaveBeenCalledWith("/api/datasources/known");
	});

	test("passes a successful result straight through", async () => {
		const result: ApiResult<KnownDatasourceConfig[]> = {
			ok: true,
			data: [config],
		};
		getMock.mockImplementation(async () => result);

		const got = await datasourceApi.getKnown();

		expect(got).toBe(result);
		expect(got.ok).toBe(true);
		if (got.ok) expect(got.data[0]!.title).toBe("Rover");
	});

	test("passes a failure through as an ApiResult, never throwing", async () => {
		getMock.mockImplementation(async () => ({
			ok: false,
			error: "Unauthorized",
			details: { status: 401 },
		}));

		const got = await datasourceApi.getKnown();

		expect(got.ok).toBe(false);
		if (!got.ok) expect(got.error).toBe("Unauthorized");
	});
});
