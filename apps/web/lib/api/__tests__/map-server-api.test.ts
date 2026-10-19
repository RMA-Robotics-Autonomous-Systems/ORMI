import { describe, test, expect, mock, beforeEach } from "bun:test";

import type { ApiResult } from "../../http/client";
import type {
	MapLayerEntry,
	MapServerRecord,
} from "@workspace/ormi-core/map-layers/model";

// Pattern 9: the wrapper drives everything through the shared httpClient, so
// that module is replaced rather than `fetch`.
type Call = (url: string, body?: unknown) => Promise<ApiResult<unknown>>;

const ok = async () => ({ ok: true as const, data: undefined });
const getMock = mock<Call>(ok);
const postMock = mock<Call>(ok);
const putMock = mock<Call>(ok);
const deleteMock = mock<Call>(ok);

mock.module("../../http/client", () => ({
	httpClient: {
		get: getMock,
		post: postMock,
		put: putMock,
		delete: deleteMock,
	},
}));

const { mapServerApi } = await import("../map-server-api");

const record: MapServerRecord = {
	id: "ckx1",
	serverKey: "geoserver:http://localhost:8095/geoserver",
	adapterId: "geoserver",
	title: "Lab GeoServer",
	settings: { url: "http://localhost:8095/geoserver" },
	catalog: null,
	catalogFetchedAt: null,
};

const entry: MapLayerEntry = {
	id: "spain:atlas_road_aidedex_v1",
	title: "Atlas road",
	tileSize: 256,
	webMercator: true,
	params: {},
};

beforeEach(() => {
	for (const fn of [getMock, postMock, putMock, deleteMock]) {
		fn.mockClear();
		fn.mockImplementation(ok);
	}
});

describe("mapServerApi", () => {
	test("list reads the collection", async () => {
		const result = { ok: true as const, data: [record] };
		getMock.mockImplementation(async () => result);

		const got = await mapServerApi.list();

		expect(getMock).toHaveBeenCalledWith("/api/map-servers");
		expect(got).toBe(result);
	});

	test("create posts the input to the collection", async () => {
		const input = {
			adapterId: "geoserver",
			title: "Lab GeoServer",
			settings: { url: "http://localhost:8095/geoserver" },
			catalog: [entry],
		};

		await mapServerApi.create(input);

		expect(postMock).toHaveBeenCalledWith("/api/map-servers", input);
	});

	test("update puts the patch to the record, id encoded", async () => {
		await mapServerApi.update("a/b", { title: "Renamed" });

		expect(putMock).toHaveBeenCalledWith("/api/map-servers/a%2Fb", {
			title: "Renamed",
		});
	});

	test("remove deletes the record", async () => {
		await mapServerApi.remove("ckx1");

		expect(deleteMock).toHaveBeenCalledWith("/api/map-servers/ckx1");
	});

	test("putCatalog wraps the snapshot in an envelope", async () => {
		await mapServerApi.putCatalog("ckx1", [entry]);

		expect(putMock).toHaveBeenCalledWith("/api/map-servers/ckx1/catalog", {
			catalog: [entry],
		});
	});

	test("a failure comes back as an ApiResult, never a throw", async () => {
		postMock.mockImplementation(async () => ({
			ok: false,
			error: "Conflict",
			details: { status: 409 },
		}));

		const got = await mapServerApi.create({
			adapterId: "geoserver",
			title: "Lab GeoServer",
			settings: { url: "http://localhost:8095/geoserver" },
		});

		expect(got.ok).toBe(false);
		if (!got.ok) expect(got.details).toEqual({ status: 409 });
	});
});
