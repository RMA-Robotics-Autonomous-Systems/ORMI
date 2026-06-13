/**
 * Tests for the subscription reconcile decision logic. The SubscriptionManager
 * wires this into a stabilize effect; the wiring is covered by typecheck/build,
 * while the recovery semantics that matter (no double-subscribe, channel
 * gating, reconnect recovery) are exercised here as a pure unit.
 */

import { describe, test, expect } from "bun:test";

import {
	topicsToSubscribe,
	type ReconcileChannel,
	type ReconcileSubscriber,
} from "../subscription-reconcile";

const channels = (...topics: string[]): ReconcileChannel[] =>
	topics.map((topic) => ({ topic }));

const subscribers = (...topics: string[]): ReconcileSubscriber[] =>
	topics.map((topic) => ({ topic }));

const requested = (...topics: string[]): Map<string, number> =>
	new Map(topics.map((topic) => [topic, 1]));

describe("topicsToSubscribe", () => {
	test("schedules a requested topic with an advertised channel and no subscriber", () => {
		const result = topicsToSubscribe(
			requested("/odom").keys(),
			subscribers(),
			channels("/odom", "/map"),
		);
		expect(result).toEqual(["/odom"]);
	});

	test("does not schedule an already-subscribed topic (idempotent)", () => {
		const result = topicsToSubscribe(
			requested("/odom").keys(),
			subscribers("/odom"),
			channels("/odom"),
		);
		expect(result).toEqual([]);
	});

	test("does not schedule a requested topic whose channel is not advertised", () => {
		const result = topicsToSubscribe(
			requested("/odom").keys(),
			subscribers(),
			channels("/map"),
		);
		expect(result).toEqual([]);
	});

	test("recovers all requested topics after a teardown wiped the subscribers", () => {
		// Reconnect-recovery case: requestedTopics persists across the churn,
		// the subscribers map was cleared on teardown, and channels are present
		// again on the final connection. Every requested topic must reschedule.
		const result = topicsToSubscribe(
			requested("/odom", "/scan", "/tf").keys(),
			subscribers(), // wiped during teardown
			channels("/odom", "/scan", "/tf"),
		);
		expect(result.sort()).toEqual(["/odom", "/scan", "/tf"]);
	});

	test("schedules only the missing subset when some topics are still live", () => {
		const result = topicsToSubscribe(
			requested("/odom", "/scan", "/tf").keys(),
			subscribers("/scan"), // survived
			channels("/odom", "/scan", "/tf"),
		);
		expect(result.sort()).toEqual(["/odom", "/tf"]);
	});

	test("skips a topic that is both unsubscribed and unadvertised", () => {
		const result = topicsToSubscribe(
			requested("/odom", "/gone").keys(),
			subscribers(),
			channels("/odom"),
		);
		expect(result).toEqual(["/odom"]);
	});

	test("never emits duplicates for a repeated requested topic", () => {
		const result = topicsToSubscribe(
			["/odom", "/odom"],
			subscribers(),
			channels("/odom"),
		);
		expect(result).toEqual(["/odom"]);
	});

	test("returns nothing when there is no recorded intent", () => {
		const result = topicsToSubscribe(
			requested().keys(),
			subscribers("/odom"),
			channels("/odom"),
		);
		expect(result).toEqual([]);
	});
});
