import { describe, expect, it } from "bun:test";

import type { MapServerSettings } from "@workspace/ormi-core/map-layers/model";

import {
	blankSecrets,
	cleanAuth,
	describeConnectionTest,
	describeDiscoveryFailure,
	describeServerUrlProblem,
	changesServerIdentity,
	describeCredentialInUrls,
	SERVER_IDENTITY_CHANGE_MESSAGE,
	formatLayerCount,
	isConflict,
	missingSecretFields,
	resolveMapServerSummary,
	settingsForSave,
	tileAt,
	tileProbeUrl,
} from "../map-server-settings";

const SENTINEL = "s3cr3t-sentinel";

describe("resolveMapServerSummary", () => {
	const settings = {
		url: "http://geo.example/geoserver",
		auth: { kind: "bearer", token: SENTINEL },
		workspace: "spain",
		port: 8095,
		empty: "  ",
		nan: Number.NaN,
	} as unknown as MapServerSettings;

	it("shows only the declared keys, in declaration order", () => {
		expect(
			resolveMapServerSummary(settings, {
				summaryProps: ["workspace", "url"],
			}),
		).toEqual(["spain", "http://geo.example/geoserver"]);
	});

	it("shows nothing when nothing is declared", () => {
		expect(resolveMapServerSummary(settings, {})).toEqual([]);
		expect(resolveMapServerSummary(settings, { summaryProps: [] })).toEqual(
			[],
		);
	});

	it("never renders an object, so a declared auth shows nothing", () => {
		const out = resolveMapServerSummary(settings, {
			summaryProps: ["auth"],
		});
		expect(out).toEqual([]);
		expect(JSON.stringify(out)).not.toContain(SENTINEL);
	});

	it("skips an identity-only .invalid URL", () => {
		expect(
			resolveMapServerSummary(
				{ url: "https://public-overlays.invalid" },
				{ summaryProps: ["url"] },
			),
		).toEqual([]);
	});

	it("skips blank, absent and non-finite values, keeps finite numbers", () => {
		expect(
			resolveMapServerSummary(settings, {
				summaryProps: ["empty", "missing", "nan", "port"],
			}),
		).toEqual(["8095"]);
	});
});

describe("changesServerIdentity", () => {
	const key = "geoserver:http://localhost:8095/geoserver";
	it("is false for the same server spelled differently", () => {
		expect(
			changesServerIdentity(
				"geoserver",
				"http://LocalHost:8095/geoserver/",
				key,
			),
		).toBe(false);
	});
	it("is true for another host, port or path", () => {
		for (const url of [
			"http://geo.lab:8095/geoserver",
			"http://localhost:8096/geoserver",
			"http://localhost:8095/other",
		])
			expect(changesServerIdentity("geoserver", url, key)).toBe(true);
	});
	it("leaves an unparseable URL to the URL check", () => {
		expect(changesServerIdentity("geoserver", "not a url", key)).toBe(
			false,
		);
		expect(changesServerIdentity("geoserver", undefined, key)).toBe(false);
	});
	it("warns in plain words", () => {
		expect(SERVER_IDENTITY_CHANGE_MESSAGE).toBe(
			"Maps using this server's layers show them as missing.",
		);
	});
});

describe("describeCredentialInUrls", () => {
	it("names a credential in any URL setting, never in auth", () => {
		expect(
			describeCredentialInUrls({
				url: "https://h",
				layers: [{ template: "https://h/{z}/{x}/{y}?apikey=1" }],
			} as unknown as MapServerSettings),
		).toBe(
			"URL query carries a credential (apikey). Put it in Authentication.",
		);
		expect(
			describeCredentialInUrls({
				url: "https://h",
				auth: { kind: "bearer", token: "?token=1" },
			} as unknown as MapServerSettings),
		).toBeUndefined();
	});
});

describe("formatLayerCount", () => {
	it("counts layers", () => {
		expect(formatLayerCount(null)).toBe("No layers listed");
		expect(formatLayerCount([])).toBe("0 layers");
		expect(formatLayerCount([1])).toBe("1 layer");
		expect(formatLayerCount([1, 2])).toBe("2 layers");
	});
});

describe("describeServerUrlProblem", () => {
	it("leaves blank and valid URLs alone", () => {
		expect(describeServerUrlProblem("")).toBeUndefined();
		expect(describeServerUrlProblem(undefined)).toBeUndefined();
		expect(
			describeServerUrlProblem("https://geo.example/geoserver"),
		).toBeUndefined();
	});
	it("names each problem", () => {
		expect(describeServerUrlProblem("nope")).toContain("not a valid");
		expect(describeServerUrlProblem("ftp://geo.example")).toContain(
			"http and https",
		);
		expect(
			describeServerUrlProblem("https://user:pw@geo.example"),
		).toContain("Authentication");
	});
});

