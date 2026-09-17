/**
 * Pure decision logic for the inline topic picker.
 *
 * The selection dialog is the right tool for a robot publishing 200 topics and
 * the wrong tool for a slot with three plausible answers. This module answers
 * the two questions that decide which one an operator gets:
 *
 * - *Which topics could this slot plausibly mean?* — {@link buildCandidatePool}
 * - *Is that a set you pick from, or a set you search?* —
 *   {@link resolveTopicPickerMode}
 *
 * Both are synchronous and side-effect free. The expensive half (the pool) is
 * computed once per settled topic list; the cheap half (the mode) re-runs on
 * every render because it depends on the current binding.
 */

import {
	DatasourceTopic,
	SelectedTopic,
} from "../../datasources/datasource-interface";
import { DataRequirements } from "../../widgets/widget-interface";
import { isTopicCompatible } from "../../widgets/topic-compatibility";
import { isDirectTypeMatch, topicKey } from "./topic-auto-select";

/**
 * Largest candidate set still worth rendering as an inline list.
 *
 * Six rows is roughly 200px under the field label — a set the operator takes in
 * at a glance and picks from without scrolling, even with two such controls
 * visible at once (`maps-box-viewer` puts two in every array item). Past six the
 * operator stops choosing and starts scanning, and scanning wants the search
 * box, the compatibility filter and the property tree that only the dialog has.
 * The limit is a display budget, not a semantic one: everything above it is
 * still selectable, through the dialog.
 */
export const INLINE_CANDIDATE_LIMIT = 6;

/**
 * Smallest candidate set worth rendering as an inline list.
 *
 * One candidate is not a choice. When the slot is unbound, the auto-select pass
 * has already bound it; when it is bound, a single pre-checked radio is a row of
 * form height that decides nothing. Both cases read better as the settled-value
 * button.
 */
export const INLINE_CANDIDATE_MIN = 2;

/**
 * Smallest candidate set worth rendering for a slot that binds nothing by
 * itself.
 *
 * {@link INLINE_CANDIDATE_MIN} rests on the auto-select pass having already
 * taken the single-candidate case. A scalar-only or `secondary` slot is never
 * auto-bound (see `canAutoBindSlot`), so for those a lone candidate is the whole
 * choice, and hiding it behind the dialog turns "one click" into "open a modal,
 * find the only row, click it".
 */
export const INLINE_CANDIDATE_MIN_UNBOUND = 1;

/** How a topic slot offers its choice to the operator. */
export type TopicPickerMode = "inline" | "dialog";

/** Slot-dependent inputs to {@link resolveTopicPickerMode}. */
export interface TopicPickerModeOptions {
	/**
	 * Whether the slot's auto-select pass may bind a sole candidate itself —
	 * `canAutoBindSlot` of the slot's requirements and role.
	 *
	 * Omitted or `true` keeps {@link INLINE_CANDIDATE_MIN}. Only an explicit
	 * `false` lowers the threshold, so a caller that has not worked out the
	 * slot's policy gets the conservative list rather than an accidental one.
	 */
	autoBindable?: boolean;
}

/** Candidates for one topic slot, derived from a settled available-topics list. */
export interface TopicCandidatePool {
	/**
	 * Topics whose own type satisfies the slot, de-duplicated and ordered. These
	 * are the only ones ever offered inline — see {@link buildCandidatePool}.
	 */
	direct: DatasourceTopic[];
	/**
	 * How many distinct topics are usable for the slot at all, including the
	 * ones that only reach it through a property path. Always `>=
	 * direct.length`; the difference is what the inline control advertises as
	 * living behind the dialog.
	 */
	compatibleCount: number;
}

/** A pool with nothing in it, for use before the topic list has settled. */
export const EMPTY_CANDIDATE_POOL: TopicCandidatePool = {
	direct: [],
	compatibleCount: 0,
};

/** Locale-independent string ordering, so the list is identical everywhere. */
const compareStrings = (a: string, b: string): number => {
	if (a === b) return 0;
	return a < b ? -1 : 1;
};

/**
 * Order candidates by datasource, then by topic name.
 *
 * Datasources enumerate their topics in whatever order the wire delivered them,
 * which differs between connects. Sorting on stable identity means the list the
 * operator saw last time is the list they see now, and the row under the
 * pointer is the row they meant.
 *
 * @param a - First candidate.
 * @param b - Second candidate.
 * @returns Comparator result.
 */
