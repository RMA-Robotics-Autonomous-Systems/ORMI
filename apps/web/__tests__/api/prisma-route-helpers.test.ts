/**
 * The Prisma helpers behind the workspace, template, category and user routes.
 *
 * What is asserted is the query each helper sends, because that is where an
 * ownership check lives: a list or bulk write that loses its `createdById`
 * scope reads or rewrites another user's rows, and nothing on screen says so.
 * The database is a recorder that answers every delegate call with `result`.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

interface Call {
	model: string;
	method: string;
	args: unknown;
}

let calls: Call[] = [];
let result: unknown = null;

/** A Prisma delegate whose every method records its call. */
function delegate(model: string) {
	return new Proxy(
		{},
		{
			get: (_target, method: string) => async (args: unknown) => {
				calls.push({ model, method, args });
				return result;
			},
		},
	);
}

await mock.module("@/server/db", () => ({
	db: {
		workspace: delegate("workspace"),
		template: delegate("template"),
		category: delegate("category"),
		user: delegate("user"),
		$transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
	},
}));

const workspaces = await import("../../lib/data/prisma-workspaces");
const templates = await import("../../lib/data/prisma-templates");
const categories = await import("../../lib/data/prisma-categories");
const users = await import("../../lib/data/prisma-users");

/** The `where` of every recorded call. */
function wheres() {
	return calls.map((c) => (c.args as { where?: unknown }).where);
}

beforeEach(() => {
	calls = [];
	result = null;
});

describe("prisma-workspaces", () => {
	test("list, single read and reorder are scoped to the owner", async () => {
		await workspaces.listWorkspaces("u1");
		await workspaces.findOwnedWorkspace(7, "u1");
		await workspaces.reorderWorkspaces("u1", [
			{ id: 1, order: 0 },
			{ id: 2, order: 1, categoryId: null },
		]);

		expect(wheres()).toEqual([
			{ createdById: "u1" },
			{ id: 7, createdById: "u1" },
			{ id: 1, createdById: "u1" },
			{ id: 2, createdById: "u1" },
		]);
		expect(calls[2]!.args).toMatchObject({ data: { order: 0 } });
		expect((calls[2]!.args as { data: object }).data).not.toHaveProperty(
			"categoryId",
		);
		expect(calls[3]!.args).toMatchObject({
			data: { order: 1, categoryId: null },
		});
	});

	test("PATCH update writes only the provided fields", async () => {
		await workspaces.updateWorkspaceContent(3, { categoryId: null });
		await workspaces.updateWorkspaceContent(3, {
			content: { a: 1 },
			categoryId: 5,
		});

		expect(calls[0]!.args).toEqual({
			where: { id: 3 },
			data: { category: { disconnect: true } },
			select: { id: true, name: true, categoryId: true },
		});
		expect((calls[1]!.args as { data: unknown }).data).toEqual({
			content: { a: 1 },
			category: { connect: { id: 5 } },
		});
	});

	test("PUT update carries name and dashboardType", async () => {
		await workspaces.updateWorkspace(3, {
			name: "Lab",
			dashboardType: "FLEX",
		});

		expect(calls[0]!.args).toEqual({
			where: { id: 3 },
			data: { name: "Lab", dashboardType: "FLEX" },
			select: {
				id: true,
				name: true,
				categoryId: true,
				dashboardType: true,
			},
		});
	});
});

describe("prisma-templates", () => {
	test("list shows public templates and the user's own", async () => {
		await templates.listVisibleTemplates("u1");

		expect(wheres()).toEqual([
			{ OR: [{ public: true }, { createdById: "u1" }] },
		]);
	});

	test("create stamps the session user as owner", async () => {
		await templates.createTemplate("u1", {
			name: "T",
			type: "WIDGET",
			content: { name: "T" },
		});

		expect(calls[0]!.args).toMatchObject({
			data: { name: "T", type: "WIDGET", createdById: "u1" },
		});
	});
});

describe("prisma-categories", () => {
	test("every read and bulk write is scoped to the owner", async () => {
		await categories.listCategories("u1");
		await categories.findOwnedCategory(4, "u1");
		await categories.reorderCategories("u1", [{ id: 4, order: 2 }]);

		expect(wheres()).toEqual([
			{ createdById: "u1" },
			{ id: 4, createdById: "u1" },
			{ id: 4, createdById: "u1" },
		]);
	});

	test("create appends after the user's last category", async () => {
		result = { order: 4 };
		await categories.createCategory("u1", "Field");

		expect(calls[0]!.args).toMatchObject({
			where: { createdById: "u1" },
			orderBy: { order: "desc" },
		});
		expect(calls[1]!.args).toMatchObject({
			data: { name: "Field", order: 5, createdById: "u1" },
		});
	});

	test("create starts at 0 for a user with no category", async () => {
		await categories.createCategory("u1", "First");

		expect(calls[1]!.args).toMatchObject({ data: { order: 0 } });
	});
});

describe("prisma-users", () => {
	test("rename targets the given user only", async () => {
		await users.updateUserName("u1", "Ada");

		expect(calls).toEqual([
			{
				model: "user",
				method: "update",
				args: { where: { id: "u1" }, data: { name: "Ada" } },
			},
		]);
	});
});
