import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetMissionDraftStore,
	clearMissionDraft,
	editMissionDraft,
	getMissionDraft,
	hasMissionDraft,
	isMissionDraftDirty,
	setMissionDraft,
	subscribe,
} from "./mission-draft-store";
import { MissionBehavior } from "../types/c2-types";
import type { MissionDraft } from "../widgets/mission-editor-helpers";

/**
 * Pure-logic tests for the shared mission-draft store (no React). The store is
 * module-level, so each case resets it via `__resetMissionDraftStore`. The core
 * guarantees under test: reference stability on an identical re-load (so the map's
 * memos don't churn), a fresh object on a real edit, dirty transitions on
 * set/edit/clear, and per-mission isolation.
 */

/** Build a minimal {@link MissionDraft}. */
function draft(
	missionId: string,
	name = "Mission",
	vehicles: string[] = [],
): MissionDraft {
	return {
		mission_id: missionId,
		name,
		behavior: MissionBehavior.NAVIGATE,
		objective: { geometries: [] },
		vehicles,
	};
}

afterEach(() => {
	__resetMissionDraftStore();
});

describe("mission-draft-store", () => {
	it("sets then reads the same mission back, clean", () => {
		const d = draft("m-a");
		setMissionDraft(d);
		expect(getMissionDraft("m-a")).toBe(d);
		expect(isMissionDraftDirty("m-a")).toBe(false);
		expect(hasMissionDraft("m-a")).toBe(true);
	});

	it("reads each mission independently (no cross-contamination)", () => {
		const a = draft("m-a", "A");
		const b = draft("m-b", "B");
		setMissionDraft(a);
		setMissionDraft(b);
		expect(getMissionDraft("m-a")).toBe(a);
		expect(getMissionDraft("m-b")).toBe(b);
	});

	it("an identical re-load of a clean slot is a no-op (no swap, no notify)", () => {
		const a = draft("m-a");
		setMissionDraft(a);
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		// Content-identical re-load of an already-clean slot → pure no-op.
		setMissionDraft(draft("m-a"));
		expect(notified).toBe(0);
		// Stored object reference is unchanged.
		expect(getMissionDraft("m-a")).toBe(a);
		unsubscribe();
	});

	it("a content change on set replaces the value and notifies", () => {
		setMissionDraft(draft("m-a", "A"));
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		const renamed = draft("m-a", "Renamed");
		setMissionDraft(renamed);
		expect(notified).toBe(1);
		expect(getMissionDraft("m-a")).toBe(renamed);
		unsubscribe();
	});

	it("editMissionDraft marks dirty, replaces the slot, and notifies", () => {
		setMissionDraft(draft("m-a", "A"));
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		editMissionDraft("m-a", (d) => ({ ...d, name: "Edited" }));
		expect(notified).toBe(1);
		expect(isMissionDraftDirty("m-a")).toBe(true);
		expect(getMissionDraft("m-a")?.name).toBe("Edited");
		unsubscribe();
	});

	it("editMissionDraft is a no-op for an absent slot (null-guard)", () => {
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		editMissionDraft("m-missing", (d) => ({ ...d, name: "X" }));
		expect(notified).toBe(0);
		expect(getMissionDraft("m-missing")).toBeNull();
		unsubscribe();
	});

	it("setMissionDraft on a dirty slot reloads clean (save path)", () => {
		setMissionDraft(draft("m-a", "A"));
		editMissionDraft("m-a", (d) => ({ ...d, name: "Edited" }));
		expect(isMissionDraftDirty("m-a")).toBe(true);
		// Even though the content also changed, the key assertion is dirty→clean.
		const saved = draft("m-a", "Edited");
		setMissionDraft(saved);
		expect(isMissionDraftDirty("m-a")).toBe(false);
		expect(getMissionDraft("m-a")).toBe(saved);
	});

	it("an identical re-load of a DIRTY slot still resets it clean", () => {
		const a = draft("m-a", "A");
		setMissionDraft(a);
		editMissionDraft("m-a", (d) => d); // mark dirty without content change
		expect(isMissionDraftDirty("m-a")).toBe(true);
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		// Same content as the dirty slot, but the slot is dirty → not a no-op.
		setMissionDraft(draft("m-a", "A"));
		expect(notified).toBe(1);
		expect(isMissionDraftDirty("m-a")).toBe(false);
		unsubscribe();
	});

	it("clearMissionDraft drops the slot and notifies", () => {
		setMissionDraft(draft("m-a"));
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		clearMissionDraft("m-a");
		expect(notified).toBe(1);
		expect(hasMissionDraft("m-a")).toBe(false);
		expect(getMissionDraft("m-a")).toBeNull();
		unsubscribe();
	});

	it("clearMissionDraft on an absent slot is a no-op", () => {
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		clearMissionDraft("m-missing");
		expect(notified).toBe(0);
		unsubscribe();
	});

	it("editing one mission does not change another's object reference", () => {
		const a = draft("m-a", "A");
		const b = draft("m-b", "B");
		setMissionDraft(a);
		setMissionDraft(b);
		editMissionDraft("m-a", (d) => ({ ...d, name: "A2" }));
		// B's slot is untouched — same reference.
		expect(getMissionDraft("m-b")).toBe(b);
	});

	it("reads return null / false for unknown or empty ids", () => {
		expect(getMissionDraft("m-unknown")).toBeNull();
		expect(getMissionDraft(null)).toBeNull();
		expect(isMissionDraftDirty(null)).toBe(false);
		expect(hasMissionDraft(undefined)).toBe(false);
	});

	it("does not emit to an unsubscribed listener", () => {
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		unsubscribe();
		setMissionDraft(draft("m-a"));
		expect(notified).toBe(0);
	});
});
