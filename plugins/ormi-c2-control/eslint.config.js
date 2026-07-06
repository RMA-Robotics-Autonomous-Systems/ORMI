import { config } from "@workspace/eslint-config/react-internal";

/**
 * Regex matching raw Tailwind palette literals for status/UI color utilities,
 * e.g. `bg-emerald-500`, `text-amber-600`, `ring-sky-500`. These ignore the app
 * theme tokens and dark mode. C2 widgets must color status/UI through the
 * semantic theme tokens (`success`/`warning`/`info`/`destructive`/`primary`/
 * `muted`/`foreground`) instead. MapLibre `paint`/`layout` hex colors are the
 * only exception (they cannot read CSS variables) and are not matched here.
 */
const PALETTE_LITERAL =
	"(bg|text|border|ring|from|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}";

const noRawPaletteMessage =
	"Use semantic theme tokens (bg-success / text-warning / bg-info / text-destructive / primary / muted / foreground) instead of raw Tailwind palette literals — they ignore the app theme and dark mode. See README 'Status colors'.";

/** @type {import("eslint").Linter.Config[]} */
export default [
	...config,
	{
		files: ["src/**/*.tsx"],
		rules: {
			"no-restricted-syntax": [
				"warn",
				{
					selector: `Literal[value=/${PALETTE_LITERAL}/]`,
					message: noRawPaletteMessage,
				},
				{
					selector: `TemplateElement[value.raw=/${PALETTE_LITERAL}/]`,
					message: noRawPaletteMessage,
				},
			],
		},
	},
];
