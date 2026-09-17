/**
 * Tests for the inline topic picker's two decisions.
 *
 * Both fail silently in the running dashboard. A pool that lets a property
 * match through renders a one-click row that binds a whole `Vector3` into a
 * `number` slot. A mode that returns "inline" for a binding the radio group
 * cannot express renders the operator's existing property binding as an
 * unselected group — one stray click from being erased, with no warning.
 */

import { describe, test, expect } from "bun:test";
import {
	buildCandidatePool,
	resolveTopicPickerMode,
	EMPTY_CANDIDATE_POOL,
	INLINE_CANDIDATE_LIMIT,
	INLINE_CANDIDATE_MIN,
	INLINE_CANDIDATE_MIN_UNBOUND,
} from "../topic-inline-candidates";
import type { DatasourceTopic } from "../../../datasources/datasource-interface";
import type { SelectedTopic } from "../../../datasources/datasource-interface";
import type { DataRequirements } from "../../../widgets/widget-interface";

const makeTopic = (
	overrides: Partial<DatasourceTopic> & { topic: string },
): DatasourceTopic => ({
	datasource_id: "ros2",
	source: {
		id: "source-a",
		title: "Robot A",
	} as DatasourceTopic["source"],
	type: "",
	rawType: "",
	...overrides,
});

const numberSlot: DataRequirements = { accepts: ["number"] };

/** `n` distinct direct number matches, named so the sort order is predictable. */
const numberTopics = (n: number): DatasourceTopic[] =>
	Array.from({ length: n }, (_, i) =>
		makeTopic({ topic: `/n${i}`, type: "number" }),
	);

describe("buildCandidatePool", () => {
	test("keeps direct type matches and drops everything else", () => {
		const pool = buildCandidatePool(
			[
				makeTopic({ topic: "/battery", type: "number" }),
				makeTopic({ topic: "/name", type: "string" }),
			],
			numberSlot,
		);

		expect(pool.direct.map((t) => t.topic)).toEqual(["/battery"]);
		expect(pool.compatibleCount).toBe(1);
	});

	test("counts property matches but never offers them inline", () => {
		// A Vector3 reaches a number slot through `x`, so it is compatible —
		// but binding the whole message would plot an object as a scalar.
		const pool = buildCandidatePool(
			[
				makeTopic({ topic: "/battery", type: "number" }),
				makeTopic({ topic: "/vel", type: "Vector3" }),
			],
			numberSlot,
		);

		expect(pool.direct.map((t) => t.topic)).toEqual(["/battery"]);
		expect(pool.compatibleCount).toBe(2);
	});

	test("direct-matches on rawType when the slot accepts raw types", () => {
		const pool = buildCandidatePool(
			[
				makeTopic({
					topic: "/swarm/log",
					rawType: "c2_msgs/msg/SwarmLog",
				}),
				makeTopic({ topic: "/other", rawType: "other/Type" }),
			],
			{ accepts: [], acceptsRaw: ["c2_msgs/msg/SwarmLog"] },
		);

		expect(pool.direct.map((t) => t.topic)).toEqual(["/swarm/log"]);
	});

	test("offers nothing inline when the slot has no requirements", () => {
		// "Any topic will do" is not a reason to render 200 radio buttons.
		const pool = buildCandidatePool(numberTopics(3), undefined);

		expect(pool.direct).toEqual([]);
		expect(pool.compatibleCount).toBe(3);
	});

	test("collapses duplicate entries for the same topic on the same source", () => {
		const pool = buildCandidatePool(
			[
				makeTopic({ topic: "/battery", type: "number" }),
				makeTopic({ topic: "/battery", type: "number" }),
			],
			numberSlot,
		);

		expect(pool.direct).toHaveLength(1);
		expect(pool.compatibleCount).toBe(1);
	});

	test("keeps the same topic name from two different sources", () => {
		const pool = buildCandidatePool(
			[
				makeTopic({ topic: "/battery", type: "number" }),
				makeTopic({
					topic: "/battery",
					type: "number",
					source: {
						id: "source-b",
						title: "Robot B",
					} as DatasourceTopic["source"],
				}),
			],
			numberSlot,
		);

		expect(pool.direct).toHaveLength(2);
	});

	test("orders by datasource then topic name, whatever the wire order", () => {
		const robotB = {
			id: "source-b",
			title: "Robot B",
		} as DatasourceTopic["source"];

		const pool = buildCandidatePool(
			[
				makeTopic({ topic: "/z", type: "number", source: robotB }),
				makeTopic({ topic: "/b", type: "number" }),
				makeTopic({ topic: "/a", type: "number", source: robotB }),
				makeTopic({ topic: "/a", type: "number" }),
			],
			numberSlot,
		);

		expect(pool.direct.map((t) => `${t.source.title}${t.topic}`)).toEqual([
			"Robot A/a",
			"Robot A/b",
			"Robot B/a",
			"Robot B/z",
		]);
	});

	test("skips malformed topics that carry no source identity", () => {
		const pool = buildCandidatePool(
			[
				makeTopic({ topic: "/battery", type: "number" }),
				{
					topic: "/broken",
					datasource_id: "ros2",
					type: "number",
					rawType: "",
				} as DatasourceTopic,
			],
			numberSlot,
		);

		expect(pool.direct.map((t) => t.topic)).toEqual(["/battery"]);
	});
});

