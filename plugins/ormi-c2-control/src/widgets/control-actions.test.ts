import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import { ControlAction, allowedActions } from "./control-actions";

/** The actions that must be true for a given status, everything else false. */
function expectOnly(
	status: MissionStatus | null | undefined,
	enabled: ControlAction[],
) {
	const allowed = allowedActions(status);
	const all: ControlAction[] = [
		"submit",
		"approve",
		"start",
		"pause",
		"stop",
		"delete",
	];
	for (const action of all) {
		expect(allowed[action]).toBe(enabled.includes(action));
	}
}

describe("allowedActions (F8 status → allowed lifecycle commands)", () => {
	it("allows only Submit when status is missing (defensive)", () => {
		expectOnly(null, ["submit"]);
		expectOnly(undefined, ["submit"]);
	});

	it("allows only Submit on NONE (pre-submit / no live mission)", () => {
		expectOnly(MissionStatus.NONE, ["submit"]);
	});

	it("enforces Approve-before-Start on PLANNED (no Start, yes Approve)", () => {
		expectOnly(MissionStatus.PLANNED, [
			"submit",
			"approve",
			"stop",
			"delete",
		]);
		const allowed = allowedActions(MissionStatus.PLANNED);
		expect(allowed.start).toBe(false);
		expect(allowed.approve).toBe(true);
	});

	it("treats PLANNED_ALTERNATIVE like PLANNED (approve, not start)", () => {
		expectOnly(MissionStatus.PLANNED_ALTERNATIVE, [
			"submit",
			"approve",
			"stop",
			"delete",
		]);
	});

	it("on PLANNED_FAILED allows teardown + re-submit, not approve/start", () => {
		expectOnly(MissionStatus.PLANNED_FAILED, ["submit", "stop", "delete"]);
	});

	it("allows Start (not Approve) once ACCEPTED", () => {
		expectOnly(MissionStatus.ACCEPTED, [
			"submit",
			"start",
			"stop",
			"delete",
		]);
		const allowed = allowedActions(MissionStatus.ACCEPTED);
		expect(allowed.start).toBe(true);
		expect(allowed.approve).toBe(false);
	});

	it("allows Pause/Stop while STARTED (no Start, no Approve)", () => {
		expectOnly(MissionStatus.STARTED, ["submit", "pause", "stop"]);
	});

	it("allows Start (resume)/Stop while PAUSED", () => {
		expectOnly(MissionStatus.PAUSED, ["submit", "start", "stop"]);
	});

	it("allows only Delete (+ Submit) on STOPPED / FAILED", () => {
		expectOnly(MissionStatus.STOPPED, ["submit", "delete"]);
		expectOnly(MissionStatus.FAILED, ["submit", "delete"]);
	});

	it("allows only Submit on COMPLETED / DELETED", () => {
		expectOnly(MissionStatus.COMPLETED, ["submit"]);
		expectOnly(MissionStatus.DELETED, ["submit"]);
	});

	it("falls back to Submit-only for an unknown numeric status", () => {
		expectOnly(999 as MissionStatus, ["submit"]);
	});

	it("always allows Submit (it targets/retargets :5001 at the active mission)", () => {
		const statuses = [
			null,
			MissionStatus.NONE,
			MissionStatus.PLANNED,
			MissionStatus.ACCEPTED,
			MissionStatus.STARTED,
			MissionStatus.PAUSED,
			MissionStatus.STOPPED,
			MissionStatus.COMPLETED,
		];
		for (const status of statuses) {
			expect(allowedActions(status).submit).toBe(true);
		}
	});
});
