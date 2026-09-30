/**
 * Test support for the UI copy rule (AGENTS.md, "UI copy states facts, never
 * reasons"): no em dash in any user-visible string.
 *
 * Imported only from test files, so it adds no runtime dependency to the
 * package that runs it. It lives in `@workspace/ui` because that is the one
 * workspace package nearly every other one already depends on; the guard in
 * each package is then a few lines calling {@link findUiCopyViolations} on
 * its own source.
 *
 * The check reads the AST rather than grepping, because the rule is about
 * strings and not comments: JSDoc and `//` comments are exempt and would
 * otherwise drown the signal. Every string literal, template and JSX text is
 * in scope, not only the ones a heuristic thinks reach the screen: labels,
 * titles, notices, validation messages and config-schema descriptions are
 * all plain string literals, and a narrower net is one that misses the next
 * one. Messages passed straight to `console.*` are for developers and exempt,
 * as are test files, which name cases rather than render them.
 */

import { Glob } from "bun";
import * as ts from "typescript";

/**
 * The character the rule bans in user-visible copy (U+2014). Built from its
 * code point so this module passes its own scan.
 */
export const EM_DASH = String.fromCharCode(0x2014);

/** One offending string: where it is and (the start of) what it says. */
export interface UiCopyHit {
	file: string;
	line: number;
	text: string;
}

/** Test files and anything that is not first-party source. */
const SKIPPED_PATH =
	/(^|\/)(node_modules|dist|\.next|__tests__)\/|\.test\.tsx?$|\.d\.ts$/;

function isConsoleArgument(node: ts.Node): boolean {
	const call = node.parent;
	if (!call || !ts.isCallExpression(call)) return false;
	const callee = call.expression;
	return (
		ts.isPropertyAccessExpression(callee) &&
		ts.isIdentifier(callee.expression) &&
		callee.expression.text === "console"
	);
}

/**
 * The strings and JSX text in one source file that carry an em dash.
 *
 * @param path   File path, used for the script kind (`.tsx` parses JSX) and
 *               reported as given.
 * @param source The file's contents.
 */
export function findEmDashesInSource(
	path: string,
	source: string,
): UiCopyHit[] {
	if (!source.includes(EM_DASH)) return [];
	const file = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const hits: UiCopyHit[] = [];
	const visit = (node: ts.Node) => {
		let text: string | null = null;
		if (ts.isJsxText(node)) text = node.getText();
		else if (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node)
		)
			text = node.text;
		else if (ts.isTemplateExpression(node)) text = node.getText();
		if (
			text !== null &&
			text.includes(EM_DASH) &&
			!isConsoleArgument(node)
		) {
			const { line } = file.getLineAndCharacterOfPosition(
				node.getStart(),
			);
			hits.push({
				file: path,
				line: line + 1,
				text: text.replace(/\s+/g, " ").trim().slice(0, 90),
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return hits;
}

/**
 * Scan every `.ts` / `.tsx` source file under `root` and report each em dash
 * in a string or JSX text as `relative/path.tsx:line  text`. An empty array
 * means the copy is clean, so a guard is `expect(await ...).toEqual([])`,
 * which prints the offending lines on failure.
 *
 * Test files, `__tests__/`, declaration files, `node_modules`, `dist` and
 * `.next` are skipped. Pass a root that holds source only: the scan walks
 * everything under it.
 *
 * @param root Absolute directory to scan (e.g. the package's `src`).
 */
export async function findUiCopyViolations(root: string): Promise<string[]> {
	const base = root.endsWith("/") ? root : `${root}/`;
	const report: string[] = [];
	for await (const rel of new Glob("**/*.{ts,tsx}").scan(base)) {
		if (SKIPPED_PATH.test(rel)) continue;
		const source = await Bun.file(base + rel).text();
		for (const hit of findEmDashesInSource(rel, source)) {
			report.push(`${hit.file}:${hit.line}  ${hit.text}`);
		}
	}
	return report.sort();
}
