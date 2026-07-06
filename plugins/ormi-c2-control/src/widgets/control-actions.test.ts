import { describe, expect, it } from "bun:test";

import { MissionBehavior, MissionStatus } from "../types/c2-types";
import {
	ControlAction,
	allowedActions,
	canSubmit,
	isMissionIdle,
	missionConfigSignature,
} from "./control-actions";
import type { MissionDraft } from "./mission-editor-helpers";

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

/** A minimal, valid working draft for signature/canSubmit tests. */
function makeDraft(overrides: Partial<MissionDraft> = {}): MissionDraft {
	return {
		mission_id: "m-1",
		name: "Mission 1",
		behavior: MissionBehavior.NAVIGATE,
		objective: { geometries: [] },
		vehicles: [],
		...overrides,
	};
}

describe("isMissionIdle (idle/terminal → fresh Submit is fine)", () => {
	it("treats missing status as idle", () => {
		expect(isMissionIdle(null)).toBe(true);
		expect(isMissionIdle(undefined)).toBe(true);
	});

	it("treats NONE and terminal/failed states as idle", () => {
		for (const status of [
			MissionStatus.NONE,
			MissionStatus.COMPLETED,
			MissionStatus.DELETED,
			MissionStatus.STOPPED,
			MissionStatus.FAILED,
			MissionStatus.PLANNED_FAILED,
		]) {
			expect(isMissionIdle(status)).toBe(true);
		}
	});

	it("treats active states as NOT idle", () => {
		for (const status of [
			MissionStatus.PLANNED,
			MissionStatus.PLANNED_ALTERNATIVE,
			MissionStatus.ACCEPTED,
			MissionStatus.STARTED,
			MissionStatus.PAUSED,
		]) {
			expect(isMissionIdle(status)).toBe(false);
		}
	});
});

describe("missionConfigSignature (dirty detector)", () => {
	it("is stable for the same config content", () => {
		expect(missionConfigSignature(makeDraft())).toBe(
			missionConfigSignature(makeDraft()),
		);
	});

	it("changes when a meaningful field changes", () => {
		const base = missionConfigSignature(makeDraft());
		expect(
			missionConfigSignature(makeDraft({ vehicles: ["v-1"] })),
		).not.toBe(base);
		expect(missionConfigSignature(makeDraft({ name: "Renamed" }))).not.toBe(
			base,
		);
		expect(
			missionConfigSignature(
				makeDraft({ behavior: MissionBehavior.COVERAGE }),
			),
		).not.toBe(base);
	});

	it("ignores empty optional blocks (cleaned before signing)", () => {
		const withEmptyTransit = makeDraft({
			transit: {},
		} as Partial<MissionDraft>);
		expect(missionConfigSignature(withEmptyTransit)).toBe(
			missionConfigSignature(makeDraft()),
		);
	});
});

describe("canSubmit (Submit dirty-gate)", () => {
	const sigA = "sig-a";
	const sigB = "sig-b";

	it("allows Submit when the mission is idle/terminal (regardless of sigs)", () => {
		expect(
			canSubmit({
				status: MissionStatus.NONE,
				currentSig: sigA,
				lastSubmittedSig: sigA,
			}),
		).toBe(true);
		expect(
			canSubmit({
				status: null,
				currentSig: null,
				lastSubmittedSig: null,
			}),
		).toBe(true);
		expect(
			canSubmit({
				status: MissionStatus.COMPLETED,
				currentSig: sigA,
				lastSubmittedSig: sigA,
			}),
		).toBe(true);
	});

	it("disables Submit on an active mission whose config is unchanged", () => {
		expect(
			canSubmit({
				status: MissionStatus.PLANNED,
				currentSig: sigA,
				lastSubmittedSig: sigA,
			}),
		).toBe(false);
		expect(
			canSubmit({
				status: MissionStatus.STARTED,
				currentSig: sigA,
				lastSubmittedSig: sigA,
			}),
		).toBe(false);
	});

	it("re-enables Submit on an active mission once the config changes", () => {
		expect(
			canSubmit({
				status: MissionStatus.PLANNED,
				currentSig: sigB,
				lastSubmittedSig: sigA,
			}),
		).toBe(true);
		expect(
			canSubmit({
				status: MissionStatus.ACCEPTED,
				currentSig: sigB,
				lastSubmittedSig: sigA,
			}),
		).toBe(true);
	});

	it("disables Submit on an active mission when either signature is missing", () => {
		expect(
			canSubmit({
				status: MissionStatus.PLANNED,
				currentSig: null,
				lastSubmittedSig: sigA,
			}),
		).toBe(false);
		expect(
			canSubmit({
				status: MissionStatus.PLANNED,
				currentSig: sigA,
				lastSubmittedSig: null,
			}),
		).toBe(false);
	});
});
