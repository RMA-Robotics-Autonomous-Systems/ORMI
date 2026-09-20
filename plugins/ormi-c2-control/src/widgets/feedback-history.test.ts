import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetMissionFeedbackStore,
	getMissionFeedback,
	getMissionFeedbackOrigin,
	publishMissionFeedback,
} from "../state/mission-feedback-store";
import { parseMissionFeedback } from "../types/mission-feedback";
import {
	__resetFeedbackHistoryFetchState,
	claimListFetch,
	claimMissionFetch,
	parseFeedbackHistory,
	seedFeedbackHistory,
} from "./feedback-history";

afterEach(() => {
	__resetMissionFeedbackStore();
	__resetFeedbackHistoryFetchState();
});

/** A stored document as `GET /mission-feedback/latest` returns it. */
function doc(missionId: string, status: number, extra: object = {}) {
	return {
		_id: `oid-${missionId}-${status}`,
		mission_id: missionId,
		status,
		tasks: [
			{
				vehicle_id: "v-1",
				// Pre-v2 snapshot: float-rounded coordinates, no task_id.
				waypoints: [{ coordinates: [50.84431, 4.39262] }],
			},
		],
		...extra,
	};
}

describe("parseFeedbackHistory", () => {
	it("parses the documented array of stored documents (v1 and v2)", () => {
		const out = parseFeedbackHistory([
			doc("m-1", 10, { schema: 2, ended_at: "2026-09-18T10:30:00.123Z" }),
			doc("m-2", 8),
		]);
		expect(out.map((f) => f.mission_id)).toEqual(["m-1", "m-2"]);
		expect(out[0]!.ended_at).toBe("2026-09-18T10:30:00.123Z");
		expect(out[1]!.tasks[0]!.task_id).toBeUndefined();
		expect(out[1]!.tasks[0]!.waypoints[0]!.lngLat).toEqual([
			4.39262, 50.84431,
		]);
	});

	it("parses a single document (the /:mission_id route)", () => {
		expect(parseFeedbackHistory(doc("m-1", 10))).toHaveLength(1);
	});

	it("accepts a topic-style or string-encoded document, drops junk", () => {
		const out = parseFeedbackHistory([
			{ mission_feedback: JSON.stringify(doc("a", 10)) },
			JSON.stringify(doc("b", 10)),
			null,
			42,
			{ no: "mission id" },
		]);
		expect(out.map((f) => f.mission_id)).toEqual(["a", "b"]);
		expect(parseFeedbackHistory("nope")).toEqual([]);
		expect(parseFeedbackHistory(null)).toEqual([]);
	});
});

describe("seedFeedbackHistory", () => {
	it("seeds only the newest snapshot of each mission (list is newest first)", () => {
		const seeded: number[] = [];
		seedFeedbackHistory([doc("m", 10), doc("m", 5)], (fb) => {
			seeded.push(fb.status);
			return true;
		});
		expect(seeded).toEqual([10]);
	});

	it("never overrides a live mission (live wins)", () => {
		const live = parseMissionFeedback(JSON.stringify(doc("m-live", 5)))!;
		publishMissionFeedback(live);
		expect(seedFeedbackHistory([doc("m-live", 10), doc("m-old", 10)])).toBe(
			1,
		);
		expect(getMissionFeedback("m-live")).toBe(live);
		expect(getMissionFeedbackOrigin("m-live")).toBe("live");
		expect(getMissionFeedbackOrigin("m-old")).toBe("history");
	});
});

describe("fetch throttles", () => {
	it("fetches the list once for instances mounting together, again on a new key", () => {
		expect(claimListFetch("ds#0", 1_000)).toBe(true);
		expect(claimListFetch("ds#0", 1_050)).toBe(false); // second instance
		expect(claimListFetch("ds#1", 1_100)).toBe(false); // same tick
		expect(claimListFetch("ds#1", 2_000)).toBe(true); // picker opened
		expect(claimListFetch("ds#1", 3_000)).toBe(false);
		expect(claimListFetch("ds#1", 7_100)).toBe(true);
	});

	it("fetches one mission at most every 30 s", () => {
		expect(claimMissionFetch("m", 0)).toBe(true);
		expect(claimMissionFetch("m", 10_000)).toBe(false);
		expect(claimMissionFetch("other", 10_000)).toBe(true);
		expect(claimMissionFetch("m", 30_000)).toBe(true);
	});
});
