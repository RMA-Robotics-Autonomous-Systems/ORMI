/** Exponential moving average (lowpass) filter. Port of emibagprocessing/filters.py */
export function applyLowpass(values: number[], alpha: number): number[] {
	if (values.length === 0) return [];
	const out = new Array<number>(values.length);
	out[0] = values[0]!;
	for (let i = 1; i < values.length; i++) {
		out[i] = alpha * values[i]! + (1 - alpha) * out[i - 1]!;
	}
	return out;
}
