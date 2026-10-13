import { describe, expect, it } from "bun:test";

import {
	shouldEndPointerHold,
	shouldStartPointerHold,
	type PointerHoldEvent,
} from "../use-pointer-hold";

/** Pointer event stand-in: the decisions only read id, type and button. */
function pointer(
	pointerId: number,
	pointerType: string,
	button = 0,
): PointerHoldEvent {
	return { pointerId, pointerType, button };
}

describe("shouldStartPointerHold", () => {
	it("starts on a finger", () => {
		expect(shouldStartPointerHold(null, pointer(7, "touch"))).toBe(true);
	});

	it("starts on a pen", () => {
		expect(shouldStartPointerHold(null, pointer(3, "pen"))).toBe(true);
	});

	it("starts on the primary mouse button", () => {
		expect(shouldStartPointerHold(null, pointer(1, "mouse", 0))).toBe(true);
	});

	it("ignores the secondary and middle mouse buttons", () => {
		expect(shouldStartPointerHold(null, pointer(1, "mouse", 2))).toBe(
			false,
		);
		expect(shouldStartPointerHold(null, pointer(1, "mouse", 1))).toBe(
			false,
		);
	});

	it("ignores a second finger while the first still holds", () => {
		expect(shouldStartPointerHold(7, pointer(8, "touch"))).toBe(false);
	});
});

describe("shouldEndPointerHold", () => {
	it("ends when the holding pointer lifts", () => {
		expect(shouldEndPointerHold(7, { pointerId: 7 })).toBe(true);
	});

	it("keeps the hold when another finger lifts", () => {
		expect(shouldEndPointerHold(7, { pointerId: 8 })).toBe(false);
	});

	it("does nothing when no hold is open", () => {
		// `lostpointercapture` follows every `pointerup`, after the hold ended.
		expect(shouldEndPointerHold(null, { pointerId: 7 })).toBe(false);
	});

	it("ends a hold started by pointer id 0", () => {
		expect(shouldEndPointerHold(0, { pointerId: 0 })).toBe(true);
	});
});
