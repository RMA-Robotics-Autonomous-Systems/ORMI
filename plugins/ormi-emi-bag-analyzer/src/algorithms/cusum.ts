import type { TimeSeriesPoint } from "../bag-reader/bag-types";
import type {
	CUSUMConfig,
	DetectionConfig,
	DetectionRunResult,
} from "./detection-types";
import { applyPreprocessFilter } from "./preprocess";

/**
 * CUSUM (Cumulative Sum) rising-edge detector with a rolling MAD baseline.
 *
 * Uses a sliding window to robustly estimate the baseline median (μ) and
 * noise level (σ via MAD), then accumulates the normalized deviation:
 *
 *   S(t) = max(0, S(t-1) + (x(t) - μ - κ))
 *   detect if S(t) > h
 *
 * where κ = slackFactor × σ  (allowance for normal drift)
 *       h  = threshold × σ   (decision boundary)
 *
 * Advantages over window-median MAD:
 * - Reacts to the slope of the rising edge from the first deviant sample
 * - Near-zero detection lag (~1-2 samples vs ~0.5s for MAD)
 * - O(N log N) for baseline update only, O(1) for accumulator step
 *
 * All parameters are causal — no lookahead. Safe for real-time deployment.
 */
export function runCUSUM(
	points: TimeSeriesPoint[],
	config: CUSUMConfig,
	detectionConfig: DetectionConfig,
): DetectionRunResult {
	const filteredPoints = applyPreprocessFilter(points, detectionConfig);

	const baseline: number[] = [];
	let accumulator = 0;

	const detectedTimestamps: number[] = [];
	const thresholdSeries: TimeSeriesPoint[] = [];
	const deviationSeries: TimeSeriesPoint[] = [];

	let samplesProcessed = 0;
	let cooldownRemaining = 0;

	for (const pt of filteredPoints) {
		samplesProcessed++;

		if (cooldownRemaining > 0) cooldownRemaining--;
		const inCooldown = cooldownRemaining > 0;

		// Reset accumulator while cooling down so S doesn't carry over
		if (inCooldown) accumulator = 0;

		// Baseline frozen during cooldown
		if (!inCooldown) {
			baseline.push(pt.value);
			if (baseline.length > config.baselineSize) baseline.shift();
		}

		if (samplesProcessed < config.minSamples) continue;

		// Robust baseline stats
		const baselineSorted = baseline.slice().sort((a, b) => a - b);
		const mu = baselineSorted[Math.floor(baselineSorted.length / 2)]!;
		const absDev = baselineSorted
			.map((v) => Math.abs(v - mu))
			.sort((a, b) => a - b);
		const rawMAD = absDev[Math.floor(absDev.length / 2)]!;
		const sigma = Math.max(rawMAD, config.minMAD);

		const kappa = config.slackFactor * sigma;
		const h = config.threshold * sigma;

		// CUSUM accumulation — rising edge only
		accumulator = Math.max(0, accumulator + (pt.value - mu - kappa));

		thresholdSeries.push({ timestamp: pt.timestamp, value: h });
		deviationSeries.push({ timestamp: pt.timestamp, value: accumulator });

		if (!inCooldown && accumulator > h) {
			detectedTimestamps.push(pt.timestamp);
			cooldownRemaining = config.cooldownSamples;
			accumulator = 0;
		}
	}

	return {
		detectedTimestamps,
		thresholdSeries,
		deviationSeries,
		filteredSeries: filteredPoints,
	};
}
