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
			error: `Could not read the mission from the C2: ${args.listError}`,
		};
	}

	if (args.stored == null) {
		return {
			ok: false,
			error: "This mission is not saved on the C2. Save it on the mission map, then submit.",
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
 * Why a config must not be SUBMITTED because of its behaviour graph, or null.
 *
 * The C2 refuses these too (`GRAPH_NOT_READY`), but only after a round trip
 * and in its own words. Saying it here, before anything is sent, points the
 * operator at the graph editor that lists the errors. It is deliberately NOT a
 * `validateMissionConfig` rule: that gates Save as well, and a graph that is
 * still being authored must stay **saveable**.
 *
 * That distinction is the whole reason this returns only the reason, never
 * the outcome. Submit now saves first, so when this refuses, the
 * operator's edits are already on disk — and "the behaviour graph has errors,
 * fix them before submitting" read, in that situation, as though the whole
 * click had been thrown away. The caller states which of the two happened
 * ("Saved, but not submitted." / "Not submitted.") and appends this.
 *
 * @param config - The cleaned config about to be submitted.
 * @returns The reason, a sentence composed after the caller's own, or null
 * when the graph allows submit.
 */
export function graphSubmitBlock(config: MissionDraft): string | null {
	const { graph_ref: graphRef, graph_compiles: graphCompiles } =
		config as MissionDraft & {
			graph_ref?: unknown;
			graph_compiles?: unknown;
		};
	if (typeof graphRef !== "string" || graphRef.trim() === "") {
		return "This mission has no behaviour graph to run. Build one in the mission graph editor, then submit again.";
	}
	if (graphCompiles !== true) {
		return "The behaviour graph has errors. Fix them in the mission graph editor, then submit again.";
	}
	return null;
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
		return "Mission submitted (saved version).";
	}
	return plan.unsaved
		? "Mission submitted with unsaved edits. Save the mission to keep them."
		: "Mission submitted with your current edits.";
}
