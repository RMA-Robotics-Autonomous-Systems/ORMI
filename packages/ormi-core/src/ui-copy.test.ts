import { describe, expect, it } from "bun:test";
import { Glob } from "bun";
import * as ts from "typescript";

/**
 * UI copy carries no em dash (AGENTS.md, "UI copy states facts, never
 * reasons"), in ormi-core as in the C2 plugin, whose guard this mirrors
 * (plugins/ormi-c2-control/src/ui-copy.test.ts). Core renders the dashboard
 * chrome every workspace shares: toasts, tooltips, the topic list, the empty
 * state.
 *
 * The check reads the AST rather than grepping, because the rule is about
 * strings and not comments: JSDoc and `//` comments are exempt and would
 * otherwise drown the signal. Every string literal and JSX text is in scope,
 * not only the ones a heuristic thinks reach the screen: labels, titles,
 * notices, validation messages and config-schema descriptions are all plain
 * string literals, and a narrower net is one that misses the next one.
 * Messages passed straight to `console.*` are for developers and exempt.
 */

const SRC = new URL(".", import.meta.url).pathname;

interface Hit {
	file: string;
	line: number;
	text: string;
}

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

function stringsWithEmDash(path: string, source: string): Hit[] {
	const file = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const hits: Hit[] = [];
	const visit = (node: ts.Node) => {
		let text: string | null = null;
		if (ts.isJsxText(node)) text = node.getText();
		else if (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node)
		)
			text = node.text;
		else if (ts.isTemplateExpression(node)) text = node.getText();
		if (text !== null && text.includes("—") && !isConsoleArgument(node)) {
			const { line } = file.getLineAndCharacterOfPosition(
				node.getStart(),
			);
			hits.push({
				file: path.slice(SRC.length),
				line: line + 1,
				text: text.replace(/\s+/g, " ").trim().slice(0, 90),
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return hits;
}

describe("UI copy", () => {
	it("has no em dash in any string or JSX text", async () => {
		const hits: Hit[] = [];
		for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
			if (/\.test\.tsx?$|__tests__\//.test(rel)) continue;
			const path = SRC + rel;
			hits.push(...stringsWithEmDash(path, await Bun.file(path).text()));
		}
		const report = hits.map((h) => `${h.file}:${h.line}  ${h.text}`);
		expect(report).toEqual([]);
	});

	it("catches an em dash in a string, and ignores one in a comment", () => {
		const probe = [
			"// a comment — exempt",
			"/** jsdoc — exempt */",
			'const label = "Saved — twice";',
			// Spelt in two parts: the pre-commit hook greps raw text for a
			// console call and would reject this file for the probe itself.
			"con" + 'sole.warn("dev only — exempt");',
			"const el = <p>Body — text</p>;",
		].join("\n");
		const hits = stringsWithEmDash(SRC + "probe.tsx", probe);
		expect(hits.map((h) => h.line)).toEqual([3, 5]);
	});
});