describe("secrets in the edit form", () => {
	const stored = {
		url: "http://geo.example",
		auth: { kind: "basic", username: "ops", password: SENTINEL },
	} as MapServerSettings;

	it("blankSecrets clears every secret leaf and copies", () => {
		const form = blankSecrets(stored);
		expect(form.auth).toEqual({
			kind: "basic",
			username: "ops",
			password: "",
		});
		expect(JSON.stringify(form)).not.toContain(SENTINEL);
		expect((stored.auth as { password: string }).password).toBe(SENTINEL);
	});

	it("missingSecretFields: blank on add is missing", () => {
		expect(
			missingSecretFields({ kind: "bearer", token: "" }, undefined),
		).toEqual(["Token"]);
		expect(missingSecretFields({ kind: "none" })).toEqual([]);
		expect(missingSecretFields(undefined)).toEqual([]);
	});

	it("missingSecretFields: blank on edit of the same kind keeps the stored one", () => {
		expect(
			missingSecretFields(
				{ kind: "basic", username: "ops", password: "" },
				stored.auth,
			),
		).toEqual([]);
	});

	it("missingSecretFields: a changed kind keeps nothing", () => {
		expect(
			missingSecretFields(
				{ kind: "header", name: "X-Key", value: "" },
				stored.auth,
			),
		).toEqual(["Header value"]);
	});

	it("cleanAuth keeps only the kind's own fields", () => {
		expect(
			cleanAuth({
				kind: "bearer",
				token: "t",
				username: "left over",
			} as never),
		).toEqual({ kind: "bearer", token: "t" });
		expect(cleanAuth(undefined)).toBeUndefined();
	});

	it("settingsForSave cleans auth and copies the rest", () => {
		const input = {
			url: "http://geo.example",
			layers: [{ title: "a" }],
			auth: { kind: "none", token: "stale" },
		} as unknown as MapServerSettings;
		const out = settingsForSave(input);
		expect(out).toEqual({
			url: "http://geo.example",
			layers: [{ title: "a" }],
			auth: { kind: "none" },
		} as unknown as MapServerSettings);
		expect(out).not.toBe(input);
	});
});

describe("describeConnectionTest", () => {
	it("reports layers, Web Mercator and the tile", () => {
		expect(
			describeConnectionTest({
				status: "ok",
				layerCount: 12,
				notWebMercator: 3,
				tile: { status: "ok" },
			}),
		).toEqual({
			tone: "success",
			lines: [
				"Connected. 12 layers found.",
				"3 not available in Web Mercator.",
				"Tile request succeeded.",
			],
		});
	});

	it("warns when no layer is usable or the tile fails", () => {
		expect(
			describeConnectionTest({
				status: "ok",
				layerCount: 0,
				notWebMercator: 0,
				tile: { status: "skipped" },
			}),
		).toEqual({ tone: "warning", lines: ["Connected. No layers found."] });
		expect(
			describeConnectionTest({
				status: "ok",
				layerCount: 2,
				notWebMercator: 2,
				tile: { status: "skipped" },
			}),
		).toEqual({
			tone: "warning",
			lines: [
				"Connected. 2 layers found.",
				"None available in Web Mercator.",
			],
		});
		expect(
			describeConnectionTest({
				status: "ok",
				layerCount: 1,
				notWebMercator: 0,
				tile: { status: "error", reason: "cors" },
			}).lines,
		).toEqual([
			"Connected. 1 layer found.",
			"Tile request: CORS settings do not allow this site.",
		]);
		expect(
			describeConnectionTest({
				status: "ok",
				layerCount: 1,
				notWebMercator: 0,
				tile: { status: "error", reason: "http", httpStatus: 500 },
			}).lines[1],
		).toBe("Tile request failed (HTTP 500).");
	});

	it("names every failure reason in words", () => {
		const reasons = [
			["unreachable", "Server unreachable."],
			[
				"blocked-insecure",
				"Blocked on this HTTPS page unless insecure content is allowed for this site.",
			],
			[
				"cors",
				"The server answered, but its CORS settings do not allow this site.",
			],
			["unauthorized", "Credentials refused."],
			["not-a-server", "No map server at this address."],
		] as const;
		for (const [reason, headline] of reasons) {
			const message = describeConnectionTest({ status: "error", reason });
			expect(message.tone).toBe("error");
			expect(message.lines).toEqual([headline]);
		}
	});

	it("adds the adapter's detail only when it says something new", () => {
		expect(describeDiscoveryFailure("unauthorized", "HTTP 401")).toEqual([
			"Credentials refused.",
			"HTTP 401.",
		]);
		expect(
			describeDiscoveryFailure(
				"blocked-insecure",
				"Blocked on this HTTPS page unless insecure content is allowed for this site",
			),
		).toEqual([
			"Blocked on this HTTPS page unless insecure content is allowed for this site.",
		]);
	});

	it("no line carries an em dash", () => {
		const message = describeConnectionTest({
			status: "ok",
			layerCount: 1,
			notWebMercator: 0,
			tile: { status: "error", reason: "unauthorized", httpStatus: 401 },
		});
		expect(message.lines.join(" ")).not.toContain("—");
	});
});

describe("isConflict", () => {
	it("detects a 409 from ApiResult details", () => {
		expect(isConflict({ status: 409 })).toBe(true);
		expect(isConflict({ status: 400 })).toBe(false);
		expect(isConflict(undefined)).toBe(false);
		expect(isConflict(new Error("x"))).toBe(false);
	});
});

describe("tile probe", () => {
	it("tileAt picks the containing tile", () => {
		expect(tileAt(0, 0, 0)).toEqual({ z: 0, x: 0, y: 0 });
		expect(tileAt(4.35, 50.85, 10)).toEqual({ z: 10, x: 524, y: 343 });
	});

	it("substitutes every placeholder at the bounds centre and min zoom", () => {
		expect(
			tileProbeUrl("https://t.example/{z}/{x}/{y}.png", {
				bounds: [4, 50, 5, 51],
				minzoom: 8,
			}),
		).toBe("https://t.example/8/131/86.png");
		expect(
			tileProbeUrl("https://t.example/{z}/{x}/{y}?q={quadkey}", {}),
		).toBe("https://t.example/0/0/0?q=");
		expect(
			tileProbeUrl("https://w.example/wms?bbox={bbox-epsg-3857}", {}),
		).toBe(
			"https://w.example/wms?bbox=-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244",
		);
	});
});
