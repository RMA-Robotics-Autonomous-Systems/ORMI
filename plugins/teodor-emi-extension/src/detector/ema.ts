/**
 * Offset-removal filter stage.
 *
 * Ported from `emi_ws/tools/report/detector.js`, itself a verified port of
 * `tools/pipeline.py` and the C++ nodes.
 */

/**
 * Exponential moving average with the C++ truncation, over an interleaved
 * `[n × ncoil]` array.
 *
 * `Math.trunc` is load-bearing and must not be "cleaned up": the C++ keeps the
 * filter state in a double but assigns through a `static_cast<int>` every
 * sample, so it truncates toward zero on every step. Dropping it makes this a
 * different filter from the one that ran on the robot.
 *
 * @param src - Interleaved raw samples, `[n * ncoil]`.
 * @param n - Sample count.
 * @param ncoil - Coils per sample.
 * @param alpha - EMA coefficient.
 * @returns Filtered samples, same layout as `src`.
 */
export function emaFilter(
	src: Int32Array,
	n: number,
	ncoil: number,
	alpha: number,
): Int32Array {
	const out = new Int32Array(n * ncoil);
	const st = new Float64Array(ncoil);
	const keep = 1 - alpha;
	for (let i = 0; i < n; i++) {
		const base = i * ncoil;
		for (let c = 0; c < ncoil; c++) {
			st[c] = Math.trunc(keep * st[c]! + alpha * src[base + c]!);
			out[base + c] = st[c]!;
		}
	}
	return out;
}

/**
 * `max(raw1, raw2)` — the quantity the ATR actually thresholds.
 *
 * @param f1 - Filtered channel 1.
 * @param f2 - Filtered channel 2.
 * @param n - Sample count.
 * @param ncoil - Coils per sample.
 * @returns The per-coil decision variable, `[n * ncoil]`.
 */
export function coilValue(
	f1: Int32Array,
	f2: Int32Array,
	n: number,
	ncoil: number,
): Int32Array {
	const v = new Int32Array(n * ncoil);
	for (let i = 0; i < n * ncoil; i++)
		v[i] = f1[i]! > f2[i]! ? f1[i]! : f2[i]!;
	return v;
}
