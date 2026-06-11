import { describe, test, expect } from "bun:test";
import { isTransientLocalTopic } from "../transform-topics";

describe("isTransientLocalTopic", () => {
	test("matches /tf_static", () => {
		expect(isTransientLocalTopic("/tf_static")).toBe(true);
	});

	test("matches namespaced */tf_static", () => {
		expect(isTransientLocalTopic("/robot1/tf_static")).toBe(true);
	});

	test("does not match dynamic /tf", () => {
		expect(isTransientLocalTopic("/tf")).toBe(false);
	});

	test("does not match unrelated topics", () => {
		expect(isTransientLocalTopic("/scan")).toBe(false);
		expect(isTransientLocalTopic("/tf_static_extra")).toBe(false);
	});
});
