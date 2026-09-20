import { describe, expect, it } from "bun:test";

import { UnifiedConverter } from "../unified-converter";
import {
	canReadRgb,
	canUseFloatView,
	type FloatViewLayout,
} from "../pointcloud-fast-path";

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
	/** Datatype to declare for that rgb field. Defaults to float32. */
	rgbDatatype?: number;
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
		fields.push({
			name: "rgb",
			offset: rgbOffset,
			datatype: options.rgbDatatype ?? FLOAT32,
		});
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

	/**
	 * What the fast path is, asserted directly.
	 *
	 * This replaced a benchmark that timed both decode paths and required the
	 * fast one to finish first. That assertion was a wall-clock comparison with
	 * a margin narrower than a single GC pause: it failed about one run in six
	 * on an idle machine and more often on a shared CI runner, which trains
	 * people to re-run the job rather than read it. The regression it existed to
	 * catch — the float-view path silently ceasing to engage for the common
	 * layout — is a property of the layout predicate, so it is checked there,
	 * deterministically.
	 *
	 * The timing loop is gone rather than demoted to a printed number: the
	 * repo's pre-commit hook rejects `console` statements, and routing the
	 * output around it would be the same statement under another name. An
	 * unasserted benchmark nobody can read is 600 decodes of CI time for
	 * nothing. Measure decode cost ad hoc when profiling; the regression this
	 * file has to catch is below.
	 */
	describe("float-view fast path", () => {
		const layout = (
			over: Partial<FloatViewLayout> = {},
		): FloatViewLayout => ({
			littleEndian: true,
			pointStep: 16,
			byteOffset: 0,
			datatypes: [FLOAT32, FLOAT32, FLOAT32],
			offsets: [0, 4, 8],
			...over,
		});

		it("engages for the common aligned little-endian float32 layout", () => {
			expect(canUseFloatView(layout())).toBe(true);
		});

		it("declines a big-endian payload, which a float view would misread", () => {
			expect(canUseFloatView(layout({ littleEndian: false }))).toBe(
				false,
			);
		});

		it("declines a stride that is not a multiple of four", () => {
			// 18 bytes per point: a Float32Array index cannot address it.
			expect(canUseFloatView(layout({ pointStep: 18 }))).toBe(false);
		});

		it("declines a payload whose buffer offset is not four-aligned", () => {
			// `new Float32Array(buffer, 2, n)` throws outright.
			expect(canUseFloatView(layout({ byteOffset: 2 }))).toBe(false);
		});

		it("declines a non-float32 field, which would be reinterpreted", () => {
			const FLOAT64 = 8;
			expect(
				canUseFloatView(
					layout({ datatypes: [FLOAT32, FLOAT32, FLOAT64] }),
				),
			).toBe(false);
		});

		it("declines an unaligned field offset", () => {
			expect(canUseFloatView(layout({ offsets: [0, 4, 10] }))).toBe(
				false,
			);
		});

		it("declines a cloud missing one of x, y or z", () => {
			expect(
				canUseFloatView(layout({ offsets: [0, 4, undefined] })),
			).toBe(false);
		});

		it("agrees with what the converter decodes on both paths", () => {
			// The two layouts the benchmark used, now asserted on their
			// results: whichever path each takes, the decoded points match.
			const points = makePoints(64);
			const fast = buildCloud(points, {
				pointStep: 16,
				bigEndian: false,
				withRgb: false,
			});
			const fallback = buildCloud(points, {
				pointStep: 18,
				bigEndian: false,
				withRgb: false,
			});

			expect(canUseFloatView(layout({ pointStep: 16 }))).toBe(true);
			expect(canUseFloatView(layout({ pointStep: 18 }))).toBe(false);

			const fromFast = pc2.fromRos2(fast).points;
			const fromFallback = pc2.fromRos2(fallback).points;

			// `makePoints` plants one NaN coordinate, so the decoded count is
			// one point short of the input — and both paths must be short by
			// the same one. Comparing the arrays is the assertion; a literal
			// length would only restate the fixture.
			expect(fromFast.length).toBe((points.length - 1) * 3);
			expect(Array.from(fromFast)).toEqual(Array.from(fromFallback));
		});
	});
});

describe("canReadRgb", () => {
	it("covers the three datatypes the unpacker understands", () => {
		expect(canReadRgb(5)).toBe(true); // INT32
		expect(canReadRgb(6)).toBe(true); // UINT32
		expect(canReadRgb(FLOAT32)).toBe(true);
	});

	it("rejects a missing field and every other datatype", () => {
		expect(canReadRgb(undefined)).toBe(false);
		expect(canReadRgb(1)).toBe(false); // INT8
		expect(canReadRgb(8)).toBe(false); // FLOAT64
	});
});

describe("a declared rgb field the reader cannot unpack", () => {
	/** FLOAT64: a legal PointField datatype `readRgb` has no branch for. */
	const FLOAT64 = 8;

	it("yields no colors rather than a cloud of black points", () => {
		// The regression: `colors` was shipped whenever the cloud *declared*
		// rgb, so the untouched (zeroed) buffer arrived as a uniformly black
		// cloud the widget had no way to tell from real data — and black is
		// invisible on a dark scene, exactly as white was on a light one.
		const points = makePoints(64);
		const decoded = pc2.fromRos2(
			buildCloud(points, {
				pointStep: 20,
				bigEndian: false,
				withRgb: true,
				rgbDatatype: FLOAT64,
			}),
		);

		expect(decoded.colors).toBeUndefined();
		// The geometry itself is unaffected: only the colours are withheld.
		expect(decoded.points.length).toBe((points.length - 1) * 3);
	});

	it("still yields colors when the datatype is one the reader knows", () => {
		const decoded = pc2.fromRos2(
			buildCloud(makePoints(64), {
				pointStep: 20,
				bigEndian: false,
				withRgb: true,
			}),
		);

		expect(decoded.colors).toBeDefined();
		expect(decoded.colors!.some((channel: number) => channel > 0)).toBe(
			true,
		);
	});

	it("withholds them on the DataView path too", () => {
		// An unaligned stride forces the fallback reader; the two paths must
		// agree about whether a colour exists at all.
		const decoded = pc2.fromRos2(
			buildCloud(makePoints(64), {
				pointStep: 22,
				bigEndian: false,
				withRgb: true,
				rgbDatatype: FLOAT64,
			}),
		);

		expect(decoded.colors).toBeUndefined();
	});
});
