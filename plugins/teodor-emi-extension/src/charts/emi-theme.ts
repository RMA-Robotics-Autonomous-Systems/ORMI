"use client";

/**
 * Colours for the EMI panels.
 *
 * Two kinds, kept apart on purpose.
 *
 * **Chrome** — grid, axis, text, surfaces — is read from the app's CSS custom
 * properties, so the panels follow the dashboard's theme rather than declaring
 * their own light and dark palettes.
 *
 * **Meaning** — recorded versus replayed, target, cross-coil agreement — is
 * fixed. Blue means "what the system reported on the day" on every panel and in
 * both themes; if it were a theme variable it would swap places with orange when
 * the user toggled dark mode, and every screenshot in a report would mean
 * something different from every other. These are chosen to hold contrast on
 * both backgrounds.
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/** The palette a panel draws with. */
export interface EmiTheme {
	/** Gridlines. */
	grid: string;
	/** Axis rules. */
	axis: string;
	/** Secondary text. */
	muted: string;
	/** Primary text. */
	text: string;
	/** Panel background, for label plates drawn over the plot. */
	surface: string;
	/** The filtered decision variable — the trace being thresholded. */
	signal: string;
	/** The unfiltered channel, drawn behind it. */
	raw: string;
	/** Arm and release threshold lines. */
	threshold: string;
	/** Fill between arm and release. */
	band: string;
	/** What the robot recorded on the day. Blue, everywhere, always. */
	recorded: string;
	/** What this replay produces. Orange, everywhere, always. */
	replayed: string;
	/** Cross-coil agreement. */
	link: string;
	/** Target centroids. */
	target: string;
	/** Something is wrong with this value. */
	warn: string;
	/** Detections the operator picked out by hand, for export. */
	picked: string;
	/** Font stack for canvas text. */
	font: string;
	/** True when the app is in dark mode. */
	dark: boolean;
}

/** Categorical colours — identical in both themes, by design. */
const MEANING = {
	recorded: "#2a78d6",
	replayed: "#eb6834",
	link: "#15a06f",
	target: "#c2548f",
	warn: "#d4443c",
	// None of the four above. A pick is a decision the operator made, not
	// something the data says, so it must not borrow a meaning that is.
	picked: "#1f9d8f",
} as const;

/** Fallbacks used before the document is available (SSR, first paint). */
const FALLBACK_LIGHT = {
	grid: "#e1e0d9",
	axis: "#c3c2b7",
	muted: "#898781",
	text: "#26251f",
	surface: "#ffffff",
	signal: "#52514e",
	raw: "#b9b7b0",
	threshold: "#6f6d67",
	band: "rgba(11, 11, 11, 0.055)",
} as const;

const FALLBACK_DARK = {
	grid: "#2c2c2a",
	axis: "#383835",
	muted: "#898781",
	text: "#e5e4df",
	surface: "#1a1a19",
	signal: "#c3c2b7",
	raw: "#5c5b56",
	threshold: "#8d8b84",
	band: "rgba(255, 255, 255, 0.06)",
} as const;

/** Read a CSS custom property off an element, or "" when unset. */
function cssVar(el: Element, name: string): string {
	return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * Resolve the palette against an element in the widget's tree.
 *
 * Reading from the element rather than from `document.body` is what lets a
 * panel inside a themed container (a dialog, a preview) pick up that container's
 * variables instead of the page's.
 *
 * @param el - Any element inside the widget; null falls back to the defaults.
 * @param dark - Whether the app is in dark mode, for the fallbacks.
 * @returns The palette.
 */
export function resolveEmiTheme(el: Element | null, dark: boolean): EmiTheme {
	const fb = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
	if (!el || typeof getComputedStyle !== "function") {
		return { ...fb, ...MEANING, font: "sans-serif", dark };
	}
	const pick = (name: string, fallback: string) =>
		cssVar(el, name) || fallback;
	return {
		grid: pick("--border", fb.grid),
		axis: pick("--border", fb.axis),
		muted: pick("--muted-foreground", fb.muted),
		text: pick("--foreground", fb.text),
		surface: pick("--card", fb.surface),
		signal: pick("--foreground", fb.signal),
		// No CSS variable for a recessive trace; derived from the muted tone at
		// low alpha so it recedes in both themes without a second palette.
		raw: fb.raw,
		threshold: pick("--muted-foreground", fb.threshold),
		band: fb.band,
		...MEANING,
		font:
			cssVar(el, "--font-sans") || "system-ui, -apple-system, sans-serif",
		dark,
	};
}

/**
 * The palette, re-resolved when the theme changes or the element appears.
 *
 * Takes the element itself rather than a ref: a panel's body mounts only once
 * its datasource is online, and an effect keyed on a `useRef` object never
 * re-runs at that moment — the panels would draw with the fallback palette
 * forever, which is the whole thing this module exists to avoid. See
 * `useHostElement` in `widgets/emi-panel-frame.tsx`.
 *
 * @param element - An element inside the widget; null until it mounts.
 * @returns The current palette.
 */
export function useEmiTheme(element: HTMLElement | null): EmiTheme {
	const { resolvedTheme } = useTheme();
	const dark = resolvedTheme === "dark";
	const [theme, setTheme] = useState<EmiTheme>(() =>
		resolveEmiTheme(null, dark),
	);

	useEffect(() => {
		setTheme(resolveEmiTheme(element, dark));
	}, [element, dark]);

	return theme;
}
