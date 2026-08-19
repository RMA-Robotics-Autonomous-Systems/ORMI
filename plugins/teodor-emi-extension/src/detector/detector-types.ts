/** Shared shapes produced by the detector stages. */

/** A raw detection, before it has been placed on the ground. */
export interface Detection {
	/** Sample index of the latched peak. */
	iPeak: number;
	/** Sample index at which the coil released. */
	iRel: number;
	/** Coil id as published (1-based). */
	coil: number;
	/** Coil index into the run's coil-major columns (0-based). */
	ci: number;
	/** Latched peak amplitude. */
	amp: number;
	/** Arm threshold in force when it fired. */
	thr: number;
	/**
	 * Sample index whose stamp the message carried. Differs from {@link iPeak}
	 * only under legacy mode, where coils releasing in the same cycle share one
	 * message stamp and all but the last inherit a peak time that is not theirs.
	 */
	iPub: number;
	/** True when {@link iPub} is not this coil's own peak time. */
	borrowed: boolean;
}

/** A detection placed in local metres. */
export interface GeoDetection extends Detection {
	/** Time of the georeferencing sample, seconds from run start. */
	t: number;
	/** Local-metre easting. */
	x: number;
	/** Local-metre northing. */
	y: number;
	/** Horizontal sigma of the fix used, metres. */
	sigma: number;
	/** Index of the target this was folded into, or -1. Filled by the replay. */
	targetId: number;
}

/** One physical object, accumulated from one or more coil detections. */
export interface Target {
	id: number;
	members: GeoDetection[];
	/** Running centroid. */
	cx: number;
	cy: number;
	/** Position of the highest-amplitude member — EMI falls off as ~1/r^6, so
	 *  the strongest detection is the one whose coil passed closest. */
	bx: number;
	by: number;
	bestAmp: number;
	bestCoil: number;
	coils: Set<number>;
	firstSeen: number;
	lastSeen: number;
	/** Gate this target was created under, or null under chain association
	 *  (which consults no gate at all). */
	gateUsed: number | null;
	/** Horizontal sigma at creation (gate) or median over members (chain). */
	sigma: number;
	/** Position we are unsure of — not "association was refused". */
	degraded: boolean;
	/** Max distance between any two members, metres. */
	spread: number;
	/** More than one coil contributed. */
	confirmed: boolean;
	/**
	 * Distance to the nearest existing centroid when this target was opened.
	 * Populated by gate association only; always NaN under chain association,
	 * which has no single distance that decided the outcome.
	 */
	nearest: number;
}

/** Per-coil rolling statistics backing the MAD detector. */
export interface MadBaseline {
	/** Rolling median of the decision variable, `[n * ncoil]`. */
	med: Float32Array;
	/** Rolling median absolute deviation, `[n * ncoil]`. */
	mad: Float32Array;
	/** Short detection-window median, `[n * ncoil]`. */
	det: Float32Array;
	wBase: number;
	wDet: number;
	stride: number;
}

/**
 * ATR behaviour selector — an argument to the detector, not a user parameter.
 *
 * `legacy` reproduces the single-threshold behaviour that the recordings were
 * made under and is always run alongside the current detector to produce the
 * "as recorded" comparison series. It must not change when the current detector
 * is swapped for the experimental one, or the baseline moves with the thing
 * being measured against it.
 */
export type AtrMode = "legacy" | "schmitt";
