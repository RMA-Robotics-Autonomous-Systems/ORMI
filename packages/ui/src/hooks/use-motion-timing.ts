"use client";

/**
 * The motion tokens as numbers, for motion that is driven from JavaScript
 * rather than CSS (dnd-kit's sortable transition and drop animation).
 *
 * The tokens are `calc()`s of `--motion-duration` (globals.css), and an
 * unregistered custom property's computed value is the unevaluated token
 * text, so reading the variable directly would hand back
 * `calc(120ms * 1.5)`. The value is therefore resolved through a probe
 * element's `transition-duration`, which the browser evaluates to seconds.
 * That also applies everything that shapes the token at runtime: a preset,
 * and the reduced-motion rule that forces every step to 0ms.
 *
 * Re-read on a theme change (light/dark or a preset, `subscribeThemeChange`)
 * and when the reduced-motion preference flips.
 */

import { useSyncExternalStore } from "react";

import { subscribeThemeChange } from "@workspace/ui/hooks/use-theme-colors";

/** A duration step of the motion contract. */
export type MotionStep = "fast" | "base" | "layout" | "exit";

/** A resolved step: milliseconds and a CSS easing function. */
export type MotionTiming = {
	/** Milliseconds; 0 under reduced motion or a motionless preset. */
	duration: number;
	/** A CSS `<easing-function>` (`--motion-ease`). */
	easing: string;
};

/** What the hook serves before the DOM may be read: no motion. */
const NO_MOTION: MotionTiming = { duration: 0, easing: "linear" };

/**
 * Parse a computed CSS `<time>` list (`"0.18s"`, `"180ms"`, `"0.18s, 0s"`)
 * to milliseconds, from its first entry. Anything unreadable is 0: a value
 * that cannot be read must not animate.
 *
 * @param value - A computed `transition-duration`.
 * @returns Milliseconds, never negative.
 */
export function parseCssTimeMs(value: string | null | undefined): number {
	const first = (value ?? "").split(",")[0]?.trim() ?? "";
	const match = /^(-?\d*\.?\d+)(ms|s)$/u.exec(first);
	if (!match) return 0;
	const amount = Number(match[1]);
	const ms = match[2] === "s" ? amount * 1000 : amount;
	return Number.isFinite(ms) && ms > 0 ? Math.round(ms * 1000) / 1000 : 0;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Last resolved timing per step, with the generation it was read at. */
const cache = new Map<
	MotionStep,
	{ generation: number; timing: MotionTiming }
>();
let generation = 0;

function read(step: MotionStep): MotionTiming {
	if (typeof document === "undefined" || !document.body) return NO_MOTION;
	const cached = cache.get(step);
	if (cached?.generation === generation) return cached.timing;
	const probe = document.createElement("div");
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.transitionDuration = `var(--motion-${step})`;
	probe.style.transitionTimingFunction = "var(--motion-ease)";
	document.body.appendChild(probe);
	const style = getComputedStyle(probe);
	const timing: MotionTiming = {
		duration: parseCssTimeMs(style.transitionDuration),
		easing: style.transitionTimingFunction.split(",")[0]?.trim() || "ease",
	};
	probe.remove();
	const previous = cached?.timing;
	// Keep the identity when nothing changed, so consumers do not re-render.
	const stable =
		previous &&
		previous.duration === timing.duration &&
		previous.easing === timing.easing
			? previous
			: timing;
	cache.set(step, { generation, timing: stable });
	return stable;
}

function subscribe(onChange: () => void): () => void {
	const bump = () => {
		generation += 1;
		onChange();
	};
	const unsubscribeTheme = subscribeThemeChange(bump);
	const media =
		typeof window !== "undefined" && typeof window.matchMedia === "function"
			? window.matchMedia(REDUCED_MOTION)
			: null;
	media?.addEventListener("change", bump);
	return () => {
		unsubscribeTheme();
		media?.removeEventListener("change", bump);
	};
}

/**
 * One motion step as numbers (see the module comment). `{ duration: 0 }`
 * means "do not animate": pass `null` to a library that treats that as off.
 *
 * @param step - The duration step (`--motion-<step>`).
 * @returns The step's duration in ms and `--motion-ease`.
 */
export function useMotionTiming(step: MotionStep): MotionTiming {
	return useSyncExternalStore(
		subscribe,
		() => read(step),
		() => NO_MOTION,
	);
}
