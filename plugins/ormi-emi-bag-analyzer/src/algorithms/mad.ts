import type { TimeSeriesPoint } from "../bag-reader/bag-types";
import type {
	DetectionConfig,
	DetectionRunResult,
	MADConfig,
} from "./detection-types";
import { applyPreprocessFilter } from "./preprocess";

/**
 * Port of `MADAdapter` from emibagprocessing/algorithms/adapters.py.
 *
 * Uses a rolling baseline window to compute the Median Absolute Deviation
 * and triggers a detection when the current detection window median deviates
 * more than `threshold * MAD` from the baseline median.
 */
export function runMAD(
	points: TimeSeriesPoint[],
	config: MADConfig,
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
		// Detection window always updates (we need to see the current signal)
		detection.push(pt.value);
		if (detection.length > config.detectionSize) detection.shift();

		if (cooldownRemaining > 0) cooldownRemaining--;
		const inCooldown = cooldownRemaining > 0;

		// Baseline frozen during cooldown — prevents event from contaminating
		// its own reference and corrupting the next detection
		if (!inCooldown) {
			baseline.push(pt.value);
			if (baseline.length > config.baselineSize) baseline.shift();
		}

		if (baseline.length < config.minSamples) continue;

		const baselineSorted = baseline.slice().sort((a, b) => a - b);
		const median = baselineSorted[Math.floor(baselineSorted.length / 2)]!;
		const absDev = baselineSorted
			.map((v) => Math.abs(v - median))
			.sort((a, b) => a - b);
		const mad = absDev[Math.floor(absDev.length / 2)]!;
		const effectiveMAD = Math.max(mad, config.minMAD);
		const threshold = config.threshold * effectiveMAD;

		const detSorted = detection.slice().sort((a, b) => a - b);
		const pctIdx = Math.min(
			Math.floor(detSorted.length * config.detectionPercentile),
			detSorted.length - 1,
		);
		const current = detSorted[pctIdx]!;
		// Rising-edge only: signed deviation (ignores post-event undershoot)
		const deviation = current - median;
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
