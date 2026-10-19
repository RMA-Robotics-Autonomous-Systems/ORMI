import { describe, expect, it } from "bun:test";
import { createAjv } from "@jsonforms/core";

import {
	MAP_SERVER_AUTH_FIELDS,
	MAP_SERVER_SECRET_FIELDS,
	MAP_SERVER_SECRET_PATHS,
	applyQueryParams,
	authForUrl,
	createAuthedFetch,
	mapServerAuthProperty,
	mergeMapServerAuthSecrets,
	redactMapServerAuth,
	resolveMapServerAuth,
	type MapServerAuthCapability,
} from "../auth";

const ALL: MapServerAuthCapability = {
	kinds: ["none", "basic", "bearer", "query-token", "header"],
	queryParam: "authkey",
};

describe("resolveMapServerAuth", () => {
	it("sends nothing for no auth and for none (the default)", () => {
		expect(resolveMapServerAuth(undefined, ALL)).toEqual({});
		expect(resolveMapServerAuth({ kind: "none" }, ALL)).toEqual({});
	});

	it("basic becomes an Authorization header, UTF-8 safe", () => {
		expect(
			resolveMapServerAuth(
				{ kind: "basic", username: "reader", password: "s3cret" },
				ALL,
			),
		).toEqual({
			headers: { Authorization: `Basic ${btoa("reader:s3cret")}` },
		});
		const utf8 = resolveMapServerAuth(
			{ kind: "basic", username: "lecteur", password: "été" },
			ALL,
		);
		expect(utf8.headers?.Authorization).toBe(
			`Basic ${Buffer.from("lecteur:été", "utf8").toString("base64")}`,
		);
	});

	it("bearer becomes an Authorization header", () => {
		expect(
			resolveMapServerAuth({ kind: "bearer", token: "abc" }, ALL),
		).toEqual({
			headers: { Authorization: "Bearer abc" },
		});
	});

	it("query-token uses the adapter's queryParam over the stored one", () => {
		expect(
			resolveMapServerAuth(
				{ kind: "query-token", token: "k", param: "other" },
				ALL,
			),
		).toEqual({ query: { authkey: "k" } });
	});

	it("query-token falls back to the stored param when the adapter fixes none", () => {
		const cap: MapServerAuthCapability = {
			kinds: ["none", "query-token", "header"],
		};
		expect(
			resolveMapServerAuth(
				{ kind: "query-token", token: "k", param: "api_key" },
				cap,
			),
		).toEqual({ query: { api_key: "k" } });
		expect(
			resolveMapServerAuth({ kind: "query-token", token: "k" }, cap),
		).toEqual({});
	});

	it("header sends the named header", () => {
		expect(
			resolveMapServerAuth(
				{ kind: "header", name: " X-Api-Key ", value: "v" },
				ALL,
			),
		).toEqual({ headers: { "X-Api-Key": "v" } });
		expect(
			resolveMapServerAuth(
				{ kind: "header", name: " ", value: "v" },
				ALL,
			),
		).toEqual({});
	});

	it("refuses a kind the adapter does not declare", () => {
		const cap: MapServerAuthCapability = { kinds: ["none", "basic"] };
		expect(
			resolveMapServerAuth({ kind: "bearer", token: "abc" }, cap),
		).toEqual({});
		expect(
			resolveMapServerAuth(
				{ kind: "header", name: "X-Key", value: "v" },
				cap,
			),
		).toEqual({});
	});

	it("sends nothing for an empty secret", () => {
		expect(
			resolveMapServerAuth({ kind: "bearer", token: "" }, ALL),
		).toEqual({});
		expect(
			resolveMapServerAuth({ kind: "query-token", token: "" }, ALL),
		).toEqual({});
	});
});

