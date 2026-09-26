/**
 * Tab strip indicator: the pure half.
 *
 * When the selected tab of a tabset changes, the active-tab shape (the folder
 * tab cut from the panel) slides from the tab that was selected to the one
 * that now is, instead of one tab going dark and another lighting up. At rest
 * nothing here exists: the selected tab button draws its own folder shape
 * (`.flexlayout__tab_button--selected`, flex-layout-theme.css), so the join to
 * the panel never depends on a measurement. Only for the length of the slide
 * does a stand-in (the tab container's `::before`) draw that shape, parked at
 * the new tab and played from the old one by `transform` alone.
 *
 * `translateX` + `scaleX` from a left origin: the stand-in is laid out once,
 * at the new tab's size, and a narrower or wider old tab is a horizontal
 * scale of it. On a 1px side border that is a sub-pixel change for the few
 * frames it lasts, which is why a scale is acceptable here and not on a
 * panel (panel-motion.ts clips instead).
 *
 * Everything here is pure and unit-tested (`__tests__/tab-indicator.test.ts`);
 * the DOM half is `tab-indicator-motion.ts`.
 */

/** A tab button's box, in its tab container's padding-box coordinates. */
export interface TabRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** How the stand-in is displaced at the start of a slide. */
export interface TabSlide {
	/** `translateX` in px: old tab's left edge minus the new one's. */
	dx: number;
	/** `scaleX`: old tab's width over the new one's. */
	sx: number;
}

/** Sub-pixel differences are measurement noise, not a move. */
const SLIDE_EPSILON = 0.5;

function isUsableRect(rect: TabRect | undefined): rect is TabRect {
	return (
		!!rect &&
		Number.isFinite(rect.x) &&
		Number.isFinite(rect.y) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height) &&
		rect.width > 0 &&
		rect.height > 0
	);
}

/**
 * Plan a slide from the previously selected tab to the newly selected one.
 * @param from - Where the indicator is now (the old tab, or where a running
 * slide has got to).
 * @param to - The newly selected tab.
 * @returns The start displacement, or `undefined` when there is nothing to
 * animate: either rect is missing or empty (a hidden tabset, a tab stretched
 * across the strip), or the two coincide.
 */
export function planTabSlide(
	from: TabRect | undefined,
	to: TabRect | undefined,
): TabSlide | undefined {
	if (!isUsableRect(from) || !isUsableRect(to)) return undefined;
	const dx = from.x - to.x;
	const dw = from.width - to.width;
	if (Math.abs(dx) <= SLIDE_EPSILON && Math.abs(dw) <= SLIDE_EPSILON) {
		return undefined;
	}
	return { dx, sx: from.width / to.width };
}

/**
 * Keyframes for the stand-in: from the old tab's place to its resting place
 * (the new tab), `transform` only.
 * @param slide - The planned displacement.
 * @returns Two keyframes for `Element.animate`.
 */
export function tabSlideKeyframes(slide: TabSlide): Keyframe[] {
	return [
		{ transform: `translateX(${slide.dx}px) scaleX(${slide.sx})` },
		{ transform: "none" },
	];
}

/**
 * Where a running slide has got to, from the stand-in's computed transform,
 * so a second click starts the next slide from what is on screen rather than
 * snapping back to the tab it left.
 * @param to - The rect the running stand-in is parked at.
 * @param transform - Its computed `transform` (`"none"` or a `matrix(...)`).
 * @returns The rect currently drawn, or `to` when the value is unreadable.
 */
export function visualTabRect(to: TabRect, transform: string): TabRect {
	const match = /^matrix\(([^)]*)\)$/.exec(transform.trim());
	if (!match) return to;
	const parts = match[1]!.split(",").map((p) => Number.parseFloat(p));
	if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) {
		return to;
	}
	const [a, , , , e] = parts as [number, number, number, number, number];
	if (a <= 0) return to;
	return { ...to, x: to.x + e, width: to.width * a };
}
