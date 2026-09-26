"use client";

/**
 * One sliding active indicator for a segmented control: `TabsList` and a
 * single-select `ToggleGroup`.
 *
 * The indicator is an absolutely positioned element inside the list that
 * carries the active item's own look (background, shadow, radius, border,
 * pressed offset) and moves between items over `--motion-base` /
 * `--motion-ease` when the selection changes. Items never move or resize.
 *
 * The look is **copied from the active item's computed style**, not restated
 * as classes on the indicator, so whatever paints an active item today still
 * paints it: a preset's tokens (a brutalist square, a clay inset well), the
 * dark-mode variants, and a caller's own override (the C2 map's Delete tool
 * turns red while on). The item it covers is then marked `data-indicated`,
 * which hides its own background and shadow ({@link INDICATED_ITEM_CLASS});
 * everything else about the item (text colour, focus ring) stays on it.
 *
 * Reading the look: the active item is read with its transitions switched off
 * (`data-indicator-probe`), because the item's own background is mid-fade the
 * moment it becomes active and a computed style read then returns the start
 * of the fade, not the look. An indicated item also drops background, shadow
 * and border from its transition list, so hiding them snaps instead of
 * fading out over the indicator.
 *
 * Everything is written straight to the DOM from observers: no React state,
 * so a selection change re-renders nothing. The look is re-read when the
 * selection, an item's disabled state or the theme changes (light/dark or a
 * preset, through `subscribeThemeChange`); geometry is re-read when the list
 * or an item resizes. Only a selection change slides; everything else snaps.
 *
 * When the active item cannot be measured (hidden, zero-sized) or nothing is
 * active, the indicator hides and the item keeps its own look, so the control
 * degrades to exactly what it was before this existed.
 */

import type * as React from "react";
import { type RefObject, useLayoutEffect } from "react";

import { subscribeThemeChange } from "@workspace/ui/hooks/use-theme-colors";
import {
	indicatorGeometry,
	indicatorTransform,
	parseTranslate,
	shouldSlide,
	type IndicatorGeometry,
} from "@workspace/ui/lib/sliding-indicator";

/**
 * Classes an item needs so the indicator can stand in for its active look.
 * `!important` because a caller's own `data-[state=on]:bg-*` has the same
 * specificity as these and must still yield while the indicator covers it.
 */
export const INDICATED_ITEM_CLASS =
	"data-indicated:bg-transparent! data-indicated:shadow-none! data-indicated:transition-[color,translate,scale,opacity]! data-indicator-probe:transition-none!";

/** {@link INDICATED_ITEM_CLASS} for items whose active border is part of the look. */
export const INDICATED_ITEM_BORDER_CLASS = "data-indicated:border-transparent!";

/**
 * Classes of the indicator element. It is hidden until first placed, and
 * transitions only while `data-animate` is set (a selection change).
 * `-z-1` inside an `isolate` list puts it above the list's own background
 * and below the items.
 */
export const INDICATOR_CLASS =
	"pointer-events-none absolute top-0 left-0 -z-1 hidden border-solid data-placed:block data-animate:transition-[transform,translate,width,height,background-color,box-shadow,border-color,border-radius,opacity] data-animate:duration-(--motion-base) data-animate:ease-(--motion-ease)";

/** Options of {@link useSlidingIndicator}. */
export type SlidingIndicatorOptions = {
	/** The list element: positioned, `isolate`, and the indicator's parent. */
	listRef: RefObject<HTMLElement | null>;
	/** The indicator element, rendered with {@link INDICATOR_CLASS}. */
	indicatorRef: RefObject<HTMLElement | null>;
	/** `data-slot` of the items (`"tabs-trigger"`). */
	itemSlot: string;
	/** `data-state` value of the active item (`"active"`, `"on"`). */
	activeState: string;
	/** Copy the item's border colour and width too (a tab's dark-mode edge). */
	copyBorder?: boolean;
	/** `false` leaves every item painting its own look (a multi-select group). */
	enabled?: boolean;
};

type Look = {
	backgroundColor: string;
	boxShadow: string;
	borderRadius: string;
	translate: string;
	opacity: string;
	borderColor: string;
	borderWidth: string;
};

/**
 * An element's untransformed size. The computed `width` / `height` keep the
 * fractions `offsetWidth` rounds away (every element is `border-box`, so they
 * are the border-box size); `offset*` is the fallback.
 */
function layoutSize(element: HTMLElement, style: CSSStyleDeclaration) {
	const width = Number.parseFloat(style.width);
	const height = Number.parseFloat(style.height);
	return {
		width: Number.isFinite(width) ? width : element.offsetWidth,
		height: Number.isFinite(height) ? height : element.offsetHeight,
	};
}

/** Measure `item` inside `list` for {@link indicatorGeometry}. */
function measure(item: HTMLElement, list: HTMLElement) {
	const listStyle = getComputedStyle(list);
	const itemStyle = getComputedStyle(item);
	const [itemTranslateX, itemTranslateY] = parseTranslate(
		itemStyle.translate,
	);
	const itemSize = layoutSize(item, itemStyle);
	return indicatorGeometry({
		listRect: list.getBoundingClientRect(),
		listOffsetWidth: layoutSize(list, listStyle).width,
		listClientLeft: Number.parseFloat(listStyle.borderLeftWidth) || 0,
		listClientTop: Number.parseFloat(listStyle.borderTopWidth) || 0,
		itemRect: item.getBoundingClientRect(),
		itemOffsetWidth: itemSize.width,
		itemOffsetHeight: itemSize.height,
		itemTranslateX,
		itemTranslateY,
	});
}

