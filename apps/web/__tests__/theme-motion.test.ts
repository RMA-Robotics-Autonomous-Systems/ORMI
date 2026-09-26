/**
 * Motion floor for the app default and every theme preset in
 * `apps/web/themes/*.css`.
 *
 * Motion is the UI's own state changes (presses, toggles, overlays, tabs) and
 * must stay fast: every duration token resolves, merged over `globals.css`
 * the way the runtime cascade does, to at most {@link MAX_MS}. The presets
 * that switch motion off (amber, tactical) resolve every step to 0, and
 * `prefers-reduced-motion: reduce` forces every step to 0 whatever a preset
 * writes. The durations are evaluated, not string-matched: the steps are
 * `calc()`s of `--motion-duration`, so a preset that raises the knob can push
 * a derived step over the ceiling without writing it.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { readTopLevelBlocks } from "./support/theme-colour";
import { resolveTokens, type ResolvedTokens } from "./support/theme-contract";

const MAX_MS = 300;

/** Every duration step of the contract (globals.css, "Motion and texture"). */
const DURATION_TOKENS = [
	"--motion-duration",
	"--motion-fast",
	"--motion-base",
	"--motion-layout",
	"--motion-exit",
] as const;

const EASE_TOKENS = ["--motion-ease", "--motion-ease-emphasis"] as const;

/** Presets that switch motion off entirely. */
const MOTIONLESS = ["amber", "tactical"];

const THEMES_DIR = path.join(import.meta.dir, "..", "themes");
const GLOBALS_CSS = readFileSync(
	path.join(import.meta.dir, "../../../packages/ui/src/styles/globals.css"),
	"utf8",
);

const presets = readdirSync(THEMES_DIR)
	.filter((file) => file.endsWith(".css"))
	.sort()
	.map((file) => ({
		id: file.replace(/\.css$/u, ""),
		css: readFileSync(path.join(THEMES_DIR, file), "utf8"),
	}));

const stripImportant = (value: string) =>
	value.replace(/\s*!important\s*$/u, "").trim();

/**
 * Evaluates a duration token to milliseconds: literals in `ms` / `s`,
 * `var()` references (followed through `tokens`, with their fallback), and
 * `calc()` arithmetic over them. Anything else throws, so a value the test
 * cannot read fails loudly instead of passing as 0.
 */
