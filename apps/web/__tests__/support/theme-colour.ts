/**
 * Colour maths and a small CSS custom-property reader for the theme-preset
 * contract test (`theme-presets.test.ts`).
 *
 * Deliberately small and honest: it reads the colour syntaxes the presets
 * actually use (`oklch()`, hex, `rgb()`) and refuses anything else with a
 * message, rather than guessing a value it cannot compute.
 */

/** A colour in OKLCH plus alpha. `h` is in degrees, `[0, 360)`. */
export interface Oklch {
	l: number;
	c: number;
	h: number;
	alpha: number;
}

/** Linear-light sRGB, each channel nominally in `[0, 1]` (may overshoot before clipping). */
export interface LinearRgb {
	r: number;
	g: number;
	b: number;
}

/** OKLCH -> linear sRGB (Ottosson's OKLab matrices). Not gamut-clipped. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): LinearRgb {
	const hr = (h * Math.PI) / 180;
	const a = c * Math.cos(hr);
	const b = c * Math.sin(hr);

	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;

	const L = l_ ** 3;
	const M = m_ ** 3;
	const S = s_ ** 3;

	return {
		r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
		g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
		b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
	};
}

/** Linear sRGB -> OKLCH (inverse of {@link oklchToLinearSrgb}). */
export function linearSrgbToOklch({ r, g, b }: LinearRgb, alpha = 1): Oklch {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

	const c = Math.hypot(A, B);
	const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
	return { l: L, c, h, alpha };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** sRGB transfer function, encoded channel `[0, 1]` -> linear. */
export function srgbToLinear(channel: number): number {
	return channel <= 0.04045
		? channel / 12.92
		: ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.x relative luminance of an OKLCH colour. Out-of-gamut colours are
 * clipped by clamping each linear channel to `[0, 1]`, which is what a
 * browser rendering to an sRGB display ends up showing for these presets.
 */
export function relativeLuminance(colour: Oklch): number {
	const { r, g, b } = oklchToLinearSrgb(colour);
	return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b);
}

/** WCAG 2.x contrast ratio between two opaque colours, `[1, 21]`. */
export function contrastRatio(one: Oklch, two: Oklch): number {
	const a = relativeLuminance(one);
	const b = relativeLuminance(two);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Shortest angular distance between two hues, `[0, 180]`. */
export function hueDistance(one: number, two: number): number {
	const d = Math.abs(one - two) % 360;
	return d > 180 ? 360 - d : d;
}

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;

function parseNumberOrPercent(token: string, percentScale: number): number {
	const trimmed = token.trim();
	if (trimmed.endsWith("%")) {
		return (Number.parseFloat(trimmed) / 100) * percentScale;
	}
	return Number.parseFloat(trimmed);
}

function parseAlpha(token: string | undefined): number {
	if (token === undefined) return 1;
	return parseNumberOrPercent(token, 1);
}

function parseHue(token: string): number {
	const trimmed = token.trim();
	let degrees: number;
	if (trimmed.endsWith("deg")) degrees = Number.parseFloat(trimmed);
	else if (trimmed.endsWith("turn"))
		degrees = Number.parseFloat(trimmed) * 360;
	else if (trimmed.endsWith("rad"))
		degrees = (Number.parseFloat(trimmed) * 180) / Math.PI;
	else degrees = Number.parseFloat(trimmed);
	return ((degrees % 360) + 360) % 360;
}

const OKLCH_RE = new RegExp(
	String.raw`^oklch\(\s*(${NUMBER}%?)\s+(${NUMBER}%?)\s+(${NUMBER}(?:deg|turn|rad)?)\s*(?:\/\s*(${NUMBER}%?)\s*)?\)$`,
	"i",
);
const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = new RegExp(
	String.raw`^rgba?\(\s*(${NUMBER}%?)\s*[,\s]\s*(${NUMBER}%?)\s*[,\s]\s*(${NUMBER}%?)\s*(?:[,/]\s*(${NUMBER}%?)\s*)?\)$`,
	"i",
);

/**
 * Parses a literal colour value. Returns `undefined` for anything that is not
 * an `oklch()`, hex or `rgb()` literal (including `var()` and `color-mix()`),
 * so the caller can report it instead of guessing.
 */
export function parseColour(value: string): Oklch | undefined {
	const text = value.trim();

	const oklch = OKLCH_RE.exec(text);
	if (oklch) {
		return {
			// CSS: L 100% = 1, C 100% = 0.4.
			l: parseNumberOrPercent(oklch[1]!, 1),
			c: parseNumberOrPercent(oklch[2]!, 0.4),
			h: parseHue(oklch[3]!),
			alpha: parseAlpha(oklch[4]),
		};
	}

	const hex = HEX_RE.exec(text);
	if (hex) {
		let digits = hex[1]!;
		if (digits.length <= 4) {
			digits = [...digits].map((d) => d + d).join("");
		}
		const channels = digits
			.match(/../g)!
			.map((pair) => parseInt(pair, 16) / 255);
		return linearSrgbToOklch(
			{
				r: srgbToLinear(channels[0]!),
				g: srgbToLinear(channels[1]!),
				b: srgbToLinear(channels[2]!),
			},
			channels[3] ?? 1,
		);
	}

	const rgb = RGB_RE.exec(text);
	if (rgb) {
		const channel = (token: string) =>
			srgbToLinear(parseNumberOrPercent(token, 255) / 255);
		return linearSrgbToOklch(
			{ r: channel(rgb[1]!), g: channel(rgb[2]!), b: channel(rgb[3]!) },
			parseAlpha(rgb[4]),
		);
	}

	return undefined;
}

/** One top-level rule block: its selector list and its custom properties, in source order. */
export interface CssBlock {
	selectors: string[];
	properties: Map<string, string>;
}

/**
 * Reads the top-level rule blocks of a stylesheet and their custom
 * properties. Comments are stripped; statement at-rules (`@import …;`) are
 * skipped; nested blocks (`@layer`, `@media`, `@theme` …) are returned with
 * their at-rule prelude as the selector, so a caller matching `:root` or
 * `.dark` never picks up a declaration that only applies conditionally.
 */
export function readTopLevelBlocks(css: string): CssBlock[] {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const blocks: CssBlock[] = [];

	let depth = 0;
	let prelude = "";
	let body = "";
	// A brace or semicolon inside a string (`@source "../**/*.{ts,tsx}";`)
	// is text, not structure.
	let quote: string | null = null;
	for (const char of source) {
		if (quote !== null || char === '"' || char === "'") {
			if (quote === null) quote = char;
			else if (char === quote) quote = null;
			if (depth === 0) prelude += char;
			else body += char;
			continue;
		}

		if (depth === 0) {
			if (char === "{") {
				depth = 1;
				body = "";
			} else if (char === ";") {
				prelude = "";
			} else {
				prelude += char;
			}
			continue;
		}

		if (char === "{") depth += 1;
		if (char === "}") depth -= 1;

		if (depth === 0) {
			const properties = new Map<string, string>();
			// Only a flat body carries declarations that apply to this selector.
			if (!body.includes("{")) {
				for (const declaration of body.split(";")) {
					const colon = declaration.indexOf(":");
					if (colon === -1) continue;
					const name = declaration.slice(0, colon).trim();
					if (!name.startsWith("--")) continue;
					properties.set(name, declaration.slice(colon + 1).trim());
				}
			}
			blocks.push({
				selectors: prelude
					.split(",")
					.map((selector) => selector.trim())
					.filter(Boolean),
				properties,
			});
			prelude = "";
		} else {
			body += char;
		}
	}

	return blocks;
}
