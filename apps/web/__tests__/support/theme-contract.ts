/**
 * The colour floor every theme preset in `apps/web/themes/*.css` must meet,
 * evaluated against the cascade the browser actually applies.
 *
 * A preset is injected at runtime as a plain `<style>` appended to `<head>`
 * (`theme-configurator.tsx`), after `packages/ui/src/styles/globals.css`, and
 * never passes through Tailwind. `:root` and `.dark` have equal specificity,
 * so the winner is decided by source order alone:
 *
 * - light: globals `:root`, then the preset's `:root`
 * - dark:  globals `:root` + `.dark`, then the preset's `:root` + `.dark`
 *
 * Anything a preset omits (the status colours, usually) falls back to
 * globals, which is exactly why the preset must be measured merged and never
 * on its own.
 */

import {
	contrastRatio,
	hueDistance,
	parseColour,
	readTopLevelBlocks,
	type CssBlock,
	type Oklch,
} from "./theme-colour";

export type ThemeMode = "light" | "dark";

/** One measured rule. `pass` is decided here so a report and a test agree. */
export interface ContractCheck {
	label: string;
	measured: number | null;
	threshold: number;
	pass: boolean;
	/** Why the check could not be measured, when `measured` is null. */
	problem?: string;
}

/** Custom properties in effect for one mode, after the cascade. */
export type ResolvedTokens = Map<string, string>;

const WHITE = "oklch(1 0 0)";

/** Tokens every preset must set itself in both its light and dark blocks. */
export const REQUIRED_OWN_TOKENS = [
	"background",
	"foreground",
	"card",
	"primary",
	"muted-foreground",
] as const;

/** `[text, surface, minimum ratio]`. A text of `#white` is literal white. */
const CONTRAST_PAIRS: readonly [string, string, number][] = [
	["foreground", "background", 4.5],
	["card-foreground", "card", 4.5],
	["popover-foreground", "popover", 4.5],
	["muted-foreground", "background", 4.5],
	["muted-foreground", "card", 4.5],
	["muted-foreground", "muted", 4.5],
	["primary-foreground", "primary", 4.5],
	["secondary-foreground", "secondary", 4.5],
	["accent-foreground", "accent", 4.5],
	// shadcn quirk: `--destructive-foreground` equals `--destructive` in
	// globals, so a solid destructive button paints `text-white` instead.
	["#white", "destructive", 4.5],
	["success-foreground", "success", 4.5],
	["info-foreground", "info", 4.5],
	["warning-foreground", "warning", 4.5],
	["warning-text", "background", 4.5],
	["warning-text", "card", 4.5],
	// Status colours used directly as icon / large-text colour.
	["success", "background", 3],
	["info", "background", 3],
	["destructive", "background", 3],
];

const STATUS_TOKENS = ["success", "warning", "destructive", "info"] as const;
const STATUS_HUE_MIN = 25;
const COMMAND_VS_PRIMARY_HUE_MIN = 30;
const NEUTRAL_PRIMARY_CHROMA = 0.05;

function blocksFor(blocks: CssBlock[], selectors: string[]): CssBlock[] {
	return blocks.filter((block) =>
		block.selectors.some((selector) => selectors.includes(selector)),
	);
}

function merge(target: ResolvedTokens, blocks: CssBlock[]) {
	for (const block of blocks) {
		for (const [name, value] of block.properties) target.set(name, value);
	}
}

/** Selectors that apply in a mode. Source order within a file is preserved. */
function modeSelectors(mode: ThemeMode): string[] {
	return mode === "light" ? [":root"] : [":root", ".dark"];
}

/** The tokens in effect for `mode` when `presetCss` is applied over `globalsCss`. */
export function resolveTokens(
	globalsCss: string,
	presetCss: string | null,
	mode: ThemeMode,
): ResolvedTokens {
	const tokens: ResolvedTokens = new Map();
	merge(
		tokens,
		blocksFor(readTopLevelBlocks(globalsCss), modeSelectors(mode)),
	);
	if (presetCss !== null) {
		merge(
			tokens,
			blocksFor(readTopLevelBlocks(presetCss), modeSelectors(mode)),
		);
	}
	return tokens;
}

/**
 * Resolves a token to a colour. A `var()` reference is followed one level;
 * anything still not a literal (a second `var()`, `color-mix()`, a keyword)
 * is reported instead of guessed.
 */
export function resolveColour(
	tokens: ResolvedTokens,
	name: string,
): { colour: Oklch } | { problem: string } {
	if (name === "#white") return { colour: parseColour(WHITE)! };

	const raw = tokens.get(`--${name}`);
	if (raw === undefined) return { problem: `--${name} is not defined` };

	let value = raw;
	const reference = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(raw);
	if (reference) {
		const target = tokens.get(reference[1]!) ?? reference[2];
		if (target === undefined) {
			return { problem: `--${name}: ${raw} names an undefined property` };
		}
		value = target.trim();
	}

	const colour = parseColour(value);
	if (!colour) {
		return {
			problem: `--${name}: cannot evaluate "${raw}" (only oklch(), hex and rgb() literals, or one var() to one, are measured)`,
		};
	}
	if (colour.alpha < 1) {
		return {
			problem: `--${name}: "${raw}" is translucent, so its contrast depends on what it is painted over`,
		};
	}
	return { colour };
}

