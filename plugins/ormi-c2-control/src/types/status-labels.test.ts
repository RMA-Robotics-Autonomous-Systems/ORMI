import { describe, expect, it } from "bun:test";

import { MissionStatus } from "./c2-types";
import { missionStatusLabel } from "./status-labels";

describe("missionStatusLabel", () => {
	it("maps known enum values", () => {
		expect(missionStatusLabel(MissionStatus.PLANNED)).toBe("Planned");
		expect(missionStatusLabel(MissionStatus.STARTED)).toBe("Started");
		expect(missionStatusLabel(MissionStatus.COMPLETED)).toBe("Completed");
	});

	it("labels null/undefined as Unknown", () => {
		expect(missionStatusLabel(null)).toBe("Unknown");
		expect(missionStatusLabel(undefined)).toBe("Unknown");
	});

	it("falls back generically for out-of-range values (no throw)", () => {
		expect(missionStatusLabel(999)).toBe("Status 999");
	});
});
