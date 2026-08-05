import { describe, expect, it } from "bun:test";

import { transferablesFor } from "../transferables";

describe("transferablesFor", () => {
	it("returns only the points buffer for a positions-only cloud", () => {
		const points = new Float32Array([0, 1, 2, 3, 4, 5]);
		const result = transferablesFor({ points });

		expect(result).toHaveLength(1);
		expect(result[0]).toBe(points.buffer);
	});

	it("returns points, colors and intensities buffers when present", () => {
		const points = new Float32Array([0, 1, 2]);
		const colors = new Float32Array([1, 1, 1]);
		const intensities = new Float32Array([0.5]);
		const result = transferablesFor({ points, colors, intensities });

		expect(result).toHaveLength(3);
		expect(result).toContain(points.buffer);
		expect(result).toContain(colors.buffer);
		expect(result).toContain(intensities.buffer);
	});

	it("ignores colors/intensities that are not typed arrays", () => {
		const points = new Float32Array([0, 1, 2]);
		const result = transferablesFor({
			points,
			colors: undefined,
			intensities: [1, 2, 3],
		});

		expect(result).toEqual([points.buffer]);
	});

	it("de-duplicates when views share one backing buffer", () => {
		// A single packed buffer viewed as points + colors must be transferred
		// exactly once, never listed twice (a duplicate transferable throws).
		const buffer = new ArrayBuffer(6 * 4);
		const points = new Float32Array(buffer, 0, 3);
		const colors = new Float32Array(buffer, 3 * 4, 3);
		const result = transferablesFor({ points, colors });

		expect(result).toHaveLength(1);
		expect(result[0]).toBe(buffer);
	});

	it("returns the compressed-image bytes buffer", () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const result = transferablesFor({
			__compressedData: bytes,
			__format: "jpeg",
		});

		expect(result).toEqual([bytes.buffer]);
	});

	it("returns the ImageBitmap itself when available", () => {
		if (typeof ImageBitmap === "undefined") {
			// No DOM ImageBitmap in this test runtime — nothing to assert.
			return;
		}
		const bitmap = { close() {} } as unknown as ImageBitmap;
		Object.setPrototypeOf(bitmap, ImageBitmap.prototype);
		const result = transferablesFor(bitmap);

		expect(result).toEqual([bitmap]);
	});

	it("returns an empty list for non-transferable payloads", () => {
		expect(transferablesFor({ foo: "bar" })).toEqual([]);
		expect(transferablesFor(42)).toEqual([]);
		expect(transferablesFor("string")).toEqual([]);
		expect(transferablesFor(null)).toEqual([]);
		expect(transferablesFor(undefined)).toEqual([]);
	});

	it("never returns duplicate buffers", () => {
		const points = new Float32Array([0, 1, 2]);
		const colors = new Float32Array([1, 1, 1]);
		const intensities = new Float32Array([0.5]);
		const result = transferablesFor({ points, colors, intensities });

		expect(new Set(result).size).toBe(result.length);
	});
});
