/**
 * Deterministic per-category accent colors for the List view.
 *
 * The Prisma `Category` model has no color field and we do not change the
 * schema. Instead we derive a *stable* color from the category id: the same id
 * always maps to the same palette entry across renders and sessions, so a
 * category's accent bar and badge dot stay consistent.
 *
 * The palette is a small set of theme-friendly OKLCH colors with a fixed
 * lightness/chroma chosen to stay legible in both light and dark mode (the app
 * theme is authored in OKLCH — see `packages/ui/src/styles/globals.css`). The
 * colors are intentionally muted/professional rather than neon.
 */

/**
 * Fixed accent palette. Hues are spread around the wheel; lightness and chroma
 * are held constant so every entry reads as a peer and works on both the light
 * and dark surfaces. Order is part of the contract — changing it remaps
 * existing categories to new colors.
 */
const CATEGORY_PALETTE = [
	"oklch(0.62 0.14 25)", // red
	"oklch(0.66 0.13 60)", // orange
	"oklch(0.7 0.12 95)", // amber
	"oklch(0.64 0.13 145)", // green
	"oklch(0.62 0.11 185)", // teal
	"oklch(0.6 0.12 230)", // blue
	"oklch(0.56 0.14 275)", // indigo
	"oklch(0.58 0.15 310)", // violet
	"oklch(0.62 0.14 345)", // pink
] as const;

/** Neutral, hollow treatment for the "Uncategorized" group. */
const UNCATEGORIZED_COLOR = "var(--muted-foreground)";

/**
 * Stable string hash (FNV-1a). Pure and deterministic — same input always
 * yields the same 32-bit unsigned integer.
 */
function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * Resolve the accent color for a category id. `null`/`undefined` (uncategorized)
 * returns the neutral color; any real id hashes into the fixed palette.
 */
export function getCategoryColor(
	categoryId: number | null | undefined,
): string {
	if (categoryId == null) return UNCATEGORIZED_COLOR;
	const index = hashString(String(categoryId)) % CATEGORY_PALETTE.length;
	return CATEGORY_PALETTE[index] as string;
}

/** Whether the category id is the neutral "Uncategorized" bucket. */
export function isUncategorized(
	categoryId: number | null | undefined,
): boolean {
	return categoryId == null;
}
