import { describe, expect, it } from "bun:test";

import { UnifiedConverter } from "../unified-converter";

const pc2 =
	UnifiedConverter.converters.PointsCloud!.conversions[
		"sensor_msgs/msg/PointCloud2"
	]!;

/** ROS `sensor_msgs/PointField` datatype for FLOAT32. */
const FLOAT32 = 7;

interface LivoxPoint {
	x: number;
	y: number;
	z: number;
	intensity: number;
	/** Packed 0xRRGGBB, only written when the layout carries an rgb field. */
	rgb?: number;
}

interface BuildOptions {
	/** Bytes per point. Non-multiple-of-4 forces the DataView fallback. */
	pointStep: number;
	/** Big-endian payload forces the DataView fallback. */
	bigEndian: boolean;
	/** Add a float32 rgb field between z and intensity. */
	withRgb: boolean;
}

/**
 * Build a realistic Livox-style `PointCloud2` message. Field offsets are fixed
 * (x=0, y=4, z=8, [rgb=12,] intensity=next) and only the stride / endianness
 * vary so a bit-identical decode can be asserted across the fast and fallback
 * paths.
 */
function buildCloud(points: LivoxPoint[], options: BuildOptions) {
	const { pointStep, bigEndian, withRgb } = options;
	const littleEndian = !bigEndian;

	const xOffset = 0;
	const yOffset = 4;
	const zOffset = 8;
	const rgbOffset = withRgb ? 12 : undefined;
	const intensityOffset = withRgb ? 16 : 12;

	const fields = [
		{ name: "x", offset: xOffset, datatype: FLOAT32 },
		{ name: "y", offset: yOffset, datatype: FLOAT32 },
		{ name: "z", offset: zOffset, datatype: FLOAT32 },
	];
	if (rgbOffset !== undefined) {
		fields.push({ name: "rgb", offset: rgbOffset, datatype: FLOAT32 });
	}
	fields.push({
		name: "intensity",
		offset: intensityOffset,
		datatype: FLOAT32,
	});

	const data = new Uint8Array(points.length * pointStep);
	const view = new DataView(data.buffer);
	for (let i = 0; i < points.length; i++) {
		const base = i * pointStep;
		const p = points[i]!;
		view.setFloat32(base + xOffset, p.x, littleEndian);
		view.setFloat32(base + yOffset, p.y, littleEndian);
		view.setFloat32(base + zOffset, p.z, littleEndian);
		if (rgbOffset !== undefined) {
			// rgb is transported as the float32 reinterpret of the packed uint.
			const scratch = new DataView(new ArrayBuffer(4));
			scratch.setUint32(0, p.rgb ?? 0, true);
			view.setFloat32(
				base + rgbOffset,
				scratch.getFloat32(0, true),
				littleEndian,
			);
		}
		view.setFloat32(base + intensityOffset, p.intensity, littleEndian);
	}

	return {
		fields,
		point_step: pointStep,
		is_bigendian: bigEndian,
		height: 1,
		width: points.length,
		data,
	};
}

/** Hex of the exact bytes a Float32Array covers, or "undefined". */
function bytesOf(arr?: Float32Array): string {
	if (!arr) return "undefined";
	return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString(
		"hex",
	);
}

/** Assert two decoded clouds are bit-identical across all packed arrays. */
function expectSameCloud(
	a: {
		points: Float32Array;
		colors?: Float32Array;
		intensities?: Float32Array;
	},
	b: {
		points: Float32Array;
		colors?: Float32Array;
		intensities?: Float32Array;
	},
): void {
	expect(bytesOf(a.points)).toBe(bytesOf(b.points));
	expect(bytesOf(a.colors)).toBe(bytesOf(b.colors));
	expect(bytesOf(a.intensities)).toBe(bytesOf(b.intensities));
}

