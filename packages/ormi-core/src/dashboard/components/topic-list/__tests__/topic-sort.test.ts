/**
 * Tests for how the topics panel filters and orders its rows.
 *
 * The panel is the only topic list in the product, so a comparator regression
 * shows up as "I cannot find my topic" on a live robot rather than as a failed
 * render — the ordering is pinned here because nothing else would notice.
 */

import { describe, test, expect } from "bun:test";

import type { DatasourceTopic } from "../../../../datasources/datasource-interface";
import {
	matchesTopicQuery,
	selectTopics,
	topicSortValue,
	type TopicListView,
} from "../topic-sort";

const topic = (
	overrides: Partial<DatasourceTopic> & Pick<DatasourceTopic, "topic">,
): DatasourceTopic => ({
	datasource_id: "ds-1",
	type: "number",
	rawType: "std_msgs/msg/Float32",
	source: {
		id: "ds-1",
		title: "Robot A",
	} as DatasourceTopic["source"],
	...overrides,
});

const view = (overrides: Partial<TopicListView> = {}): TopicListView => ({
	query: "",
	sortKey: "topic",
	sortDirection: "asc",
	...overrides,
});

describe("topicSortValue", () => {
	test("reads the column the table is ordered by", () => {
		const row = topic({
			topic: "/scan",
			type: "PointsCloud",
			rawType: "sensor_msgs/msg/PointCloud2",
		});

		expect(topicSortValue(row, "topic")).toBe("/scan");
		expect(topicSortValue(row, "type")).toBe("PointsCloud");
		expect(topicSortValue(row, "rawType")).toBe(
			"sensor_msgs/msg/PointCloud2",
		);
		expect(topicSortValue(row, "datasource")).toBe("Robot A");
	});

	test("an unset type sorts as empty rather than throwing", () => {
		expect(topicSortValue(topic({ topic: "/x", type: "" }), "type")).toBe(
			"",
		);
	});
});

describe("matchesTopicQuery", () => {
	const row = topic({
		topic: "/camera/image_raw",
		type: "Image",
		rawType: "sensor_msgs/msg/CompressedImage",
	});

	test("an empty needle keeps every row", () => {
		expect(matchesTopicQuery(row, "")).toBe(true);
	});

	test("matches on every column the table shows", () => {
		expect(matchesTopicQuery(row, "image_raw")).toBe(true);
		expect(matchesTopicQuery(row, "image")).toBe(true);
		expect(matchesTopicQuery(row, "compressed")).toBe(true);
		expect(matchesTopicQuery(row, "robot a")).toBe(true);
	});

	test("does not match what is not on the row", () => {
		expect(matchesTopicQuery(row, "lidar")).toBe(false);
	});
});

describe("selectTopics", () => {
	test("orders numerically, so /cam10 follows /cam2", () => {
		const topics = [
			topic({ topic: "/cam10" }),
			topic({ topic: "/cam2" }),
			topic({ topic: "/cam1" }),
		];

		expect(selectTopics(topics, view()).map((row) => row.topic)).toEqual([
			"/cam1",
			"/cam2",
			"/cam10",
		]);
	});

	test("reverses on descending", () => {
		const topics = [topic({ topic: "/b" }), topic({ topic: "/a" })];

		expect(
			selectTopics(topics, view({ sortDirection: "desc" })).map(
				(row) => row.topic,
			),
		).toEqual(["/b", "/a"]);
	});

	test("ties keep one order in both directions", () => {
		// Same type on three datasources: reversing the sort must not reshuffle
		// rows the operator reads as identical.
		const topics = [
			topic({ topic: "/c", datasource_id: "ds-3" }),
			topic({ topic: "/a", datasource_id: "ds-1" }),
			topic({ topic: "/b", datasource_id: "ds-2" }),
		];

		const ascending = selectTopics(topics, view({ sortKey: "type" }));
		const descending = selectTopics(
			topics,
			view({ sortKey: "type", sortDirection: "desc" }),
		);

		expect(ascending.map((row) => row.topic)).toEqual(["/a", "/b", "/c"]);
		expect(descending.map((row) => row.topic)).toEqual(["/a", "/b", "/c"]);
	});

	test("filters before it orders", () => {
		const topics = [
			topic({ topic: "/lidar/points", type: "PointsCloud" }),
			topic({ topic: "/camera/image", type: "Image" }),
			topic({ topic: "/battery", type: "number" }),
		];

		expect(
			selectTopics(topics, view({ query: "  CAM  " })).map(
				(row) => row.topic,
			),
		).toEqual(["/camera/image"]);
	});

	test("never mutates the list it was handed", () => {
		const topics = [topic({ topic: "/b" }), topic({ topic: "/a" })];
		const snapshot = topics.map((row) => row.topic);

		selectTopics(topics, view());

		expect(topics.map((row) => row.topic)).toEqual(snapshot);
	});
});