function durationMs(tokens: ResolvedTokens, name: string, depth = 0): number {
	if (depth > 16) throw new Error(`${name}: var() cycle`);
	const raw = tokens.get(name);
	if (raw === undefined) throw new Error(`${name} is not defined`);

	let expression = stripImportant(raw);
	// Innermost var() first, so a fallback holding another var() resolves.
	const varPattern = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/u;
	for (let match = varPattern.exec(expression); match;) {
		const [whole, reference, fallback] = match;
		const value = tokens.has(reference!)
			? `${durationMs(tokens, reference!, depth + 1)}ms`
			: fallback?.trim();
		if (value === undefined) {
			throw new Error(`${name}: ${reference} is not defined`);
		}
		expression = expression.replace(whole, value);
		match = varPattern.exec(expression);
	}

	const arithmetic = expression
		.replace(/calc\(/gu, "(")
		.replace(/(\d*\.?\d+)ms\b/gu, "$1")
		.replace(/(\d*\.?\d+)s\b/gu, "($1*1000)");
	if (!/^[\d.\s+\-*/()]+$/u.test(arithmetic)) {
		throw new Error(`${name}: cannot evaluate "${raw}"`);
	}
	return Number(new Function(`return (${arithmetic});`)());
}

/** The declarations inside `@media (prefers-reduced-motion: reduce) { :root { … } }`. */
function reducedMotionDeclarations(css: string): Map<string, string> {
	const source = css.replace(/\/\*[\s\S]*?\*\//gu, "");
	const start = source.search(
		/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/u,
	);
	if (start === -1) return new Map();
	const open = source.indexOf("{", start);
	let depth = 0;
	let end = open;
	for (; end < source.length; end += 1) {
		if (source[end] === "{") depth += 1;
		if (source[end] === "}") depth -= 1;
		if (depth === 0) break;
	}
	const inner = source.slice(open + 1, end);
	const declarations = new Map<string, string>();
	for (const block of readTopLevelBlocks(inner)) {
		if (!block.selectors.includes(":root")) continue;
		for (const [key, value] of block.properties)
			declarations.set(key, value);
	}
	return declarations;
}

/** The tokens with the reduced-motion block applied over them (it is `!important`). */
function withReducedMotion(tokens: ResolvedTokens): ResolvedTokens {
	const merged = new Map(tokens);
	for (const [key, value] of reducedMotionDeclarations(GLOBALS_CSS)) {
		merged.set(key, value);
	}
	return merged;
}

const cases = [{ id: "app default", css: "" }, ...presets];

test("there are theme presets to check", () => {
	expect(presets.length).toBeGreaterThan(0);
	for (const id of MOTIONLESS) {
		expect(presets.map((preset) => preset.id)).toContain(id);
	}
});

describe("the evaluator", () => {
	const tokens: ResolvedTokens = new Map([
		["--a", "120ms"],
		["--b", "calc(var(--a) * 1.5)"],
		["--c", "calc(var(--b) * 0.75)"],
		["--d", "0.2s"],
		["--e", "var(--missing, 40ms)"],
		["--f", "0ms !important"],
		["--g", "ease"],
	]);

	test("follows var() through calc() and converts seconds", () => {
		expect(durationMs(tokens, "--b")).toBeCloseTo(180, 6);
		expect(durationMs(tokens, "--c")).toBeCloseTo(135, 6);
		expect(durationMs(tokens, "--d")).toBeCloseTo(200, 6);
		expect(durationMs(tokens, "--e")).toBe(40);
		expect(durationMs(tokens, "--f")).toBe(0);
	});

	test("refuses what it cannot read instead of guessing 0", () => {
		expect(() => durationMs(tokens, "--g")).toThrow();
		expect(() => durationMs(tokens, "--nope")).toThrow();
	});
});

describe.each(cases)("motion in $id", ({ id, css }) => {
	const tokens = resolveTokens(GLOBALS_CSS, css, "light");

	test.each([...DURATION_TOKENS])(`%s is at most ${MAX_MS}ms`, (token) => {
		const ms = durationMs(tokens, token);
		expect(ms).toBeGreaterThanOrEqual(0);
		expect(ms).toBeLessThanOrEqual(MAX_MS);
	});

	test("an overlay leaves no slower than it enters", () => {
		expect(durationMs(tokens, "--motion-exit")).toBeLessThanOrEqual(
			durationMs(tokens, "--motion-base"),
		);
	});

	test.each([...EASE_TOKENS])(
		"%s is a cubic-bezier with x in [0, 1]",
		(token) => {
			const value = tokens.get(token);
			expect(value).toBeDefined();
			// A var() to another ease token is allowed; follow it once.
			const resolved = /^var\((--[\w-]+)\)$/u.exec(value!)
				? tokens.get(/^var\((--[\w-]+)\)$/u.exec(value!)![1]!)
				: value;
			const match =
				/^cubic-bezier\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/u.exec(
					resolved ?? "",
				);
			expect(match).not.toBeNull();
			const [x1, y1, x2, y2] = match!.slice(1).map(Number) as [
				number,
				number,
				number,
				number,
			];
			expect(x1).toBeGreaterThanOrEqual(0);
			expect(x1).toBeLessThanOrEqual(1);
			expect(x2).toBeGreaterThanOrEqual(0);
			expect(x2).toBeLessThanOrEqual(1);
			// A little overshoot is personality; more is a bounce nobody asked for.
			expect(y1).toBeLessThanOrEqual(1.6);
			expect(y2).toBeLessThanOrEqual(1.6);
		},
	);

	test("prefers-reduced-motion zeroes every duration step", () => {
		const reduced = withReducedMotion(tokens);
		for (const token of DURATION_TOKENS) {
			expect({ token, ms: durationMs(reduced, token) }).toEqual({
				token,
				ms: 0,
			});
		}
	});

	if (MOTIONLESS.includes(id)) {
		test("switches every duration step off", () => {
			for (const token of DURATION_TOKENS) {
				expect({ token, ms: durationMs(tokens, token) }).toEqual({
					token,
					ms: 0,
				});
			}
		});
	}
});

test("the reduced-motion rule lists every step, each !important", () => {
	const declarations = reducedMotionDeclarations(GLOBALS_CSS);
	for (const token of DURATION_TOKENS) {
		expect({ token, value: declarations.get(token) }).toEqual({
			token,
			value: "0ms !important",
		});
	}
});
