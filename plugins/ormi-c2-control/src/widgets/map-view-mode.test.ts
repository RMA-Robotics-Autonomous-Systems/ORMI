import { describe, expect, it } from "bun:test";
import { MissionStatus } from "../types/c2-types";
import { allowedActions } from "./control-actions";
import { isMissionCommitted, resolveViewOnly } from "./map-view-mode";

describe("isMissionCommitted", () => {
	it("counts approved and running plans", () => {
		expect(isMissionCommitted(MissionStatus.ACCEPTED)).toBe(true);
		expect(isMissionCommitted(MissionStatus.STARTED)).toBe(true);
		expect(isMissionCommitted(MissionStatus.PAUSED)).toBe(true);
	});

	it("does not count a plan still awaiting approval", () => {
		expect(isMissionCommitted(MissionStatus.PLANNED)).toBe(false);
		expect(isMissionCommitted(MissionStatus.PLANNED_ALTERNATIVE)).toBe(
			false,
		);
		expect(isMissionCommitted(MissionStatus.NONE)).toBe(false);
	});

	it("does not count terminal or failed plans, which get refined and resubmitted", () => {
		expect(isMissionCommitted(MissionStatus.PLANNED_FAILED)).toBe(false);
		expect(isMissionCommitted(MissionStatus.STOPPED)).toBe(false);
		expect(isMissionCommitted(MissionStatus.FAILED)).toBe(false);
		expect(isMissionCommitted(MissionStatus.COMPLETED)).toBe(false);
		expect(isMissionCommitted(MissionStatus.DELETED)).toBe(false);
	});

	it("treats no feedback as not committed", () => {
		// Absence of news is not a reason to take authoring away.
		expect(isMissionCommitted(null)).toBe(false);
		expect(isMissionCommitted(undefined)).toBe(false);
	});

	it("never calls a status committed while Approve is still on offer", () => {
		// The invariant that ties this to the lifecycle gating: if the operator
		// can still approve, the plan is not committed and the map must stay
		// editable. Checked across the whole enum so a status added later has to
		// satisfy both sides.
		const statuses = Object.values(MissionStatus).filter(
			(v): v is MissionStatus => typeof v === "number",
		);
		for (const status of statuses) {
			if (allowedActions(status).approve) {
				expect(isMissionCommitted(status)).toBe(false);
			}
		}
	});
});

describe("resolveViewOnly", () => {
	const base = {
		readOnly: false,
		inMissionContext: true,
		status: MissionStatus.PLANNED as MissionStatus | null,
		editUnlockedAt: null as MissionStatus | null,
	};

	it("honours the operator's own View choice", () => {
		expect(resolveViewOnly({ ...base, readOnly: true })).toBe(true);
	});

	it("leaves a planned mission editable", () => {
		expect(resolveViewOnly(base)).toBe(false);
	});

	it("stands authoring down once the mission is approved", () => {
		// The point of the change: approving commits the plan, so the map stops
		// being armed over geometry the C2 has already dispatched.
		expect(
			resolveViewOnly({ ...base, status: MissionStatus.ACCEPTED }),
		).toBe(true);
	});

	it("lets the operator take Edit back deliberately", () => {
		expect(
			resolveViewOnly({
				...base,
				status: MissionStatus.ACCEPTED,
				editUnlockedAt: MissionStatus.ACCEPTED,
			}),
		).toBe(false);
	});

	it("stands down again on the next transition, even after Edit was taken back", () => {
		// Approved → started is a new fact: the robot is moving, and an Edit
		// permitted over a stationary approved plan does not carry over to it.
		expect(
			resolveViewOnly({
				...base,
				status: MissionStatus.STARTED,
				editUnlockedAt: MissionStatus.ACCEPTED,
			}),
		).toBe(true);
	});

	it("never stands down map-feature authoring", () => {
		// Roads, geofences and risk areas belong to the map, not to a mission.
		// An operator mid-polygon must not be thrown into View because a mission
		// they are not looking at was approved, possibly from another console.
		expect(
			resolveViewOnly({
				...base,
				inMissionContext: false,
				status: MissionStatus.STARTED,
			}),
		).toBe(false);
	});

	it("stays editable when no feedback has arrived", () => {
		expect(resolveViewOnly({ ...base, status: null })).toBe(false);
	});
});
