/**
 * Pure geometry for the sliding active indicator of a segmented control
 * (`TabsList`, a single-select `ToggleGroup`).
 *
 * The indicator is one absolutely positioned element inside the list, placed
 * over the active item in the list's own untransformed pixels, so a list
 * inside an overlay that is still scaling in (`motion-pop`) does not put the
 * indicator a few pixels off once the overlay settles.
 *
 * DOM-free: the hook in `hooks/use-sliding-indicator.ts` feeds it plain numbers.
 */

/** What the indicator is placed from: the list and the active item, measured. */
export type IndicatorMeasure = {
	/** The list's `getBoundingClientRect()` left and top, and its width. */
	listRect: { left: number; top: number; width: number };
	/** The list's untransformed width, to recover its scale. */
	listOffsetWidth: number;
	/** The list's left and top border widths. */
	listClientLeft: number;
	listClientTop: number;
	/** The item's `getBoundingClientRect()`. */
	itemRect: { left: number; top: number; width: number; height: number };
	/** The item's untransformed width and height (computed, fractional). */
	itemOffsetWidth: number;
	itemOffsetHeight: number;
	/** The item's own `translate`, in px (a pressed offset). */
	itemTranslateX: number;
	itemTranslateY: number;
};

/** Where the indicator sits, relative to the list's padding edge. */
export type IndicatorGeometry = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * The active item's box relative to the list's padding edge, in the list's
 * own (untransformed) pixels.
 *
 * Measured from client rects and computed sizes, not `offset*`, because
 * offsets are rounded to whole pixels and a trigger centred on a half pixel
 * would put the indicator half a pixel off it. Client rects include transforms, so each one
 * is undone: the list's scale (an overlay still scaling in with `motion-pop`)
 * is divided out, and the item is placed by its centre, which its own press
 * scale does not move, less its own translate (the indicator copies that
 * separately). The size is the item's untransformed layout size.
 *
 * `null` when the item or the list has no size (hidden, `display: none`, a
 * closed overlay): there is nothing honest to cover, and the item then keeps
 * painting its own active look.
 *
 * @param m - The list and item measurements.
 * @returns The indicator's geometry, or `null` when it cannot be placed.
 */
export function indicatorGeometry(
	m: IndicatorMeasure,
): IndicatorGeometry | null {
	if (!(m.itemOffsetWidth > 0) || !(m.itemOffsetHeight > 0)) return null;
	if (!(m.listOffsetWidth > 0) || !(m.listRect.width > 0)) return null;
	const scale = m.listRect.width / m.listOffsetWidth;
	const centreX =
		(m.itemRect.left + m.itemRect.width / 2 - m.listRect.left) / scale -
		m.listClientLeft -
		m.itemTranslateX;
	const centreY =
		(m.itemRect.top + m.itemRect.height / 2 - m.listRect.top) / scale -
		m.listClientTop -
		m.itemTranslateY;
	const round = (n: number) => Math.round(n * 100) / 100;
	const x = round(centreX - m.itemOffsetWidth / 2);
	const y = round(centreY - m.itemOffsetHeight / 2);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	return { x, y, width: m.itemOffsetWidth, height: m.itemOffsetHeight };
}

/**
 * Parse a computed `translate` (`"none"`, `"2px"`, `"2px 3px"`) to px.
 *
 * @param value - The computed `translate` of an element.
 * @returns `[x, y]` in px; `[0, 0]` for `none` or anything unreadable.
 */
export function parseTranslate(
	value: string | null | undefined,
): [number, number] {
	const parts = (value ?? "").trim().split(/\s+/u);
	const px = (part: string | undefined) => {
		const match = /^(-?\d*\.?\d+)px$/u.exec(part ?? "");
		return match ? Number(match[1]) : 0;
	};
	if (parts[0] === "none" || parts[0] === "") return [0, 0];
	return [px(parts[0]), px(parts[1])];
}

/**
 * Whether moving the indicator should animate.
 *
 * It slides only when the active item changed from one placed item to
 * another: the operator picked something. A first placement, a list that
 * resized, fonts that loaded, a theme switch all snap, since sliding there
 * would show motion nobody caused.
 *
 * @param previous - The item the indicator covered, or `null` if none.
 * @param next - The item it is about to cover, or `null` if none.
 * @param placed - Whether the indicator is currently visible.
 * @returns `true` to transition, `false` to snap.
 */
export function shouldSlide<T>(
	previous: T | null,
	next: T | null,
	placed: boolean,
): boolean {
	return placed && previous !== null && next !== null && previous !== next;
}

/**
 * The CSS `transform` placing the indicator at `geometry`. Width and height
 * are set as lengths rather than folded into a `scale()`: a scaled box
 * stretches its radius and the preset's shadow (a hard brutalist offset, a
 * clay inset), which is the look the indicator exists to carry.
 *
 * @param geometry - The indicator's placement.
 * @returns The `transform` value.
 */
export function indicatorTransform(geometry: IndicatorGeometry): string {
	return `translate(${geometry.x}px, ${geometry.y}px)`;
}
