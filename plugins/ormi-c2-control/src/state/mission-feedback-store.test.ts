import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetMissionFeedbackStore,
	getMissionFeedback,
	publishMissionFeedback,
	subscribe,
} from "./mission-feedback-store";
import {
	MissionFeedback,
	parseMissionFeedback,
} from "../types/mission-feedback";

/**
 * Pure-logic tests for the per-mission feedback store (no React). The store is
 * module-level, so each case resets it via `__resetMissionFeedbackStore`. The
 * core guarantee under test is the anti-flicker invariant: an interleaved publish
 * for mission B must not swap mission A's returned object reference.
 */

/** Build a real {@link MissionFeedback} via the production parser. */
function feedback(
	missionId: string,
	status: number,
	lng = 4.39,
	lat = 50.84,
): MissionFeedback {
	const fb = parseMissionFeedback({
		mission_id: missionId,
		status,
		tasks: [
			{
				vehicle_id: "v-1",
				waypoints: [{ coordinates: [lat, lng], average_speed: 2 }],
			},
		],
	});
	if (!fb) throw new Error("fixture failed to parse");
	return fb;
}

afterEach(() => {
	__resetMissionFeedbackStore();
});

describe("mission-feedback-store", () => {
	it("publishes then reads the same mission back", () => {
		const a = feedback("m-a", 5);
		publishMissionFeedback(a);
		expect(getMissionFeedback("m-a")).toBe(a);
	});

	it("reads each mission independently (no cross-contamination)", () => {
		const a = feedback("m-a", 5);
		const b = feedback("m-b", 1);
		publishMissionFeedback(a);
		publishMissionFeedback(b);
		expect(getMissionFeedback("m-a")).toBe(a);
		expect(getMissionFeedback("m-b")).toBe(b);
	});

	it("an interleaved publish for B does NOT change A's object reference", () => {
		const a = feedback("m-a", 5);
		publishMissionFeedback(a);
		const aRef = getMissionFeedback("m-a");
		// Interleaved message for a DIFFERENT mission.
		publishMissionFeedback(feedback("m-b", 1));
		// A's slot is untouched — same reference, no flicker to null.
		expect(getMissionFeedback("m-a")).toBe(aRef);
		expect(Object.is(getMissionFeedback("m-a"), a)).toBe(true);
	});

	it("an identical republish for the latest mission is a no-op (no swap, no notify)", () => {
		const a = feedback("m-a", 5);
		publishMissionFeedback(a);
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		// Same plan signature, same (latest) mission → pure no-op.
		publishMissionFeedback(feedback("m-a", 5));
		expect(notified).toBe(0);
		// Stored value object reference is unchanged.
		expect(getMissionFeedback("m-a")).toBe(a);
		unsubscribe();
	});

	it("a real content change replaces the value and notifies", () => {
		const a = feedback("m-a", 5);
		publishMissionFeedback(a);
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		// Changed status → different feedbackPlanSignature → swap + notify.
		const a2 = feedback("m-a", 6);
		publishMissionFeedback(a2);
		expect(notified).toBe(1);
		expect(getMissionFeedback("m-a")).toBe(a2);

		// A changed waypoint also counts as a real change.
		const a3 = feedback("m-a", 6, 5.0, 51.0);
		publishMissionFeedback(a3);
		expect(notified).toBe(2);
		expect(getMissionFeedback("m-a")).toBe(a3);
		unsubscribe();
	});

	it("getMissionFeedback(null) returns the latest published mission's feedback", () => {
		expect(getMissionFeedback(null)).toBeNull();
		const a = feedback("m-a", 5);
		publishMissionFeedback(a);
		expect(getMissionFeedback(null)).toBe(a);
		const b = feedback("m-b", 1);
		publishMissionFeedback(b);
		expect(getMissionFeedback(null)).toBe(b);
		// Pinned read still resolves the older mission independently.
		expect(getMissionFeedback("m-a")).toBe(a);
	});

	it("returns null for an unknown mission id", () => {
		publishMissionFeedback(feedback("m-a", 5));
		expect(getMissionFeedback("m-unknown")).toBeNull();
	});

	it("does not emit to an unsubscribed listener", () => {
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		unsubscribe();
		publishMissionFeedback(feedback("m-a", 5));
		expect(notified).toBe(0);
	});
});
