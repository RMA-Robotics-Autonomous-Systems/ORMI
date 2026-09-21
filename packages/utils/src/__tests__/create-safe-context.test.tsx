/**
 * `createSafeContext`'s two reading modes.
 *
 * The required hook throwing outside its provider is the default and the
 * reason the factory exists. The optional hook is the deliberate exception,
 * for a component that must render on a surface where the provider is
 * knowingly absent — so both halves are pinned here, including the tuple's
 * shape, because appending the third element is only non-breaking as long as
 * the first two stay where they are.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSafeContext } from "../create-safe-context";

interface Thing {
	label: string;
}

describe("createSafeContext", () => {
	test("returns provider, required hook and optional hook, in that order", () => {
		const tuple = createSafeContext<Thing>("Thing");

		expect(tuple).toHaveLength(3);
		expect(typeof tuple[1]).toBe("function");
		expect(typeof tuple[2]).toBe("function");
	});

	test("the required hook reads the value inside the provider", () => {
		const [Provider, useThing] = createSafeContext<Thing>("Thing");

		const Consumer = () => <span>{useThing().label}</span>;

		const markup = renderToStaticMarkup(
			<Provider value={{ label: "inside" }}>
				<Consumer />
			</Provider>,
		);

		expect(markup).toBe("<span>inside</span>");
	});

	test("the required hook throws outside the provider, naming it", () => {
		const [, useThing] = createSafeContext<Thing>("Thing");

		const Consumer = () => <span>{useThing().label}</span>;

		expect(() => renderToStaticMarkup(<Consumer />)).toThrow(
			"useThing must be within ThingProvider",
		);
	});

	test("the optional hook returns undefined outside the provider", () => {
		const [, , useThingOptional] = createSafeContext<Thing>("Thing");

		const Consumer = () => (
			<span>{useThingOptional()?.label ?? "absent"}</span>
		);

		expect(renderToStaticMarkup(<Consumer />)).toBe("<span>absent</span>");
	});

	test("the optional hook reads the value inside the provider", () => {
		const [Provider, , useThingOptional] =
			createSafeContext<Thing>("Thing");

		const Consumer = () => (
			<span>{useThingOptional()?.label ?? "absent"}</span>
		);

		const markup = renderToStaticMarkup(
			<Provider value={{ label: "inside" }}>
				<Consumer />
			</Provider>,
		);

		expect(markup).toBe("<span>inside</span>");
	});
});
