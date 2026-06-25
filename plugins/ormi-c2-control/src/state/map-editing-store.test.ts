import { afterEach, describe, expect, it } from "bun:test";

import {
	clearMapEditing,
	getSnapshot,
	setDraftGeometry,
	setPickedFeature,
	subscribe,
} from "./map-editing-store";

// Reset module-level state between tests (the store is a singleton).
afterEach(() => {
	clearMapEditing();
});

describe("map-editing-store", () => {
	it("starts cleared", () => {
		const snap = getSnapshot();
		expect(snap.pickedFeatureId).toBeNull();
		expect(snap.draftGeometry).toBeNull();
	});

	it("sets the picked feature and the draft geometry", () => {
		setPickedFeature("feat-1");
		expect(getSnapshot().pickedFeatureId).toBe("feat-1");

		setDraftGeometry({
			geometry_type: "Point",
			coordinates: [4.39, 50.84],
		});
		expect(getSnapshot().draftGeometry).toEqual({
			geometry_type: "Point",
			coordinates: [4.39, 50.84],
		});
	});

	it("clears both fields", () => {
		setPickedFeature("feat-1");
		setDraftGeometry({ geometry_type: "Point", coordinates: [0, 0] });
		clearMapEditing();
		const snap = getSnapshot();
		expect(snap.pickedFeatureId).toBeNull();
		expect(snap.draftGeometry).toBeNull();
	});

	it("returns a referentially-STABLE snapshot when nothing changes", () => {
		setPickedFeature("feat-1");
		const a = getSnapshot();
		const b = getSnapshot();
		expect(a).toBe(b); // same reference between reads (no loop)
	});

	it("returns a FRESH snapshot identity after a real change", () => {
		const before = getSnapshot();
		setPickedFeature("feat-1");
		const after = getSnapshot();
		expect(after).not.toBe(before);
		expect(after.pickedFeatureId).toBe("feat-1");
	});

	it("is a no-op (no new identity, no notify) on an identical write", () => {
		setPickedFeature("feat-1");
		const a = getSnapshot();

		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		setPickedFeature("feat-1"); // identical → no-op
		unsubscribe();

		expect(notified).toBe(0);
		expect(getSnapshot()).toBe(a); // unchanged reference
	});

	it("notifies subscribers on a real change", () => {
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		setPickedFeature("feat-1");
		setDraftGeometry({ geometry_type: "Point", coordinates: [0, 0] });
		unsubscribe();
		// One notify per real change; a third (post-unsubscribe) clear must not count.
		setPickedFeature("feat-2");
		expect(notified).toBe(2);
	});

	it("no-ops clearing when already cleared", () => {
		const a = getSnapshot();
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		clearMapEditing(); // already cleared → no-op
		unsubscribe();
		expect(notified).toBe(0);
		expect(getSnapshot()).toBe(a);
	});
});
