import { describe, expect, test } from "bun:test";
import { sceneClearColor } from "../scene-background";

describe("sceneClearColor", () => {
	test("the default (transparent) leaves the canvas transparent, never black", () => {
		expect(sceneClearColor("rgba(0, 0, 0, 0)", "#ffffff")).toBeNull();
		expect(sceneClearColor("", "#ffffff")).toBeNull();
		expect(sceneClearColor("transparent", "#ffffff")).toBeNull();
	});

	test("an opaque colour is used as is", () => {
		expect(sceneClearColor("#0a0b0c", "#ffffff")).toBe("#0a0b0c");
		expect(sceneClearColor("rgba(10, 11, 12, 1)", "#ffffff")).toBe(
			"#0a0b0c",
		);
	});

	test("a translucent colour is mixed over the panel background", () => {
		expect(sceneClearColor("rgba(0, 0, 0, 0.5)", "#ffffff")).toBe(
			"#808080",
		);
		expect(sceneClearColor("rgba(255, 0, 0, 0.25)", "#000000")).toBe(
			"#400000",
		);
	});

	test("a translucent colour over nothing opaque stays transparent", () => {
		expect(sceneClearColor("rgba(0, 0, 0, 0.5)", "")).toBeNull();
		expect(
			sceneClearColor("rgba(0, 0, 0, 0.5)", "rgba(255, 255, 255, 0.5)"),
		).toBeNull();
	});
});
