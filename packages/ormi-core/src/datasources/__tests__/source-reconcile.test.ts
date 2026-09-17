/**
 * Tests for the buffer-map reconciliation `LocalDataSourcesProvider` runs on
 * every topic change.
 *
 * Both rules under test fail silently in the running dashboard — a chart that
 * quietly restarts from zero, or a wire that unsubscribes and resubscribes on
 * every unrelated re-render — so neither is caught by a type check or by
 * looking at the UI.
 */

import { describe, test, expect } from "bun:test";
import {
	createEmptyBuffer,
	createSourcesKey,
	prunePendingUpdates,
	reconcileSources,
	type TopicBuffer,
} from "../source-reconcile";

/** Build a selected-topic-shaped fixture. */
const topic = (
	sourceId: string,
	name: string,
	property?: string,
	bufferSize?: number,
) => ({
	topic: name,
	datasource_id: sourceId,
	source: { id: sourceId, title: sourceId, enable: true },
	type: "number",
	rawType: "std_msgs/Float64",
	property: property ?? "",
	bufferSize,
});

/** A buffer holding `count` samples, so preservation is observable. */
const filled = (count: number): TopicBuffer => ({
	data: Array.from({ length: count }, (_, i) => i),
	times: Array.from({ length: count }, (_, i) => i * 10),
	referenceFrameId: "map",
});

describe("createSourcesKey", () => {
	test("an equal-but-new array yields an identical key", () => {
		const a = [topic("ds1", "/odom"), topic("ds1", "/imu")];
		const b = [topic("ds1", "/odom"), topic("ds1", "/imu")];

		expect(a).not.toBe(b);
		expect(createSourcesKey(a)).toBe(createSourcesKey(b));
	});

	test("a changed topic name changes the key", () => {
		expect(createSourcesKey([topic("ds1", "/odom")])).not.toBe(
			createSourcesKey([topic("ds1", "/imu")]),
		);
	});

	test("the same topic on a different datasource changes the key", () => {
		expect(createSourcesKey([topic("ds1", "/odom")])).not.toBe(
			createSourcesKey([topic("ds2", "/odom")]),
		);
	});

	test("a changed property changes the key", () => {
		expect(
			createSourcesKey([topic("ds1", "/odom", "pose.position.x")]),
		).not.toBe(
			createSourcesKey([topic("ds1", "/odom", "pose.position.y")]),
		);
	});

	test("an unbound slot is not keyed, so it owns no wire", () => {
		// A widget the operator has not finished configuring holds an empty
		// topic slot. It subscribes to nothing, so it must not change the
		// identity of the subscription the widget already owns — otherwise
		// binding an unrelated field tears every live wire down.
		expect(createSourcesKey([topic("ds1", "/odom"), undefined])).toBe(
			createSourcesKey([topic("ds1", "/odom")]),
		);

		expect(createSourcesKey([undefined, null])).toBe("");
	});

	test("binding a previously empty slot changes the key", () => {
		expect(createSourcesKey([topic("ds1", "/odom"), undefined])).not.toBe(
			createSourcesKey([topic("ds1", "/odom"), topic("ds1", "/imu")]),
		);
	});

	test("adding or removing a topic changes the key", () => {
		const one = createSourcesKey([topic("ds1", "/odom")]);
		const two = createSourcesKey([
			topic("ds1", "/odom"),
			topic("ds1", "/imu"),
		]);
		expect(one).not.toBe(two);
	});

	test("bufferSize is NOT part of identity — depth must not re-subscribe", () => {
		expect(createSourcesKey([topic("ds1", "/odom", "", 1)])).toBe(
			createSourcesKey([topic("ds1", "/odom", "", 2000)]),
		);
	});

	test("an empty topic list is a stable key", () => {
		expect(createSourcesKey([])).toBe(createSourcesKey([]));
	});
});

describe("reconcileSources", () => {
	test("re-render with the same topic set is a no-op (same Map instance)", () => {
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", filled(3)],
		]);

		const next = reconcileSources(previous, ["ds1::/odom"]);

		// Identity matters: Jotai bails out on Object.is, so returning a new
		// equal Map would re-render every consumer on every topic-array churn.
		expect(next).toBe(previous);
	});

	test("an unchanged topic keeps its buffer when another is added", () => {
		const existing = filled(2000);
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", existing],
		]);

		const next = reconcileSources(previous, ["ds1::/odom", "ds1::/imu"]);

		expect(next).not.toBe(previous);
		expect(next.get("ds1::/odom")).toBe(existing);
		expect(next.get("ds1::/odom")?.data).toHaveLength(2000);
	});

	test("a newly added topic starts empty", () => {
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", filled(5)],
		]);

		const next = reconcileSources(previous, ["ds1::/odom", "ds1::/imu"]);

		expect(next.get("ds1::/imu")).toEqual(createEmptyBuffer());
	});

	test("a removed topic is dropped and the survivors keep their buffers", () => {
		const kept = filled(7);
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", kept],
			["ds1::/imu", filled(4)],
		]);

		const next = reconcileSources(previous, ["ds1::/odom"]);

		expect(next.has("ds1::/imu")).toBe(false);
		expect(next.get("ds1::/odom")).toBe(kept);
		expect(next.size).toBe(1);
	});

	test("swapping one topic for another keeps neither stale nor shared state", () => {
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", filled(9)],
		]);

		const next = reconcileSources(previous, ["ds1::/imu"]);

		expect([...next.keys()]).toEqual(["ds1::/imu"]);
		expect(next.get("ds1::/imu")?.data).toHaveLength(0);
	});

	test("clearing the topic list empties the map", () => {
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", filled(1)],
		]);

		expect(reconcileSources(previous, []).size).toBe(0);
	});

	test("an empty map with no topics is still a no-op", () => {
		const previous = new Map<string, TopicBuffer>();
		expect(reconcileSources(previous, [])).toBe(previous);
	});

	test("a duplicated key is not mistaken for a changed set", () => {
		const previous = new Map<string, TopicBuffer>([
			["ds1::/odom", filled(3)],
		]);

		// Two widget slots bound to the same topic produce the same wire key.
		const next = reconcileSources(previous, ["ds1::/odom", "ds1::/odom"]);

		expect(next).toBe(previous);
	});
});

describe("prunePendingUpdates", () => {
	test("drops entries for removed topics and keeps undrained survivors", () => {
		const pending = new Map<string, number>([
			["ds1::/odom", 1],
			["ds1::/imu", 2],
		]);

		prunePendingUpdates(pending, ["ds1::/odom"]);

		expect([...pending.keys()]).toEqual(["ds1::/odom"]);
		expect(pending.get("ds1::/odom")).toBe(1);
	});

	test("keeps everything when nothing was removed", () => {
		const pending = new Map<string, number>([["ds1::/odom", 1]]);

		prunePendingUpdates(pending, ["ds1::/odom", "ds1::/imu"]);

		expect(pending.size).toBe(1);
	});
});
