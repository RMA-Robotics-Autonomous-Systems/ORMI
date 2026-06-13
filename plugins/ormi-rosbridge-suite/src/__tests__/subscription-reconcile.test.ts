/**
 * Tests for the subscription reconcile decision logic. The datasource provider
 * wires this into the "connection" event handler after a reconnect; the wiring
 * is covered by typecheck/build, while the recovery semantics that matter (no
 * double-subscribe, reconnect recovery, partial overlap) are exercised here as
 * a pure unit. No roslib is faked — the helper is connection-agnostic.
 */

import { describe, test, expect } from "bun:test";

import {
	topicsToResubscribe,
	type RequestedTopic,
} from "../subscription-reconcile";

const requested = (
	...entries: [topic: string, rawType: string][]
): Map<string, RequestedTopic> =>
	new Map(entries.map(([topic, rawType]) => [topic, { rawType, count: 1 }]));

const live = (...topics: string[]): Set<string> => new Set(topics);

describe("topicsToResubscribe", () => {
	test("schedules a requested topic that has no live subscriber", () => {
		const result = topicsToResubscribe(
			requested(["/odom", "nav_msgs/msg/Odometry"]),
			live(),
		);
		expect(result).toEqual([
			{ topic: "/odom", rawType: "nav_msgs/msg/Odometry" },
		]);
	});

	test("does not schedule an already-live topic (idempotent)", () => {
		const result = topicsToResubscribe(
			requested(["/odom", "nav_msgs/msg/Odometry"]),
			live("/odom"),
		);
		expect(result).toEqual([]);
	});

	test("recovers all requested topics after a reconnect wiped the live set", () => {
		// Reconnect-recovery case: requestedTopics persists across the close,
		// the live subscribers were dropped (their ROSLIB.Topic objects are
		// bound to the dead connection), so every requested topic reschedules
		// on the new connection, each with its recorded rawType.
		const result = topicsToResubscribe(
			requested(
				["/odom", "nav_msgs/msg/Odometry"],
				["/scan", "sensor_msgs/msg/LaserScan"],
				["/tf", "tf2_msgs/msg/TFMessage"],
			),
			live(), // wiped on reconnect
		);
		expect(result).toEqual([
			{ topic: "/odom", rawType: "nav_msgs/msg/Odometry" },
			{ topic: "/scan", rawType: "sensor_msgs/msg/LaserScan" },
			{ topic: "/tf", rawType: "tf2_msgs/msg/TFMessage" },
		]);
	});

	test("returns nothing when there is no recorded intent", () => {
		const result = topicsToResubscribe(requested(), live("/odom"));
		expect(result).toEqual([]);
	});

	test("schedules only the missing subset on partial overlap", () => {
		const result = topicsToResubscribe(
			requested(
				["/odom", "nav_msgs/msg/Odometry"],
				["/scan", "sensor_msgs/msg/LaserScan"],
				["/tf", "tf2_msgs/msg/TFMessage"],
			),
			live("/scan"), // still live on the current connection
		);
		expect(result).toEqual([
			{ topic: "/odom", rawType: "nav_msgs/msg/Odometry" },
			{ topic: "/tf", rawType: "tf2_msgs/msg/TFMessage" },
		]);
	});
});
