import type { TimeSeriesPoint } from "../bag-reader/bag-types";

// ── Config ────────────────────────────────────────────────────────────────

/**
 * A single point on a user-drawn baseline polyline.
 * `tsNs` is nanoseconds from bag start (same reference as TimeSeriesPoint.timestamp).
 */
export interface DrawnBaselinePoint {
	tsNs: number;
	value: number;
}

export interface AutoLabelConfig {
	/**
	 * Merge event segments whose inter-segment gap is below this value (seconds).
	 * Prevents rapid re-ignition from producing dozens of tiny fragments.
	 *
	 * The appropriate value depends on the mission profile:
	 * - Dense/persistent EMI zones (robot repeatedly re-enters a source area)
	 *   produce sub-second dips below the threshold between spikes, so a larger
	 *   window is needed to coalesce them into coherent regions.
	 * - Isolated short-duration events rarely re-fire within 30 s.
	 *
	 * Cross-bag empirical optimum (12 bags): 30 s reduces the worst-case
	 * segment count from 127 to 42 while keeping well-separated events distinct.
	 * Default 30.0.
	 */
	mergeGapS: number;
	/**
	 * Minimum confidence to be considered part of an event segment.
	 * Expressed as a fraction of the range [P1 floor → P99 ceiling] of sketch values:
	 * 0 = just above floor, 1 = at or above the ceiling value.
	 * Default 0.5.
	 */
	minSegmentConf: number;
	/**
	 * Seconds of margin added before/after each event to place a low-confidence
	 * anchor that returns the curve to baseline.
	 * Default 3.0.
	 */
	anchorMarginS: number;
	/**
	 * Confidence value assigned to the baseline anchor control points.
	 * Should be close to 0 so the curve interpolates cleanly back to baseline.
	 * Default 0.05.
	 */
	anchorConf: number;
	/**
	 * Optional user-drawn signal sketch.
	 *
	 * When provided, the sketch is treated as a simplified representation of the
	 * signal shape — elevated on event peaks and low at background. Confidence is
	 * derived from the sketch's own elevation above its Otsu-determined floor:
	 *   confidence = clamp((sketch(t) − floor) / (P99_sketch − floor), 0, 1)
	 *
	 * The raw signal values are not used for confidence in this mode.
	 * Points must be sorted by tsNs ascending.
	 */
	drawnBaseline?: DrawnBaselinePoint[];
}

export const DEFAULT_AUTO_LABEL_CONFIG: AutoLabelConfig = {
	mergeGapS: 1,
	minSegmentConf: 0.1,
	anchorMarginS: 0.5,
	anchorConf: 0.05,
};

// ── Output ────────────────────────────────────────────────────────────────

export interface RawConfidencePoint {
	/** Nanoseconds from bag start */
	tsNs: number;
	/** 0–1 */
	confidence: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────

/** Linear interpolation of a user-drawn signal sketch at a given timestamp. */
function lerpBaseline(baseline: DrawnBaselinePoint[], tsNs: number): number {
	if (baseline.length === 0) return 0;
	if (baseline.length === 1) return baseline[0]!.value;
	if (tsNs <= baseline[0]!.tsNs) return baseline[0]!.value;
	if (tsNs >= baseline[baseline.length - 1]!.tsNs)
		return baseline[baseline.length - 1]!.value;

	// Binary search for surrounding pair
	let lo = 0;
	let hi = baseline.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (baseline[mid]!.tsNs <= tsNs) lo = mid;
		else hi = mid;
	}
	const a = baseline[lo]!;
	const b = baseline[hi]!;
	const t = (tsNs - a.tsNs) / (b.tsNs - a.tsNs);
	return a.value + t * (b.value - a.value);
}

// ── Main algorithm ────────────────────────────────────────────────────────

/**
 * Offline auto-labeler driven by a user-drawn signal sketch.
 *
 * The sketch traces the signal shape — elevated on event peaks, low at
 * background. Confidence is derived from the sketch's own elevation:
 *
 *   sketchVal(t) = lerp(drawnSketch, t)
 *   floor        = P1 of sketch values (robust minimum)
 *   ceiling      = P99 of sketch values
 *   confidence   = clamp((sketchVal − floor) / (ceiling − floor), 0, 1)
 *
 * ### Algorithm
 * 1. Interpolate sketch at each sample timestamp.
 * 2. Compute P1/P99 of sketch values as floor/ceiling.
 * 3. Per-sample confidence = clamp((sketch − floor) / (ceiling − floor), 0, 1).
 * 4. Detect contiguous segments where conf ≥ minSegmentConf.
 * 5. Merge segments whose gap < mergeGapS.
 * 6. Emit trapezoid control points per segment: anchor → plateau → anchor.
 * 7. Always add bag-start and bag-end baseline anchors.
 *
 * Returns `RawConfidencePoint[]` — caller is responsible for adding `id` fields
 * required by the UI (ConfidencePoint).
 */