/** The item's natural active look, read with its transitions off. */
function readLook(item: HTMLElement): Look {
	item.removeAttribute("data-indicated");
	item.setAttribute("data-indicator-probe", "");
	const style = getComputedStyle(item);
	const look: Look = {
		backgroundColor: style.backgroundColor,
		boxShadow: style.getPropertyValue("--tw-shadow").trim() || "none",
		borderRadius: style.borderRadius,
		translate: style.translate,
		opacity: style.opacity,
		borderColor: style.borderTopColor,
		borderWidth: style.borderTopWidth,
	};
	item.removeAttribute("data-indicator-probe");
	return look;
}

function sameGeometry(
	a: IndicatorGeometry | null,
	b: IndicatorGeometry | null,
): boolean {
	return (
		!!a &&
		!!b &&
		a.x === b.x &&
		a.y === b.y &&
		a.width === b.width &&
		a.height === b.height
	);
}

/**
 * Drive a sliding active indicator (see the module comment).
 *
 * @param options - The list, the indicator and how to find the active item.
 */
export function useSlidingIndicator({
	listRef,
	indicatorRef,
	itemSlot,
	activeState,
	copyBorder = false,
	enabled = true,
}: SlidingIndicatorOptions): void {
	useLayoutEffect(() => {
		const list = listRef.current;
		const indicator = indicatorRef.current;
		if (!enabled || !list || !indicator) return;
		if (
			typeof MutationObserver === "undefined" ||
			typeof ResizeObserver === "undefined"
		) {
			return;
		}
		const listSlot = list.getAttribute("data-slot");

		let current: HTMLElement | null = null;
		let geometry: IndicatorGeometry | null = null;

		const items = (): HTMLElement[] =>
			Array.from(
				list.querySelectorAll<HTMLElement>(`[data-slot="${itemSlot}"]`),
			).filter(
				(item) =>
					!listSlot ||
					item.parentElement?.closest(`[data-slot="${listSlot}"]`) ===
						list,
			);

		const hide = () => {
			current?.removeAttribute("data-indicated");
			current = null;
			geometry = null;
			indicator.removeAttribute("data-placed");
			indicator.removeAttribute("data-animate");
		};

		/**
		 * Place the indicator over the active item. `restyle` re-reads the
		 * look even when the active item is unchanged.
		 */
		const sync = (restyle: boolean) => {
			const next =
				items().find(
					(item) => item.getAttribute("data-state") === activeState,
				) ?? null;
			const nextGeometry = next ? measure(next, list) : null;
			if (!next || !nextGeometry) {
				hide();
				return;
			}
			const changed = next !== current;
			if (!changed && !restyle && sameGeometry(geometry, nextGeometry)) {
				return;
			}
			const slide = shouldSlide(
				current,
				next,
				indicator.hasAttribute("data-placed"),
			);
			if (changed) current?.removeAttribute("data-indicated");

			const look = changed || restyle ? readLook(next) : null;

			indicator.toggleAttribute("data-animate", slide);
			const { style } = indicator;
			style.transform = indicatorTransform(nextGeometry);
			style.width = `${nextGeometry.width}px`;
			style.height = `${nextGeometry.height}px`;
			if (look) {
				style.backgroundColor = look.backgroundColor;
				style.boxShadow = look.boxShadow;
				style.borderRadius = look.borderRadius;
				style.translate = look.translate;
				style.opacity = look.opacity;
				style.borderWidth = copyBorder ? look.borderWidth : "0px";
				style.borderColor = copyBorder
					? look.borderColor
					: "transparent";
			}
			next.setAttribute("data-indicated", "");
			indicator.setAttribute("data-placed", "");
			current = next;
			geometry = nextGeometry;
		};

		const resizes = new ResizeObserver(() => sync(false));
		const observeSizes = () => {
			resizes.disconnect();
			resizes.observe(list);
			for (const item of items()) resizes.observe(item);
		};

		const mutations = new MutationObserver((records) => {
			if (records.some((record) => record.type === "childList")) {
				observeSizes();
			}
			sync(true);
		});
		mutations.observe(list, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["data-state", "data-disabled", "disabled"],
		});

		const unsubscribeTheme = subscribeThemeChange(() => sync(true));

		sync(true);
		observeSizes();

		return () => {
			unsubscribeTheme();
			mutations.disconnect();
			resizes.disconnect();
			hide();
		};
	}, [listRef, indicatorRef, itemSlot, activeState, copyBorder, enabled]);
}

/**
 * Point a caller's `ref` (callback or object, or none) and the component's own
 * at the same node: the list components take a `ref` prop and also need the
 * node themselves.
 *
 * @param node - The mounted node, or `null` on detach.
 * @param refs - Refs to write.
 */
export function assignRefs<T>(
	node: T | null,
	...refs: (React.Ref<T> | undefined)[]
): void {
	for (const ref of refs) {
		if (typeof ref === "function") ref(node);
		else if (ref) (ref as React.RefObject<T | null>).current = node;
	}
}
