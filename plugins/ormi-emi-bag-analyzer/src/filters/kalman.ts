/**
 * 1-D constant-velocity Kalman filter.
 * Port of emibagprocessing/filters.py _kalman().
 * State: [position, velocity], sampled at 32 Hz.
 */
export function applyKalman(
	values: number[],
	opts: {
		processNoise?: number;
		measurementNoise?: number;
		initialCovariance?: number;
		samplingRate?: number;
	} = {},
): number[] {
	const {
		processNoise = 10,
		measurementNoise = 17.7828,
		initialCovariance = 100,
		samplingRate = 32,
	} = opts;

	if (values.length === 0) return [];

	const dt = 1 / samplingRate;

	// State transition matrix F (2x2)
	const F = [
		[1, dt],
		[0, 1],
	] as const;

	// Process noise covariance Q (2x2)
	const Q = [
		[(dt ** 4 / 4) * processNoise, (dt ** 3 / 2) * processNoise],
		[(dt ** 3 / 2) * processNoise, dt ** 2 * processNoise],
	];

	const R = measurementNoise;

	// State and covariance
	let x0 = values[0]!;
	let x1 = 0; // velocity
	let p00 = initialCovariance;
	let p01 = 0;
	let p10 = 0;
	let p11 = initialCovariance;

	const out: number[] = [x0];

	for (let i = 1; i < values.length; i++) {
		// Predict
		const px0 = F[0][0] * x0 + F[0][1] * x1;
		const px1 = F[1][0] * x0 + F[1][1] * x1;
		const pp00 = F[0][0] * p00 + F[0][1] * p10 + Q[0]![0]!;
		const pp01 = F[0][0] * p01 + F[0][1] * p11 + Q[0]![1]!;
		const pp10 = F[1][0] * p00 + F[1][1] * p10 + Q[1]![0]!;
		const pp11 = F[1][0] * p01 + F[1][1] * p11 + Q[1]![1]!;

		// Innovation: H = [1, 0], so y = z - px0
		const S = pp00 + R;
		const K0 = pp00 / S;
		const K1 = pp10 / S;

		const y = values[i]! - px0;
		x0 = px0 + K0 * y;
		x1 = px1 + K1 * y;
		p00 = (1 - K0) * pp00;
		p01 = (1 - K0) * pp01;
		p10 = pp10 - K1 * pp00;
		p11 = pp11 - K1 * pp01;

		out.push(x0);
	}

	return out;
}
