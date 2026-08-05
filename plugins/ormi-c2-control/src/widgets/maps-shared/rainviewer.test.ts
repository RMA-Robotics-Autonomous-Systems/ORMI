import { describe, expect, it } from "bun:test";

import { buildRainviewerTileUrl, parseWeatherMaps } from "./rainviewer";

const SAMPLE = {
	version: "2.0",
	generated: 1609402525,
	host: "https://tilecache.rainviewer.com",
	radar: {
		past: [
			{ time: 1609401600, path: "/v2/radar/1609401600" },
			{ time: 1609402200, path: "/v2/radar/1609402200" },
		],
		nowcast: [{ time: 1609402800, path: "/v2/radar/nowcast_1609402800" }],
	},
};

describe("parseWeatherMaps", () => {
	it("merges past + nowcast in order and records pastCount", () => {
		const parsed = parseWeatherMaps(SAMPLE);
		expect(parsed).not.toBeNull();
		expect(parsed?.host).toBe("https://tilecache.rainviewer.com");
		expect(parsed?.frames.map((f) => f.time)).toEqual([
			1609401600, 1609402200, 1609402800,
		]);
		expect(parsed?.pastCount).toBe(2);
	});

	it("filters out malformed frame entries", () => {
		const parsed = parseWeatherMaps({
			host: "https://h",
			radar: {
				past: [
					{ time: 1, path: "/a" },
					{ time: "bad", path: "/b" },
					{ path: "/c" },
					null,
				],
			},
		});
		expect(parsed?.frames).toEqual([{ time: 1, path: "/a" }]);
	});

	it("returns null when host is missing", () => {
		expect(
			parseWeatherMaps({ radar: { past: [{ time: 1, path: "/a" }] } }),
		).toBeNull();
	});

	it("returns null when there are no frames", () => {
		expect(
			parseWeatherMaps({ host: "https://h", radar: { past: [] } }),
		).toBeNull();
		expect(parseWeatherMaps(null)).toBeNull();
		expect(parseWeatherMaps("nope")).toBeNull();
	});
});

describe("buildRainviewerTileUrl", () => {
	it("applies mission defaults (256 / color 2 / smooth+snow)", () => {
		expect(
			buildRainviewerTileUrl(
				"https://tilecache.rainviewer.com",
				"/v2/radar/1609401600",
			),
		).toBe(
			"https://tilecache.rainviewer.com/v2/radar/1609401600/256/{z}/{x}/{y}/2/1_1.png",
		);
	});

	it("honors explicit size/color/smooth/snow overrides", () => {
		expect(
			buildRainviewerTileUrl("https://h", "/p", {
				size: 512,
				color: 4,
				smooth: 0,
				snow: 0,
			}),
		).toBe("https://h/p/512/{z}/{x}/{y}/4/0_0.png");
	});
});
