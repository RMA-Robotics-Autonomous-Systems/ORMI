import { afterEach, describe, expect, it } from "bun:test";

import {
	getSelectedMission,
	getSnapshot,
	setSelectedMission,
	subscribe,
} from "./selection-store";

// The store is module-level; reset between tests so cases are independent.
afterEach(() => {
	setSelectedMission(null);
});

describe("selection-store", () => {
	it("starts cleared", () => {
		expect(getSelectedMission()).toBeNull();
		expect(getSnapshot()).toBeNull();
	});

	it("set updates the snapshot", () => {
		setSelectedMission("m-1");
		expect(getSnapshot()).toBe("m-1");
		expect(getSelectedMission()).toBe("m-1");
	});

	it("notifies subscribers on change", () => {
		let calls = 0;
		const unsubscribe = subscribe(() => {
			calls++;
		});
		setSelectedMission("m-1");
		setSelectedMission("m-2");
		expect(calls).toBe(2);
		unsubscribe();
	});

	it("does not notify when the value is unchanged", () => {
		setSelectedMission("m-1");
		let calls = 0;
		const unsubscribe = subscribe(() => {
			calls++;
		});
		setSelectedMission("m-1"); // same value → no notification
		expect(calls).toBe(0);
		unsubscribe();
	});

	it("snapshot is stable (===) while unchanged and fresh on change", () => {
		setSelectedMission("m-1");
		const a = getSnapshot();
		const b = getSnapshot();
		expect(a).toBe(b); // identity-stable while unchanged
		setSelectedMission("m-2");
		expect(getSnapshot()).not.toBe(a); // fresh value after change
		expect(getSnapshot()).toBe("m-2");
	});

	it("stops notifying after unsubscribe", () => {
		let calls = 0;
		const unsubscribe = subscribe(() => {
			calls++;
		});
		setSelectedMission("m-1");
		unsubscribe();
		setSelectedMission("m-2");
		expect(calls).toBe(1);
	});

	it("clears back to null", () => {
		setSelectedMission("m-1");
		setSelectedMission(null);
		expect(getSnapshot()).toBeNull();
	});
});
