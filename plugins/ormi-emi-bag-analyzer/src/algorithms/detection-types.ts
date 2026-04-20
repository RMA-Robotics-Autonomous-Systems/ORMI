import type { TimeSeriesPoint } from "../bag-reader/bag-types";

export type DetectionFilterType = "none" | "lowpass" | "kalman" | "dezerolizer";

// ---------------------------------------------------------------------------
// Per-algorithm configs
// ---------------------------------------------------------------------------

export interface MADConfig {
	enabled: boolean;
	baselineSize: number;
	detectionSize: number;
	threshold: number;
	minSamples: number;
	showInternals: boolean;
	/** Cooldown samples after a detection — baseline frozen, no new detection emitted */
	cooldownSamples: number;
	/** Percentile (0–1) of detection window used as current value. 0.75 = faster rising edge */
	detectionPercentile: number;
	/** Minimum MAD floor to prevent false triggers on unusually flat signal */
	minMAD: number;
}

export interface RSDConfig {
	enabled: boolean;
	baselineSize: number;
	detectionSize: number;
	threshold: number;
	minSamples: number;
	showInternals: boolean;
	/** Cooldown samples after a detection — baseline frozen, no new detection emitted */
	cooldownSamples: number;
	/** Minimum std floor to prevent false triggers on unusually flat signal */
	minStd: number;
}

export interface CUSUMConfig {
	enabled: boolean;
	/** Baseline rolling window size (samples). Recommended ~300 at 30Hz = 10s */
	baselineSize: number;
	/** Minimum samples before detection is enabled */
	minSamples: number;
	/** Slack factor — fraction of noise sigma used as drift allowance. Recommended 0.5 */
	slackFactor: number;
	/** Detection threshold in multiples of sigma. Recommended 5.0 */
	threshold: number;
	/** Minimum MAD floor. Recommended 1.0 */
	minMAD: number;
	/** Cooldown samples after a detection. Recommended 60 at 30Hz = 2s */
	cooldownSamples: number;
	showInternals: boolean;
}

export interface ClusterConfig {
	enabled: boolean;
	/** Merge events within this many milliseconds */
	timeThresholdMs: number;
	/** Merge events within this many meters (haversine) */
	distanceThresholdM: number;
}

export interface DetectionFilterParams {
	lowpassAlpha: number;
	kalmanProcessNoise: number;
	kalmanMeasurementNoise: number;
	dezeroliserDecay: number;
}

export interface DetectionConfig {
	enabled: boolean;
	/** Pre-processing filter applied before running detection algorithms */
	filterType: DetectionFilterType;
	filterParams: DetectionFilterParams;
	/** Show the pre-processed signal as an extra trace in the signal chart */
	showFiltered: boolean;
	mad: MADConfig;
	rsd: RSDConfig;
	cusum: CUSUMConfig;
	clustering: ClusterConfig;
	/** Which topic to run detection on (typically /emi/pulse/avg) */
	detectionTopic: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DetectionRunResult {
	/** Timestamps in nanoseconds from bag start where a detection was triggered */
	detectedTimestamps: number[];
	thresholdSeries: TimeSeriesPoint[];
	deviationSeries: TimeSeriesPoint[];
	/** Pre-processed (filtered) signal fed to the detector */
	filteredSeries: TimeSeriesPoint[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_MAD_CONFIG: MADConfig = {
	enabled: true,
	baselineSize: 300,
	detectionSize: 10,
	threshold: 4.5,
	minSamples: 128,
	showInternals: false,
	cooldownSamples: 60,
	detectionPercentile: 0.75,
	minMAD: 1.0,
};

export const DEFAULT_RSD_CONFIG: RSDConfig = {
	enabled: false,
	baselineSize: 300,
	detectionSize: 10,
	threshold: 4.5,
	minSamples: 128,
	showInternals: false,
	cooldownSamples: 60,
	minStd: 1.0,
};

export const DEFAULT_CUSUM_CONFIG: CUSUMConfig = {
	enabled: false,
	baselineSize: 300,
	minSamples: 128,
	slackFactor: 0.5,
	threshold: 5.0,
	minMAD: 1.0,
	cooldownSamples: 60,
	showInternals: false,
};

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
	enabled: true,
	filterType: "lowpass",
	filterParams: {
		lowpassAlpha: 0.3,
		kalmanProcessNoise: 10.0,
		kalmanMeasurementNoise: 17.7828,
		dezeroliserDecay: 0.98,
	},
	showFiltered: true,
	mad: DEFAULT_MAD_CONFIG,
	rsd: DEFAULT_RSD_CONFIG,
	cusum: DEFAULT_CUSUM_CONFIG,
	clustering: {
		enabled: true,
		timeThresholdMs: 2000,
		distanceThresholdM: 10,
	},
	detectionTopic: "/emi/pulse/avg",
};
