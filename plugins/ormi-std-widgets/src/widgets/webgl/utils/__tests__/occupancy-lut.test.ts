import { describe, test, expect } from "bun:test";
import { buildOccupancyLut, recolorOccupancyRotated } from "../occupancy-lut";

const rgbaAt = (
	buf: Uint8ClampedArray,
	index: number,
): [number, number, number, number] => [
	buf[index * 4]!,
	buf[index * 4 + 1]!,
	buf[index * 4 + 2]!,
	buf[index * 4 + 3]!,
];

describe("buildOccupancyLut", () => {
	test("has one RGBA entry per occupancy byte", () => {
		expect(buildOccupancyLut("costmap", 1, true).length).toBe(256 * 4);
	});

	test("free cell (0): costmap is faint green, grayscale is near-white", () => {
		const costmap = buildOccupancyLut("costmap", 0.85, true);
		expect(rgbaAt(costmap, 0)).toEqual([
			13,
			184,
			38,
			Math.round(0.85 * 0.12 * 255),
		]);

		const grayscale = buildOccupancyLut("grayscale", 0.85, true);
		expect(rgbaAt(grayscale, 0)).toEqual([
			242,
			242,
			242,
			Math.round(0.85 * 0.25 * 255),
		]);
	});

	test("lethal cell (254): costmap gradient endpoint at full baked opacity", () => {
		const lut = buildOccupancyLut("costmap", 0.5, true);
		expect(rgbaAt(lut, 254)).toEqual([230, 13, 13, Math.round(0.5 * 255)]);
	});

	test("lethal cell (254): grayscale gradient endpoint", () => {
		const lut = buildOccupancyLut("grayscale", 1, true);
		expect(rgbaAt(lut, 254)).toEqual([20, 20, 20, 255]);
	});

	test("unknown cell (255): grey when shown, fully transparent when hidden", () => {
		const shown = buildOccupancyLut("costmap", 1, true);
		expect(rgbaAt(shown, 255)).toEqual([
			115,
			115,
			115,
			Math.round(0.45 * 255),
		]);

		const hidden = buildOccupancyLut("costmap", 1, false);
		expect(rgbaAt(hidden, 255)).toEqual([0, 0, 0, 0]);
	});
});

describe("recolorOccupancyRotated", () => {
	// width=3, height=2 grid; the rotated image is 2 wide × 3 tall.
	const width = 3;
	const height = 2;
	const lut = buildOccupancyLut("costmap", 1, true);
	const free = rgbaAt(lut, 0);
	const lethal = rgbaAt(lut, 254);
	const unknown = rgbaAt(lut, 255);

	test("maps grid cell (row, col) to rotated pixel (col, height-1-row)", () => {
		// prettier-ignore
		const src = new Uint8Array([
			254, 0,   255, // row 0
			0,   254, 0,   // row 1
		]);
		const dst = new Uint8ClampedArray(width * height * 4);
		recolorOccupancyRotated(dst, src, width, height, lut);

		const outWidth = height;
		const pixel = (row: number, col: number) =>
			rgbaAt(dst, col * outWidth + (height - 1 - row));

		expect(pixel(0, 0)).toEqual(lethal);
		expect(pixel(0, 1)).toEqual(free);
		expect(pixel(0, 2)).toEqual(unknown);
		expect(pixel(1, 0)).toEqual(free);
		expect(pixel(1, 1)).toEqual(lethal);
		expect(pixel(1, 2)).toEqual(free);
	});

	test("overwrites the buffer fully on reuse", () => {
		const dst = new Uint8ClampedArray(width * height * 4);
		recolorOccupancyRotated(
			dst,
			new Uint8Array([254, 254, 254, 254, 254, 254]),
			width,
			height,
			lut,
		);
		recolorOccupancyRotated(
			dst,
			new Uint8Array([0, 0, 0, 0, 0, 0]),
			width,
			height,
			lut,
		);
		for (let i = 0; i < width * height; i++) {
			expect(rgbaAt(dst, i)).toEqual(free);
		}
	});
});
