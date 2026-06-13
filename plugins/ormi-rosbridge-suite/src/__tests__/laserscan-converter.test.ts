import { describe, expect, it } from "bun:test";

import { UnifiedConverter } from "../ros2/unified-converter";

const laserScan =
	UnifiedConverter.converters.PointsCloud!.conversions[
		"sensor_msgs/msg/LaserScan"
	]!;

describe("LaserScan -> PointsCloud conversion", () => {
	it("routes LaserScan to the PointsCloud webapp type", () => {
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"sensor_msgs/msg/LaserScan",
			),
		).toBe("PointsCloud");
	});

	it("projects polar ranges into THREE-convention cartesian points", () => {
		const cloud = laserScan.fromRos2({
			angle_min: 0,
			angle_increment: Math.PI / 2,
			range_min: 0,
			range_max: 5,
			ranges: [1, 2, NaN, Infinity, 10],
		});

		// NaN, Infinity, and the out-of-window 10 (> range_max) are dropped.
		expect(cloud.points.length).toBe(6);
		expect(cloud.convention).toBe("THREE");

		// i=0: r=1, angle=0 -> ROS (1,0,0) -> THREE (-0, 0, -1)
		expect(cloud.points[0]).toBeCloseTo(0, 5);
		expect(cloud.points[1]).toBeCloseTo(0, 5);
		expect(cloud.points[2]).toBeCloseTo(-1, 5);

		// i=1: r=2, angle=pi/2 -> ROS (~0, 2, 0) -> THREE (-2, 0, ~0)
		expect(cloud.points[3]).toBeCloseTo(-2, 5);
		expect(cloud.points[4]).toBeCloseTo(0, 5);
		expect(cloud.points[5]).toBeCloseTo(0, 5);
	});

	it("normalizes per-scan intensities to 0..1 aligned with kept points", () => {
		const cloud = laserScan.fromRos2({
			angle_min: 0,
			angle_increment: Math.PI / 2,
			range_min: 0,
			range_max: 5,
			ranges: [1, 100, 2],
			intensities: [50, 0, 100],
		});

		// range 100 is dropped; intensities stay aligned with kept ranges (1, 2).
		expect(cloud.intensities).toBeDefined();
		expect(cloud.intensities!.length).toBe(2);
		expect(cloud.intensities![0]).toBeCloseTo(0.5, 5); // 50 / max(50,100)
		expect(cloud.intensities![1]).toBeCloseTo(1, 5); // 100 / max
	});

	it("returns an empty cloud for a malformed message", () => {
		const cloud = laserScan.fromRos2({});
		expect(cloud.points.length).toBe(0);
		expect(cloud.convention).toBe("THREE");
	});
});
