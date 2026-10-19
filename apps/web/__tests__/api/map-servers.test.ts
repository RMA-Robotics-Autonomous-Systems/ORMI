/**
 * `/api/map-servers` routes and the `prisma-map-servers` helper behind them.
 *
 * The database is an in-memory fake of the `mapServer` delegate that honours
 * the two properties the routes rely on: a `where` matches only rows that
 * satisfy every field (so `{ id, userId }` is a real ownership check), and
 * `(userId, serverKey)` is unique. Everything above it (Zod, the secret
 * merge, the status mapping, `apiResponse`) is the real code.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/** Session the mocked `getServerSession` answers with. */
let session: unknown = { user: { id: "user-1" } };

await mock.module("next-auth", () => ({
	getServerSession: async () => session,
}));

await mock.module("@/server/auth", () => ({ authOptions: {} }));

interface Row {
	id: string;
	userId: string;
	serverKey: string;
	adapterId: string;
	title: string;
	settings: unknown;
	catalog: unknown;
	catalogFetchedAt: Date | null;
	position: number;
	createdAt: Date;
}

let rows: Row[] = [];
let nextId = 1;

/** Prisma-shaped error with a code. */
function prismaError(code: string): Error {
	return Object.assign(new Error(`prisma ${code}`), { code });
}

function matches(row: Row, where: Record<string, unknown>): boolean {
	return Object.entries(where).every(
		([key, value]) => row[key as keyof Row] === value,
	);
}

function select(row: Row) {
	return {
		id: row.id,
		serverKey: row.serverKey,
		adapterId: row.adapterId,
		title: row.title,
		settings: structuredClone(row.settings),
		catalog: structuredClone(row.catalog),
		catalogFetchedAt: row.catalogFetchedAt,
	};
}

function assertUnique(candidate: Row): void {
	if (
		rows.some(
			(r) =>
				r.id !== candidate.id &&
				r.userId === candidate.userId &&
				r.serverKey === candidate.serverKey,
		)
	) {
		throw prismaError("P2002");
	}
}

/** `Prisma.DbNull` is a sentinel object; the fake stores it as `null`. */
function jsonValue(value: unknown): unknown {
	return value === Prisma.DbNull ? null : value;
}

const mapServer = {
	findMany: mock(async (args: { where: Record<string, unknown> }) =>
		rows
			.filter((r) => matches(r, args.where))
			.sort((a, b) => a.position - b.position)
			.map(select),
	),
	findFirst: mock(async (args: { where: Record<string, unknown> }) => {
		const row = rows.find((r) => matches(r, args.where));
		return row ? select(row) : null;
	}),
	count: mock(
		async (args: { where: Record<string, unknown> }) =>
			rows.filter((r) => matches(r, args.where)).length,
	),
	aggregate: mock(async (args: { where: Record<string, unknown> }) => {
		const positions = rows
			.filter((r) => matches(r, args.where))
			.map((r) => r.position);
		return {
			_max: {
				position: positions.length ? Math.max(...positions) : null,
			},
		};
	}),
	create: mock(async (args: { data: Record<string, unknown> }) => {
		const data = args.data as Partial<Row>;
		const row = {
			...data,
			id: `c${nextId++}`,
			catalog: data.catalog ?? null,
			catalogFetchedAt: data.catalogFetchedAt ?? null,
			createdAt: new Date(),
		} as Row;
		assertUnique(row);
		rows.push(row);
		return select(row);
	}),
	update: mock(
		async (args: {
			where: Record<string, unknown>;
			data: Record<string, unknown>;
		}) => {
			const row = rows.find((r) => matches(r, args.where));
			if (!row) throw prismaError("P2025");
			const data = Object.fromEntries(
				Object.entries(args.data).map(([k, v]) => [k, jsonValue(v)]),
			);
			const next = { ...row, ...data } as Row;
			assertUnique(next);
			Object.assign(row, next);
			return select(row);
		},
	),
	deleteMany: mock(async (args: { where: Record<string, unknown> }) => {
		const before = rows.length;
		rows = rows.filter((r) => !matches(r, args.where));
		return { count: before - rows.length };
	}),
};

