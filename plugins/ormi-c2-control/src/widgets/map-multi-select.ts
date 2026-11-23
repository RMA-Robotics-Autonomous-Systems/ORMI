/**
 * Selecting several features on the C2 map, and what can be done to them
 * together.
 *
 * Select-first editing (`map-selection.ts`) opens one feature at a time. A
 * group is selected with the checkboxes of the Assets panel's feature list
 * (the touch path) or by Shift-clicking features on the map (an accelerator
 * on top). The group lives in the map-editor context only.
 *
 * The selection is one of three things:
 * - nothing;
 * - one feature, open for editing exactly as a click opens it (stage-1
 *   editing, with its own card);
 * - a group: no feature open, and a group card holds what applies to all of
 *   them (Delete, Type, Category, Move).
 *
 * One feature can still be a group when it cannot be opened (its layer is
 * locked or hidden, or its geometry cannot be edited): it is selected, and
 * the card says why nothing applies to it.
 *
 * A locked feature can be selected but is excluded from every bulk action,
 * and the card names how many are. A hidden one stays in the set and is not
 * drawn.
 *
 * Pure (no React, no map) so the rules are unit-testable on their own.
 */

import type { C2Feature } from "../types/c2-types";
import {
	CATEGORISED_FEATURE_TYPES,
	FEATURE_TYPES,
	type FeatureType,
	isFeatureType,
	retypeTargets,
} from "./feature-geojson";
import {
	type MercatorOffset,
	isZeroOffset,
	translateGeometry,
} from "./map-group-move";
import { sameGeometry } from "./map-selection";

// ---------------------------------------------------------------------------
// The selection
// ---------------------------------------------------------------------------

/** What is selected: a group, or one feature open, or nothing. */
export interface MultiSelection {
	/** The group, in the order it was built. Empty when there is none. */
	groupIds: readonly string[];
	/** The stored feature open for editing, outside a group. */
	openId: string | null;
}

/** Nothing selected. */
export const NO_SELECTION: MultiSelection = { groupIds: [], openId: null };

/** How a request changes the selection. */
export type SelectionRequestMode = "toggle" | "add" | "remove";

/**
 * The selected feature ids, whichever form the selection takes.
 * @param selection - The selection.
 * @returns The group, or the open feature alone, or nothing.
 */
export function selectedIds(selection: MultiSelection): string[] {
	if (selection.groupIds.length > 0) return [...selection.groupIds];
	return selection.openId ? [selection.openId] : [];
}

/**
 * The selection a set of ids makes: one feature that can be opened opens,
 * anything else is a group.
 *
 * @param ids - The ids selected.
 * @param canOpen - Whether a feature can be opened for editing.
 * @returns The selection.
 */
export function settleSelection(
	ids: readonly string[],
	canOpen: (id: string) => boolean,
): MultiSelection {
	if (ids.length === 0) return NO_SELECTION;
	if (ids.length === 1 && canOpen(ids[0]!))
		return { groupIds: [], openId: ids[0]! };
	return { groupIds: [...ids], openId: null };
}

/**
 * The selection after a checkbox, a "select all" or a Shift-click.
 *
 * @param current - The selection now.
 * @param ids - The features the request names.
 * @param mode - Toggle each one, add them all, or remove them all.
 * @param canOpen - Whether a feature can be opened for editing.
 * @returns The next selection.
 */
export function changeSelection(
	current: MultiSelection,
	ids: readonly string[],
	mode: SelectionRequestMode,
	canOpen: (id: string) => boolean,
): MultiSelection {
	const next = selectedIds(current);
	for (const id of ids) {
		const at = next.indexOf(id);
		const add = mode === "add" || (mode === "toggle" && at === -1);
		if (add && at === -1) next.push(id);
		else if (!add && at !== -1) next.splice(at, 1);
	}
	return settleSelection(next, canOpen);
}

/**
 * Whether two selections are the same.
 * @param a - One selection.
 * @param b - The other.
 * @returns True when the group and the open feature match.
 */
export function sameSelection(a: MultiSelection, b: MultiSelection): boolean {
	return (
		a.openId === b.openId &&
		a.groupIds.length === b.groupIds.length &&
		a.groupIds.every((id, i) => b.groupIds[i] === id)
	);
}

/**
 * What a selection change does to the feature open for editing, so the
 * caller knows whether to ask about its unsaved changes first.
 *
 * @param current - The selection now.
 * @param next - The selection asked for.
 * @returns True when the open feature would close or be replaced.
 */
export function closesOpenFeature(
	current: MultiSelection,
	next: MultiSelection,
): boolean {
	return current.openId !== null && next.openId !== current.openId;
}