describe("mapServerAuthProperty", () => {
	const ajv = createAjv({ useDefaults: true });

	function validator(cap: MapServerAuthCapability) {
		return ajv.compile({
			type: "object",
			properties: { auth: mapServerAuthProperty(cap) },
		});
	}

	it("offers the declared kinds with none first, and defaults to none", () => {
		const schema = mapServerAuthProperty({
			kinds: ["basic", "none", "basic"],
		}) as {
			oneOf: { properties: { kind: { const: string } } }[];
			default: unknown;
		};
		expect(
			schema.oneOf.map((branch) => branch.properties.kind.const),
		).toEqual(["none", "basic"]);
		expect(schema.default).toEqual({ kind: "none" });
	});

	it("is valid on open and validates each kind exactly once", () => {
		const validate = validator(ALL);
		const data: Record<string, unknown> = {};
		expect(validate(data)).toBe(true);
		expect(data.auth).toEqual({ kind: "none" });
		expect(
			validate({ auth: { kind: "basic", username: "u", password: "p" } }),
		).toBe(true);
		expect(validate({ auth: { kind: "bearer", token: "t" } })).toBe(true);
		expect(validate({ auth: { kind: "query-token", token: "t" } })).toBe(
			true,
		);
		expect(
			validate({ auth: { kind: "header", name: "X", value: "v" } }),
		).toBe(true);
		expect(validate({ auth: { kind: "bearer" } })).toBe(false);
	});

	it("asks for the parameter name only when the adapter fixes none", () => {
		const fixed = validator(ALL);
		const free = validator({ kinds: ["none", "query-token"] });
		expect(fixed({ auth: { kind: "query-token", token: "t" } })).toBe(true);
		expect(free({ auth: { kind: "query-token", token: "t" } })).toBe(false);
		expect(
			free({ auth: { kind: "query-token", token: "t", param: "key" } }),
		).toBe(true);
	});

	it("rejects a kind the adapter does not declare", () => {
		const validate = validator({ kinds: ["none", "basic"] });
		expect(validate({ auth: { kind: "bearer", token: "t" } })).toBe(false);
	});

	it("marks every secret leaf writeOnly, and nothing else", () => {
		const schema = mapServerAuthProperty(ALL) as {
			oneOf: { properties: Record<string, { writeOnly?: boolean }> }[];
		};
		const secret = new Set<string>();
		const plain = new Set<string>();
		for (const branch of schema.oneOf) {
			for (const [name, prop] of Object.entries(branch.properties)) {
				(prop.writeOnly ? secret : plain).add(`auth.${name}`);
			}
		}
		expect([...secret].sort()).toEqual([...MAP_SERVER_SECRET_PATHS].sort());
		for (const path of MAP_SERVER_SECRET_PATHS)
			expect(plain.has(path)).toBe(false);
	});
});

describe("applyQueryParams", () => {
	it("leaves template braces unencoded", () => {
		expect(
			applyQueryParams("http://h/wmts/{z}/{y}/{x}?format=image/png", {
				authkey: "k",
			}),
		).toBe("http://h/wmts/{z}/{y}/{x}?format=image/png&authkey=k");
		expect(
			applyQueryParams("http://h/wms?SERVICE=WMS&BBOX={bbox-epsg-3857}", {
				authkey: "k",
			}),
		).toBe("http://h/wms?SERVICE=WMS&BBOX={bbox-epsg-3857}&authkey=k");
	});

	it("adds a query string when there is none, and keeps the fragment", () => {
		expect(applyQueryParams("http://h/{z}/{x}/{y}.png", { t: "1" })).toBe(
			"http://h/{z}/{x}/{y}.png?t=1",
		);
		expect(applyQueryParams("http://h/{z}?a=1#frag", { t: "1" })).toBe(
			"http://h/{z}?a=1&t=1#frag",
		);
		expect(applyQueryParams("http://h/x?", { t: "1" })).toBe(
			"http://h/x?t=1",
		);
	});

	it("replaces a parameter of the same name and encodes what it adds", () => {
		expect(
			applyQueryParams("http://h/x?access_token=old&b=2", {
				access_token: "a&b=c",
			}),
		).toBe("http://h/x?b=2&access_token=a%26b%3Dc");
	});

	it("returns the url unchanged when there is nothing to add", () => {
		expect(applyQueryParams("http://h/{z}", undefined)).toBe(
			"http://h/{z}",
		);
		expect(applyQueryParams("http://h/{z}", {})).toBe("http://h/{z}");
	});
});

describe("authForUrl", () => {
	const SERVER = "http://h/geoserver";
	const QUERY = { query: { authkey: "k" } };
	const HEADERS = { headers: { Authorization: "Bearer t" } };

	it("returns the auth for the server and for URLs under it", () => {
		expect(authForUrl("http://h/geoserver", SERVER, QUERY)).toBe(QUERY);
		expect(
			authForUrl("http://h/geoserver/ows?service=WMS", SERVER, HEADERS),
		).toBe(HEADERS);
	});

	it("returns nothing for another host, a sibling path or a bad URL", () => {
		for (const url of [
			"https://tile.openstreetmap.org/1/0/0.png",
			"http://h/geoserver2/ows",
			"http://h/",
			"http://evil.example/geoserver/ows",
			"http://h.evil.example/geoserver/ows",
			"not a url",
		]) {
			expect(authForUrl(url, SERVER, QUERY)).toEqual({});
		}
		expect(
			authForUrl("http://h/geoserver/x", "javascript:x", QUERY),
		).toEqual({});
		expect(
			authForUrl("http://h/geoserver/x", "http://u:p@h/geoserver", QUERY),
		).toEqual({});
	});

	it("places tile templates, whose placeholders follow the prefix", () => {
		for (const template of [
			"http://h/geoserver/gwc/{z}/{y}/{x}?format=image/png",
			"http://h/geoserver/wms?SERVICE=WMS&BBOX={bbox-epsg-3857}",
			"http://h/geoserver/{z}/{x}/{y}@2x.png",
		]) {
			expect(authForUrl(template, SERVER, QUERY)).toBe(QUERY);
		}
		expect(
			authForUrl("http://other/{z}/{x}/{y}.png", SERVER, QUERY),
		).toEqual({});
		// A placeholder in the host cannot be placed.
		expect(
			authForUrl("http://{s}.h/geoserver/{z}/{x}/{y}.png", SERVER, QUERY),
		).toEqual({});
	});

	it("matches a server URL typed with a trailing slash or upper-case host", () => {
		expect(
			authForUrl("http://h/geoserver/ows", "http://H/geoserver/", QUERY),
		).toBe(QUERY);
	});
});

