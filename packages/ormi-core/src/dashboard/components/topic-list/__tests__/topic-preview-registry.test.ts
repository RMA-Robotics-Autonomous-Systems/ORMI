/**
 * Tests for which preview a hovered topic resolves to.
 *
 * A lookup that quietly stops resolving leaves the hover working and the card
 * empty — no error, no missing element, nothing an operator would report.
 */

import { describe, test, expect } from "bun:test";

import type { DatasourceTopic } from "../../../../datasources/datasource-interface";
import {
	TOPIC_PREVIEW_FALLBACK,
	resolveTopicPreview,
	type TopicPreviewRegistry,
} from "../topic-preview-registry";

const topic = (type: string): DatasourceTopic => ({
	topic: "/some/topic",
	datasource_id: "ds-1",
	type,
	rawType: "std_msgs/msg/Float32",
	source: { id: "ds-1", title: "Robot A" } as DatasourceTopic["source"],
});

const registry = (entries: [string, string][]): TopicPreviewRegistry =>
	new Map(entries.map(([key, label]) => [key, { component: () => label }]));

const rendered = (config: ReturnType<typeof resolveTopicPreview>): unknown =>
	config?.component(topic("whatever"));

describe("resolveTopicPreview", () => {
	test("prefers the preview registered for the webapp type", () => {
		const previews = registry([
			["Image", "image"],
			[TOPIC_PREVIEW_FALLBACK, "json"],
		]);

		expect(rendered(resolveTopicPreview(previews, topic("Image")))).toBe(
			"image",
		);
	});

	test("falls back for an unregistered type, so a new message is still inspectable", () => {
		const previews = registry([[TOPIC_PREVIEW_FALLBACK, "json"]]);

		expect(rendered(resolveTopicPreview(previews, topic("BrandNew")))).toBe(
			"json",
		);
	});

	test("falls back for a topic with no webapp type at all", () => {
		const previews = registry([[TOPIC_PREVIEW_FALLBACK, "json"]]);

		expect(rendered(resolveTopicPreview(previews, topic("")))).toBe("json");
	});

	test("is undefined when no plugin contributed anything", () => {
		expect(resolveTopicPreview(new Map(), topic("Image"))).toBeUndefined();
	});
});
