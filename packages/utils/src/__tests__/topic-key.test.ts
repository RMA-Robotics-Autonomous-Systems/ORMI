/**
 * Tests for the unbound-topic contract of the wire key.
 *
 * `createTopicKey` reads `topic.source.id` on a path that runs during widget
 * render, and a widget the operator has not finished configuring hands it
 * `undefined`. That used to throw `Cannot read properties of undefined
 * (reading 'source')` and take the whole tile down.
 *
 * The predicate and the key are pure, so they rot silently in both directions:
 * a key that starts throwing again fails in the field, and a key that starts
 * answering something for an unbound topic silently binds a widget to the
 * wrong buffer. Both are pinned here.
 */

import { describe, test, expect } from "bun:test";
import { createTopicKey, isBoundTopic, type TopicKeyInput } from "../topic-key";

/** A fully bound topic fixture. */
const bound = (property?: string): TopicKeyInput => ({
	source: { id: "ds-1" },
	topic: "/scan",
	property,
});

describe("isBoundTopic", () => {
	test("accepts a topic carrying a datasource id and a name", () => {
		expect(isBoundTopic(bound())).toBe(true);
		expect(isBoundTopic(bound("ranges.0"))).toBe(true);
	});

	test("rejects an absent slot", () => {
		expect(isBoundTopic(undefined)).toBe(false);
		expect(isBoundTopic(null)).toBe(false);
	});

	test("rejects a half-filled slot", () => {
		expect(isBoundTopic({ topic: "/scan" })).toBe(false);
		expect(isBoundTopic({ source: { id: "ds-1" } })).toBe(false);
		expect(isBoundTopic({ source: {}, topic: "/scan" })).toBe(false);
	});

	test("rejects empty identifiers, which key nothing", () => {
		expect(isBoundTopic({ source: { id: "" }, topic: "/scan" })).toBe(
			false,
		);
		expect(isBoundTopic({ source: { id: "ds-1" }, topic: "" })).toBe(false);
	});

	test("rejects a non-object", () => {
		expect(isBoundTopic("ds-1::/scan")).toBe(false);
		expect(isBoundTopic(0)).toBe(false);
	});
});

describe("createTopicKey", () => {
	test("keys a bound topic as dsId::topic", () => {
		expect(createTopicKey(bound())).toBe("ds-1::/scan");
	});

	test("appends a non-empty property", () => {
		expect(createTopicKey(bound("ranges.0"))).toBe("ds-1::/scan::ranges.0");
	});

	test("ignores an empty property, so the key stays stable", () => {
		expect(createTopicKey(bound(""))).toBe("ds-1::/scan");
	});

	test("returns undefined for an unbound topic instead of throwing", () => {
		expect(createTopicKey(undefined)).toBeUndefined();
		expect(createTopicKey(null)).toBeUndefined();
		expect(
			createTopicKey({ topic: "/scan" } as unknown as TopicKeyInput),
		).toBeUndefined();
		expect(
			createTopicKey({
				source: { id: "" },
				topic: "/scan",
			}),
		).toBeUndefined();
	});

	test("never yields a key an unbound topic could be confused with", () => {
		// Every real key contains the separator; the absent key is not a
		// string at all, so it cannot be looked up in the buffer map.
		expect(createTopicKey(bound())).toContain("::");
		expect(typeof createTopicKey(undefined)).toBe("undefined");
	});
});
