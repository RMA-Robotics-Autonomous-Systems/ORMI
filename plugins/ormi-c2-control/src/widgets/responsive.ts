"use client";

/**
 * Container-size responsiveness for every C2 widget — ONE approach, used
 * consistently.
 *
 * Every C2 widget lives in a resizable dashboard panel, so the viewport width
 * says nothing about the room a widget has: a 280 px panel on a 4K screen is
 * still 280 px. Widgets therefore measure their own box (ResizeObserver) and
 * pick a layout from a small set of container sizes ({@link containerSizeOf}):
 *
 * | size | width        | typical layout                                   |
 * |------|--------------|--------------------------------------------------|
 * | xs   | < 360 px     | one column, icon-only buttons, secondary text hidden |
 * | sm   | 360–559 px   | one column, labels kept, rows wrap                 |
 * | md   | 560–899 px   | two-column where it helps                          |
 * | lg   | ≥ 900 px     | full layout                                       |
 *
 * Measuring (rather than CSS container queries) because the SVG charts need a
 * number to lay themselves out at their real width — so the SAME measurement
 * drives both the HTML layout choices and the charts, and there is a single
 * source of truth for "how big is this widget".
 *
 * The element is tracked through a CALLBACK ref (the pattern from the EMI panel
 * frame): a widget body often mounts behind a datasource gate, and an effect
 * keyed on a `useRef` object never re-runs when the element finally appears,
 * which would leave the size at its fallback forever.
 */

import { useCallback, useLayoutEffect, useState } from "react";

/** The container-size buckets. */
export type ContainerSize = "xs" | "sm" | "md" | "lg";

/** Lower bounds (px) of each bucket above `xs`. */
export const CONTAINER_BREAKPOINTS = { sm: 360, md: 560, lg: 900 } as const;

/**
 * Bucket a width.
 * @param width - Container width in CSS px (0 = not measured yet → `md`).
 * @returns The container size.
 */
export function containerSizeOf(width: number): ContainerSize {
	if (!(width > 0)) return "md";
	if (width < CONTAINER_BREAKPOINTS.sm) return "xs";
	if (width < CONTAINER_BREAKPOINTS.md) return "sm";
	if (width < CONTAINER_BREAKPOINTS.lg) return "md";
	return "lg";
}

/** A measured container. */
export interface ContainerMeasure {
	/** Content-box width in CSS px (0 until measured). */
	width: number;
	/** Content-box height in CSS px (0 until measured). */
	height: number;
	/** {@link containerSizeOf} of `width`. */
	size: ContainerSize;
}

/**
 * Measure the element a callback ref is attached to.
 *
 * Returned as a tuple rather than an object with a `ref` field: the React lint
 * rules treat any `{ ref }` object as a ref container and flag reading it in
 * render.
 *
 * @returns `[ref, measure]` — attach `ref` to the widget's root element.
 */
export function useContainerSize<
	T extends HTMLElement = HTMLDivElement,
>(): readonly [(el: T | null) => void, ContainerMeasure] {
	const [element, setElement] = useState<T | null>(null);
	const ref = useCallback((el: T | null) => setElement(el), []);
	const [box, setBox] = useState({ width: 0, height: 0 });

	useLayoutEffect(() => {
		if (!element || typeof ResizeObserver === "undefined") return;
		const apply = () => {
			const width = Math.round(element.clientWidth);
			const height = Math.round(element.clientHeight);
			setBox((prev) =>
				prev.width === width && prev.height === height
					? prev
					: { width, height },
			);
		};
		// No synchronous first measure: a ResizeObserver reports every observed
		// element once on `observe()`, before the next paint.
		const observer = new ResizeObserver(apply);
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);

	return [
		ref,
		{
			width: box.width,
			height: box.height,
			size: containerSizeOf(box.width),
		},
	] as const;
}

/**
 * Whether a size is at most another (`atMost("sm", size)` → xs or sm).
 * @param limit - The largest size that qualifies.
 * @param size - The measured size.
 * @returns True when `size` ≤ `limit`.
 */
export function atMost(limit: ContainerSize, size: ContainerSize): boolean {
	const order: ContainerSize[] = ["xs", "sm", "md", "lg"];
	return order.indexOf(size) <= order.indexOf(limit);
}
