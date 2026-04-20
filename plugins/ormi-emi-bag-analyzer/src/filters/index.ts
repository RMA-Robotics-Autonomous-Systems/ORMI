import type { TimeSeriesPoint } from "../bag-reader/bag-types";
import type { FilterConfig } from "./filter-types";
import { applyLowpass } from "./lowpass";
import { applyKalman } from "./kalman";
import { applyDezerolizer } from "./dezerolizer";

/**
 * Applies the selected filter to a series of time-series points.
 * Returns a new array; the original is never mutated.
 */
export function applyFilter(
	points: TimeSeriesPoint[],
	config: FilterConfig,
): TimeSeriesPoint[] {
	if (points.length === 0 || config.kind === "none") return points;

	const values = points.map((p) => p.value);
	let filtered: number[];

	switch (config.kind) {
		case "lowpass":
			filtered = applyLowpass(values, config.lowpassAlpha);
			break;
		case "kalman":
			filtered = applyKalman(values, {
				processNoise: config.kalmanProcessNoise,
				measurementNoise: config.kalmanMeasurementNoise,
				initialCovariance: config.kalmanInitialCovariance,
			});
			break;
		case "dezerolizer":
			filtered = applyDezerolizer(values, config.dezeroliserDecay);
			break;
		default:
			return points;
	}

	return points.map((p, i) => ({
		timestamp: p.timestamp,
		value: filtered[i] ?? p.value,
	}));
}
