/**
 * Guards the rosbridge queue-mode decision: the datasource's own
 * classification (TF / DiagnosticArray / configured transform-tree topics) OR
 * the consumer's `DatasourceTopic.lossless` declaration.
 */

import { describe, test, expect } from "bun:test";

import { isLosslessTopic } from "../topic-lossless";

const IMU = "sensor_msgs/msg/Imu";

describe("isLosslessTopic", () => {
	test("a plain topic nobody declared stays last-wins", () => {
		expect(isLosslessTopic("/imu", IMU, [], new Set())).toBe(false);
	});

	test("a consumer's declaration makes a plain topic lossless", () => {
		expect(isLosslessTopic("/imu", IMU, [], new Set(["/imu"]))).toBe(true);
	});

	test("a declaration for another topic does not leak", () => {
		expect(isLosslessTopic("/imu", IMU, [], new Set(["/odom"]))).toBe(
			false,
		);
	});

	test("raw-type and transform-tree classification still hold", () => {
		expect(
			isLosslessTopic("/tf", "tf2_msgs/msg/TFMessage", [], new Set()),
		).toBe(true);
		expect(isLosslessTopic("/my_tf", IMU, ["/my_tf"], new Set())).toBe(
			true,
		);
		expect(isLosslessTopic("/imu", IMU, undefined, new Set())).toBe(false);
	});
});