const displayName = (token: string) => (token === "#white" ? "white" : token);

/** Every colour rule of the contract for one preset in one mode. */
export function evaluateMode(tokens: ResolvedTokens): ContractCheck[] {
	const checks: ContractCheck[] = [];

	const measure = (
		label: string,
		threshold: number,
		names: string[],
		compute: (...colours: Oklch[]) => number,
		pass: (value: number) => boolean,
	) => {
		const colours: Oklch[] = [];
		for (const name of names) {
			const resolved = resolveColour(tokens, name);
			if ("problem" in resolved) {
				checks.push({
					label,
					measured: null,
					threshold,
					pass: false,
					problem: resolved.problem,
				});
				return;
			}
			colours.push(resolved.colour);
		}
		const measured = compute(...colours);
		checks.push({ label, measured, threshold, pass: pass(measured) });
	};

	for (const [text, surface, minimum] of CONTRAST_PAIRS) {
		measure(
			`contrast ${displayName(text)} on ${surface}`,
			minimum,
			[text, surface],
			(a, b) => contrastRatio(a!, b!),
			(ratio) => ratio >= minimum,
		);
	}

	for (let i = 0; i < STATUS_TOKENS.length; i += 1) {
		for (let j = i + 1; j < STATUS_TOKENS.length; j += 1) {
			const one = STATUS_TOKENS[i]!;
			const two = STATUS_TOKENS[j]!;
			measure(
				`hue distance ${one} / ${two}`,
				STATUS_HUE_MIN,
				[one, two],
				(a, b) => hueDistance(a!.h, b!.h),
				(distance) => distance >= STATUS_HUE_MIN,
			);
		}
	}

	// The amber command affordance must not read as the primary action. A
	// neutral primary carries no hue to collide with.
	const primary = resolveColour(tokens, "primary");
	if ("colour" in primary && primary.colour.c < NEUTRAL_PRIMARY_CHROMA) {
		checks.push({
			label: "hue distance warning / primary (primary is neutral)",
			measured: primary.colour.c,
			threshold: NEUTRAL_PRIMARY_CHROMA,
			pass: true,
		});
	} else {
		measure(
			"hue distance warning / primary",
			COMMAND_VS_PRIMARY_HUE_MIN,
			["warning", "primary"],
			(a, b) => hueDistance(a!.h, b!.h),
			(distance) => distance >= COMMAND_VS_PRIMARY_HUE_MIN,
		);
	}

	return checks;
}

/** Structural rules: the preset owns both modes, and its light mode is not stock. */
export function evaluateStructure(
	globalsCss: string,
	presetCss: string,
): string[] {
	const failures: string[] = [];
	const blocks = readTopLevelBlocks(presetCss);

	for (const selector of [":root", ".dark"]) {
		const own = new Map<string, string>();
		merge(own, blocksFor(blocks, [selector]));
		const missing = REQUIRED_OWN_TOKENS.filter(
			(token) => !own.has(`--${token}`),
		);
		if (missing.length > 0) {
			failures.push(
				`${selector} block is missing ${missing.map((t) => `--${t}`).join(", ")}`,
			);
		}
	}

	const stock = resolveTokens(globalsCss, null, "light");
	const themed = resolveTokens(globalsCss, presetCss, "light");
	const differs = (["background", "primary"] as const).some((token) => {
		const a = resolveColour(stock, token);
		const b = resolveColour(themed, token);
		if (!("colour" in a) || !("colour" in b)) return true;
		const ha = (a.colour.h * Math.PI) / 180;
		const hb = (b.colour.h * Math.PI) / 180;
		// Euclidean distance in OKLab.
		const distance = Math.hypot(
			a.colour.l - b.colour.l,
			a.colour.c * Math.cos(ha) - b.colour.c * Math.cos(hb),
			a.colour.c * Math.sin(ha) - b.colour.c * Math.sin(hb),
		);
		return distance > 0.005;
	});
	if (!differs) {
		failures.push(
			"light mode background and primary are the stock globals.css values (light mode is unthemed)",
		);
	}

	return failures;
}

/** Formats a failed check for a test message. */
export function describeFailure(
	preset: string,
	mode: ThemeMode,
	check: ContractCheck,
): string {
	if (check.measured === null) {
		return `${preset} [${mode}] ${check.label}: ${check.problem}`;
	}
	const unit = check.label.startsWith("contrast") ? ":1" : "°";
	return `${preset} [${mode}] ${check.label}: measured ${check.measured.toFixed(2)}${unit}, needs >= ${check.threshold}${unit}`;
}
