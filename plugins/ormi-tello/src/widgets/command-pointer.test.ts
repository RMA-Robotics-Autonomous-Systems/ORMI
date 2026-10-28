/**
 * The on-screen Tello keys must use pointer events with capture, never mouse
 * events: under touch a mouse press arrives only after the finger lifts.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "command.tsx"), "utf8");

describe("Tello command keys", () => {
	test("use no mouse events", () => {
		expect(source).not.toMatch(/onMouse(Down|Up|Leave|Enter)/);
	});

	test("hold through usePointerHold with touch-action none", () => {
		expect(source).toContain("usePointerHold(");
		expect(source).toContain("touch-none select-none");
	});

	test("use motion tokens, never a literal duration or easing", () => {
		expect(source).not.toMatch(/\bduration-\d/);
		expect(source).not.toMatch(/\bease-(in|out|linear)\b/);
	});
});
