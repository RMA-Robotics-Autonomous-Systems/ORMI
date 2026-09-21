/**
 * `GET /api/datasources/known`.
 *
 * Three things are asserted, and each of them is a way this endpoint could
 * quietly become a leak or an outage: it is unreachable without a session, it
 * reads only the caller's own workspaces, and one malformed historical
 * `content` blob cannot 500 it forever.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { NextRequest } from "next/server";

/** Session the mocked `getServerSession` answers with. */
let session: unknown = { user: { id: "user-1" } };

await mock.module("next-auth", () => ({
	getServerSession: async () => session,
}));

await mock.module("@/server/auth", () => ({ authOptions: {} }));

/** Rows the mocked Prisma client returns, and the args it was called with. */
let rows: unknown[] = [];
let findManyArgs: unknown = undefined;
let findManyThrows = false;

const findManyMock = mock(async (args: unknown) => {
	findManyArgs = args;
	if (findManyThrows) throw new Error("connection refused");
	return rows;
});

await mock.module("@/server/db", () => ({
	db: { workspace: { findMany: findManyMock } },
}));

const { GET } = await import("../../app/api/datasources/known/route");

/**
 * Invoke the route.
 *
 * @returns The response.
 */
async function call(): Promise<Response> {
	return GET(
		new Request("http://localhost/api/datasources/known") as NextRequest,
		undefined,
	);
}

/**
 * Build a workspace row carrying one datasource.
 *
 * @param content - The row's persisted content.
 * @returns A row as Prisma would return it.
 */
function row(content: unknown) {
	return {
		id: 1,
		name: "Lab",
		updatedAT: new Date("2026-05-01T00:00:00.000Z"),
		content,
	};
}

beforeEach(() => {
	session = { user: { id: "user-1" } };
	rows = [];
	findManyArgs = undefined;
	findManyThrows = false;
	findManyMock.mockClear();
});

describe("GET /api/datasources/known", () => {
	test("401s without a session and never touches the database", async () => {
		session = null;

		const response = await call();

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
		expect(findManyMock).not.toHaveBeenCalled();
	});

	test("reads only the caller's own workspaces, with a narrow select", async () => {
		session = { user: { id: "user-42" } };

		const response = await call();

		expect(response.status).toBe(200);
		expect(findManyArgs).toMatchObject({
			where: { createdById: "user-42" },
			select: {
				id: true,
				name: true,
				updatedAT: true,
				content: true,
			},
		});
	});

	test("returns the grouped configurations", async () => {
		rows = [
			row({
				datasources: {
					d1: {
						datasource_id: "foxglove",
						title: "Rover",
						settings: {
							id: "datasource_1",
							title: "Rover",
							enable: true,
							url: "ws://robot:8765",
						},
					},
				},
			}),
		];

		const response = await call();
		const body = (await response.json()) as Array<{
			title: string;
			datasource_id: string;
			workspaceCount: number;
		}>;

		expect(response.status).toBe(200);
		expect(body).toHaveLength(1);
		expect(body[0]!.title).toBe("Rover");
		expect(body[0]!.datasource_id).toBe("foxglove");
		expect(body[0]!.workspaceCount).toBe(1);
	});

	test("a malformed historical row does not 500 the endpoint", async () => {
		rows = [
			row(null),
			row("not json"),
			row([1, 2, 3]),
			row({ datasources: { d1: { datasource_id: "foxglove" } } }),
		];

		const response = await call();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	test("a database failure is a 500 with no detail leaked", async () => {
		findManyThrows = true;

		const response = await call();

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: "Internal server error",
		});
	});
});
