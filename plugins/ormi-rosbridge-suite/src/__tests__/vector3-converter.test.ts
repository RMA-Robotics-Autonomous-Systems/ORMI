/**
 * `geometry_msgs/msg/Vector3` and its stamped form must reach the dashboard as
 * the `Vector3` webapp type over rosbridge, the way they already do over
 * foxglove.
 *
 * Routing is decided on the webapp type, so a transport that leaves a vector
 * untyped offers the operator a different set of widgets for the same topic on
 * the same robot — the kind of difference nobody attributes to the transport.
 */

import { describe, expect, it } from "bun:test";

import { UnifiedConverter } from "../ros2/unified-converter";

const stamped =
	UnifiedConverter.converters.Vector3!.conversions[
		"geometry_msgs/msg/Vector3Stamped"
	]!;
const bare =
	UnifiedConverter.converters.Vector3!.conversions[
		"geometry_msgs/msg/Vector3"
	]!;

describe("Vector3 <-> geometry_msgs conversion (rosbridge)", () => {
	it("routes both schemas to the Vector3 webapp type", () => {
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"geometry_msgs/msg/Vector3",
			),
		).toBe("Vector3");
		expect(
			UnifiedConverter.getWebappTypeFromROSType(
				"geometry_msgs/msg/Vector3Stamped",
			),
		).toBe("Vector3");
	});

	it("keeps the unstamped vector as the primary ROS type", () => {
		expect(UnifiedConverter.getROSTypeFromWebappType("Vector3")).toBe(
			"geometry_msgs/msg/Vector3Stamped",
		);
	});

	it("unwraps the nested vector of a stamped message", () => {
		expect(
			stamped.fromRos2({
				header: {
					stamp: { sec: 3, nanosec: 0 },
					frame_id: "base_link",
				},
				vector: { x: 1.5, y: -2, z: 0.25 },
			}),
		).toEqual({ x: 1.5, y: -2, z: 0.25 });
	});

	it("reads an unstamped vector from the top level", () => {
		// The one that matters: reading only `data.vector` here would report
		// every bare vector as a stationary {0, 0, 0}.
		expect(bare.fromRos2({ x: 1.5, y: -2, z: 0.25 })).toEqual({
			x: 1.5,
			y: -2,
			z: 0.25,
		});
	});

	it("defaults missing components to zero", () => {
		expect(stamped.fromRos2({ header: {}, vector: {} })).toEqual({
			x: 0,
			y: 0,
			z: 0,
		});
		expect(bare.fromRos2({})).toEqual({ x: 0, y: 0, z: 0 });
	});

	it("round-trips through each ROS 2 shape", () => {
		const vector = { x: 1, y: 2, z: 3 };

		expect(stamped.toRos2(vector)).toEqual({ vector });
		expect(stamped.fromRos2(stamped.toRos2(vector))).toEqual(vector);

		expect(bare.toRos2(vector)).toEqual(vector);
		expect(bare.fromRos2(bare.toRos2(vector))).toEqual(vector);
	});
});
