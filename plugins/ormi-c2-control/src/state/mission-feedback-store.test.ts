import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetMissionFeedbackStore,
	FEEDBACK_STALE_AFTER_MS,
	getAllMissionFeedback,
	getLiveMissionFeedback,
	getMissionFeedback,
	getMissionFeedbackOrigin,
	getMissionFeedbackUpdatedAt,
	publishMissionFeedback,
	seedMissionFeedbackHistory,
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

describe("mission-feedback-store — all missions + freshness", () => {
	it("lists every mission, reference-stable while nothing changed", () => {
		publishMissionFeedback(feedback("m-a", 5));
		publishMissionFeedback(feedback("m-b", 10));
		const all = getAllMissionFeedback();
		expect(all.map((f) => f.mission_id)).toEqual(["m-a", "m-b"]);
		// Identical republish → same snapshot object.
		publishMissionFeedback(feedback("m-b", 10));
		expect(getAllMissionFeedback()).toBe(all);
		// Real change → new snapshot, finished missions kept.
		publishMissionFeedback(feedback("m-a", 6));
		expect(getAllMissionFeedback()).not.toBe(all);
		expect(getAllMissionFeedback()).toHaveLength(2);
	});

	it("an identical republish refreshes updatedAt (freshness)", async () => {
		publishMissionFeedback(feedback("m-a", 5));
		const first = getMissionFeedbackUpdatedAt("m-a")!;
		await new Promise((r) => setTimeout(r, 5));
		publishMissionFeedback(feedback("m-a", 5));
		expect(getMissionFeedbackUpdatedAt("m-a")!).toBeGreaterThan(first);
	});
});

describe("mission-feedback-store — history vs live merge rule", () => {
	it("seeds a history snapshot with no age and no 'latest' claim", () => {
		expect(seedMissionFeedbackHistory(feedback("m-h", 10))).toBe(true);
		expect(getMissionFeedback("m-h")?.status).toBe(10);
		expect(getMissionFeedbackOrigin("m-h")).toBe("history");
		// Never fresh, never stale: it has no age at all.
		expect(getMissionFeedbackUpdatedAt("m-h")).toBeNull();
		// Not the "latest published" mission, and not in the live list.
		expect(getMissionFeedback(null)).toBeNull();
		expect(getLiveMissionFeedback()).toEqual([]);
		expect(getAllMissionFeedback().map((f) => f.mission_id)).toEqual([
			"m-h",
		]);
	});

	it("a live message always replaces a history snapshot", () => {
		seedMissionFeedbackHistory(feedback("m-a", 5));
		const live = feedback("m-a", 10);
		publishMissionFeedback(live);
		expect(getMissionFeedbackOrigin("m-a")).toBe("live");
		expect(getMissionFeedback("m-a")).toBe(live);
		expect(getMissionFeedbackUpdatedAt("m-a")).not.toBeNull();
		expect(getLiveMissionFeedback().map((f) => f.mission_id)).toEqual([
			"m-a",
		]);
	});

	it("a live message with the SAME content still flips the origin and notifies", () => {
		const stored = feedback("m-a", 5);
		seedMissionFeedbackHistory(stored);
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		publishMissionFeedback(feedback("m-a", 5));
		expect(notified).toBe(1);
		expect(getMissionFeedbackOrigin("m-a")).toBe("live");
		// Same content → the value object is kept (no needless re-render).
		expect(getMissionFeedback("m-a")).toBe(stored);
		unsubscribe();
	});

	it("a history snapshot never replaces a live slot", () => {
		const live = feedback("m-a", 5);
		publishMissionFeedback(live);
		const at = getMissionFeedbackUpdatedAt("m-a");
		expect(seedMissionFeedbackHistory(feedback("m-a", 10))).toBe(false);
		expect(getMissionFeedback("m-a")).toBe(live);
		expect(getMissionFeedbackOrigin("m-a")).toBe("live");
		expect(getMissionFeedbackUpdatedAt("m-a")).toBe(at);
	});

	it("a differing history snapshot replaces a live slot that has gone stale", () => {
		// The publisher died with the mission still reading "Started" here while
		// the C2 recorded it ending: the stored snapshot is the newer truth.
		publishMissionFeedback(feedback("m-a", 5));
		const at = getMissionFeedbackUpdatedAt("m-a")!;
		expect(
			seedMissionFeedbackHistory(
				feedback("m-a", 7),
				at + FEEDBACK_STALE_AFTER_MS,
			),
		).toBe(false);
		expect(getMissionFeedbackOrigin("m-a")).toBe("live");
		expect(
			seedMissionFeedbackHistory(
				feedback("m-a", 7),
				at + FEEDBACK_STALE_AFTER_MS + 1,
			),
		).toBe(true);
		expect(getMissionFeedbackOrigin("m-a")).toBe("history");
		expect(getMissionFeedback("m-a")?.status).toBe(7);
		expect(getMissionFeedbackUpdatedAt("m-a")).toBeNull();
		expect(getLiveMissionFeedback()).toEqual([]);
	});

	it("an identical history snapshot leaves a stale live slot alone", () => {
		publishMissionFeedback(feedback("m-a", 5));
		const at = getMissionFeedbackUpdatedAt("m-a")!;
		expect(
			seedMissionFeedbackHistory(
				feedback("m-a", 5),
				at + FEEDBACK_STALE_AFTER_MS + 1,
			),
		).toBe(false);
		expect(getMissionFeedbackOrigin("m-a")).toBe("live");
	});

	it("a newer history snapshot replaces an older one; an identical one is a no-op", () => {
		seedMissionFeedbackHistory(feedback("m-a", 5));
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified += 1;
		});
		expect(seedMissionFeedbackHistory(feedback("m-a", 5))).toBe(false);
		expect(notified).toBe(0);
		expect(seedMissionFeedbackHistory(feedback("m-a", 10))).toBe(true);
		expect(notified).toBe(1);
		expect(getMissionFeedback("m-a")?.status).toBe(10);
		unsubscribe();
	});
});