await mock.module("@/server/db", () => ({ db: { mapServer } }));

const collection = await import("../../app/api/map-servers/route");
const item = await import("../../app/api/map-servers/[id]/route");
const catalogRoute =
	await import("../../app/api/map-servers/[id]/catalog/route");
const { MAP_SERVER_LIMITS } = await import("@/lib/validations/map-server");

function request(method: string, url: string, body?: unknown): NextRequest {
	return new Request(`http://localhost${url}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	}) as NextRequest;
}

function ctx(id: string) {
	return { params: Promise.resolve({ id }) };
}

async function post(body: unknown): Promise<Response> {
	return collection.POST(
		request("POST", "/api/map-servers", body),
		undefined,
	);
}

async function list(): Promise<Response> {
	return collection.GET(request("GET", "/api/map-servers"), undefined);
}

async function put(id: string, body: unknown): Promise<Response> {
	return item.PUT(request("PUT", `/api/map-servers/${id}`, body), ctx(id));
}

async function del(id: string): Promise<Response> {
	return item.DELETE(request("DELETE", `/api/map-servers/${id}`), ctx(id));
}

async function putCatalog(id: string, body: unknown): Promise<Response> {
	return catalogRoute.PUT(
		request("PUT", `/api/map-servers/${id}/catalog`, body),
		ctx(id),
	);
}

const GEOSERVER = {
	adapterId: "geoserver",
	title: "Lab GeoServer",
	settings: {
		url: "http://LocalHost:8095/geoserver/",
		workspaces: ["spain", "Sweden"],
		auth: { kind: "basic", username: "viewer", password: "s3cret" },
	},
};

const ENTRY = {
	id: "spain:atlas_road_aidedex_v1",
	title: "Atlas road",
	bounds: [-3.71, 40.41, -3.7, 40.42],
	minzoom: 0,
	maxzoom: 30,
	tileSize: 256,
	webMercator: true,
	params: { matrixSet: "EPSG:900913", format: "image/png" },
};

/** Create a server as `user-1` and return its record. */
async function seed(body: unknown = GEOSERVER) {
	const response = await post(body);
	expect(response.status).toBe(201);
	return (await response.json()) as {
		id: string;
		serverKey: string;
		settings: Record<string, unknown> & { auth?: Record<string, unknown> };
		catalog: unknown;
		catalogFetchedAt: string | null;
	};
}

beforeEach(() => {
	session = { user: { id: "user-1" } };
	rows = [];
	nextId = 1;
	for (const fn of Object.values(mapServer)) fn.mockClear();
});

describe("auth", () => {
	test("every handler 401s without a session and never touches the database", async () => {
		session = null;
		const responses = [
			await list(),
			await post(GEOSERVER),
			await put("c1", { title: "x" }),
			await del("c1"),
			await putCatalog("c1", { catalog: [] }),
		];
		for (const response of responses) {
			expect(response.status).toBe(401);
			expect(response.headers.get("cache-control")).toBe("no-store");
			expect(await response.json()).toEqual({ error: "Unauthorized" });
		}
		for (const fn of Object.values(mapServer)) {
			expect(fn).not.toHaveBeenCalled();
		}
	});
});

describe("POST /api/map-servers", () => {
	test("stores the record under the session user with a server-computed key", async () => {
		const record = await seed();

		expect(record.serverKey).toBe(
			"geoserver:http://localhost:8095/geoserver",
		);
		expect(record.catalog).toBeNull();
		expect(record.catalogFetchedAt).toBeNull();
		expect(rows[0]!.userId).toBe("user-1");
		expect(rows[0]!.position).toBe(0);
	});

	test("refuses an owner or key in the body", async () => {
		const response = await post({
			...GEOSERVER,
			userId: "user-2",
			serverKey: "xyz:http://evil",
		});
		expect(response.status).toBe(400);
		expect(rows).toHaveLength(0);
	});

	test("appends: positions follow creation order and the list keeps it", async () => {
		await seed();
		await seed({
			adapterId: "xyz",
			title: "Public overlays",
			settings: { url: "https://tiles.example.org" },
		});

		expect(rows.map((r) => r.position)).toEqual([0, 1]);
		const body = (await (await list()).json()) as { title: string }[];
		expect(body.map((r) => r.title)).toEqual([
			"Lab GeoServer",
			"Public overlays",
		]);
	});

	test("a server already registered is a 409", async () => {
		await seed();
		const response = await post({
			...GEOSERVER,
			settings: { url: "http://localhost:8095/geoserver?service=WMS" },
		});
		expect(response.status).toBe(409);
		expect(rows).toHaveLength(1);
	});

	test("the same server for another user is not a conflict", async () => {
		await seed();
		session = { user: { id: "user-2" } };
		expect((await post(GEOSERVER)).status).toBe(201);
	});

	test("a first snapshot stamps catalogFetchedAt", async () => {
		const record = await seed({ ...GEOSERVER, catalog: [ENTRY] });
		expect(record.catalog).toEqual([ENTRY]);
		expect(typeof record.catalogFetchedAt).toBe("string");
	});

	test.each([
		[
			"userinfo in the URL",
			{ url: "http://admin:geoserver@localhost:8095/geoserver" },
		],
		["a username only", { url: "http://admin@localhost:8095/geoserver" }],
		["a non-http protocol", { url: "ftp://localhost/geoserver" }],
		["not a URL", { url: "localhost:8095" }],
		[
			"an unknown auth kind",
			{ url: "http://h", auth: { kind: "oauth2", token: "t" } },
		],
		[
			"a basic auth without password",
			{ url: "http://h", auth: { kind: "basic", username: "u" } },
		],
		[
			"an extra key on an auth",
			{ url: "http://h", auth: { kind: "bearer", token: "t", extra: 1 } },
		],
		["a nested settings object", { url: "http://h", nested: { a: 1 } }],
		[
			"a credential in the URL query",
			{ url: "https://h/geoserver?authkey=abc" },
		],
		[
			"a credential in a template query",
			{
				url: "https://h",
				layers: [
					{
						title: "L",
						template: "https://h/{z}/{x}/{y}.png?key=abc",
					},
				],
			},
		],
		[
			"a presigned COG URL",
			{
				url: "https://h",
				cogs: [
					{
						title: "C",
						url: "https://b.s3/a.tif?X-Amz-Credential=abc",
					},
				],
			},
		],
		[
			"too many settings keys",
			Object.fromEntries([
				["url", "http://h"],
				...Array.from(
					{ length: MAP_SERVER_LIMITS.settingsKeys },
					(_, i) => [`k${i}`, i],
				),
			]),
		],
		[
			"oversized settings",
			{
				url: "http://h",
				a: "x".repeat(2048),
				b: "x".repeat(2048),
				c: "x".repeat(2048),
				d: "x".repeat(2048),
				e: "x".repeat(2048),
				f: "x".repeat(2048),
				g: "x".repeat(2048),
				h: "x".repeat(2048),
			},
		],
	])("refuses %s with a 400", async (_label, settings) => {
		const response = await post({ ...GEOSERVER, settings });
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: unknown };
		expect(body.error).toBeDefined();
		expect(rows).toHaveLength(0);
	});

	test("accepts a URL whose query carries no credential", async () => {
		const response = await post({
			...GEOSERVER,
			settings: { url: "https://h/cgi-bin/mapserv?map=/srv/a.map" },
		});
		expect(response.status).toBe(201);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	test("refuses a user's server beyond the limit with a 409 naming it", async () => {
		for (let i = 0; i < MAP_SERVER_LIMITS.serversPerUser; i++) {
			rows.push({
				id: `x${i}`,
				userId: "user-1",
				serverKey: `xyz:https://h${i}`,
				adapterId: "xyz",
				title: "t",
				settings: { url: `https://h${i}` },
				catalog: null,
				catalogFetchedAt: null,
				position: i,
				createdAt: new Date(),
			});
		}
		const response = await post(GEOSERVER);
		expect(response.status).toBe(409);
		const body = (await response.json()) as { error: string; code: string };
		expect(body.code).toBe("map-server-limit");
		expect(body.error).toContain(String(MAP_SERVER_LIMITS.serversPerUser));
		expect(mapServer.create).not.toHaveBeenCalled();
		session = { user: { id: "user-2" } };
		expect((await post(GEOSERVER)).status).toBe(201);
	});

	test("refuses a body over the limit with a 413 before parsing", async () => {
		const big = JSON.stringify({
			...GEOSERVER,
			title: "x".repeat(MAP_SERVER_LIMITS.bodyBytes),
		});
		const declared = await collection.POST(
			new Request("http://localhost/api/map-servers", {
				method: "POST",
				headers: { "content-length": String(big.length) },
				body: big,
			}) as NextRequest,
			undefined,
		);
		expect(declared.status).toBe(413);
		const encoder = new TextEncoder();
		const streamed = await collection.POST(
			new Request("http://localhost/api/map-servers", {
				method: "POST",
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(encoder.encode(big));
						controller.close();
					},
				}),
				duplex: "half",
			} as RequestInit) as NextRequest,
			undefined,
		);
		expect(streamed.status).toBe(413);
		expect(streamed.headers.get("cache-control")).toBe("no-store");
		expect(rows).toHaveLength(0);
	});

	test("refuses a malformed JSON body with a 400, not a 500", async () => {
		const response = await collection.POST(
			new Request("http://localhost/api/map-servers", {
				method: "POST",
				body: "{not json",
			}) as NextRequest,
			undefined,
		);
		expect(response.status).toBe(400);
	});

	test("a database failure is a 500 that logs neither message nor settings", async () => {
		mapServer.create.mockImplementationOnce(async () => {
			throw new Error(
				`invocation failed: ${JSON.stringify(GEOSERVER.settings)}`,
			);
		});
		const logged: unknown[][] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => void logged.push(args);
		try {
			const response = await post(GEOSERVER);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				error: "Internal server error",
			});
		} finally {
			console.error = original;
		}
		expect(JSON.stringify(logged)).not.toContain("s3cret");
		expect(logged).toHaveLength(1);
	});
});

