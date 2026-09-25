import { describe, expect, it } from "bun:test";

import {
	isThemeRootSelectorList,
	scopeThemeCss,
	themePreviewSelector,
} from "../theme-presets";

const SCOPE = themePreviewSelector("clay");
const DARK = `:where(.dark) ${SCOPE}`;

/** Collapse whitespace so assertions do not depend on formatting. */
const flat = (css: string) => css.replace(/\s+/gu, " ").trim();

describe("themePreviewSelector", () => {
	it("quotes the id in an attribute selector", () => {
		expect(themePreviewSelector("retro-arcade")).toBe(
			'[data-theme-preview="retro-arcade"]',
		);
	});

	it("escapes quotes and backslashes", () => {
		expect(themePreviewSelector('a"b\\c')).toBe(
			'[data-theme-preview="a\\"b\\\\c"]',
		);
	});
});

describe("scopeThemeCss", () => {
	it("maps :root to the scope and .dark to the scope under a dark ancestor", () => {
		const out = scopeThemeCss(
			":root { --radius: 1rem; }\n.dark { --radius: 0; }",
			SCOPE,
		);
		expect(flat(out)).toBe(
			flat(`${SCOPE} { --radius: 1rem; } ${DARK} { --radius: 0; }`),
		);
	});

	it("keeps rule order, so a later light block still beats an earlier dark one", () => {
		const out = scopeThemeCss(".dark { --a: 1; } :root { --a: 2; }", SCOPE);
		expect(out.indexOf(DARK)).toBeLessThan(out.lastIndexOf(`${SCOPE} {`));
	});

	it("maps a combined selector list entry by entry", () => {
		const out = scopeThemeCss(":root, .dark { --x: 1; }", SCOPE);
		expect(flat(out)).toBe(flat(`${SCOPE}, ${DARK} { --x: 1; }`));
	});

	it("accepts html, :host and :root.dark spellings and deduplicates", () => {
		const out = scopeThemeCss(
			"html, :root, :host { --x: 1; } html.dark, :root.dark { --y: 2; }",
			SCOPE,
		);
		expect(flat(out)).toBe(
			flat(`${SCOPE} { --x: 1; } ${DARK} { --y: 2; }`),
		);
	});

	it("drops selectors that reach outside the root, and rules left empty", () => {
		const out = scopeThemeCss(
			":root, body { --x: 1; } .card { color: red; } [data-slot='x'] { --y: 1; }",
			SCOPE,
		);
		expect(flat(out)).toBe(flat(`${SCOPE} { --x: 1; }`));
	});

	it("removes comments, including ones holding braces or selectors", () => {
		const out = scopeThemeCss(
			"/* .dark { --evil: 1 } */ :root { /* } */ --a: 1; /* x */ --b: 2; }",
			SCOPE,
		);
		expect(flat(out)).toBe(flat(`${SCOPE} { --a: 1; --b: 2; }`));
	});

	it("keeps strings verbatim, braces and comment markers included", () => {
		const out = scopeThemeCss(
			':root { --label: "a { b } /* c */"; --font: "Space Grotesk", sans-serif; }',
			SCOPE,
		);
		expect(out).toContain('--label: "a { b } /* c */"');
		expect(out).toContain('--font: "Space Grotesk", sans-serif');
	});

	it("keeps multi-line values and !important", () => {
		const out = scopeThemeCss(
			":root {\n\t--elevation-md:\n\t\t0 1px 2px red,\n\t\tinset 0 0 1px blue;\n\t--m: 0ms !important\n}",
			SCOPE,
		);
		expect(flat(out)).toBe(
			flat(
				`${SCOPE} { --elevation-md: 0 1px 2px red, inset 0 0 1px blue; --m: 0ms !important; }`,
			),
		);
	});

	it("keeps @media and @supports around scoped rules, and drops them when empty", () => {
		const out = scopeThemeCss(
			"@media (prefers-reduced-motion: reduce) { :root { --m: 0ms; } body { margin: 0; } }" +
				"@supports (color: oklch(0 0 0)) { .dark { --c: oklch(0 0 0); } }" +
				"@media print { body { color: black; } }",
			SCOPE,
		);
		expect(flat(out)).toBe(
			flat(
				`@media (prefers-reduced-motion: reduce) { ${SCOPE} { --m: 0ms; } } ` +
					`@supports (color: oklch(0 0 0)) { ${DARK} { --c: oklch(0 0 0); } }`,
			),
		);
	});

	it("drops global at-rules: @import, @property, @font-face, @keyframes, @layer", () => {
		const out = scopeThemeCss(
			'@import url("x.css");' +
				'@property --p { syntax: "<length>"; inherits: true; initial-value: 0px; }' +
				'@font-face { font-family: X; src: url("x.woff2"); }' +
				"@keyframes spin { from { rotate: 0; } to { rotate: 1turn; } }" +
				"@layer base { :root { --leak: 1; } }" +
				":root { --kept: 1; }",
			SCOPE,
		);
		expect(flat(out)).toBe(flat(`${SCOPE} { --kept: 1; }`));
	});

	it("drops nested rules inside a token block but keeps its declarations", () => {
		const out = scopeThemeCss(
			":root { --a: 1; & body { color: red; } --b: 2 }",
			SCOPE,
		);
		expect(flat(out)).toBe(flat(`${SCOPE} { --a: 1; --b: 2; }`));
	});

	it("returns an empty string when nothing applies", () => {
		expect(scopeThemeCss("body { color: red; }", SCOPE)).toBe("");
		expect(scopeThemeCss("", SCOPE)).toBe("");
	});

	it("scopes every real preset file without leaving a bare :root or .dark", async () => {
		const { readdirSync, readFileSync } = await import("node:fs");
		const path = await import("node:path");
		const dir = path.join(
			import.meta.dir,
			"../../../../../apps/web/themes",
		);
		for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
			const out = scopeThemeCss(
				readFileSync(path.join(dir, file), "utf8"),
				SCOPE,
			);
			expect(out.length).toBeGreaterThan(0);
			expect(out).not.toMatch(/(^|[\s,}]):root\b/u);
			expect(out).not.toMatch(/(^|[\s,}])\.dark\s*\{/u);
			for (const prelude of out.match(/^[^\s@}][^{]*\{/gmu) ?? []) {
				expect(prelude.includes(SCOPE)).toBe(true);
			}
		}
	});
});

describe("isThemeRootSelectorList", () => {
	it("accepts lists made only of root selectors", () => {
		expect(isThemeRootSelectorList(":root")).toBe(true);
		expect(isThemeRootSelectorList(":root, .dark")).toBe(true);
		expect(isThemeRootSelectorList("html.dark")).toBe(true);
	});

	it("rejects anything else", () => {
		expect(isThemeRootSelectorList(":root, :host body")).toBe(false);
		expect(isThemeRootSelectorList("body")).toBe(false);
		expect(isThemeRootSelectorList("")).toBe(false);
	});
});
