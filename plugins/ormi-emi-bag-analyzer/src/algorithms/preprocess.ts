import type { TimeSeriesPoint } from "../bag-reader/bag-types";
import type { DetectionConfig } from "./detection-types";
import { applyLowpass } from "../filters/lowpass";
import { applyKalman } from "../filters/kalman";
import { applyDezerolizer } from "../filters/dezerolizer";

/**
 * Applies the detection pre-processing filter to a point series.
 * The filter is configured separately from the display filter so two
 * independent filter settings can coexist on the same page.
 */
export function applyPreprocessFilter(
	points: TimeSeriesPoint[],
	config: DetectionConfig,
): TimeSeriesPoint[] {
	if (points.length === 0 || config.filterType === "none") return points;

	const values = points.map((p) => p.value);
	let filtered: number[];

	switch (config.filterType) {
		case "lowpass":
			filtered = applyLowpass(values, config.filterParams.lowpassAlpha);
			break;
		case "kalman":
			filtered = applyKalman(values, {
				processNoise: config.filterParams.kalmanProcessNoise,
				measurementNoise: config.filterParams.kalmanMeasurementNoise,
			});
			break;
		case "dezerolizer":
			filtered = applyDezerolizer(
				values,
				config.filterParams.dezeroliserDecay,
			);
			break;
		default:
			return points;
	}

	return points.map((p, i) => ({
		timestamp: p.timestamp,
		value: filtered[i] ?? p.value,
	}));
}
