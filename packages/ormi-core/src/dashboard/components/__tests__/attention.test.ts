/**
 * Tests for the dashboard's next-step cue (attention.ts).
 *
 * The class string is pinned for its two halves: the static one (ring, full
 * opacity) is the signal a reduced-motion console still sees, and the motion
 * one must stay `motion-safe:` gated. The save predicate is pinned for when
 * it stays quiet as much as for when it fires: only the next step is cued.
 */

import { describe, test, expect } from "bun:test";

import { ATTENTION_CLASS, shouldSaveCallAttention } from "../attention";

describe("ATTENTION_CLASS", () => {
	const classes = ATTENTION_CLASS.split(/\s+/);

	test("carries a static half that survives reduced motion", () => {
		expect(classes).toContain("opacity-100");
		expect(classes).toContain("ring-2");
		expect(classes.some((c) => c.startsWith("ring-primary"))).toBe(true);
	});

	test("every animation is motion-safe gated", () => {
		const animated = classes.filter((c) => c.includes("animate-"));
		expect(animated.length).toBeGreaterThan(0);
		for (const c of animated)
			expect(c.startsWith("motion-safe:")).toBe(true);
	});

	test("plays the shared keyframes, never a generic pulse", () => {
		expect(ATTENTION_CLASS).toContain("pulse-bg");
		expect(ATTENTION_CLASS).toContain("pulse-scale");
		expect(classes).not.toContain("animate-pulse");
	});
});

describe("shouldSaveCallAttention", () => {
	test("cues unsaved changes on a set-up dashboard", () => {
		expect(
			shouldSaveCallAttention({
				hasChanged: true,
				datasourceCount: 1,
				widgetCount: 2,
			}),
		).toBe(true);
	});

	test("stops the moment the changes are saved", () => {
		expect(
			shouldSaveCallAttention({
				hasChanged: false,
				datasourceCount: 1,
				widgetCount: 2,
			}),
		).toBe(false);
	});

	test("leaves the first step to the Datasources button", () => {
		expect(
			shouldSaveCallAttention({
				hasChanged: true,
				datasourceCount: 0,
				widgetCount: 2,
			}),
		).toBe(false);
	});

	test("leaves an empty dashboard to the launcher", () => {
		expect(
			shouldSaveCallAttention({
				hasChanged: true,
				datasourceCount: 1,
				widgetCount: 0,
			}),
		).toBe(false);
	});
});
