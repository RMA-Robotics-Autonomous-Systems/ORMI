import { describe, expect, it } from "bun:test";

import { atMost, containerSizeOf } from "./responsive";

describe("containerSizeOf", () => {
	it("buckets widths at 360 / 560 / 900 px", () => {
		expect(containerSizeOf(280)).toBe("xs");
		expect(containerSizeOf(359)).toBe("xs");
		expect(containerSizeOf(360)).toBe("sm");
		expect(containerSizeOf(630)).toBe("md");
		expect(containerSizeOf(900)).toBe("lg");
	});

	it("treats an unmeasured box as md (no layout flash to the smallest)", () => {
		expect(containerSizeOf(0)).toBe("md");
	});

	it("atMost compares sizes", () => {
		expect(atMost("sm", "xs")).toBe(true);
		expect(atMost("sm", "md")).toBe(false);
	});
});
