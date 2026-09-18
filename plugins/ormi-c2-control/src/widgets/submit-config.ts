import type { MissionDraft } from "./mission-editor-helpers";
import { cleanMissionConfig } from "./mission-editor-helpers";

/**
 * Which config a Submit (`c2.mission.init`) actually ships — pure, so the rule is
 * stated once and tested rather than buried in an async click handler.
 *
 * THE BUG THIS REPLACES — the control panel sourced `missionConfig` **only** from
 * `c2.missions.list` and never looked at the shared working draft, while the
 * Submit dirty-gate was computed FROM that draft and, on success, recorded the
 * DRAFT's signature as "last submitted". So editing geometry on the map and
 * pressing Submit made the C2 plan the **stored** config while the panel reported
 * the edit as submitted, and then gated further Submits because it believed the
 * edit was already in. The operator was told their change was live when it was
 * not — the worst failure mode this panel has.
 *
 * THE RULE — the operator's live draft is authoritative whenever one is loaded.
 * It is cleaned first ({@link cleanMissionConfig}), exactly as the editor's save
 * path does, so the half-formed optional blocks JSON-Forms materializes (`transit:
 * {}` and friends) do not reach the C2 — and so the signature recorded afterwards
 * matches the one the dirty-gate computes.
 *
 * The stored config is used only when no draft is loaded at all. There is no
 * empty-stub fallback: submitting a fabricated stub is what turned a backend
 * outage into "fix the errors below" against a mission that was perfectly valid
 * (the stub has no geometries, so it trips the geometries gate).
 */

/** Where the submitted config came from. */
export type SubmitSource = "draft" | "stored";

/** A resolved Submit payload. */
export interface SubmitPlan {
	/** The cleaned config to hand to `c2.mission.init`. */
	config: MissionDraft;
	/** Which source it came from (drives the operator-facing message). */
	source: SubmitSource;
	/**
	 * True when the draft had unsaved edits. The submit still goes ahead — what
	 * the operator sees is what gets planned — but the panel says so, because the
	 * C2 will then be planning a config the mission store does not yet hold.
	 */
	unsaved: boolean;
}

/** Inputs to {@link planSubmit}. */
export interface PlanSubmitArgs {
	/** The active mission id. */
	missionId: string;
	/** The operator's live working draft for that mission, or null. */
	draft: MissionDraft | null;
	/** Whether that draft has unsaved edits. */
	dirty: boolean;
	/**
	 * The stored mission's raw config from `c2.missions.list`, or null when the
	 * mission is not in the store.
	 */
	stored: unknown | null;
	/**
	 * The missions-list fetch error, when the fetch FAILED. Distinguished from
	 * `stored: null` (fetch succeeded, mission absent) on purpose: a backend
	 * outage and a missing mission are different problems with different fixes,
	 * and conflating them is what produced the bogus validation error.
	 */
	listError?: string | null;
}

/** The outcome of resolving what to submit. */
export type SubmitResolution =
	{ ok: true; plan: SubmitPlan } | { ok: false; error: string };

/**
 * Decide what a Submit should ship for the active mission.
 *
 * Precedence:
 *  1. **A loaded draft wins**, cleaned. This is what the operator is looking at,
 *     and it is what the dirty-gate and `lastSubmittedSig` are computed from, so
 *     it is the only choice that keeps the three consistent. A fetch error is
 *     irrelevant here — we never needed the list.
 *  2. No draft, but the **list fetch failed** → surface the transport error. Do
 *     not fall through to anything.
 *  3. No draft, list fetched, **mission present** → the stored config, cleaned.
 *  4. No draft, list fetched, **mission absent** → an explicit error naming the
 *     mission. Never a stub.
 *
 * @param args - {@link PlanSubmitArgs}.
 * @returns The resolved plan, or the error to show instead.
 */
export function planSubmit(args: PlanSubmitArgs): SubmitResolution {
	if (args.draft) {
		return {
			ok: true,
			plan: {
				config: cleanMissionConfig(args.draft),
				source: "draft",
				unsaved: args.dirty,
			},
		};
	}

	if (args.listError) {
		return {
			ok: false,
			error: `Could not load the stored mission config: ${args.listError}`,
		};
	}

	if (args.stored == null) {
		return {
			ok: false,
			error: `Mission ${args.missionId} has no stored config. Open it in the mission editor and save it before submitting.`,
		};
	}

	return {
		ok: true,
		plan: {
			config: cleanMissionConfig(args.stored as MissionDraft),
			source: "stored",
			unsaved: false,
		},
	};
}

/**
 * The operator-facing message for a successful submit, naming what was sent.
 *
 * "Mission submitted" alone is what let the old panel lie. Saying which config
 * went — and flagging that it is not yet persisted — makes the divergence
 * visible at the moment it is created.
 *
 * @param plan - The plan that was submitted.
 * @returns The message to show.
 */
export function submitMessage(plan: SubmitPlan): string {
	if (plan.source === "stored") {
		return "Mission submitted (initialize) — sent the saved config.";
	}
	return plan.unsaved
		? "Mission submitted (initialize) — sent your UNSAVED edits. Save the mission to persist them."
		: "Mission submitted (initialize) — sent your current edits.";
}