/** Deterministic Livox-like sample with a NaN point to exercise the filter. */
function makePoints(count: number): LivoxPoint[] {
	const points: LivoxPoint[] = [];
	for (let i = 0; i < count; i++) {
		if (i === Math.floor(count / 2)) {
			// A NaN coordinate must be dropped identically by both paths.
			points.push({ x: NaN, y: 1, z: 2, intensity: 30 });
			continue;
		}
		points.push({
			x: Math.sin(i * 0.01) * 10,
			y: Math.cos(i * 0.017) * 8,
			z: (i % 200) * 0.05 - 5,
			intensity: i % 256,
			rgb:
				(((i * 7) & 0xff) << 16) |
				(((i * 13) & 0xff) << 8) |
				(i & 0xff),
		});
	}
	return points;
}

describe("PointCloud2 -> PointsCloud conversion (foxglove)", () => {
	it("routes PointCloud2 to the PointsCloud webapp type", () => {
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"sensor_msgs/msg/PointCloud2",
			),
		).toBe("PointsCloud");
	});

	it("fast float-view path is bit-identical to the DataView fallback (intensity-only Livox layout)", () => {
		const points = makePoints(4096);

		// point_step 16, LE, 4-aligned -> fast float-view path.
		const fast = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 16,
				bigEndian: false,
				withRgb: false,
			}),
		);

		// Big-endian -> DataView fallback, same logical values.
		const beFallback = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 16,
				bigEndian: true,
				withRgb: false,
			}),
		);

		// LE but non-4-aligned stride -> DataView fallback, same values.
		const unalignedFallback = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 18,
				bigEndian: false,
				withRgb: false,
			}),
		);

		expect(fast.convention).toBe("THREE");
		expectSameCloud(fast, beFallback);
		expectSameCloud(fast, unalignedFallback);
	});

	it("fast float-view path is bit-identical to the DataView fallback (rgb + intensity layout)", () => {
		const points = makePoints(2048);

		// point_step 20, LE, aligned -> rgb + intensity fast reads.
		const fast = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 20,
				bigEndian: false,
				withRgb: true,
			}),
		);
		const beFallback = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 20,
				bigEndian: true,
				withRgb: true,
			}),
		);
		const unalignedFallback = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 22,
				bigEndian: false,
				withRgb: true,
			}),
		);

		expect(fast.colors).toBeDefined();
		expectSameCloud(fast, beFallback);
		expectSameCloud(fast, unalignedFallback);
	});

	it("drops the NaN point identically on both paths", () => {
		const points = makePoints(101);
		const fast = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 16,
				bigEndian: false,
				withRgb: false,
			}),
		);
		// 101 points minus the single NaN row.
		expect(fast.points.length).toBe(100 * 3);
	});

	it("benchmarks fast float-view vs DataView fallback (ms/cloud)", () => {
		const points = makePoints(14000);
		const fastMsg = buildCloud(points, {
			pointStep: 16,
			bigEndian: false,
			withRgb: false,
		});
		// Same little-endian values, non-aligned stride -> DataView per component.
		const fallbackMsg = buildCloud(points, {
			pointStep: 18,
			bigEndian: false,
			withRgb: false,
		});

		const iterations = 300;

		// Warm up both paths so the timing reflects the optimised JIT tier.
		for (let i = 0; i < 100; i++) {
			pc2.fromRos2(fastMsg);
			pc2.fromRos2(fallbackMsg);
		}

		const fallbackStart = performance.now();
		for (let i = 0; i < iterations; i++) pc2.fromRos2(fallbackMsg);
		const fallbackMs = (performance.now() - fallbackStart) / iterations;

		const fastStart = performance.now();
		for (let i = 0; i < iterations; i++) pc2.fromRos2(fastMsg);
		const fastMs = (performance.now() - fastStart) / iterations;

		// eslint-disable-next-line no-console
		console.log(
			`PointCloud2 decode (${points.length} pts): ` +
				`DataView fallback ${fallbackMs.toFixed(3)} ms/cloud, ` +
				`float-view fast ${fastMs.toFixed(3)} ms/cloud, ` +
				`speedup ${(fallbackMs / fastMs).toFixed(2)}x`,
		);

		// Guard against a regression that silently defeats the fast path.
		expect(fastMs).toBeLessThan(fallbackMs);
	});
});
