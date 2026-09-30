import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { formatMeasurement } from "./contact-details";

/**
 * Two kinds of check, both for defects that no rendering test catches.
 *
 * The first is arithmetic: a float32 depth round-tripped through a float64
 * prints as `0.10000000149011612 m`, which an operator reads as a broken
 * readout rather than as 10 cm.
 *
 * The second is source text. A `size="icon-sm"` Button given `h-6 w-6` still
 * renders — at 24 px, because Tailwind orders `h-*`/`w-*` after `size-*`, so
 * the override silently wins and every icon control becomes an under-sized
 * target. A `ScrollArea` without the Radix viewport fix likewise renders, with
 * `truncate` quietly doing nothing because the inner div is `display: table`.
 * Both are invisible to a DOM assertion and to review; the class string is
 * where they live, so the class string is what is asserted.
 *
 * Scoped to the panels this audit fixed rather than to the whole plugin: the
 * rule is the house one, but a repo-wide sweep here would fail on files this
 * change does not own.
 */

/** The panels covered by these source rules. */
const PANELS = [
	"contact-details.tsx",
	"findings-layer.tsx",
	"fleet-status.tsx",
	"mission-assets-panel.tsx",
	"mission-browser.tsx",
	"mission-feedback.tsx",
	"swarm-log.tsx",
];

const source = (file: string) =>
	readFileSync(join(import.meta.dir, file), "utf8");

/**
 * The opening tags of one JSX element type, as raw text.
 *
 * Quote- and brace-aware rather than "up to the first `>`": the Radix viewport
 * fix these tests look for CONTAINS a `>` (`…viewport]>div]`), so a naive scan
 * truncated the very class string it was asserting and the test failed on the
 * fixed file.
 *
 * @param text - The source file.
 * @param tag - The component name.
 * @returns One string per element, from `<Tag` up to the closing `>`.
 */
function openingTags(text: string, tag: string): string[] {
	const out: string[] = [];
	const re = new RegExp(`<${tag}\\b`, "g");
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		const rest = text.slice(match.index);
		let quoted = false;
		let braces = 0;
		let end = rest.length;
		for (let i = 0; i < rest.length; i++) {
			const char = rest[i];
			if (char === '"') quoted = !quoted;
			else if (quoted) continue;
			else if (char === "{") braces += 1;
			else if (char === "}") braces -= 1;
			else if (char === ">" && braces === 0) {
				end = i;
				break;
			}
		}
		out.push(rest.slice(0, end));
	}
	return out;
}

describe("measurement formatting", () => {
	it("tames a float32 round-trip instead of printing it", () => {
		expect(formatMeasurement(0.10000000149011612)).toBe("0.1");
	});
	it("keeps an integer, and a zero, exactly as measured", () => {
		expect(formatMeasurement(0)).toBe("0");
		expect(formatMeasurement(1834)).toBe("1834");
		expect(formatMeasurement(-7)).toBe("-7");
	});
	it("keeps three significant figures across the table's decades", () => {
		expect(formatMeasurement(0.000123456)).toBe("0.000123");
		expect(formatMeasurement(12.3456)).toBe("12.3");
		expect(formatMeasurement(1234.56)).toBe("1230");
	});
	it("says a very large or very small value in exponent form", () => {
		expect(formatMeasurement(1.5e-7)).toBe("1.50e-7");
		expect(formatMeasurement(12345678.9)).toBe("1.23e+7");
	});
	it("refuses a non-finite reading rather than printing NaN", () => {
		expect(formatMeasurement(Number.NaN)).toBe("n/a");
		expect(formatMeasurement(Number.POSITIVE_INFINITY)).toBe("n/a");
	});
});

describe("house conventions, in the class strings", () => {
	it("never overrides an icon-sm Button's 32 px target", () => {
		for (const file of PANELS) {
			for (const props of openingTags(source(file), "Button")) {
				if (!props.includes('size="icon-sm"')) continue;
				expect(`${file}: ${props}`).not.toMatch(
					/className="[^"]*\b(?:h|w|size)-\d/,
				);
			}
		}
	});

	it("gives every scrolled list the Radix viewport block fix", () => {
		const fix = "[&_[data-radix-scroll-area-viewport]>div]:!block";
		for (const file of PANELS) {
			for (const props of openingTags(source(file), "ScrollArea")) {
				// A ScrollArea with no className wraps a single block, not a
				// list of rows that must truncate.
				if (!props.includes("className=")) continue;
				expect(`${file}: ${props}`).toContain(fix);
			}
		}
	});

	it("reads colour from the raw token, never `--color-*`", () => {
		for (const file of PANELS) {
			expect([file, source(file).includes("var(--color-")]).toEqual([
				file,
				false,
			]);
		}
	});
});
