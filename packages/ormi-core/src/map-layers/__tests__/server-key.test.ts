import { describe, expect, it } from "bun:test";

import {
	MapServerUrlError,
	hasUserinfo,
	isUnderServerPrefix,
	parseServerUrl,
	serverKey,
	serverUrlPrefix,
} from "../server-key";

describe("serverKey", () => {
	it("prefixes the adapter id to origin + pathname", () => {
		expect(serverKey("geoserver", "http://localhost:8095/geoserver")).toBe(
			"geoserver:http://localhost:8095/geoserver",
		);
	});

	it("lower-cases the host but keeps the path's case", () => {
		expect(
			serverKey("geoserver", "http://GeoServer.Example.ORG/GeoServer"),
		).toBe("geoserver:http://geoserver.example.org/GeoServer");
	});

	it("drops trailing slashes, query, fragment and the default port", () => {
		const expected = "xyz:https://tiles.example.org/maps";
		expect(serverKey("xyz", "https://tiles.example.org:443/maps/")).toBe(
			expected,
		);
		expect(serverKey("xyz", "https://tiles.example.org/maps//?a=1#x")).toBe(
			expected,
		);
		expect(serverKey("xyz", "  https://tiles.example.org/maps  ")).toBe(
			expected,
		);
	});

	it("gives a root URL the bare origin", () => {
		expect(serverKey("titiler", "http://127.0.0.1:8000/")).toBe(
			"titiler:http://127.0.0.1:8000",
		);
		expect(serverKey("titiler", "http://127.0.0.1:8000")).toBe(
			"titiler:http://127.0.0.1:8000",
		);
	});

	it("separates adapters on the same URL", () => {
		expect(serverKey("geoserver", "http://h/x")).not.toBe(
			serverKey("ogc-wms", "http://h/x"),
		);
	});

	it("refuses userinfo instead of stripping it", () => {
		expect(() =>
			serverKey("geoserver", "http://admin:geoserver@h/geoserver"),
		).toThrow(MapServerUrlError);
		expect(() =>
			serverKey("geoserver", "http://admin@h/geoserver"),
		).toThrow(MapServerUrlError);
		try {
			serverKey("geoserver", "http://admin:pw@h/");
		} catch (error) {
			expect((error as MapServerUrlError).problem).toBe("userinfo");
			expect((error as Error).message).not.toContain("pw");
		}
	});

	it("refuses invalid and non-http URLs", () => {
		expect(parseServerUrl("not a url")).toEqual({
			ok: false,
			problem: "invalid",
		});
		expect(parseServerUrl("ftp://h/x")).toEqual({
			ok: false,
			problem: "protocol",
		});
		expect(() => serverKey("xyz", "file:///etc/passwd")).toThrow(
			MapServerUrlError,
		);
	});
});

describe("hasUserinfo", () => {
	it("reports a username or password", () => {
		expect(hasUserinfo("http://u:p@h/")).toBe(true);
		expect(hasUserinfo("http://u@h/")).toBe(true);
		expect(hasUserinfo("http://h/")).toBe(false);
		expect(hasUserinfo("garbage")).toBe(false);
	});
});

describe("serverUrlPrefix / isUnderServerPrefix", () => {
	const prefix = serverUrlPrefix("http://localhost:8095/geoserver/");

	it("matches the server and paths under it", () => {
		expect(prefix).toBe("http://localhost:8095/geoserver");
		expect(
			isUnderServerPrefix("http://localhost:8095/geoserver", prefix),
		).toBe(true);
		expect(
			isUnderServerPrefix(
				"http://localhost:8095/geoserver/gwc/service/wmts/rest/a/EPSG:900913/EPSG:900913:3/1/2?format=image/png",
				prefix,
			),
		).toBe(true);
	});

	it("never matches a sibling path, another port, host or scheme", () => {
		expect(
			isUnderServerPrefix("http://localhost:8095/geoserver2/x", prefix),
		).toBe(false);
		expect(
			isUnderServerPrefix("http://localhost:8096/geoserver/x", prefix),
		).toBe(false);
		expect(
			isUnderServerPrefix("https://localhost:8095/geoserver/x", prefix),
		).toBe(false);
		expect(
			isUnderServerPrefix(
				"https://tile.openstreetmap.org/1/0/0.png",
				prefix,
			),
		).toBe(false);
		expect(isUnderServerPrefix("not a url", prefix)).toBe(false);
	});

	it("covers every path of a root-mounted server", () => {
		const root = serverUrlPrefix("http://127.0.0.1:8000/");
		expect(
			isUnderServerPrefix("http://127.0.0.1:8000/cog/tiles/1/2/3", root),
		).toBe(true);
		expect(isUnderServerPrefix("http://127.0.0.1:8001/cog", root)).toBe(
			false,
		);
	});
});
