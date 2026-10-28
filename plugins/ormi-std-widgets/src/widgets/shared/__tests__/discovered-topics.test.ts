/**
 * `reduceDiscoveredTopics`: waiting vs settled, a failed poll never waits
 * forever, and an unchanged topic set keeps its identity (no resubscribe).
 */
import { describe, expect, test } from "bun:test";
import type { SelectedTopic } from "@workspace/ormi-core/datasources";

import {
	reduceDiscoveredTopics,
	type DiscoveredTopics,
} from "../use-discovered-topics";

const topic = (name: string, source = "ds1"): SelectedTopic => ({
	topic: name,
	type: "BatteryState",
	rawType: "sensor_msgs/msg/BatteryState",
	datasource_id: source,
	source: { id: source, title: source, enable: true },
	property: "",
});

const waiting: DiscoveredTopics = { status: "waiting" };

describe("reduceDiscoveredTopics", () => {
	test("a poll settles, even on an empty list", () => {
		expect(reduceDiscoveredTopics(waiting, [])).toEqual({
			status: "settled",
			topics: [],
		});
	});

	test("a failed first poll settles empty; a failed later poll keeps the list", () => {
		expect(reduceDiscoveredTopics(waiting, null)).toEqual({
			status: "settled",
			topics: [],
		});
		const settled = reduceDiscoveredTopics(waiting, [topic("/a")]);
		expect(reduceDiscoveredTopics(settled, null)).toBe(settled);
	});

	test("a reordered, same-set poll keeps identity; a changed set does not", () => {
		const settled = reduceDiscoveredTopics(waiting, [
			topic("/a"),
			topic("/b"),
		]);
		expect(
			reduceDiscoveredTopics(settled, [topic("/b"), topic("/a")]),
		).toBe(settled);
		expect(
			reduceDiscoveredTopics(settled, [topic("/a"), topic("/c")]),
		).toEqual({ status: "settled", topics: [topic("/a"), topic("/c")] });
	});
});