export function runAutoLabel(
	points: TimeSeriesPoint[],
	cfg: Partial<AutoLabelConfig> = {},
): RawConfidencePoint[] {
	if (points.length === 0) return [];

	const config: AutoLabelConfig = { ...DEFAULT_AUTO_LABEL_CONFIG, ...cfg };

	if (!config.drawnBaseline || config.drawnBaseline.length < 2) return [];

	const t0 = points[0]!.timestamp;
	const duration = points[points.length - 1]!.timestamp - t0;

	// ── Step 1–3: per-sample confidence from sketch ───────────────────────
	const sketchVals = points.map((p) =>
		lerpBaseline(config.drawnBaseline!, p.timestamp),
	);
	const sortedSketch = sketchVals.slice().sort((a, b) => a - b);
	const floor = sortedSketch[Math.floor(0.01 * (sortedSketch.length - 1))]!;
	const ceiling = sortedSketch[Math.floor(0.99 * (sortedSketch.length - 1))]!;
	const range = Math.max(ceiling - floor, 1e-9);
	const confs = sketchVals.map((v) =>
		Math.min(1, Math.max(0, (v - floor) / range)),
	);

	// ── Step 4: detect segments ────────────────────────────────────────────
	type Segment = {
		startIdx: number;
		endIdx: number;
		peakIdx: number;
		peakConf: number;
	};

	const segments: Segment[] = [];
	let inSeg = false;
	let segStart = 0;
	let peakIdx = 0;
	let peakConf = 0;

	for (let i = 0; i < confs.length; i++) {
		const c = confs[i]!;
		if (!inSeg && c >= config.minSegmentConf) {
			inSeg = true;
			segStart = i;
			peakIdx = i;
			peakConf = c;
		} else if (inSeg) {
			if (c > peakConf) {
				peakIdx = i;
				peakConf = c;
			}
			const isLast = i === confs.length - 1;
			if (c < config.minSegmentConf || isLast) {
				segments.push({
					startIdx: segStart,
					endIdx: isLast && c >= config.minSegmentConf ? i : i - 1,
					peakIdx,
					peakConf,
				});
				inSeg = false;
				peakConf = 0;
			}
		}
	}

	if (segments.length === 0) return [];

	// ── Step 5: merge nearby segments ─────────────────────────────────────
	const mergeGapNs = config.mergeGapS * 1e9;
	const merged: Segment[] = [{ ...segments[0]! }];

	for (let i = 1; i < segments.length; i++) {
		const seg = segments[i]!;
		const prev = merged[merged.length - 1]!;
		const gapNs =
			points[seg.startIdx]!.timestamp - points[prev.endIdx]!.timestamp;

		if (gapNs <= mergeGapNs) {
			// Extend the previous merged segment
			const betterPeak =
				seg.peakConf > prev.peakConf ? seg.peakIdx : prev.peakIdx;
			merged[merged.length - 1] = {
				startIdx: prev.startIdx,
				endIdx: seg.endIdx,
				peakIdx: betterPeak,
				peakConf: Math.max(prev.peakConf, seg.peakConf),
			};
		} else {
			merged.push({ ...seg });
		}
	}

	// ── Step 6–7: emit control points (trapezoid shape) ──────────────────
	//
	// Each event segment emits 4 control points:
	//
	//   anchorConf ─────╮                         ╭───── anchorConf
	//                   │  ramp up    plateau  ramp down
	//   peakConf  ──────────────╮─────────────╯
	//
	//   beforeTs   startTs  (plateau-start)  (plateau-end)  endTs   afterTs
	//
	// The flat plateau spans the full detected segment extent, so the curve
	// correctly covers the event duration rather than peaking at a single
	// point and bleeding heavily into quiet regions.
	const anchorMarginNs = config.anchorMarginS * 1e9;
	const raw: RawConfidencePoint[] = [];

	// Bag-start anchor
	raw.push({ tsNs: 0, confidence: config.anchorConf });

	for (const seg of merged) {
		const segStartTs = points[seg.startIdx]!.timestamp - t0;
		const segEndTs = points[seg.endIdx]!.timestamp - t0;

		// Pre-event anchor → start of ramp-up
		const beforeTs = Math.max(0, segStartTs - anchorMarginNs);
		raw.push({ tsNs: beforeTs, confidence: config.anchorConf });

		// Plateau leading edge (segment start)
		raw.push({ tsNs: segStartTs, confidence: seg.peakConf });

		// Plateau trailing edge (segment end)
		// For single-sample segments segEndTs == segStartTs; dedup keeps one.
		raw.push({ tsNs: segEndTs, confidence: seg.peakConf });

		// Post-event anchor → end of ramp-down
		const afterTs = Math.min(duration, segEndTs + anchorMarginNs);
		raw.push({ tsNs: afterTs, confidence: config.anchorConf });
	}

	// Bag-end anchor
	raw.push({ tsNs: duration, confidence: config.anchorConf });

	// ── Sort + deduplicate (keep higher confidence when timestamps collide) ─
	raw.sort((a, b) => a.tsNs - b.tsNs);

	const DEDUP_NS = 1e8; // 0.1 s
	const deduped: RawConfidencePoint[] = [];
	for (const pt of raw) {
		const prev = deduped[deduped.length - 1];
		if (prev && pt.tsNs - prev.tsNs < DEDUP_NS) {
			if (pt.confidence > prev.confidence)
				deduped[deduped.length - 1] = pt;
		} else {
			deduped.push(pt);
		}
	}

	return deduped;
}
