/**
 * The 3D viewers' clear colour, from the `--scene-background` theme token.
 *
 * Kept free of React and Three.js so the colour arithmetic is unit-tested on
 * its own. Inputs are what `useThemeColors` returns: `#rrggbb` when opaque,
 * `rgba(r, g, b, a)` otherwise, `""` when unset or before the DOM is read.
 */

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgba | null {
	const v = value.trim();
	const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
	if (hex) {
		return {
			r: parseInt(hex[1]!, 16),
			g: parseInt(hex[2]!, 16),
			b: parseInt(hex[3]!, 16),
			a: 1,
		};
	}
	const rgba =
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
			v,
		);
	if (rgba) {
		return {
			r: Number(rgba[1]),
			g: Number(rgba[2]),
			b: Number(rgba[3]),
			a: rgba[4] === undefined ? 1 : Number(rgba[4]),
		};
	}
	return null;
}

function hex2(n: number): string {
	return Math.round(Math.min(255, Math.max(0, n)))
		.toString(16)
		.padStart(2, "0");
}

/**
 * The opaque colour a 3D viewer should clear to, or `null` to leave the
 * canvas transparent (the panel shows through, which is the default).
 *
 * Three.js ignores alpha, so a translucent token handed over as-is would
 * paint its full-strength colour, and a transparent one black. Instead:
 * fully transparent (or unset, or unreadable) is `null`; opaque is returned
 * as is; translucent is mixed over `base` (the panel background), or `null`
 * when `base` is not an opaque colour to mix over.
 *
 * @param background - Resolved `--scene-background`.
 * @param base - Resolved `--panel-background`.
 * @returns `#rrggbb`, or `null` for a transparent canvas.
 */
export function sceneClearColor(
	background: string,
	base: string,
): string | null {
	const bg = parseColor(background);
	if (!bg || bg.a <= 0) return null;
	if (bg.a >= 1) return `#${hex2(bg.r)}${hex2(bg.g)}${hex2(bg.b)}`;
	const under = parseColor(base);
	if (!under || under.a < 1) return null;
	const mix = (top: number, bottom: number) =>
		top * bg.a + bottom * (1 - bg.a);
	return `#${hex2(mix(bg.r, under.r))}${hex2(mix(bg.g, under.g))}${hex2(mix(bg.b, under.b))}`;
}
