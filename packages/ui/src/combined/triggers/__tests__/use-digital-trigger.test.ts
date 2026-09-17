import { describe, expect, it } from "bun:test";

import {
	shouldActivateOnKeyDown,
	shouldDeactivateOnKeyUp,
} from "../use-digital-trigger";
import type { DigitalInput } from "../digital-trigger-input";
import type { GuardScope } from "../../../lib/input-guards";

const BOUND: DigitalInput = { type: "keyboard", key: "w" };
const GAMEPAD_BOUND: DigitalInput = {
	type: "gamepad",
	gamepadButtonIndex: 0,
	gamepadId: "pad",
};

/** Keyboard event stand-in: the decision helpers only read key/target/path. */
function keyEvent(key: string, path: unknown[] = [{ tagName: "BODY" }]) {
	return {
		key,
		target: path[0],
		composedPath: () => path,
	} as unknown as KeyboardEvent;
}

const FIELD = { tagName: "INPUT" };

/** Document stand-in with an optional open dialog. */
function scope(options: { openDialog?: boolean } = {}): GuardScope {
	return {
		activeElement: null,
		querySelector: (selector: string) =>
			options.openDialog && selector.includes('[role="dialog"]')
				? { tagName: "DIV" }
				: null,
	};
}

describe("shouldActivateOnKeyDown", () => {
	it("activates on the bound key pressed on the dashboard", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w"),
				digitalInput: BOUND,
				isActive: false,
				scope: scope(),
			}),
		).toBe(true);
	});

	it("matches case-insensitively", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("W"),
				digitalInput: BOUND,
				isActive: false,
				scope: scope(),
			}),
		).toBe(true);
	});

	it("ignores an unrelated key", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("s"),
				digitalInput: BOUND,
				isActive: false,
				scope: scope(),
			}),
		).toBe(false);
	});

	it("ignores keyboard events for a gamepad binding", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w"),
				digitalInput: GAMEPAD_BOUND,
				isActive: false,
				scope: scope(),
			}),
		).toBe(false);
	});

	it("does NOT activate while the operator is typing in a field", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w", [FIELD]),
				digitalInput: BOUND,
				isActive: false,
				scope: scope(),
			}),
		).toBe(false);
	});

	it("does NOT activate while a modal dialog is open", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w"),
				digitalInput: BOUND,
				isActive: false,
				scope: scope({ openDialog: true }),
			}),
		).toBe(false);
	});

	it("guards by default when no guard option is supplied", () => {
		// No `allowKeyboardWhileTyping`, no `shouldHandleKeyboardEvent`:
		// the guard must still run. This is the safety defect's regression test.
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w", [FIELD]),
				digitalInput: BOUND,
				isActive: false,
				scope: scope(),
			}),
		).toBe(false);
	});

	it("honours the explicit opt-out", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w", [FIELD]),
				digitalInput: BOUND,
				isActive: false,
				allowKeyboardWhileTyping: true,
				scope: scope({ openDialog: true }),
			}),
		).toBe(true);
	});

	it("lets shouldHandleKeyboardEvent narrow further but never re-admit", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w"),
				digitalInput: BOUND,
				isActive: false,
				shouldHandleKeyboardEvent: () => false,
				scope: scope(),
			}),
		).toBe(false);

		// Guard rejects (typing); a permissive extra predicate cannot override it.
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w", [FIELD]),
				digitalInput: BOUND,
				isActive: false,
				shouldHandleKeyboardEvent: () => true,
				scope: scope(),
			}),
		).toBe(false);
	});

	it("does not re-activate an already-held trigger (key repeat)", () => {
		expect(
			shouldActivateOnKeyDown({
				event: keyEvent("w"),
				digitalInput: BOUND,
				isActive: true,
				scope: scope(),
			}),
		).toBe(false);
	});
});

describe("shouldDeactivateOnKeyUp", () => {
	it("releases a press the keydown path started", () => {
		expect(
			shouldDeactivateOnKeyUp({
				event: keyEvent("w"),
				digitalInput: BOUND,
				isKeyboardHeld: true,
			}),
		).toBe(true);
	});

	it("does nothing when the keydown was rejected by the guard", () => {
		const event = keyEvent("w", [FIELD]);
		const held = shouldActivateOnKeyDown({
			event,
			digitalInput: BOUND,
			isActive: false,
			scope: scope(),
		});
		expect(held).toBe(false);
		expect(
			shouldDeactivateOnKeyUp({
				event,
				digitalInput: BOUND,
				isKeyboardHeld: held,
			}),
		).toBe(false);
	});

	it("still releases when focus moved into a field while the key was held", () => {
		// Fail-safe: a release is never suppressed, or the robot keeps moving.
		expect(
			shouldDeactivateOnKeyUp({
				event: keyEvent("w", [FIELD]),
				digitalInput: BOUND,
				isKeyboardHeld: true,
			}),
		).toBe(true);
	});

	it("ignores an unrelated key", () => {
		expect(
			shouldDeactivateOnKeyUp({
				event: keyEvent("s"),
				digitalInput: BOUND,
				isKeyboardHeld: true,
			}),
		).toBe(false);
	});
});
