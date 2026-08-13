/**
 * Everything that changes the result.
 *
 * The split is deliberate and matches the source report: a parameter belongs
 * here only if moving it changes what the detector decides. Anything that only
 * changes the drawing (log vs linear, unfiltered on/off, robot pose) lives in
 * the widget that draws it, not in this type.
 */

/** Which peak detector runs. */
export type DetectorMode = "fixed" | "mad";

/** How detections are associated into targets. */
export type AssocMode = "gate" | "chain";

/** Which frame the coil offsets are resolved against. */
export type GnssFrame = "xsens_link" | "base_link";

/** Which sample's orientation georeferences a detection. */
export type YawAt = "peak" | "release";

/** How the association gate scales with fix quality. */
export type GateMode = "covariance" | "fixed";

/** The full parameter set. */
export interface EmiParams {
	detector: DetectorMode;

	/** Arm threshold on `max(raw1, raw2)`, fixed detector. */
	threshold: number;
	/** Release threshold as a fraction of {@link threshold} (Schmitt trigger). */
	releaseRatio: number;
	/** Minimum lockout after publishing, in seconds. 0 disables. */
	rearmDwellS: number;
	/** EMA coefficient. */
	alpha: number;

	/** MAD: multiples of the local MAD above the local median. */
	madFactor: number;
	/** MAD: rolling baseline window, seconds. */
	madBaseS: number;
	/** MAD: detection window, seconds. */
	madDetS: number;
	/** MAD: release threshold as a fraction of the arm threshold. */
	madRearmRatio: number;
	/** MAD: hold the baseline captured at arm time while latched. */
	madFreeze: boolean;
	/**
	 * MAD: recompute the rolling median every `madStride` samples and hold it in
	 * between. At 32 Hz this is invisible in the result and turns an
	 * `O(n·w·log w)` pass into one that runs while a slider moves.
	 */
	madStride: number;

	gnssFrame: GnssFrame;
	yawAt: YawAt;

	assoc: AssocMode;
	/** Gate association: base gate radius in metres. */
	gateBaseM: number;
	gateMode: GateMode;
	/** Sigma at or below which the full gate applies. */
	gateSigmaRefM: number;
	/** Floor on the covariance scaling factor. */
	gateMinScale: number;
	/** Above this sigma the gate closes entirely (0 disables the cutoff). */
	gateSigmaMaxM: number;

	/** Chain association: along-track acceptance, metres. */
	linkAlongM: number;
	/** Chain association: shared footprint across track, metres. */
	linkCrossM: number;
}

/**
 * What the robot runs today: one fixed threshold shared by all five coils, and
 * the covariance gate. `emi/config/params.yaml` and `emigps.launch.py`.
 */
export const SHIPPED_PARAMS: EmiParams = {
	detector: "fixed",
	threshold: 5000,
	releaseRatio: 0.75,
	rearmDwellS: 0,
	alpha: 0.45,

	madFactor: 15,
	madBaseS: 16,
	madDetS: 0.5,
	madRearmRatio: 0.8,
	madFreeze: false,
	madStride: 8,

	gnssFrame: "xsens_link",
	yawAt: "peak",

	assoc: "gate",
	gateBaseM: 0.45,
	gateMode: "covariance",
	gateSigmaRefM: 0.15,
	gateMinScale: 0.3,
	gateSigmaMaxM: 0.6,

	linkAlongM: 0.3,
	linkCrossM: 0.45,
};

/**
 * The two proposals rather than the two shipped algorithms: per-coil MAD and
 * chain association.
 *
 * This is the opening state, for the reason the source report gives — opening
 * on what the robot runs presents a threshold several times too high for the
 * quietest coil, feeding an associator that refuses almost everything. Both are
 * one click from being restored.
 */
export const PROPOSED_PARAMS: EmiParams = {
	...SHIPPED_PARAMS,
	detector: "mad",
	assoc: "chain",
};

/**
 * Reproduce what a specific recording actually ran under: the fixed threshold
 * it recorded, no hysteresis, `base_link` offsets and release-time orientation.
 * The honest starting point for judging any change.
 *
 * @param recordedThreshold - ATR threshold the recording carried.
 * @returns Parameters matching the recorded configuration.
 */
export function matchRecordingParams(recordedThreshold: number): EmiParams {
	return {
		...SHIPPED_PARAMS,
		detector: "fixed",
		threshold: recordedThreshold,
		releaseRatio: 1,
		rearmDwellS: 0,
		gnssFrame: "base_link",
		yawAt: "release",
		assoc: "gate",
	};
}

/**
 * Parameters that invalidate the cached MAD rolling medians.
 *
 * Moving any of these costs a full recompute over the run, so the UI coalesces
 * them while a slider is in motion; everything else — the factor especially —
 * is free to sweep because the medians do not depend on it.
 */
export const MAD_BASELINE_KEYS = [
	"alpha",
	"madBaseS",
	"madDetS",
	"madStride",
] as const satisfies readonly (keyof EmiParams)[];

/**
 * Cache key for the MAD baseline: changes exactly when the rolling medians must
 * be recomputed.
 *
 * @param params - Current parameters.
 * @param runId - Identity of the run the baseline was computed over.
 * @param n - Sample count, so a growing mission invalidates the cache.
 * @returns An opaque key.
 */
export function madBaselineKey(
	params: EmiParams,
	runId: string,
	n: number,
): string {
	return [runId, n, ...MAD_BASELINE_KEYS.map((k) => String(params[k]))].join(
		"|",
	);
}
