import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

/**
 * Every component in the repo is compiled by the React Compiler.
 *
 * The app builds with `reactCompiler: true` (no options, so the default
 * `infer` compilation mode), and the compiler silently skips a function it
 * cannot compile: no build error, no warning, just a component with no memos.
 * Lint catches almost none of these: try/finally,
 * a throw inside try, a dynamic import and the rest are only visible by
 * compiling. So this runs the real compiler over every `.tsx` and `.ts` source file
 * (the same babel plugin
 * `packages/ormi-plugins/src/plugins/__tests__/plugin-filter-compiled.test.ts`
 * uses, on the TypeScript source directly) and fails on any `CompileError` or `PipelineError` the compiler logs.
 *
 * A bailout is fixed in the source; the one excused file is in
 * `ALLOWED_BAILOUTS`, with the owner's reason.
 */

// Untyped (no `@types/babel__core` in the repo); the root's
// `babel-plugin-react-compiler` devDependency brings it.
const { transformSync } = createRequire(import.meta.url)("@babel/core") as {
	transformSync: (code: string, options: Record<string, unknown>) => unknown;
};

const REPO = new URL("../../../", import.meta.url).pathname;
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "__tests__"]);

/** Source roots, relative to the repo root, mirroring what the app bundles. */
function sourceRoots(): string[] {
	const listed = (dir: string) =>
		readdirSync(join(REPO, dir))
			.sort()
			.map((name) => join(dir, name, "src"));
	return [
		"apps/web/app",
		"apps/web/components",
		"apps/web/hooks",
		"apps/web/lib",
		...listed("packages"),
		...listed("plugins"),
	].filter((dir) => existsSync(join(REPO, dir)));
}

/** Every non-test `.ts`/`.tsx` under `dir` (no `.d.ts`), in a deterministic order. */
function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort(
		(a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
	)) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) out.push(...sourceFiles(path));
		} else if (
			/\.tsx?$/.test(entry.name) &&
			!/\.d\.ts$/.test(entry.name) &&
			!/\.(test|spec)\.tsx?$/.test(entry.name)
		) {
			out.push(path);
		}
	}
	return out;
}

interface Loc {
	start?: { line?: number };
}

interface CompilerEvent {
	kind: string;
	fnLoc?: Loc | null;
	data?: string;
	detail?: {
		reason?: string;
		loc?: Loc | null;
		options?: {
			reason?: string;
			loc?: Loc | null;
			details?: { loc?: Loc }[];
		};
	};
}

/**
 * Compile one file and return a line per bailout.
 *
 * Parsed as TypeScript with the compiler running on the original source, the
 * way Next applies it, so the reported lines are the file's own.
 *
 * @param path - Absolute path to a `.ts` or `.tsx` file.
 * @returns `line N: reason` for each bailout, deduplicated, in source order.
 */
function bailouts(path: string): string[] {
	const found = new Map<string, number>();
	const logEvent = (_file: string | null, event: CompilerEvent) => {
		if (event.kind !== "CompileError" && event.kind !== "PipelineError")
			return;
		const options = event.detail?.options;
		const reason =
			event.detail?.reason ?? options?.reason ?? event.data ?? event.kind;
		const line =
			options?.details?.[0]?.loc?.start?.line ??
			options?.loc?.start?.line ??
			event.detail?.loc?.start?.line ??
			event.fnLoc?.start?.line ??
			0;
		found.set(`line ${line}: ${reason}`, line);
	};
	try {
		transformSync(readFileSync(path, "utf8"), {
			filename: path,
			babelrc: false,
			configFile: false,
			// `.ts` takes no `jsx` plugin: `<T>(x) => x` is a generic there, not a tag.
			parserOpts: {
				plugins: path.endsWith(".tsx")
					? ["typescript", "jsx"]
					: ["typescript"],
			},
			plugins: [
				[
					"babel-plugin-react-compiler",
					{ panicThreshold: "none", logger: { logEvent } },
				],
			],
		});
	} catch (error) {
		found.set(`parse: ${(error as Error).message.split("\n")[0]}`, 0);
	}
	return [...found].sort((a, b) => a[1] - b[1]).map(([text]) => text);
}

/**
 * Files deliberately left uncompiled, each with the owner's reason. An entry
 * that starts compiling fails the test, so the list cannot go stale.
 */
const ALLOWED_BAILOUTS: Record<string, string> = {
	// `widgetDefinitions` is a new array on every shell render (the factories
	// may call hooks, pattern 10), and children call `getDefinition` during
	// that same render, so the ref is written during render. Keying the
	// callback on the array would re-render every tile on every shell render.
	// Decided 2026-10-28: one cold hook, kept uncompiled.
	"packages/ormi-core/src/dashboard/state/use-dashboard-actions.ts":
		"Cannot access refs during render",
};

describe("React Compiler coverage", () => {
	it("compiles every component in the repo without a bailout", () => {
		const files = sourceRoots().flatMap((dir) =>
			sourceFiles(join(REPO, dir)),
		);
		expect(files.length).toBeGreaterThan(100);
		const offenders: string[] = [];
		const allowedSeen = new Set<string>();
		for (const path of files) {
			const rel = relative(REPO, path);
			for (const b of bailouts(path)) {
				const allowed = ALLOWED_BAILOUTS[rel];
				if (allowed && b.includes(allowed)) allowedSeen.add(rel);
				else offenders.push(`${rel}: ${b}`);
			}
		}
		expect(offenders.join("\n")).toBe("");
		const stale = Object.keys(ALLOWED_BAILOUTS).filter(
			(rel) => !allowedSeen.has(rel),
		);
		expect(stale).toEqual([]);
	}, 120_000);
});
