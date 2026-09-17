"use client";

import { useEffect, useRef } from "react";

/**
 * Focus an element as soon as it mounts, reliably inside a Radix dialog.
 *
 * The plain `autoFocus` attribute is not enough here. Radix's dialog focuses
 * its own content on open (`onOpenAutoFocus`) *after* children mount, so an
 * `autoFocus` input is focused and then immediately un-focused, and the
 * operator types into nothing. Deferring by one animation frame lets Radix
 * settle first and then takes the focus back, which is the outcome the
 * attribute was meant to express.
 *
 * `preventScroll` matters because these inputs sit at the top of a scrollable
 * pane: without it the browser scrolls the pane to the input, which on a short
 * viewport visibly jumps the list the operator is about to read.
 *
 * The hook re-runs on `enabled`, so a surface that mounts the input while the
 * panel is inactive (a tab that is rendered but not shown) can turn focus on
 * when it becomes the visible one.
 *
 * @param enabled - Whether to take focus. False leaves focus where it is.
 * @returns A ref to attach to the element that should receive focus.
 */
export function useAutoFocus<T extends HTMLElement>(enabled = true) {
	const ref = useRef<T>(null);

	useEffect(() => {
		if (!enabled) return;

		const frame = requestAnimationFrame(() => {
			ref.current?.focus({ preventScroll: true });
		});

		return () => cancelAnimationFrame(frame);
	}, [enabled]);

	return ref;
}
