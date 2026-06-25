import { describe, it, expect } from "bun:test";
import { parseMissionFeedback } from "./mission-feedback";
import { MissionStatus } from "./c2-types";

describe("parseMissionFeedback", () => {
	it("parses a JSON string and swaps [lat,lng] → lngLat", () => {
		const raw = JSON.stringify({
			mission_id: "m-1",
			status: 5,
			tasks: [
				{
					vehicle_id: "v-1",
					waypoints: [
						{
							coordinates: [50.8443, 4.3926],
							average_speed: 2,
							eta: "t",
						},
					],
				},
			],
		});
		const fb = parseMissionFeedback(raw);
		expect(fb).not.toBeNull();
		expect(fb!.mission_id).toBe("m-1");
		expect(fb!.status).toBe(MissionStatus.STARTED);
		const wp = fb!.tasks[0]!.waypoints[0]!;
		expect(wp.coordinates).toEqual([50.8443, 4.3926]); // raw [lat,lng]
		expect(wp.lngLat).toEqual([4.3926, 50.8443]); // GeoJSON [lng,lat]
	});

	it("treats a missing `issue` as null", () => {
		const fb = parseMissionFeedback({ mission_id: "m-2", status: 1 });
		expect(fb!.issue).toBeNull();
	});

	it("accepts an already-parsed object", () => {
		const fb = parseMissionFeedback({
			mission_id: "m-3",
			status: 4,
			tasks: [],
		});
		expect(fb!.status).toBe(MissionStatus.ACCEPTED);
		expect(fb!.tasks).toEqual([]);
	});

	it("returns null for invalid / id-less input", () => {
		expect(parseMissionFeedback("not json")).toBeNull();
		expect(parseMissionFeedback(null)).toBeNull();
		expect(parseMissionFeedback({} as never)).toBeNull();
	});

	it("drops malformed waypoints (missing coordinates)", () => {
		const fb = parseMissionFeedback({
			mission_id: "m-4",
			status: 5,
			tasks: [
				{ vehicle_id: "v", waypoints: [{ average_speed: 1 } as never] },
			],
		});
		expect(fb!.tasks[0]!.waypoints).toHaveLength(0);
	});
});
