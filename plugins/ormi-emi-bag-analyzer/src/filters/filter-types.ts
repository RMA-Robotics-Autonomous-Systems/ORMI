export interface FilterConfig {
	kind: "none" | "lowpass" | "kalman" | "dezerolizer";
	lowpassAlpha: number;
	kalmanProcessNoise: number;
	kalmanMeasurementNoise: number;
	kalmanInitialCovariance: number;
	dezeroliserDecay: number;
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
	kind: "none",
	lowpassAlpha: 0.1,
	kalmanProcessNoise: 10.0,
	kalmanMeasurementNoise: 17.7828,
	kalmanInitialCovariance: 100.0,
	dezeroliserDecay: 0.98,
};
