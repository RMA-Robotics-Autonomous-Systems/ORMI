import { describe, expect, it } from "bun:test";

import {
	formatDistance,
	formatResolution,
	resolveScaleBar,
} from "../map-scale";

/**
 * Metres per CSS pixel at a given zoom and latitude, on MapLibre's 512-pixel
 * world. Recomputed here rather than imported: the production path measures a
 * live map through `unproject`, so this is an independent check that the
 * rounding behaves across the range those zooms actually produce.
 *
 * @param zoom - MapLibre zoom level.
 * @param latitude - Latitude in degrees.
 * @returns Ground metres per CSS pixel.
 */
function metersPerPixel(zoom: number, latitude: number): number {
	return (
		(40075016.686 * Math.cos((latitude * Math.PI) / 180)) /
		(512 * 2 ** zoom)
	);
}

describe("resolveScaleBar", () => {
	it("never exceeds the pixel budget", () => {
		for (let zoom = 1; zoom <= 24; zoom += 0.25) {
			const bar = resolveScaleBar(metersPerPixel(zoom, 50.8), 110);
			expect(bar).toBeDefined();
			expect(bar!.widthPx).toBeLessThanOrEqual(110);
			expect(bar!.widthPx).toBeGreaterThan(0);
		}
	});

	it("keeps the bar within a factor of two of the budget", () => {
		// The 1/2/3/5 ladder guarantees it; a bar that collapsed to a sliver
		// at some zooms would be unreadable exactly where it is needed.
		for (let zoom = 1; zoom <= 24; zoom += 0.25) {
			const bar = resolveScaleBar(metersPerPixel(zoom, 50.8), 110);
			expect(bar!.widthPx).toBeGreaterThan(110 / 2.5);
		}
	});

	it("reports the exact distance the drawn width spans", () => {
		const mpp = metersPerPixel(19, 50.8);
		const bar = resolveScaleBar(mpp, 110)!;
		expect(bar.widthPx * mpp).toBeCloseTo(bar.meters, 6);
	});

	it("rounds down, never up", () => {
		// 100 px at 0.0199 m/px is 1.99 m of budget: the honest bar is 1 m,
		// not the 2 m a round-to-nearest would report.
		const bar = resolveScaleBar(0.0199, 100)!;
		expect(bar.meters).toBe(1);
		expect(bar.label).toBe("1 m");
	});

	it("goes below a metre, which MapLibre's own control cannot", () => {
		// ~3 mm/px is zoom 24 at 50°N. A control that floors at 1 m would
		// report "1 m" for a bar spanning a third of that.
		const bar = resolveScaleBar(metersPerPixel(24, 50.8), 110)!;
		expect(bar.meters).toBeLessThan(1);
		expect(bar.label).toMatch(/cm$/);
	});

	it("refuses inputs it cannot honour", () => {
		// A map that has not laid out yet reports a zero-height container.
		expect(resolveScaleBar(0, 110)).toBeUndefined();
		expect(resolveScaleBar(0.5, 0)).toBeUndefined();
		expect(resolveScaleBar(Number.NaN, 110)).toBeUndefined();
		expect(resolveScaleBar(0.5, Number.POSITIVE_INFINITY)).toBeUndefined();
	});
});

describe("formatDistance", () => {
	it("switches unit with magnitude", () => {
		expect(formatDistance(5000)).toBe("5 km");
		expect(formatDistance(1000)).toBe("1 km");
		expect(formatDistance(500)).toBe("500 m");
		expect(formatDistance(1)).toBe("1 m");
		expect(formatDistance(0.5)).toBe("50 cm");
		expect(formatDistance(0.01)).toBe("1 cm");
		expect(formatDistance(0.003)).toBe("3 mm");
	});

	it("survives the decade arithmetic's floating point", () => {
		// 3 * 10**-1 is 0.30000000000000004; naive rendering says
		// "30.000000000000004 cm".
		expect(formatDistance(3 * 10 ** -1)).toBe("30 cm");
		expect(formatDistance(3 * 10 ** -2)).toBe("3 cm");
	});

	it("names a non-distance rather than printing one", () => {
		expect(formatDistance(0)).toBe("—");
		expect(formatDistance(Number.NaN)).toBe("—");
	});
});

describe("formatResolution", () => {
	it("switches unit with magnitude", () => {
		expect(formatResolution(150)).toBe("150 m/px");
		expect(formatResolution(1)).toBe("1 m/px");
		expect(formatResolution(0.12)).toBe("12 cm/px");
		expect(formatResolution(0.003)).toBe("3 mm/px");
	});

	it("names a non-resolution rather than printing one", () => {
		expect(formatResolution(0)).toBe("—");
		expect(formatResolution(Number.NaN)).toBe("—");
	});
});