const compareCandidates = (a: DatasourceTopic, b: DatasourceTopic): number =>
	compareStrings(a.source?.title ?? "", b.source?.title ?? "") ||
	compareStrings(a.source?.id ?? "", b.source?.id ?? "") ||
	compareStrings(a.topic, b.topic);

/**
 * Collect the topics a slot can be filled with from a settled topic list.
 *
 * **Only direct type matches become inline candidates.** A property match — an
 * `Odometry` reaching a `number` slot through `pose.pose.position.x` — is a
 * different question (*which field?*), and answering it needs the property tree
 * that `analyzeTopicCompatibilityWithTrees` builds asynchronously, in batches,
 * behind a spinner. Offering the topic inline without that tree would bind the
 * whole message into a scalar slot: plausible, wrong, and silent. So property
 * matches are counted, advertised, and left to the dialog.
 *
 * `isTopicCompatible` is the single sanctioned "usable at all" gate;
 * {@link isDirectTypeMatch} narrows it to what can be offered as a one-click
 * row. Duplicate entries for the same topic on the same source collapse to one.
 *
 * @param topics - Available topics, as reported by `AVAILABLE_TOPICS`.
 * @param requirements - Widget data requirements for the slot.
 * @returns The candidate pool for the slot.
 */
export const buildCandidatePool = (
	topics: DatasourceTopic[],
	requirements: DataRequirements | undefined,
): TopicCandidatePool => {
	const seen = new Set<string>();
	const direct: DatasourceTopic[] = [];
	let compatibleCount = 0;

	for (const topic of topics) {
		if (!topic?.source?.id) continue;

		const key = topicKey(topic);
		if (seen.has(key)) continue;
		seen.add(key);

		if (!isTopicCompatible(topic, requirements)) continue;
		compatibleCount += 1;

		if (isDirectTypeMatch(topic, requirements)) direct.push(topic);
	}

	direct.sort(compareCandidates);

	return { direct, compatibleCount };
};

/**
 * Decide whether a slot renders its candidates inline or defers to the dialog.
 *
 * Falls back to the dialog whenever the inline radio group could not honestly
 * represent the slot:
 *
 * - **fewer than the minimum candidates** — nothing to choose. The minimum is
 *   {@link INLINE_CANDIDATE_MIN}, dropping to
 *   {@link INLINE_CANDIDATE_MIN_UNBOUND} for an unbound slot that auto-select
 *   will not touch, because there the lone candidate is a real offer rather
 *   than a row restating a decision already made;
 * - **more than {@link INLINE_CANDIDATE_LIMIT}** — a list to search, not to pick
 *   from;
 * - **the binding names a property** — a radio row can only express "this whole
 *   topic", so rendering one would show the operator's `pose.pose.position.x`
 *   binding as an unselected group, one stray click from being erased;
 * - **the bound topic is not among the candidates** — same failure, reached by a
 *   binding to a topic that has since disappeared or was made through the
 *   dialog.
 *
 * @param pool - Candidate pool from {@link buildCandidatePool}.
 * @param current - The slot's current binding, if any.
 * @param options - Picker options; `autoBindable` defaults to `true`, which is
 * the historical behaviour of assuming auto-select handled a lone candidate.
 * @returns The picker mode to render.
 */
export const resolveTopicPickerMode = (
	pool: TopicCandidatePool,
	current: SelectedTopic | undefined,
	options?: TopicPickerModeOptions,
): TopicPickerMode => {
	const minimum =
		!current?.topic && options?.autoBindable === false
			? INLINE_CANDIDATE_MIN_UNBOUND
			: INLINE_CANDIDATE_MIN;

	if (pool.direct.length < minimum) return "dialog";
	if (pool.direct.length > INLINE_CANDIDATE_LIMIT) return "dialog";

	if (current?.topic) {
		if (current.property) return "dialog";
		if (!current.source?.id) return "dialog";

		const currentKey = topicKey(current);
		if (!pool.direct.some((topic) => topicKey(topic) === currentKey)) {
			return "dialog";
		}
	}

	return "inline";
};
