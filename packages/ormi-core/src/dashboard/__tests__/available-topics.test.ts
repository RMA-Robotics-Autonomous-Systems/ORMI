/**
 * What `useAvailableTopics` counts as "the list has not changed".
 *
 * The hook returns the PREVIOUS array whenever a poll reports the same topics,
 * so memoised consumers are not torn down twice a second. That makes
 * `sameTopics` the gate on everything the topic list can ever show: a field it
 * ignores is a field that can never change on screen, no matter how correctly
 * the datasource reports it.
 *
 * Operator report: "when we add a datasource and change its name, it doesn't
 * update in the dashboard topics — we have to reload the dashboard." The
 * datasource's title is rendered in the topic list's first column and was not
 * compared here, so even once the datasource reported the new name the hook
 * kept handing back the array built before the rename.
 */

import { describe, test, expect } from "bun:test";

import { sameTopics } from "../state/use-available-topics";
import type { DatasourceTopic } from "../../datasources/datasource-interface";

/** A topic as a datasource reports it. */
const topic = (
	overrides: Partial<DatasourceTopic> & { topic: string },
): DatasourceTopic => ({
	datasource_id: "datasource_1",
	type: "number",
	rawType: "std_msgs/msg/Float64",
	source: { id: "datasource_1", title: "Robot A", enable: true },
	...overrides,
});

describe("sameTopics", () => {
	test("an unchanged list is the same list", () => {
		const previous = [topic({ topic: "/a" }), topic({ topic: "/b" })];
		const next = [topic({ topic: "/a" }), topic({ topic: "/b" })];
		expect(sameTopics(previous, next)).toBe(true);
	});

	test("a topic that appeared is a change", () => {
		expect(
			sameTopics(
				[topic({ topic: "/a" })],
				[topic({ topic: "/a" }), topic({ topic: "/b" })],
			),
		).toBe(false);
	});

	test("a topic that disappeared is a change", () => {
		expect(
			sameTopics(
				[topic({ topic: "/a" }), topic({ topic: "/b" })],
				[topic({ topic: "/a" })],
			),
		).toBe(false);
	});

	test("renaming the datasource is a change", () => {
		const before = [
			topic({
				topic: "/a",
				source: { id: "datasource_1", title: "Old name", enable: true },
			}),
		];
		const after = [
			topic({
				topic: "/a",
				source: { id: "datasource_1", title: "New name", enable: true },
			}),
		];

		expect(sameTopics(before, after)).toBe(false);
	});

	test("an unrelated settings edit is not a change", () => {
		// Only the title reaches the screen. Re-keying the list on every url or
		// timeout edit would tear down every memoised consumer for nothing.
		const before = [
			topic({
				topic: "/a",
				source: {
					id: "datasource_1",
					title: "Robot A",
					enable: true,
					url: "ws://old:8765",
				} as DatasourceTopic["source"],
			}),
		];
		const after = [
			topic({
				topic: "/a",
				source: {
					id: "datasource_1",
					title: "Robot A",
					enable: true,
					url: "ws://new:8765",
				} as DatasourceTopic["source"],
			}),
		];

		expect(sameTopics(before, after)).toBe(true);
	});

	test("a topic whose raw type changed is a change", () => {
		expect(
			sameTopics(
				[topic({ topic: "/a", rawType: "std_msgs/msg/Float64" })],
				[topic({ topic: "/a", rawType: "std_msgs/msg/Int32" })],
			),
		).toBe(false);
	});

	test("the same topic on a different datasource is a change", () => {
		expect(
			sameTopics(
				[topic({ topic: "/a", datasource_id: "datasource_1" })],
				[topic({ topic: "/a", datasource_id: "datasource_2" })],
			),
		).toBe(false);
	});

	test("reordering is a change: the list is compared positionally", () => {
		// Datasources enumerate in wire order, and the panel sorts what it is
		// given — a reorder is a different list to render.
		expect(
			sameTopics(
				[topic({ topic: "/a" }), topic({ topic: "/b" })],
				[topic({ topic: "/b" }), topic({ topic: "/a" })],
			),
		).toBe(false);
	});
});