// ---------------------------------------------------------------------------
// The group and what applies to it
// ---------------------------------------------------------------------------

/** One selected feature, as the group card sees it. */
export interface GroupMember {
	id: string;
	/** The name shown, or the id when it has none. */
	name: string;
	/** The stored `feature_type`, as stored (possibly unknown to this build). */
	featureType: string;
	/** The stored category, "" for none. */
	category: string;
	/** Its layer is locked: never part of a bulk action. */
	locked: boolean;
	/** Its layer is hidden: in the set, not drawn. */
	hidden: boolean;
}

/** The group split by what bulk actions may touch. */
export interface GroupTargets {
	/** Members a bulk action applies to. */
	eligible: GroupMember[];
	/** Members excluded because their layer is locked. */
	locked: GroupMember[];
	/** Members whose layer is hidden (they stay eligible). */
	hidden: GroupMember[];
}

/**
 * Split the group into what a bulk action applies to and what it does not.
 * @param members - The selected features.
 * @returns The split.
 */
export function groupTargets(members: readonly GroupMember[]): GroupTargets {
	return {
		eligible: members.filter((m) => !m.locked),
		locked: members.filter((m) => m.locked),
		hidden: members.filter((m) => m.hidden),
	};
}

/**
 * The types every eligible feature may be retyped to: the types sharing the
 * geometry class of all of them (`retypeTargets`). A group mixing classes,
 * or holding a type this build does not know, has none.
 *
 * @param eligible - The features a bulk action applies to.
 * @returns The legal types, in `FEATURE_TYPES` order.
 */
export function groupRetypeTargets(
	eligible: readonly Pick<GroupMember, "featureType">[],
): FeatureType[] {
	if (eligible.length === 0) return [];
	let legal: FeatureType[] = [...FEATURE_TYPES];
	for (const member of eligible) {
		if (!isFeatureType(member.featureType)) return [];
		const targets = retypeTargets(member.featureType);
		legal = legal.filter((type) => targets.includes(type));
	}
	return legal;
}

/** The changes the group card holds, not saved yet. */
export interface GroupDraft {
	/** The type every eligible feature becomes; undefined leaves each as is. */
	featureType?: FeatureType;
	/** The category every eligible feature takes ("" for none); undefined leaves each as is. */
	category?: string;
	/** The move, as one offset. */
	offset: MercatorOffset;
}

/**
 * The type a member has once the draft applies.
 * @param member - The member.
 * @param draft - The draft.
 * @returns Its resulting type.
 */
function resultingType(
	member: Pick<GroupMember, "featureType">,
	draft: Pick<GroupDraft, "featureType">,
): string {
	return draft.featureType ?? member.featureType;
}

/**
 * Whether the category can be set on the whole group: every eligible
 * feature's type (after the draft's type) carries one.
 *
 * @param eligible - The features a bulk action applies to.
 * @param draft - The draft's type, if any.
 * @returns True when Category may be set.
 */
export function groupTakesCategory(
	eligible: readonly Pick<GroupMember, "featureType">[],
	draft: Pick<GroupDraft, "featureType">,
): boolean {
	return (
		eligible.length > 0 &&
		eligible.every((member) => {
			const type = resultingType(member, draft);
			return (
				isFeatureType(type) && CATEGORISED_FEATURE_TYPES.includes(type)
			);
		})
	);
}

/**
 * The value shared by every item, or null when they differ or there are none.
 * @param values - The values.
 * @returns The common value.
 */
export function commonValue<T>(values: readonly T[]): T | null {
	if (values.length === 0) return null;
	const first = values[0]!;
	return values.every((v) => v === first) ? first : null;
}

/** Which of the group card's actions are available. */
export interface GroupActions {
	delete: boolean;
	move: boolean;
	retype: boolean;
	categorise: boolean;
}

/**
 * Which bulk actions the group card offers. Nothing applies in View, while
 * a write is running, or with no eligible feature.
 *
 * @param input - The eligible members, the draft, and the map's state.
 * @returns The actions available.
 */
export function groupActions(input: {
	eligible: readonly Pick<GroupMember, "featureType">[];
	draft: Pick<GroupDraft, "featureType">;
	viewOnly: boolean;
	busy: boolean;
	canUpdate: boolean;
	canDelete: boolean;
}): GroupActions {
	const open = !input.viewOnly && !input.busy && input.eligible.length > 0;
	const update = open && input.canUpdate;
	return {
		delete: open && input.canDelete,
		move: update,
		retype: update && groupRetypeTargets(input.eligible).length > 0,
		categorise: update && groupTakesCategory(input.eligible, input.draft),
	};
}

