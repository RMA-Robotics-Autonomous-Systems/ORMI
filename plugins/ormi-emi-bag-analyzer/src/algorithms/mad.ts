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

	for (const pt of filteredPoints) {
		baseline.push(pt.value);
		detection.push(pt.value);

		if (baseline.length > config.baselineSize) baseline.shift();
		if (detection.length > config.detectionSize) detection.shift();

		if (baseline.length < config.minSamples) continue;

		const baselineSorted = baseline.slice().sort((a, b) => a - b);
		const median = baselineSorted[Math.floor(baselineSorted.length / 2)]!;
		const absDev = baselineSorted
			.map((v) => Math.abs(v - median))
			.sort((a, b) => a - b);
		const mad = absDev[Math.floor(absDev.length / 2)]!;
		const threshold = config.threshold * mad;

		const detSorted = detection.slice().sort((a, b) => a - b);
		const current = detSorted[Math.floor(detSorted.length / 2)]!;
		const deviation = Math.abs(current - median);
		const detected = threshold > 0 && deviation > threshold;

		thresholdSeries.push({ timestamp: pt.timestamp, value: threshold });
		deviationSeries.push({ timestamp: pt.timestamp, value: deviation });

		if (detected) {
			detectedTimestamps.push(pt.timestamp);
		}
	}

	return {
		detectedTimestamps,
		thresholdSeries,
		deviationSeries,
		filteredSeries: filteredPoints,
	};
}
