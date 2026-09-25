/**
 * The graph editor stands down on a committed plan — the same rule the mission
 * map runs, on the other surface that authors the same mission.
 *
 * Before this, `mission-graph-editor.tsx` referenced `MissionStatus` nowhere at
 * all: an operator watching a running mission could retarget a node, it landed
 * in the shared draft, and Submit carried it.
 */

import { describe, expect, it } from "bun:test";

import { MissionStatus } from "../types/c2-types";
import { allowedActions } from "./control-actions";
import {
	graphModeTitle,
	resolveGraphViewOnly,
} from "./mission-graph-editor-helpers";
import { isMissionCommitted } from "./map-view-mode";

const EVERY_STATUS = Object.values(MissionStatus).filter(
	(value): value is MissionStatus => typeof value === "number",
);

describe("resolveGraphViewOnly", () => {
	it("stands authoring down once the plan is approved", () => {
		for (const status of [
			MissionStatus.ACCEPTED,
			MissionStatus.STARTED,
			MissionStatus.PAUSED,
		]) {
			expect(
				resolveGraphViewOnly({
					readOnly: false,
					status,
					editUnlockedAt: null,
				}),
			).toBe(true);
		}
	});

	it("leaves authoring on while the plan is still being authored", () => {
		for (const status of [
			MissionStatus.NONE,
			MissionStatus.PLANNED,
			MissionStatus.PLANNED_ALTERNATIVE,
			MissionStatus.PLANNED_FAILED,
			MissionStatus.FAILED,
			MissionStatus.STOPPED,
			MissionStatus.COMPLETED,
			MissionStatus.DELETED,
		]) {
			expect(
				resolveGraphViewOnly({
					readOnly: false,
					status,
					editUnlockedAt: null,
				}),
			).toBe(false);
		}
	});

	it("treats no feedback at all as authorable — absence of news is not a signal", () => {
		expect(
			resolveGraphViewOnly({
				readOnly: false,
				status: null,
				editUnlockedAt: null,
			}),
		).toBe(false);
		expect(
			resolveGraphViewOnly({
				readOnly: false,
				status: undefined,
				editUnlockedAt: null,
			}),
		).toBe(false);
	});

	it("honours the operator's own View choice whatever the status", () => {
		for (const status of EVERY_STATUS) {
			expect(
				resolveGraphViewOnly({
					readOnly: true,
					status,
					editUnlockedAt: status,
				}),
			).toBe(true);
		}
	});

	it("is a TRANSITION, not a lock: Author taken back over a committed plan holds", () => {
		expect(
			resolveGraphViewOnly({
				readOnly: false,
				status: MissionStatus.ACCEPTED,
				editUnlockedAt: MissionStatus.ACCEPTED,
			}),
		).toBe(false);
	});

	it("stands down again on the NEXT transition (approved → started)", () => {
		expect(
			resolveGraphViewOnly({
				readOnly: false,
				status: MissionStatus.STARTED,
				editUnlockedAt: MissionStatus.ACCEPTED,
			}),
		).toBe(true);
	});

	it("agrees with allowedActions: a status that still offers Approve is never view-only", () => {
		for (const status of EVERY_STATUS) {
			const offersApprove = allowedActions(status).approve;
			if (!offersApprove) continue;
			expect(
				resolveGraphViewOnly({
					readOnly: false,
					status,
					editUnlockedAt: null,
				}),
			).toBe(false);
		}
	});

	it("matches isMissionCommitted exactly across the whole enum", () => {
		for (const status of EVERY_STATUS) {
			expect(
				resolveGraphViewOnly({
					readOnly: false,
					status,
					editUnlockedAt: null,
				}),
			).toBe(isMissionCommitted(status));
		}
	});
});

describe("graphModeTitle", () => {
	it("says WHY when the editor stood down by itself", () => {
		const title = graphModeTitle({
			readOnly: false,
			status: MissionStatus.ACCEPTED,
			editUnlockedAt: null,
		});
		expect(title).toContain("approved");
		expect(title).toContain("Author");
	});

	it("distinguishes the operator's own View from the automatic one", () => {
		const chosen = graphModeTitle({
			readOnly: true,
			status: MissionStatus.PLANNED,
			editUnlockedAt: null,
		});
		expect(chosen).not.toContain("approved");
		expect(chosen).toContain("View");
	});

	it("says authoring is on when it is", () => {
		expect(
			graphModeTitle({
				readOnly: false,
				status: MissionStatus.PLANNED,
				editUnlockedAt: null,
			}),
		).toContain("Author");
	});

	it("says when authoring is on over an approved plan", () => {
		const title = graphModeTitle({
			readOnly: false,
			status: MissionStatus.ACCEPTED,
			editUnlockedAt: MissionStatus.ACCEPTED,
		});
		expect(title).toContain("Author");
		expect(title).toContain("approved");
	});

	it("never carries an em dash", () => {
		for (const status of EVERY_STATUS) {
			for (const readOnly of [true, false]) {
				expect(
					graphModeTitle({ readOnly, status, editUnlockedAt: null }),
				).not.toContain("—");
			}
		}
	});
});
