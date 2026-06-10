/**
 * Tests for the per-widget error boundary's state derivation.
 *
 * Scope note: the repo has no DOM-based React render harness (no jsdom/happy-dom,
 * and `react-dom/server` rethrows boundary errors rather than recovering). So the
 * full render → fallback → reset flow is verified manually (see the PR notes).
 * These tests cover the boundary's pure, deterministic contract: the static
 * `getDerivedStateFromError` derivation that drives the fallback.
 */

import { describe, test, expect } from "bun:test";
import { WidgetErrorBoundary } from "../widget-error-boundary";

describe("WidgetErrorBoundary - getDerivedStateFromError", () => {
	test("captures the thrown error into boundary state", () => {
		const error = new Error("widget exploded");
		const next = WidgetErrorBoundary.getDerivedStateFromError(error);
		expect(next.error).toBe(error);
	});

	test("preserves the original error message for the fallback", () => {
		const error = new Error("no data yet");
		const next = WidgetErrorBoundary.getDerivedStateFromError(error);
		expect(next.error?.message).toBe("no data yet");
	});
});
