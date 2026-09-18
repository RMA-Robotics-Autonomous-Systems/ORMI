import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetWaypointHighlight,
	getWaypointHighlight,
	hoverWaypoint,
	toggleWaypointPin,
	unhoverWaypoint,
} from "./waypoint-highlight-store";

afterEach(() => __resetWaypointHighlight());

const A = { missionId: "m", vehicleId: "v", index: 3 };
const B = { missionId: "m", vehicleId: "v", index: 7 };

describe("waypoint highlight", () => {
	it("hover sets, leave clears", () => {
		hoverWaypoint(A);
		expect(getWaypointHighlight()).toEqual({ ...A, pinned: false });
		unhoverWaypoint();
		expect(getWaypointHighlight()).toBeNull();
	});

	it("a pin survives hover elsewhere and leave; clicking it again unpins", () => {
		toggleWaypointPin(A);
		hoverWaypoint(B);
		unhoverWaypoint();
		expect(getWaypointHighlight()).toEqual({ ...A, pinned: true });
		toggleWaypointPin(B);
		expect(getWaypointHighlight()?.index).toBe(7);
		toggleWaypointPin(B);
		expect(getWaypointHighlight()).toBeNull();
	});
});
