import type { TimeSeriesPoint } from "../bag-reader/bag-types";
import type {
	DetectionConfig,
	DetectionRunResult,
	RSDConfig,
} from "./detection-types";
import { applyPreprocessFilter } from "./preprocess";

/**
 * Port of `RSDAdapter` from emibagprocessing/algorithms/adapters.py.
 *
 * Uses rolling mean / std and triggers when the current detection window mean
 * deviates more than `threshold * std` from the baseline mean.
 */
export function runRSD(
	points: TimeSeriesPoint[],
	config: RSDConfig,
	detectionConfig: DetectionConfig,
): DetectionRunResult {
	const filteredPoints = applyPreprocessFilter(points, detectionConfig);

	const baseline: number[] = [];
	const detection: number[] = [];

	const detectedTimestamps: number[] = [];
	const thresholdSeries: TimeSeriesPoint[] = [];
	const deviationSeries: TimeSeriesPoint[] = [];

	let cooldownRemaining = 0;

	for (const pt of filteredPoints) {
		// Detection window always updates
		detection.push(pt.value);
		if (detection.length > config.detectionSize) detection.shift();

		if (cooldownRemaining > 0) cooldownRemaining--;
		const inCooldown = cooldownRemaining > 0;

		// Baseline frozen during cooldown
		if (!inCooldown) {
			baseline.push(pt.value);
			if (baseline.length > config.baselineSize) baseline.shift();
		}

		if (baseline.length < config.minSamples) continue;

		let sum = 0;
		for (const v of baseline) sum += v;
		const mean = sum / baseline.length;

		let variance = 0;
		for (const v of baseline) variance += (v - mean) ** 2;
		const std = Math.sqrt(variance / baseline.length);
		const effectiveStd = Math.max(std, config.minStd);
		const threshold = config.threshold * effectiveStd;

		let detSum = 0;
		for (const v of detection) detSum += v;
		const current = detSum / detection.length;
		// Rising-edge only: signed deviation
		const deviation = current - mean;
		const detected = !inCooldown && threshold > 0 && deviation > threshold;

		thresholdSeries.push({ timestamp: pt.timestamp, value: threshold });
		deviationSeries.push({ timestamp: pt.timestamp, value: deviation });

		if (detected) {
			detectedTimestamps.push(pt.timestamp);
			cooldownRemaining = config.cooldownSamples;
		}
	}

	return {
		detectedTimestamps,
		thresholdSeries,
		deviationSeries,
		filteredSeries: filteredPoints,
	};
}
