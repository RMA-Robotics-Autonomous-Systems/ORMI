import { describe, expect, it } from "bun:test";

import { UnifiedConverter } from "../ros2/unified-converter";

const twistStamped =
	UnifiedConverter.converters.Movement!.conversions[
		"geometry_msgs/msg/TwistStamped"
	]!;

describe("TwistStamped <-> Movement conversion (rosbridge)", () => {
	it("routes TwistStamped to the Movement webapp type", () => {
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"geometry_msgs/msg/TwistStamped",
			),
		).toBe("Movement");
	});

	it("keeps unstamped Twist as the primary ROS type for Movement", () => {
		expect(UnifiedConverter.getROSTypeFromWebappType("Movement")).toBe(
			"geometry_msgs/msg/Twist",
		);
	});

	it("unwraps the nested twist body", () => {
		const movement = twistStamped.fromRos2({
			header: { stamp: { sec: 12, nanosec: 0 }, frame_id: "base_link" },
			twist: {
				linear: { x: 1, y: 2, z: 3 },
				angular: { x: 4, y: 5, z: 6 },
			},
		});

		expect(movement.linear).toEqual({ x: 1, y: 2, z: 3 });
		expect(movement.angular).toEqual({ x: 4, y: 5, z: 6 });
	});

	it("defaults missing velocity fields to zero", () => {
		const movement = twistStamped.fromRos2({ header: {}, twist: {} });

		expect(movement.linear).toEqual({ x: 0, y: 0, z: 0 });
		expect(movement.angular).toEqual({ x: 0, y: 0, z: 0 });
	});

	it("nests the body under `twist` and stamps the header when publishing", () => {
		const before = Date.now();
		const msg = twistStamped.toRos2({
			linear: { x: 0.5, y: 0, z: 0 },
			angular: { x: 0, y: 0, z: -0.25 },
		});
		const after = Date.now();

		expect(msg.twist.linear).toEqual({ x: 0.5, y: 0, z: 0 });
		expect(msg.twist.angular).toEqual({ x: 0, y: 0, z: -0.25 });
		expect(msg.header.frame_id).toBe("");

		const stampMs =
			msg.header.stamp.sec * 1000 + msg.header.stamp.nanosec / 1e6;
		expect(stampMs).toBeGreaterThanOrEqual(before);
		expect(stampMs).toBeLessThanOrEqual(after + 1);
	});

	it("uses the caller-provided frame id", () => {
		const msg = twistStamped.toRos2({
			linear: { x: 0, y: 0, z: 0 },
			angular: { x: 0, y: 0, z: 0 },
			frameId: "base_link",
		});

		expect(msg.header.frame_id).toBe("base_link");
	});
});
