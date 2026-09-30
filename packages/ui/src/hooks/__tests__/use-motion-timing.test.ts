import { describe, expect, it } from "bun:test";

import { parseCssTimeMs } from "../use-motion-timing";

describe("parseCssTimeMs", () => {
	it("reads seconds and milliseconds", () => {
		expect(parseCssTimeMs("0.18s")).toBe(180);
		expect(parseCssTimeMs("180ms")).toBe(180);
		expect(parseCssTimeMs(".135s")).toBe(135);
	});

	it("reads the first entry of a list", () => {
		expect(parseCssTimeMs("0.12s, 0s")).toBe(120);
	});

	it("reads zero as no motion", () => {
		expect(parseCssTimeMs("0s")).toBe(0);
		expect(parseCssTimeMs("0ms")).toBe(0);
	});

	it("treats what it cannot read as no motion", () => {
		expect(parseCssTimeMs("")).toBe(0);
		expect(parseCssTimeMs(undefined)).toBe(0);
		expect(parseCssTimeMs("var(--motion-base)")).toBe(0);
		expect(parseCssTimeMs("calc(120ms * 1.5)")).toBe(0);
		expect(parseCssTimeMs("-1s")).toBe(0);
	});
});
