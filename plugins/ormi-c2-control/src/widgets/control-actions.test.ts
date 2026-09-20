import { describe, expect, it } from "bun:test";

import { MissionBehavior, MissionStatus } from "../types/c2-types";
import {
	ControlAction,
	allowedActions,
	canSubmit,
	displayedStatus,
	gatedActions,
	gatingStatus,
	isCommandConfirmed,
	isMissionIdle,
	isTerminalStatus,
	missionConfigSignature,
	primaryAction,
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

describe("allowedActions (status → allowed lifecycle commands)", () => {
	it("advances nothing when status is missing, but keeps Stop", () => {
		expectOnly(null, ["submit", "stop"]);
		expectOnly(undefined, ["submit", "stop"]);
	});

	it("allows Submit and Stop on NONE (no live mission reported)", () => {
		expectOnly(MissionStatus.NONE, ["submit", "stop"]);
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

	it("advances nothing on an unknown numeric status, but keeps Stop", () => {
		expectOnly(999 as MissionStatus, ["submit", "stop"]);
	});

	it("offers Stop for every status that is not terminal, and for no status", () => {
		// The field incident: a panel that could not hear the mission (history
		// slot, no topic, silent publisher → null) withheld Stop while the
		// robot kept driving. Only a KNOWN final state may withhold it.
		const numeric = Object.values(MissionStatus).filter(
			(v): v is MissionStatus => typeof v === "number",
		);
		const terminal = new Set<MissionStatus>([
			MissionStatus.STOPPED,
			MissionStatus.FAILED,
			MissionStatus.COMPLETED,
			MissionStatus.DELETED,
		]);
		for (const status of [
			...numeric,
			null,
			undefined,
			999 as MissionStatus,
		]) {
			const known = status != null && terminal.has(status);
			expect(isTerminalStatus(status)).toBe(known);
			expect(allowedActions(status).stop).toBe(!known);
		}
	});

	it("never advances a mission from an unknown status", () => {
		for (const status of [null, undefined, 999 as MissionStatus]) {
			const allowed = allowedActions(status);
			expect(allowed.approve).toBe(false);
			expect(allowed.start).toBe(false);
			expect(allowed.pause).toBe(false);
			expect(allowed.delete).toBe(false);
		}
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

/**
 * Lifecycle commands used to be sent with no target and reported as sent.
 *
 * With nothing selected, `useMissionFeedback(null)` returns the LATEST mission's
 * feedback, which the panel fed straight into `allowedActions`: it showed another
 * mission's status and enabled that mission's Stop, while `change_status` went
 * out with no `mission_id` and landed on whatever `:5001` last initialized.
 */
describe("gatingStatus", () => {
	it("ignores another mission's feedback when nothing is selected", () => {
		expect(
			gatingStatus({
				hasMission: false,
				hasTopic: true,
				// The store's "latest mission" answer — a RUNNING mission.
				storeStatus: MissionStatus.STARTED,
			}),
		).toBeNull();
	});

	it("uses this mission's status when one is selected", () => {
		expect(
			gatingStatus({
				hasMission: true,
				hasTopic: true,
				storeStatus: MissionStatus.STARTED,
			}),
		).toBe(MissionStatus.STARTED);
	});

	it("is null with no feedback topic, whatever the store holds", () => {
		expect(
			gatingStatus({
				hasMission: true,
				hasTopic: false,
				storeStatus: MissionStatus.STARTED,
			}),
		).toBeNull();
	});

	it("maps an absent slot to null", () => {
		expect(
			gatingStatus({
				hasMission: true,
				hasTopic: true,
				storeStatus: undefined,
			}),
		).toBeNull();
	});
});

describe("gatedActions", () => {
	it("forbids EVERY action with no mission selected", () => {
		const allowed = gatedActions({
			hasMission: false,
			hasTopic: true,
			storeStatus: MissionStatus.STARTED,
		});
		expect(allowed).toEqual({
			submit: false,
			approve: false,
			start: false,
			pause: false,
			stop: false,
			delete: false,
		});
	});

	it("does not offer Stop for another mission that is running", () => {
		// The precise symptom: an enabled Stop against a mission the operator has
		// not selected, which the backend would apply to a third one.
		expect(
			gatedActions({
				hasMission: false,
				hasTopic: true,
				storeStatus: MissionStatus.STARTED,
			}).stop,
		).toBe(false);
	});

	it("offers the status-appropriate actions once a mission IS selected", () => {
		const allowed = gatedActions({
			hasMission: true,
			hasTopic: true,
			storeStatus: MissionStatus.STARTED,
		});
		expect(allowed.stop).toBe(true);
		expect(allowed.pause).toBe(true);
		expect(allowed.start).toBe(false);
	});

	it("falls back to Submit + Stop with a mission but no feedback topic", () => {
		const allowed = gatedActions({
			hasMission: true,
			hasTopic: false,
			storeStatus: MissionStatus.STARTED,
		});
		expect(allowed.submit).toBe(true);
		expect(allowed.stop).toBe(true);
		expect(allowed.approve).toBe(false);
		expect(allowed.start).toBe(false);
		expect(allowed.pause).toBe(false);
	});

	it("offers Stop for a selected mission with no live feedback yet", () => {
		// A history-origin slot reads as absent to the live gate.
		expect(
			gatedActions({
				hasMission: true,
				hasTopic: true,
				storeStatus: undefined,
			}).stop,
		).toBe(true);
	});
});

describe("canSubmit after NO_TARGET_MISSION", () => {
	it("re-enables Submit on an active, unchanged mission the C2 no longer holds", () => {
		// The C2 restarted and lost the runtime; the last feedback still says
		// STARTED and the config is unchanged. Submit is the way back.
		const args = {
			status: MissionStatus.STARTED,
			currentSig: "same",
			lastSubmittedSig: "same",
		};
		expect(canSubmit(args)).toBe(false);
		expect(canSubmit({ ...args, c2HasNoRuntime: true })).toBe(true);
		expect(
			canSubmit({
				...args,
				lastSubmittedSig: null,
				c2HasNoRuntime: true,
			}),
		).toBe(true);
	});
});

describe("isCommandConfirmed", () => {
	it("confirms Stop only on a terminal status", () => {
		// A first feedback message reading STARTED is not a robot standing down.
		expect(isCommandConfirmed("stop", null, MissionStatus.STARTED)).toBe(
			false,
		);
		expect(
			isCommandConfirmed(
				"stop",
				MissionStatus.STARTED,
				MissionStatus.PAUSED,
			),
		).toBe(false);
		expect(
			isCommandConfirmed(
				"stop",
				MissionStatus.STARTED,
				MissionStatus.STOPPED,
			),
		).toBe(true);
		expect(isCommandConfirmed("stop", null, MissionStatus.COMPLETED)).toBe(
			true,
		);
	});

	it("confirms other commands when the status moves off where it was sent from", () => {
		expect(
			isCommandConfirmed(
				"approve",
				MissionStatus.PLANNED,
				MissionStatus.PLANNED,
			),
		).toBe(false);
		expect(
			isCommandConfirmed(
				"approve",
				MissionStatus.PLANNED,
				MissionStatus.ACCEPTED,
			),
		).toBe(true);
		expect(isCommandConfirmed("submit", null, MissionStatus.PLANNED)).toBe(
			true,
		);
	});

	it("never confirms anything without a live status", () => {
		for (const action of [
			"submit",
			"approve",
			"start",
			"pause",
			"stop",
			"delete",
		] as ControlAction[]) {
			expect(
				isCommandConfirmed(action, MissionStatus.STARTED, null),
			).toBe(false);
			expect(isCommandConfirmed(action, null, undefined)).toBe(false);
		}
	});
});

describe("primaryAction (the one filled button)", () => {
	/** The gate's answer for a status, with Submit narrowed as the panel does. */
	function forStatus(status: MissionStatus | null, edited = false) {
		const allowed = allowedActions(status);
		return primaryAction({
			...allowed,
			submit:
				allowed.submit &&
				canSubmit({
					status,
					currentSig: "b",
					lastSubmittedSig: edited ? "a" : "b",
				}),
		});
	}

	it("suggests Submit before anything has been planned", () => {
		expect(forStatus(null)).toBe("submit");
		expect(forStatus(MissionStatus.NONE)).toBe("submit");
		expect(forStatus(MissionStatus.PLANNED_FAILED)).toBe("submit");
	});

	it("suggests Approve on an unedited planned mission, never Start", () => {
		expect(forStatus(MissionStatus.PLANNED)).toBe("approve");
		expect(forStatus(MissionStatus.PLANNED_ALTERNATIVE)).toBe("approve");
	});

	it("suggests re-submitting a planned mission whose config was edited", () => {
		expect(forStatus(MissionStatus.PLANNED, true)).toBe("submit");
	});

	it("suggests Start once approved, and to resume a paused mission", () => {
		expect(forStatus(MissionStatus.ACCEPTED)).toBe("start");
		expect(forStatus(MissionStatus.PAUSED)).toBe("start");
	});

	it("suggests nothing for a running, unedited mission (never Stop)", () => {
		expect(forStatus(MissionStatus.STARTED)).toBeNull();
	});

	it("suggests nothing when nothing is allowed", () => {
		expect(
			primaryAction({ submit: false, approve: false, start: false }),
		).toBeNull();
	});
});

describe("displayedStatus (display vs gating)", () => {
	it("shows the live status as live", () => {
		expect(
			displayedStatus(MissionStatus.STARTED, MissionStatus.COMPLETED),
		).toEqual({ status: MissionStatus.STARTED, live: true });
	});

	it("falls back to the last known status, flagged as not live", () => {
		expect(displayedStatus(null, MissionStatus.COMPLETED)).toEqual({
			status: MissionStatus.COMPLETED,
			live: false,
		});
	});

	it("reports nothing known as null, not live", () => {
		expect(displayedStatus(null, null)).toEqual({
			status: null,
			live: false,
		});
		expect(displayedStatus(null, undefined)).toEqual({
			status: null,
			live: false,
		});
	});
});