describe("ownership", () => {
	test("another user's id answers 404 on PUT, DELETE and catalogue PUT, and changes nothing", async () => {
		const record = await seed();
		const before = structuredClone(rows);
		session = { user: { id: "user-2" } };

		expect((await put(record.id, { title: "Mine now" })).status).toBe(404);
		expect((await del(record.id)).status).toBe(404);
		expect((await putCatalog(record.id, { catalog: [ENTRY] })).status).toBe(
			404,
		);
		expect(rows).toEqual(before);
	});

	test("the list only carries the caller's own records", async () => {
		await seed();
		session = { user: { id: "user-2" } };
		expect(await (await list()).json()).toEqual([]);
	});

	test("every query is scoped by the session user", async () => {
		const record = await seed();
		await put(record.id, { title: "Renamed" });
		await putCatalog(record.id, { catalog: [] });
		await del(record.id);

		const calls = [
			...mapServer.findFirst.mock.calls,
			...mapServer.update.mock.calls,
			...mapServer.deleteMany.mock.calls,
		] as unknown as [{ where: Record<string, unknown> }][];
		expect(calls.length).toBeGreaterThan(0);
		for (const [args] of calls) {
			expect(args.where).toEqual({ id: record.id, userId: "user-1" });
		}
	});
});

describe("PUT /api/map-servers/:id", () => {
	test("an auth of the same kind without its secret keeps the stored secret", async () => {
		const record = await seed();
		const response = await put(record.id, {
			settings: {
				url: GEOSERVER.settings.url,
				auth: { kind: "basic", username: "viewer2" },
			},
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as typeof record;
		expect(body.settings.auth).toEqual({
			kind: "basic",
			username: "viewer2",
			password: "s3cret",
		});
	});

	test("a blank secret means unchanged too", async () => {
		const record = await seed();
		const response = await put(record.id, {
			settings: {
				url: GEOSERVER.settings.url,
				auth: { kind: "basic", username: "viewer", password: "" },
			},
		});
		const body = (await response.json()) as typeof record;
		expect(body.settings.auth?.password).toBe("s3cret");
	});

	test("omitting auth entirely keeps it; kind none removes it", async () => {
		const record = await seed();
		let body = (await (
			await put(record.id, { settings: { url: GEOSERVER.settings.url } })
		).json()) as typeof record;
		expect(body.settings.auth?.password).toBe("s3cret");

		body = (await (
			await put(record.id, {
				settings: {
					url: GEOSERVER.settings.url,
					auth: { kind: "none" },
				},
			})
		).json()) as typeof record;
		expect(body.settings.auth).toEqual({ kind: "none" });
	});

	test("a new secret replaces the stored one", async () => {
		const record = await seed();
		const body = (await (
			await put(record.id, {
				settings: {
					url: GEOSERVER.settings.url,
					auth: {
						kind: "basic",
						username: "viewer",
						password: "n3w",
					},
				},
			})
		).json()) as typeof record;
		expect(body.settings.auth?.password).toBe("n3w");
	});

	test("a changed kind without a secret is a 400 naming the field", async () => {
		const record = await seed();
		const response = await put(record.id, {
			settings: {
				url: GEOSERVER.settings.url,
				auth: { kind: "query-token" },
			},
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: {
				formErrors: [],
				fieldErrors: { "settings.auth.token": ["Required"] },
			},
		});
		expect(
			(rows[0]!.settings as typeof GEOSERVER.settings).auth.password,
		).toBe("s3cret");
	});

	test("a changed address re-keys the record and drops the snapshot", async () => {
		const record = await seed({ ...GEOSERVER, catalog: [ENTRY] });
		const body = (await (
			await put(record.id, {
				settings: {
					url: "http://geo.lab:8080/geoserver",
					auth: {
						kind: "basic",
						username: "viewer",
						password: "n3w",
					},
				},
			})
		).json()) as typeof record;
		expect(body.serverKey).toBe("geoserver:http://geo.lab:8080/geoserver");
		expect(body.catalog).toBeNull();
		expect(body.catalogFetchedAt).toBeNull();
	});

	test.each([
		[
			"resends the auth without its secret",
			{ kind: "basic", username: "viewer" },
		],
		[
			"resends the auth with a blank secret",
			{ kind: "basic", username: "viewer", password: "" },
		],
		["omits the auth", undefined],
	])(
		"a changed address that %s is a 400: the stored secret is not kept",
		async (_label, auth) => {
			const record = await seed();
			const response = await put(record.id, {
				settings: { url: "http://geo.lab:8080/geoserver", auth },
			});
			expect(response.status).toBe(400);
			expect(JSON.stringify(await response.json())).toContain(
				"settings.auth.password",
			);
			expect(rows[0]!.serverKey).toBe(record.serverKey);
			expect((rows[0]!.settings as typeof GEOSERVER.settings).url).toBe(
				GEOSERVER.settings.url,
			);
		},
	);

	test("an address that only differs in spelling keeps the server, and its secret", async () => {
		const record = await seed();
		const response = await put(record.id, {
			settings: {
				url: "http://localhost:8095/geoserver",
				auth: { kind: "basic", username: "viewer" },
			},
		});
		expect(response.status).toBe(200);
		expect(
			(rows[0]!.settings as typeof GEOSERVER.settings).auth.password,
		).toBe("s3cret");
	});

	test("re-keying onto a server already registered is a 409", async () => {
		const first = await seed();
		const second = await seed({
			...GEOSERVER,
			settings: { url: "http://other:8095/geoserver" },
		});
		const response = await put(second.id, {
			settings: { url: "http://localhost:8095/geoserver" },
		});
		expect(response.status).toBe(409);
		expect(first.id).not.toBe(second.id);
	});

	test.each([
		["an empty body", {}],
		["an adapter change", { adapterId: "xyz" }],
		["userinfo", { settings: { url: "https://u:p@h" } }],
		[
			"an unknown auth kind",
			{ settings: { url: "http://h", auth: { kind: "magic" } } },
		],
	])("refuses %s with a 400", async (_label, body) => {
		const record = await seed();
		expect((await put(record.id, body)).status).toBe(400);
	});

	test("a malformed id is a 400", async () => {
		expect((await put("../etc", { title: "x" })).status).toBe(400);
	});
});

describe("DELETE /api/map-servers/:id", () => {
	test("removes the record", async () => {
		const record = await seed();
		const response = await del(record.id);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(rows).toHaveLength(0);
	});

	test("an unknown id is a 404", async () => {
		expect((await del("nope")).status).toBe(404);
	});
});

describe("PUT /api/map-servers/:id/catalog", () => {
	test("stores the snapshot and stamps catalogFetchedAt", async () => {
		const record = await seed();
		const response = await putCatalog(record.id, { catalog: [ENTRY] });
		expect(response.status).toBe(200);
		const body = (await response.json()) as typeof record;
		expect(body.catalog).toEqual([ENTRY]);
		expect(Number.isNaN(Date.parse(body.catalogFetchedAt!))).toBe(false);
	});

	test.each([
		[
			"too many entries",
			Array.from(
				{ length: MAP_SERVER_LIMITS.catalogEntries + 1 },
				(_, i) => ({
					...ENTRY,
					id: `l${i}`,
				}),
			),
		],
		[
			"an oversized title",
			[
				{
					...ENTRY,
					title: "t".repeat(MAP_SERVER_LIMITS.entryTitleLength + 1),
				},
			],
		],
		[
			"too many params",
			[
				{
					...ENTRY,
					params: Object.fromEntries(
						Array.from(
							{ length: MAP_SERVER_LIMITS.paramsKeys + 1 },
							(_, i) => [`p${i}`, "v"],
						),
					),
				},
			],
		],
		[
			"an oversized param value",
			[
				{
					...ENTRY,
					params: {
						style: "s".repeat(
							MAP_SERVER_LIMITS.paramValueLength + 1,
						),
					},
				},
			],
		],
		["a credential-like param", [{ ...ENTRY, params: { authkey: "abc" } }]],
		[
			"a param URL whose query carries a credential",
			[
				{
					...ENTRY,
					params: { template: "https://h/{z}/{x}/{y}.png?token=abc" },
				},
			],
		],
		[
			"markup in the attribution",
			[
				{
					...ENTRY,
					params: { attribution: '<img src=x onerror="a()">' },
				},
			],
		],
		[
			"a catalogue over the byte cap",
			(() => {
				// Just over the catalogue cap, still under the body cap.
				const entries: (typeof ENTRY)[] = [];
				while (
					JSON.stringify(entries).length <=
					MAP_SERVER_LIMITS.catalogBytes
				) {
					entries.push({
						...ENTRY,
						id: `l${entries.length}`,
						title: "t".repeat(500),
					});
				}
				return entries;
			})(),
		],
		["a tile size MapLibre does not draw", [{ ...ENTRY, tileSize: 300 }]],
		["out-of-range bounds", [{ ...ENTRY, bounds: [-200, 0, 0, 0] }]],
		["a bare array body", [ENTRY]],
	])("refuses %s with a 400", async (_label, catalog) => {
		const record = await seed();
		const body =
			Array.isArray(catalog) && catalog[0] === ENTRY
				? catalog
				: { catalog };
		expect((await putCatalog(record.id, body)).status).toBe(400);
		expect(rows[0]!.catalog).toBeNull();
	});
});
