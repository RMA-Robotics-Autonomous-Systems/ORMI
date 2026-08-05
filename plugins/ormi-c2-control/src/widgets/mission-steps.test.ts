import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import {
	MISSION_STEPS,
	MissionStepId,
	MissionStateTone,
	MissionStepState,
	deriveMissionStepper,
	missionStateBadge,
} from "./mission-steps";

/** Map a status to `{ stepId: state }` for the non-terminal step view. */
function stateById(
	status: MissionStatus | null | undefined,
): Record<MissionStepId, MissionStepState> {
	const model = deriveMissionStepper(status);
	const out = {} as Record<MissionStepId, MissionStepState>;
	for (const step of model.steps) out[step.id] = step.state;
	return out;
}

describe("deriveMissionStepper (live status → stepper model)", () => {
	it("renders all five steps in canonical order for a non-terminal status", () => {
		const model = deriveMissionStepper(MissionStatus.ACCEPTED);
		expect(model.steps.map((s) => s.id)).toEqual([...MISSION_STEPS]);
	});

	it("puts Submit current and the rest upcoming for NONE / null / unknown", () => {
		for (const status of [
			MissionStatus.NONE,
			null,
			undefined,
			999 as MissionStatus,
		]) {
			const by = stateById(status);
			expect(by.submit).toBe("current");
			expect(by.planned).toBe("upcoming");
			expect(by.done).toBe("upcoming");
		}
	});

	it("marks Planned current and Submit done on PLANNED", () => {
		const by = stateById(MissionStatus.PLANNED);
		expect(by.submit).toBe("done");
		expect(by.planned).toBe("current");
		expect(by.accepted).toBe("upcoming");
	});

	it("marks Planned warn on PLANNED_ALTERNATIVE", () => {
		expect(stateById(MissionStatus.PLANNED_ALTERNATIVE).planned).toBe(
			"warn",
		);
	});

	it("marks Planned fail on PLANNED_FAILED", () => {
		expect(stateById(MissionStatus.PLANNED_FAILED).planned).toBe("fail");
	});

	it("marks Accepted current with prior steps done", () => {
		const by = stateById(MissionStatus.ACCEPTED);
		expect(by.submit).toBe("done");
		expect(by.planned).toBe("done");
		expect(by.accepted).toBe("current");
		expect(by.started).toBe("upcoming");
	});

	it("marks Started current and is not paused on STARTED", () => {
		const model = deriveMissionStepper(MissionStatus.STARTED);
		expect(model.paused).toBe(false);
		const by = stateById(MissionStatus.STARTED);
		expect(by.accepted).toBe("done");
		expect(by.started).toBe("current");
		expect(by.done).toBe("upcoming");
	});

	it("sets paused on PAUSED while still on the Started step", () => {
		const model = deriveMissionStepper(MissionStatus.PAUSED);
		expect(model.paused).toBe(true);
		expect(stateById(MissionStatus.PAUSED).started).toBe("current");
	});

	it("collapses to a success outcome on COMPLETED", () => {
		const model = deriveMissionStepper(MissionStatus.COMPLETED);
		expect(model.steps).toEqual([]);
		expect(model.outcome).toEqual({ label: "Completed", tone: "success" });
	});

	it("collapses to a fail outcome on FAILED", () => {
		expect(deriveMissionStepper(MissionStatus.FAILED).outcome).toEqual({
			label: "Failed",
			tone: "fail",
		});
	});

	it("collapses to a neutral outcome on STOPPED / DELETED", () => {
		expect(deriveMissionStepper(MissionStatus.STOPPED).outcome?.tone).toBe(
			"neutral",
		);
		expect(deriveMissionStepper(MissionStatus.DELETED).outcome?.tone).toBe(
			"neutral",
		);
	});
});

describe("missionStateBadge", () => {
	it("reads 'Awaiting submit' (neutral) before any feedback", () => {
		expect(missionStateBadge(null)).toEqual({
			label: "Awaiting submit",
			tone: "neutral",
		});
		expect(missionStateBadge(MissionStatus.NONE).tone).toBe("neutral");
	});

	it("maps the full C2 status set to its tone", () => {
		const cases: [MissionStatus, MissionStateTone][] = [
			[MissionStatus.PLANNED, "info"],
			[MissionStatus.PLANNED_ALTERNATIVE, "warn"],
			[MissionStatus.PLANNED_FAILED, "fail"],
			[MissionStatus.ACCEPTED, "info"],
			[MissionStatus.STARTED, "active"],
			[MissionStatus.PAUSED, "warn"],
			[MissionStatus.FAILED, "fail"],
			[MissionStatus.STOPPED, "neutral"],
			[MissionStatus.DELETED, "neutral"],
			[MissionStatus.COMPLETED, "success"],
		];
		for (const [status, tone] of cases) {
			expect(missionStateBadge(status).tone).toBe(tone);
		}
	});

	it("carries a non-empty operator label for an active status", () => {
		expect(missionStateBadge(MissionStatus.STARTED).label).toBe("Started");
	});
});