describe("resolveTopicPickerMode", () => {
	test("defers to the dialog before the topic list has settled", () => {
		expect(resolveTopicPickerMode(EMPTY_CANDIDATE_POOL, undefined)).toBe(
			"dialog",
		);
	});

	test("defers to the dialog when there is nothing to choose between", () => {
		// One candidate is not a choice — auto-select already handled it.
		const pool = buildCandidatePool(
			numberTopics(INLINE_CANDIDATE_MIN - 1),
			numberSlot,
		);
		expect(resolveTopicPickerMode(pool, undefined)).toBe("dialog");
	});

	test("offers the lone candidate of a slot auto-select will not bind", () => {
		// A scalar-only or secondary slot binds nothing by itself, so its one
		// candidate is the whole choice rather than a restatement of one.
		const pool = buildCandidatePool(
			numberTopics(INLINE_CANDIDATE_MIN_UNBOUND),
			numberSlot,
		);

		expect(
			resolveTopicPickerMode(pool, undefined, { autoBindable: false }),
		).toBe("inline");
	});

	test("keeps the lone candidate behind the dialog once something is bound", () => {
		// A single pre-checked radio next to a live binding decides nothing.
		const topics = numberTopics(1);
		const pool = buildCandidatePool(topics, numberSlot);
		const current: SelectedTopic = { ...topics[0]!, property: "" };

		expect(
			resolveTopicPickerMode(pool, current, { autoBindable: false }),
		).toBe("dialog");
	});

	test("still needs nothing to choose from before the list has settled", () => {
		expect(
			resolveTopicPickerMode(EMPTY_CANDIDATE_POOL, undefined, {
				autoBindable: false,
			}),
		).toBe("dialog");
	});

	test("goes inline from the minimum up to the limit", () => {
		for (
			let n = INLINE_CANDIDATE_MIN;
			n <= INLINE_CANDIDATE_LIMIT;
			n += 1
		) {
			const pool = buildCandidatePool(numberTopics(n), numberSlot);
			expect(pool.direct).toHaveLength(n);
			expect(resolveTopicPickerMode(pool, undefined)).toBe("inline");
		}
	});

	test("falls back to the dialog one candidate past the limit", () => {
		const pool = buildCandidatePool(
			numberTopics(INLINE_CANDIDATE_LIMIT + 1),
			numberSlot,
		);
		expect(resolveTopicPickerMode(pool, undefined)).toBe("dialog");
	});

	test("keeps a bound candidate inline", () => {
		const topics = numberTopics(3);
		const pool = buildCandidatePool(topics, numberSlot);
		const current: SelectedTopic = { ...topics[1]!, property: "" };

		expect(resolveTopicPickerMode(pool, current)).toBe("inline");
	});

	test("falls back to the dialog for a property binding", () => {
		// A radio row can only say "this whole topic". Rendering one would show
		// pose.pose.position.x as an unselected group.
		const topics = numberTopics(3);
		const pool = buildCandidatePool(
			[...topics, makeTopic({ topic: "/odom", type: "Vector3" })],
			numberSlot,
		);
		const current: SelectedTopic = {
			...makeTopic({ topic: "/odom", type: "Vector3" }),
			property: "x",
		};

		expect(resolveTopicPickerMode(pool, current)).toBe("dialog");
	});

	test("falls back to the dialog when the bound topic is not a candidate", () => {
		const pool = buildCandidatePool(numberTopics(3), numberSlot);
		const current: SelectedTopic = {
			...makeTopic({ topic: "/gone", type: "number" }),
			property: "",
		};

		expect(resolveTopicPickerMode(pool, current)).toBe("dialog");
	});

	test("falls back to the dialog when the binding names a different source", () => {
		const topics = numberTopics(3);
		const pool = buildCandidatePool(topics, numberSlot);
		const current: SelectedTopic = {
			...topics[0]!,
			source: {
				id: "source-b",
				title: "Robot B",
			} as DatasourceTopic["source"],
			property: "",
		};

		expect(resolveTopicPickerMode(pool, current)).toBe("dialog");
	});

	test("falls back to the dialog for a binding with no source identity", () => {
		const pool = buildCandidatePool(numberTopics(3), numberSlot);
		const current = {
			topic: "/n0",
			datasource_id: "ros2",
			type: "number",
			rawType: "",
			property: "",
		} as SelectedTopic;

		expect(resolveTopicPickerMode(pool, current)).toBe("dialog");
	});
});
