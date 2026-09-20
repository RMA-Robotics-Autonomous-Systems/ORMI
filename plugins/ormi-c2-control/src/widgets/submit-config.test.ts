import { describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import { missionConfigSignature } from "./control-actions";
import type { MissionDraft } from "./mission-editor-helpers";
import { planSubmit, submitMessage } from "./submit-config";

/**
 * P0 #1 — Submit used to ship the STORED config while reporting the DRAFT as
 * submitted. These cases pin the precedence that fixes it.
 */

/** A minimal, valid-shaped draft. */
function draft(overrides: Partial<MissionDraft> = {}): MissionDraft {
	return {
		mission_id: "m1",
		name: "Recon",
		behavior: MissionBehavior.NAVIGATE,
		vehicles: ["agent-1"],
		objective: {
			geometries: [
				{
					geometry: {
						geometry_type: "Point",
						coordinates: [[4.39, 50.84]],
					},
				},
			],
		},
		...overrides,
	} as MissionDraft;
}

describe("planSubmit", () => {
	it("ships the operator's live draft, not the stored config", () => {
		const edited = draft({ name: "Recon (edited)" });
		const stored = draft({ name: "Recon" });
		const out = planSubmit({
			missionId: "m1",
			draft: edited,
			dirty: true,
			stored,
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.plan.source).toBe("draft");
		expect(out.plan.config.name).toBe("Recon (edited)");
		expect(out.plan.unsaved).toBe(true);
	});

	it("cleans the draft exactly as the editor's save path does", () => {
		// JSON-Forms materializes `transit: {}`; the C2 crashes on a partial
		// transit block, so the empty one must be pruned before submitting.
		const withEmptyBlocks = draft({
			transit: {},
			start: undefined,
		} as Partial<MissionDraft>);
		const out = planSubmit({
			missionId: "m1",
			draft: withEmptyBlocks,
			dirty: true,
			stored: null,
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect("transit" in out.plan.config).toBe(false);
	});

	it("produces a config whose signature matches the dirty-gate's", () => {
		// The panel records `missionConfigSignature(submitted)` as
		// `lastSubmittedSig` and compares it against the DRAFT's signature. If
		// cleaning were not idempotent the two would never agree and Submit would
		// stay enabled forever after a submit.
		const d = draft({ transit: {} } as Partial<MissionDraft>);
		const out = planSubmit({
			missionId: "m1",
			draft: d,
			dirty: false,
			stored: null,
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(missionConfigSignature(out.plan.config)).toBe(
			missionConfigSignature(d),
		);
	});

	it("uses the stored config only when no draft is loaded", () => {
		const stored = draft({ name: "Stored" });
		const out = planSubmit({
			missionId: "m1",
			draft: null,
			dirty: false,
			stored,
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.plan.source).toBe("stored");
		expect(out.plan.unsaved).toBe(false);
	});

	it("surfaces a fetch failure instead of fabricating a stub (#12)", () => {
		// The old path fell through to `newMissionStub`, which has no geometries,
		// so a backend outage was reported to the operator as "this mission config
		// cannot be submitted — fix the errors below" against a valid mission.
		const out = planSubmit({
			missionId: "m1",
			draft: null,
			dirty: false,
			stored: null,
			listError: "HTTP 503: Service Unavailable",
		});
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toContain("HTTP 503");
		expect(out.error).toContain("Could not load");
	});

	it("distinguishes a missing mission from a failed fetch", () => {
		const out = planSubmit({
			missionId: "m-404",
			draft: null,
			dirty: false,
			stored: null,
			listError: null,
		});
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toContain("m-404");
		expect(out.error).toContain("no stored config");
	});

	it("prefers the draft even when the list fetch failed", () => {
		// A draft is self-sufficient; a transport failure we never needed must not
		// block a submit the operator can perfectly well make.
		const out = planSubmit({
			missionId: "m1",
			draft: draft(),
			dirty: true,
			stored: null,
			listError: "HTTP 503",
		});
		expect(out.ok).toBe(true);
	});
});

describe("submitMessage", () => {
	it("says the submitted config is not yet saved", () => {
		const message = submitMessage({
			config: draft(),
			source: "draft",
			unsaved: true,
		});
		expect(message).toContain("UNSAVED");
	});

	it("distinguishes a saved-draft submit from a stored-config submit", () => {
		expect(
			submitMessage({ config: draft(), source: "draft", unsaved: false }),
		).toContain("your current edits");
		expect(
			submitMessage({
				config: draft(),
				source: "stored",
				unsaved: false,
			}),
		).toContain("saved config");
	});
});
