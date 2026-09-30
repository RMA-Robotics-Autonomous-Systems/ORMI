import { afterEach, describe, expect, it } from "bun:test";

import {
	getActiveMap,
	getActiveMapSnapshot,
	getSelectedMission,
	getSnapshot,
	setActiveMap,
	setSelectedMission,
	subscribe,
} from "./selection-store";

// The store is module-level; reset between tests so cases are independent.
afterEach(() => {
	setSelectedMission(null);
	setActiveMap(null);
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

/**
 * The active MAP, published by the mission map and followed by the
 * behaviour-graph editor. Same primitive-snapshot contract as the mission.
 */
describe("selection-store active map", () => {
	it("starts cleared", () => {
		expect(getActiveMap()).toBeNull();
		expect(getActiveMapSnapshot()).toBeNull();
	});

	it("set updates the snapshot", () => {
		setActiveMap("florennes");
		expect(getActiveMap()).toBe("florennes");
		expect(getActiveMapSnapshot()).toBe("florennes");
	});

	it("normalizes an empty name to null — 'no map yet' is one state", () => {
		setActiveMap("");
		expect(getActiveMap()).toBeNull();
	});

	it("notifies subscribers on a real change only", () => {
		let calls = 0;
		const unsubscribe = subscribe(() => {
			calls++;
		});
		setActiveMap("alpha");
		setActiveMap("alpha");
		setActiveMap("beta");
		expect(calls).toBe(2);
		unsubscribe();
	});

	it("is independent of the mission selection", () => {
		setSelectedMission("m-1");
		setActiveMap("alpha");
		expect(getSelectedMission()).toBe("m-1");
		expect(getActiveMap()).toBe("alpha");
		setSelectedMission(null);
		expect(getActiveMap()).toBe("alpha");
	});
});