/**
 * A stored feature with the group draft applied, ready to PUT. Null when
 * the draft changes nothing about it.
 *
 * The stored document is the base, so every property it carries is written
 * back. A category is removed when the type it lands on takes none, as the
 * single-feature save does.
 *
 * @param stored - The feature as the C2 holds it.
 * @param draft - The group draft.
 * @returns The feature to write, or null.
 */
export function applyGroupDraft(
	stored: C2Feature,
	draft: GroupDraft,
): C2Feature | null {
	const properties: Record<string, unknown> = {
		...(stored.properties ?? {}),
	};
	const before = {
		type: String(properties.feature_type ?? ""),
		category:
			typeof properties.category === "string"
				? properties.category.trim()
				: "",
	};
	const type = draft.featureType ?? before.type;
	if (draft.featureType !== undefined) properties.feature_type = type;
	const takesCategory =
		isFeatureType(type) && CATEGORISED_FEATURE_TYPES.includes(type);
	let category = before.category;
	if (!takesCategory) category = "";
	else if (draft.category !== undefined) category = draft.category.trim();
	if (category) properties.category = category;
	else delete properties.category;

	const geometry =
		stored.geometry && !isZeroOffset(draft.offset)
			? translateGeometry(
					stored.geometry as { type: string; coordinates: unknown },
					draft.offset,
				)
			: stored.geometry;

	const changed =
		type !== before.type ||
		category !== before.category ||
		!sameGeometry(
			geometry as { type: string; coordinates: unknown } | undefined,
			stored.geometry as
				{ type: string; coordinates: unknown } | undefined,
		);
	if (!changed) return null;
	return {
		...stored,
		properties: properties as C2Feature["properties"],
		geometry: geometry as C2Feature["geometry"],
	};
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * A count of features.
 * @param count - How many.
 * @returns E.g. "1 feature", "3 features".
 */
export function featureCount(count: number): string {
	return `${count} feature${count === 1 ? "" : "s"}`;
}

/**
 * Names joined for a sentence: "A", "A and B", "A, B and C".
 * @param names - The names.
 * @returns The joined names.
 */
export function joinNames(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? "";
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Most names a question lists before it gives a count only. */
export const NAMED_IN_QUESTION_MAX = 5;

/**
 * The question asked before a bulk delete.
 *
 * @param eligible - The names of the features that would be deleted.
 * @param lockedCount - Selected features left alone because they are locked.
 * @returns The dialog's title and description.
 */
export function bulkDeleteQuestion(
	eligible: readonly string[],
	lockedCount: number,
): { title: string; description: string } {
	const what =
		eligible.length <= NAMED_IN_QUESTION_MAX
			? joinNames(eligible)
			: featureCount(eligible.length);
	const kept =
		lockedCount > 0
			? ` ${featureCount(lockedCount)} on a locked layer ${lockedCount === 1 ? "is" : "are"} kept.`
			: "";
	return {
		title: `Delete ${featureCount(eligible.length)}?`,
		description: `Permanently delete ${what} from this map.${kept}`,
	};
}

// ---------------------------------------------------------------------------
// Partial failure
// ---------------------------------------------------------------------------

/** The answer to one request of a bulk action. */
export interface BulkOutcome {
	id: string;
	name: string;
	ok: boolean;
	/** The C2's reason, for a failure. */
	error?: string;
}

/** What a bulk action did, for the selection and the message. */
export interface BulkReport {
	/** Ids the C2 accepted. */
	succeeded: string[];
	/** Ids it did not, in request order. */
	failed: string[];
	/** The message to show; null when every request succeeded. */
	message: string | null;
}

/**
 * Sort a bulk action's answers. Successes are applied and failures are
 * named, never counted as done; the caller keeps the failures selected. No
 * request is retried.
 *
 * @param outcomes - One answer per request, in request order.
 * @param action - What the requests did.
 * @returns The report.
 */
export function bulkReport(
	outcomes: readonly BulkOutcome[],
	action: "save" | "delete",
): BulkReport {
	const succeeded = outcomes.filter((o) => o.ok).map((o) => o.id);
	const failures = outcomes.filter((o) => !o.ok);
	if (failures.length === 0) return { succeeded, failed: [], message: null };
	const named = failures
		.map((o) => (o.error ? `${o.name} (${o.error})` : o.name))
		.join(", ");
	const verb = action === "save" ? "saved" : "deleted";
	const done =
		succeeded.length > 0
			? ` ${featureCount(succeeded.length)} ${verb}.`
			: "";
	return {
		succeeded,
		failed: failures.map((o) => o.id),
		message: `Not ${verb}: ${named}.${done} Still selected.`,
	};
}