describe("createAuthedFetch", () => {
	function recorder() {
		const calls: { url: string; init?: RequestInit }[] = [];
		const fake = (async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return new Response("ok");
		}) as unknown as typeof fetch;
		return { calls, fake };
	}

	it("applies the query and headers and passes the signal", async () => {
		const { calls, fake } = recorder();
		const controller = new AbortController();
		const authed = createAuthedFetch(
			resolveMapServerAuth({ kind: "query-token", token: "k" }, ALL),
			"http://h/geoserver",
			controller.signal,
			fake,
		);
		await authed("http://h/geoserver/ows?service=WMS");
		expect(calls[0]?.url).toBe(
			"http://h/geoserver/ows?service=WMS&authkey=k",
		);
		expect(calls[0]?.init?.signal).toBe(controller.signal);
	});

	it("sends neither query token nor header to another host", async () => {
		const { calls, fake } = recorder();
		const signal = new AbortController().signal;
		const query = createAuthedFetch(
			resolveMapServerAuth({ kind: "query-token", token: "k" }, ALL),
			"http://h/geoserver",
			signal,
			fake,
		);
		const header = createAuthedFetch(
			resolveMapServerAuth({ kind: "bearer", token: "t" }, ALL),
			"http://h/geoserver",
			signal,
			fake,
		);
		await query("https://cdn.example.org/caps.xml");
		await header("https://cdn.example.org/caps.xml");
		await header("http://h/geoserver/ows");
		expect(calls[0]?.url).toBe("https://cdn.example.org/caps.xml");
		expect(calls[0]?.init?.headers).toBeUndefined();
		expect(calls[1]?.init?.headers).toBeUndefined();
		expect(calls[2]?.init?.headers).toEqual({ Authorization: "Bearer t" });
	});
});

describe("MAP_SERVER_AUTH_FIELDS", () => {
	it("derives the secret fields", () => {
		expect([...MAP_SERVER_SECRET_FIELDS].sort()).toEqual([
			"password",
			"token",
			"value",
		]);
	});

	it("lists exactly the fields each schema branch stores", () => {
		const schema = mapServerAuthProperty({ kinds: ALL.kinds }) as {
			oneOf: { properties: Record<string, { const?: string }> }[];
		};
		for (const branch of schema.oneOf) {
			const kind = branch.properties.kind
				?.const as keyof typeof MAP_SERVER_AUTH_FIELDS;
			const fields = Object.keys(branch.properties).filter(
				(name) => name !== "kind",
			);
			expect(fields.sort()).toEqual(
				[...MAP_SERVER_AUTH_FIELDS[kind].fields].sort(),
			);
		}
	});
});

describe("secret handling", () => {
	it("keeps a stored secret an edit omits, for the same kind only", () => {
		expect(
			mergeMapServerAuthSecrets(
				{ kind: "basic", username: "u2", password: "" },
				{ kind: "basic", username: "u", password: "p" },
			),
		).toEqual({ kind: "basic", username: "u2", password: "p" });
		expect(
			mergeMapServerAuthSecrets(
				{ kind: "bearer", token: "new" },
				{ kind: "bearer", token: "old" },
			),
		).toEqual({ kind: "bearer", token: "new" });
		expect(
			mergeMapServerAuthSecrets(
				{ kind: "bearer", token: "" },
				{ kind: "basic", username: "u", password: "p" },
			),
		).toEqual({ kind: "bearer", token: "" });
	});

	it("redacts every secret leaf", () => {
		expect(
			redactMapServerAuth({ kind: "header", name: "X-Key", value: "v" }),
		).toEqual({ kind: "header", name: "X-Key" } as never);
		expect(
			redactMapServerAuth({
				kind: "basic",
				username: "u",
				password: "p",
			}),
		).toEqual({
			kind: "basic",
			username: "u",
		} as never);
	});
});
