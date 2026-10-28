/**
 * `usePluginFilter` re-applies its filter under the React Compiler.
 *
 * The web app builds with `reactCompiler: true`, which memoises a filter call
 * on its arguments. `manager.applyFilter(HOOK, [])` takes no reactive argument
 * but the manager, so it is cached once per manager: a component that only
 * subscribes with `usePluginFiltersRevision` re-renders on a registration and
 * still hands back the first result. These tests compile the real source with
 * the real compiler and check the memo is keyed on the revision, then check
 * the read itself sees a later registration.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "typescript";

import { PluginsManager } from "../plugins-manager";
import { applyFilterAtRevision } from "../components/plugins-provider";

// Untyped (no `@types/babel__core` in the repo); the root's
// `babel-plugin-react-compiler` devDependency brings it.
const { transformSync } = createRequire(import.meta.url)("@babel/core") as {
	transformSync: (
		code: string,
		options: Record<string, unknown>,
	) => { code?: string | null } | null;
};

/**
 * Compile TypeScript/TSX source the way the app build does: types stripped,
 * JSX kept, then the React Compiler.
 *
 * @param source - Module source.
 * @returns Compiled JavaScript.
 */
function compile(source: string): string {
	const js = ts.transpileModule(source, {
		compilerOptions: {
			jsx: ts.JsxEmit.Preserve,
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
		},
	}).outputText;
	const out = transformSync(js, {
		filename: "module.jsx",
		babelrc: false,
		configFile: false,
		parserOpts: { plugins: ["jsx"] },
		plugins: [["babel-plugin-react-compiler", { panicThreshold: "none" }]],
	});
	return out?.code ?? "";
}

/**
 * The compiled body of the arrow function bound to `name`.
 *
 * @param code - Compiled module.
 * @param name - Binding name.
 * @returns Its source, up to the next top-level declaration.
 */
function compiledBody(code: string, name: string): string {
	const start = code.indexOf(`const ${name} =`);
	expect(start).toBeGreaterThanOrEqual(0);
	const rest = code.slice(start + 1);
	const end = rest.search(/\n(?:const|function|export|\/\*\*) /);
	return end === -1 ? rest : rest.slice(0, end);
}

describe("usePluginFilter under the React Compiler", () => {
	test("the compiler freezes a filter read that only subscribes", () => {
		const code = compile(`
			import { usePluginsManager, usePluginFiltersRevision } from "x";
			const HOOKS = ["h"];
			export const useRead = () => {
				const manager = usePluginsManager();
				usePluginFiltersRevision(HOOKS);
				return manager.applyFilter("h", []);
			};
		`);
		const body = compiledBody(code, "useRead");
		expect(body).toContain("!== manager");
		expect(body).not.toContain("revision");
	});

	test("usePluginFilter keys the filter call on the revision", () => {
		const source = readFileSync(
			join(import.meta.dir, "../components/plugins-provider.tsx"),
			"utf8",
		);
		const body = compiledBody(compile(source), "usePluginFilter");
		expect(body).toContain("applyFilterAtRevision(");
		expect(body).toMatch(/\$\[\d+\] !== revision/);
	});
});

describe("applyFilterAtRevision", () => {
	test("sees a filter registered after the first read", () => {
		const manager = new PluginsManager(new Map());
		const empty = (): string[] => [];

		const before = applyFilterAtRevision(
			manager,
			manager.getFilterRevision("pages"),
			"pages",
			empty,
		);
		manager.addFilter("pages", {
			id: "late",
			priority: 1,
			filter: (pages: string[]) => [...pages, "late"],
		});
		const after = applyFilterAtRevision(
			manager,
			manager.getFilterRevision("pages"),
			"pages",
			empty,
		);

		expect(before).toEqual([]);
		expect(after).toEqual(["late"]);
	});

	test("builds a fresh accumulator on every application", () => {
		const manager = new PluginsManager(new Map());
		manager.addFilter("list", {
			id: "push",
			priority: 1,
			filter: (list: string[]) => {
				list.push("x");
				return list;
			},
		});
		const initial = (): string[] => [];

		applyFilterAtRevision(manager, 0, "list", initial);
		expect(applyFilterAtRevision(manager, 0, "list", initial)).toEqual([
			"x",
		]);
	});
});
