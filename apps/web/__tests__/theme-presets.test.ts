/**
 * Colour floor for every theme preset in `apps/web/themes/*.css`.
 *
 * A preset is plain CSS injected at runtime over `globals.css`; nothing else
 * checks it, so a preset whose light mode is the stock black-and-white
 * default, or whose muted text is unreadable, ships unnoticed. Every preset
 * is measured merged with globals in both modes (see `support/theme-contract.ts`
 * for the cascade), and every failure names the preset, mode, token pair and
 * the measured value.
 *
 * The contract, per preset and mode:
 * - body, card and popover text >= 4.5:1 on their surface;
 * - muted text >= 4.5:1 on background, card and muted;
 * - every `*-foreground` >= 4.5:1 on its fill (white on destructive, since
 *   solid destructive buttons paint `text-white`);
 * - `--warning-text` >= 4.5:1 on background and card; success, info and
 *   destructive >= 3:1 on background (icons, large text);
 * - success, warning, destructive and info at least 25° apart in hue;
 * - warning at least 30° from a chromatic primary, so the command affordance
 *   never reads as the primary action;
 * - both a `:root` and a `.dark` block, and a light mode that is not stock;
 * - no selector besides `:root` and `.dark` (shape goes through tokens).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
	contrastRatio,
	hueDistance,
	parseColour,
	readTopLevelBlocks,
	relativeLuminance,
	type Oklch,
} from "./support/theme-colour";
import {
	describeFailure,
	evaluateMode,
	evaluateStructure,
	resolveTokens,
	type ThemeMode,
} from "./support/theme-contract";

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

const colour = (value: string): Oklch => {
	const parsed = parseColour(value);
	if (!parsed) throw new Error(`test fixture did not parse: ${value}`);
	return parsed;
};

describe("colour maths", () => {
	test("luminance of white, black and a mid grey", () => {
		expect(relativeLuminance(colour("oklch(1 0 0)"))).toBeCloseTo(1, 4);
		expect(relativeLuminance(colour("oklch(0 0 0)"))).toBeCloseTo(0, 6);
		// An achromatic OKLab L is the cube root of luminance.
		expect(relativeLuminance(colour("oklch(0.5 0 0)"))).toBeCloseTo(
			0.125,
			4,
		);
		expect(relativeLuminance(colour("#777777"))).toBeCloseTo(0.1845, 3);
	});

	test("sRGB red round-trips through OKLCH with the WCAG red weight", () => {
		const red = colour("#ff0000");
		expect(red.l).toBeCloseTo(0.628, 3);
		expect(red.c).toBeCloseTo(0.2577, 3);
		expect(red.h).toBeCloseTo(29.23, 1);
		expect(relativeLuminance(red)).toBeCloseTo(0.2126, 3);
		expect(
			relativeLuminance(colour("oklch(0.62796 0.25768 29.2339)")),
		).toBeCloseTo(0.2126, 3);
		expect(colour("rgb(255 0 0)").h).toBeCloseTo(red.h, 6);
	});

	test("contrast of black on white is 21:1 and hue distance wraps", () => {
		expect(
			contrastRatio(colour("#000"), colour("oklch(100% 0 0)")),
		).toBeCloseTo(21, 3);
		expect(hueDistance(350, 10)).toBe(20);
		expect(hueDistance(10, 190)).toBe(180);
	});

	test("unsupported syntaxes are refused, not guessed", () => {
		expect(parseColour("var(--primary)")).toBeUndefined();
		expect(
			parseColour("color-mix(in oklch, red 50%, blue)"),
		).toBeUndefined();
		expect(colour("oklch(0.6 0.1 20 / 50%)").alpha).toBe(0.5);
	});

	test("the stylesheet reader ignores braces in strings and nested blocks", () => {
		const blocks = readTopLevelBlocks(`
			@source "../**/*.{ts,tsx}";
			/* :root { --background: red; } */
			:root { --background: oklch(1 0 0); }
			@media (x) { :root { --background: oklch(0 0 0); } }
		`);
		const root = blocks.filter((b) => b.selectors.includes(":root"));
		expect(root).toHaveLength(1);
		expect(root[0]!.properties.get("--background")).toBe("oklch(1 0 0)");
	});
});

test("there are theme presets to check", () => {
	expect(presets.length).toBeGreaterThan(0);
});

// The app default is what every preset falls back to for anything it does not
// set, so it has to meet the floor on its own.
test.each(["light", "dark"] as ThemeMode[])(
	"the app default meets the colour floor in %s mode",
	(mode) => {
		const failures = evaluateMode(resolveTokens(GLOBALS_CSS, "", mode))
			.filter((check) => !check.pass)
			.map((check) => describeFailure("app default", mode, check));
		expect(failures).toEqual([]);
	},
);

describe.each(presets)("theme preset $id", ({ id, css }) => {
	test("owns both modes, and its light mode is not stock", () => {
		const failures = evaluateStructure(GLOBALS_CSS, css).map(
			(failure) => `${id}: ${failure}`,
		);
		expect(failures).toEqual([]);
	});

	// A preset changes shape through the token contract (globals.css), never
	// by targeting components: a selector here is a missing token.
	test("writes tokens only: no selector besides :root and .dark", () => {
		const selectors = readTopLevelBlocks(css)
			.flatMap((block) => block.selectors)
			.filter((selector) => selector !== ":root" && selector !== ".dark");
		expect(selectors).toEqual([]);
	});

	test.each(["light", "dark"] as ThemeMode[])(
		"meets the colour floor in %s mode",
		(mode) => {
			const failures = evaluateMode(resolveTokens(GLOBALS_CSS, css, mode))
				.filter((check) => !check.pass)
				.map((check) => describeFailure(id, mode, check));
			expect(failures).toEqual([]);
		},
	);
});
