import { describe, expect, it } from "bun:test";

import {
	isEditableElement,
	isModalOpen,
	isSafeRobotControlKeyEvent,
	isTypingInEditableElement,
	type GuardScope,
} from "../input-guards";

/** Minimal element stand-in: the guards duck-type, they never use instanceof. */
function el(
	tagName: string,
	extra: { isContentEditable?: boolean; editableAncestor?: boolean } = {},
) {
	return {
		tagName,
		isContentEditable: extra.isContentEditable,
		closest: (selector: string) =>
			extra.editableAncestor && selector.includes("contenteditable")
				? { tagName: "DIV" }
				: null,
	};
}

/** Document stand-in with an optional focused element and open dialog. */
function scope(options: {
	activeElement?: unknown;
	openDialog?: boolean;
}): GuardScope {
	return {
		activeElement: options.activeElement ?? null,
		querySelector: (selector: string) =>
			options.openDialog && selector.includes('[role="dialog"]')
				? { tagName: "DIV" }
				: null,
	};
}

/** Keyboard event stand-in whose composedPath is the bubble chain. */
function keyEvent(path: unknown[]) {
	return {
		target: path[0] as EventTarget,
		composedPath: () => path as EventTarget[],
	};
}

const EMPTY_SCOPE = scope({});

describe("isEditableElement", () => {
	it("accepts the text-entry tag names", () => {
		expect(isEditableElement(el("INPUT"))).toBe(true);
		expect(isEditableElement(el("TEXTAREA"))).toBe(true);
		expect(isEditableElement(el("SELECT"))).toBe(true);
		expect(isEditableElement(el("input"))).toBe(true);
	});

	it("accepts a contenteditable element and its descendants", () => {
		expect(isEditableElement(el("DIV", { isContentEditable: true }))).toBe(
			true,
		);
		expect(isEditableElement(el("SPAN", { editableAncestor: true }))).toBe(
			true,
		);
	});

	it("rejects ordinary elements and non-elements", () => {
		expect(isEditableElement(el("DIV"))).toBe(false);
		expect(isEditableElement(el("BUTTON"))).toBe(false);
		expect(isEditableElement(null)).toBe(false);
		expect(isEditableElement(undefined)).toBe(false);
		expect(isEditableElement("INPUT")).toBe(false);
	});
});

describe("isTypingInEditableElement", () => {
	it("catches a field anywhere in the composed path, not just the target", () => {
		const event = keyEvent([
			el("SPAN"),
			el("DIV", { isContentEditable: true }),
			el("BODY"),
		]);
		expect(isTypingInEditableElement(event, EMPTY_SCOPE)).toBe(true);
	});

	it("catches a shadow-retargeted target via the composed path", () => {
		// event.target would be the host <my-field>; the real field is path[0].
		const event = {
			target: el("MY-FIELD") as unknown as EventTarget,
			composedPath: () =>
				[el("INPUT"), el("MY-FIELD")] as unknown as EventTarget[],
		};
		expect(isTypingInEditableElement(event, EMPTY_SCOPE)).toBe(true);
	});

	it("falls back to event.target when composedPath is unavailable", () => {
		expect(
			isTypingInEditableElement(
				{ target: el("INPUT") as unknown as EventTarget },
				EMPTY_SCOPE,
			),
		).toBe(true);
	});

	it("catches a focused field even when the event did not come from it", () => {
		const event = keyEvent([el("BODY")]);
		expect(
			isTypingInEditableElement(
				event,
				scope({ activeElement: el("INPUT") }),
			),
		).toBe(true);
	});

	it("reports false for a key pressed on the dashboard body", () => {
		const event = keyEvent([el("DIV"), el("BODY")]);
		expect(isTypingInEditableElement(event, EMPTY_SCOPE)).toBe(false);
	});

	it("reports false with no event and no DOM", () => {
		expect(isTypingInEditableElement(undefined, undefined)).toBe(false);
	});
});

describe("isModalOpen", () => {
	it("detects an open dialog", () => {
		expect(isModalOpen(scope({ openDialog: true }))).toBe(true);
	});

	it("reports false with no dialog mounted", () => {
		expect(isModalOpen(EMPTY_SCOPE)).toBe(false);
	});

	it("reports false with no DOM", () => {
		expect(isModalOpen(undefined)).toBe(false);
	});
});

describe("isSafeRobotControlKeyEvent", () => {
	const bodyEvent = keyEvent([el("DIV"), el("BODY")]);

	it("allows a key pressed on the dashboard", () => {
		expect(isSafeRobotControlKeyEvent(bodyEvent, EMPTY_SCOPE)).toBe(true);
	});

	it("blocks a key typed into a field", () => {
		const event = keyEvent([el("INPUT")]);
		expect(isSafeRobotControlKeyEvent(event, EMPTY_SCOPE)).toBe(false);
	});

	it("blocks a key pressed while a config dialog is open, even off-field", () => {
		expect(
			isSafeRobotControlKeyEvent(bodyEvent, scope({ openDialog: true })),
		).toBe(false);
	});
});
