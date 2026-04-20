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
}

export interface RSDConfig {
	enabled: boolean;
	baselineSize: number;
	detectionSize: number;
	threshold: number;
	minSamples: number;
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
	baselineSize: 512,
	detectionSize: 16,
	threshold: 15.0,
	minSamples: 128,
	showInternals: false,
};

export const DEFAULT_RSD_CONFIG: RSDConfig = {
	enabled: true,
	baselineSize: 512,
	detectionSize: 16,
	threshold: 8.35,
	minSamples: 128,
	showInternals: false,
};

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
	enabled: false,
	filterType: "none",
	filterParams: {
		lowpassAlpha: 0.1,
		kalmanProcessNoise: 10.0,
		kalmanMeasurementNoise: 17.7828,
		dezeroliserDecay: 0.98,
	},
	showFiltered: false,
	mad: DEFAULT_MAD_CONFIG,
	rsd: DEFAULT_RSD_CONFIG,
	clustering: {
		enabled: false,
		timeThresholdMs: 2000,
		distanceThresholdM: 10,
	},
	detectionTopic: "/emi/pulse/avg",
};
