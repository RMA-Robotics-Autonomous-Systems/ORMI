/** Dezerolizer filter: replaces zero samples with a decayed version of the last valid value. */
export function applyDezerolizer(values: number[], decay: number): number[] {
	if (values.length === 0) return [];
	const out = [...values];
	let lastValid = out[0]!;
	for (let i = 0; i < out.length; i++) {
		if (out[i] === 0) {
			out[i] = lastValid * decay;
		}
		lastValid = out[i]!;
	}
	return out;
}
