/**
 * Pure helpers for the mission behaviour-graph editor.
 *
 * Everything here is React-free, DOM-optional and unit tested directly, for the
 * same reason `mission-graph.ts` is: the editor widget itself is a canvas and a
 * form, and a rule that only exists inside JSX is a rule nobody can test and
 * nobody notices rotting.
 *
 * @module
 */

import {
	isModalOpen,
	isTypingInEditableElement,
	type GuardScope,
} from "@workspace/ui/lib/input-guards";

import type { MissionBehavior, MissionGeometry } from "../types/c2-types";
import type {
	ProgramGateCondition,
	ProgramProgress,
	ProgramStepState,
} from "../types/mission-feedback";
import {
	CONDITION_OP_SHAPE,
	graphCompiles,
	type CompiledMissionGraph,
	type ConditionOpShape,
	type GraphCondition,
	type MissionGraph,
	type MissionGraphIssue,
} from "./mission-graph";

// ============================================================================
// Condition formatting
// ============================================================================

/** Name lookups the formatter resolves ids through. */
export interface ConditionNameLookup {
	/** `feature_id → operator-facing name`, for a `zone` key. */
	featureNames?: Readonly<Record<string, string>>;
	/** `agent_id → operator-facing name`, for an `agent` key. */
	agentNames?: Readonly<Record<string, string>>;
}

/** What a node card says when a condition node carries no predicate. */
export const NO_CONDITION_LABEL = "nothing to evaluate";

/** Render an op's `key` field, already resolved to a human name where known. */
function formatKey(
	shape: ConditionOpShape,
	key: string | undefined,
	lookup: ConditionNameLookup,
): string {
	switch (shape.key) {
		case "none":
			return "";
		case "zone":
			if (!key) return " <no zone>";
			return ` "${lookup.featureNames?.[key] ?? key}"`;
		case "agent":
			if (!key) return " <no agent>";
			return ` "${lookup.agentNames?.[key] ?? key}"`;
		case "flag":
			// A flag IS a name the operator typed — there is nothing to resolve.
			return key ? ` "${key}"` : " <no flag>";
	}
}

/** Render an op's `threshold`, in the unit the op actually reads it in. */
function formatThreshold(shape: ConditionOpShape, threshold: number): string {
	switch (shape.threshold) {
		case "none":
			// `AgentHolding`, `FlagSet`, `Always` and `Never` never read it, so
			// showing one would be a number that means nothing.
			return "";
		case "fraction":
			return ` ≥ ${Math.round(threshold * 100)}%`;
		case "count":
			return ` ≥ ${Math.trunc(threshold)}`;
		case "seconds":
			return ` ≥ ${threshold}s`;
	}
}

/**
 * Turn a condition into one short phrase an operator can read on a node card.
 *
 * Driven entirely off {@link CONDITION_OP_SHAPE} — it renders the op's label
 * and then only the fields that op actually uses, so a phrase can never claim
 * a threshold the fog will not read. Ids are resolved to names where the
 * caller knows them: a raw UUID on a node card tells the operator nothing they
 * can act on.
 *
 * @param condition - The predicate, or `undefined` for an unset condition node.
 * @param lookup - Optional id→name maps for zone and agent keys.
 * @returns A short phrase, or {@link NO_CONDITION_LABEL} when there is none.
 */
export function formatCondition(
	condition: GraphCondition | undefined,
	lookup: ConditionNameLookup = {},
): string {
	if (!condition) return NO_CONDITION_LABEL;
	const shape = CONDITION_OP_SHAPE[condition.op];
	if (!shape) return NO_CONDITION_LABEL;
	const negate = condition.negate ? "NOT " : "";
	const arg =
		shape.arg === "modality" && condition.arg ? ` (${condition.arg})` : "";
	return `${negate}${shape.label}${formatKey(shape, condition.key, lookup)}${arg}${formatThreshold(shape, condition.threshold)}`;
}

// ============================================================================
// Selection
// ============================================================================

/** One xyflow `"select"` change, reduced to what the reducer reads. */
export interface SelectionChange {
	id: string;
	selected: boolean;
}

/**
 * Fold xyflow's `"select"` changes into the editor's own selected-id list.
 *
 * Selection is EPHEMERAL UI state and is deliberately not persisted into the
 * graph: a graph document that carried "which node was highlighted" would mark
 * a mission dirty for a click and re-save on every selection.
 *
 * Returns the SAME array when nothing actually changed, so a click that
 * re-selects what is already selected does not re-render the canvas.
 *
 * @param current - The currently selected ids.
 * @param changes - The `"select"` changes from one xyflow change batch.
 * @returns The next selected ids, or `current` unchanged.
 */
export function applySelectionChanges(
	current: readonly string[],
	changes: readonly SelectionChange[],
): readonly string[] {
	const next = new Set(current);
	let changed = false;
	for (const change of changes) {
		if (change.selected) {
			if (!next.has(change.id)) {
				next.add(change.id);
				changed = true;
			}
		} else if (next.delete(change.id)) {
			changed = true;
		}
	}
	return changed ? [...next] : current;
}

// ============================================================================
// Keyboard shortcuts
// ============================================================================

/**
 * An open Radix popup that owns the keyboard: a `Select`'s listbox or a menu.
 *
 * These render in a PORTAL on `document.body`, so they are outside the
 * inspector's own subtree and outside the canvas — neither a container-scoped
 * listener nor xyflow's `.nokey` opt-out can see them. An operator who has just
 * opened the action dropdown and presses Backspace means "close / go back", not
 * "delete this node".
 */
const OPEN_POPUP_SELECTOR =
	'[role="listbox"][data-state="open"],[role="menu"][data-state="open"]';

/** The keyboard event shape the guard reads — nothing browser-specific. */
export type GuardedKeyEvent = Pick<Event, "target"> & {
	composedPath?: () => EventTarget[];
};

/** Returns the ambient document, or `undefined` outside a browser. */
function ambientScope(): GuardScope | undefined {
	return typeof document === "undefined" ? undefined : document;
}

/**
 * Whether a graph-editor keyboard shortcut may act on this key press.
 *
 * Composes the repo's single keyboard guard
 * (`packages/ui/src/lib/input-guards.ts`) rather than re-deriving it — that
 * module is the one place that knows what "the operator is typing" means, and a
 * local copy is how the defect comes back. This only ever NARROWS it further,
 * which is the sanctioned direction: it additionally refuses while an open
 * Radix listbox or menu owns the keyboard.
 *
 * Without it, `Delete` and `Backspace` reach the graph while the operator is
 * renaming a node — the label field becomes text you cannot edit, and the node
 * you were naming disappears instead.
 *
 * @param event - The key event being considered, if there is one.
 * @param scope - Document to read focus and popups from. Defaults to ambient.
 * @returns True when the shortcut may run.
 */
export function shouldHandleGraphShortcut(
	event?: GuardedKeyEvent,
	scope: GuardScope | undefined = ambientScope(),
): boolean {
	if (isTypingInEditableElement(event, scope)) return false;
	if (isModalOpen(scope)) return false;
	if (typeof scope?.querySelector === "function") {
		try {
			if (scope.querySelector(OPEN_POPUP_SELECTOR) != null) return false;
		} catch {
			return false;
		}
	}
	return true;
}

// ============================================================================
// Issue ordering
// ============================================================================

/**
 * Errors first, warnings after, original order preserved within each group.
 *
 * The list is what an operator reads when the C2 has refused their mission, so
 * the blocking items have to be the ones at the top. `compileMissionGraph`
 * emits in node-declaration order, which interleaves the two severities: a
 * mixed list makes the operator hunt for the one thing that is actually
 * stopping them among advisories they may well have decided to live with.
 *
 * Stable within a severity on purpose — node order is the only ordering the
 * operator can predict, and a sort that reordered siblings would make the list
 * jump on every edit.
 *
 * @param issues - Issues from `compileMissionGraph`.
 * @returns A new array, errors first.
 */
export function sortIssuesBySeverity(
	issues: readonly MissionGraphIssue[],
): MissionGraphIssue[] {
	return [
		...issues.filter((issue) => issue.severity === "error"),
		...issues.filter((issue) => issue.severity !== "error"),
	];
}

// ============================================================================
// The graph → mission draft write
// ============================================================================

/**
 * The slice of a mission draft the behaviour graph authors.
 *
 * Four fields and nothing else. Three of them are what `compileMissionGraph`
 * can express of a `MissionConfig`; the fourth is the C2's gate.
 *
 * ⚠ NOTHING LARGER MAY JOIN THEM. The whole draft rides into the
 * 10 000-character `mission_config` string `InitMission.srv` caps, so the issue
 * list, the node ids, a compiled summary — and above all the graph itself —
 * stay out. `vehicles` and `geometries` are bounded by the fleet and the
 * objective, which the C2 carries anyway; `behavior` is an integer and
 * `graph_compiles` a boolean. See `state/mission-graph-store.ts`.
 */
export interface GraphDraftSlice {
	vehicles: string[];
	geometries: MissionGeometry[];
	behavior: MissionBehavior;
	/**
	 * The C2's gate: a submit is refused with `GRAPH_NOT_READY` unless this is
	 * `true`. Written on EVERY compile, never only when it holds — a stale
	 * `true` left over from a graph that used to compile is exactly the lie the
	 * gate exists to prevent.
	 */
	graph_compiles: boolean;
}

/**
 * What the write decision reads off a mission draft.
 *
 * Deliberately structural rather than `MissionDraft`: `graph_compiles` is an
 * unknown field carried through `hydrateMissionDraft` verbatim and is not
 * declared on the draft type, and this module must not take a dependency on
 * `mission-editor-helpers.ts` to say "a thing with these four fields".
 */
export interface GraphDraftView {
	vehicles?: readonly string[] | null;
	behavior?: unknown;
	graph_compiles?: unknown;
	objective?: { geometries?: readonly MissionGeometry[] | null } | null;
}

/** Whether two vehicle allocations are the same list in the same order. */
function sameVehicles(
	a: readonly string[] | null | undefined,
	b: readonly string[],
): boolean {
	if (!a || a.length !== b.length) return false;
	return a.every((id, index) => id === b[index]);
}

/**
 * Whether two objective-geometry lists are the same references in the same
 * order.
 *
 * Compared item-wise rather than as one `JSON.stringify` of the array: the
 * compiler emits single-key `{ feature_id }` objects, so item-wise
 * serialization is exact for what it produces, and a draft carrying something
 * richer (an inline geometry an older build wrote) compares unequal and is
 * replaced, which is correct — the graph is the author of this field.
 */
function sameGeometries(
	a: readonly MissionGeometry[] | null | undefined,
	b: readonly MissionGeometry[],
): boolean {
	if (!a || a.length !== b.length) return false;
	return a.every(
		(item, index) => JSON.stringify(item) === JSON.stringify(b[index]),
	);
}

/**
 * The slice a compiled graph writes into the mission draft.
 *
 * @param compiled - Output of `compileMissionGraph`.
 * @returns The four fields, with `graph_compiles` derived from the issues.
 */
export function compiledDraftSlice(
	compiled: CompiledMissionGraph,
): GraphDraftSlice {
	return {
		vehicles: compiled.vehicles,
		geometries: compiled.geometries,
		behavior: compiled.behavior,
		graph_compiles: graphCompiles(compiled.issues),
	};
}

/**
 * Decide what — if anything — the graph must write into the mission draft.
 *
 * This is the whole of the "Apply to mission" button, minus the button. The
 * editor calls it after every compile and writes only when it returns a slice,
 * so authoring an agent node puts that agent in `draft.vehicles` on the same
 * gesture instead of waiting for a second one nobody knew to press.
 *
 * ## Why an incomplete graph still writes its allocation
 *
 * When the compile has errors the slice is written **anyway**, with
 * `graph_compiles: false` riding along in the same patch. The alternative —
 * hold `vehicles`/`geometries` back until the graph is clean — was rejected,
 * and the reason is the bug this replaces: a graph with one agent node and no
 * asset node yet does NOT compile (it has no objective), so withholding would
 * reproduce exactly the operator's complaint, an authored agent that the
 * mission says is not there. It also strands values that outlive the nodes they
 * came from: delete the last agent node from a graph that used to compile and
 * the draft would still claim that vehicle, with nothing on screen saying so.
 *
 * What makes writing it safe is that the slice is never written WITHOUT its
 * verdict. The four fields go in one `editMissionDraft` call, so no render ever
 * observes a fresh allocation beside a stale `graph_compiles: true`, and the C2
 * refuses a submit (`GRAPH_NOT_READY`) for as long as the flag is false. "A
 * partial mission" is a partial mission that looks authored; this one is
 * partial and says so, in the one field the C2 actually gates on.
 *
 * ## An EMPTY graph authors nothing
 *
 * A graph with no nodes at all is a mission nobody has authored a behaviour
 * for — not a mission authored as nothing — so it writes nothing, and merely
 * opening the editor beside a mission neither clears its allocation nor marks
 * it unsaved. Once the graph has authored the draft once (`graph_compiles` is
 * on it) every later state IS written, deleting the last node included: by then
 * the graph demonstrably is the author of those fields, and leaving a vehicle
 * behind that no node allocates any more is the stale-value failure this whole
 * change removes.
 *
 * ## Why it returns `null` instead of always writing
 *
 * `editMissionDraft` marks the draft DIRTY unconditionally and always replaces
 * the slot object — that is right for an operator edit and wrong for a
 * re-derivation of something already there. Called on every compile without
 * this guard it would mark a freshly loaded mission dirty for merely rendering
 * it, and each write notifies subscribers, re-renders the editor and re-runs
 * the compile — a loop that only terminates by accident. So an identical slice
 * is NOT a write at all.
 *
 * @param graph - The graph that was compiled, or `null` when none is loaded.
 * @param compiled - Output of `compileMissionGraph`, or `null` when no graph
 *   is loaded.
 * @param draft - The current mission draft, or `null` when none is loaded.
 * @returns The slice to write, or `null` when the draft already carries it.
 */
export function resolveGraphDraftWrite(
	graph: Pick<MissionGraph, "nodes"> | null | undefined,
	compiled: CompiledMissionGraph | null | undefined,
	draft: GraphDraftView | null | undefined,
): GraphDraftSlice | null {
	if (!graph || !compiled || !draft) return null;
	if (graph.nodes.length === 0 && draft.graph_compiles === undefined) {
		return null;
	}
	const slice = compiledDraftSlice(compiled);
	const unchanged =
		sameVehicles(draft.vehicles, slice.vehicles) &&
		sameGeometries(draft.objective?.geometries, slice.geometries) &&
		draft.behavior === slice.behavior &&
		draft.graph_compiles === slice.graph_compiles;
	return unchanged ? null : slice;
}

// ============================================================================
// Live progress: where each agent is in its chain
// ============================================================================

/** How a node is drawn while the mission runs. */
export type RunTone = "running" | "starting" | "waiting" | "done" | "failed";

/** One node's live mark. */
export interface RunMark {
	tone: RunTone;
	/** Short operator-facing line, e.g. "waiting 12/30 s" or "step 2/3 · running". */
	text: string;
}

const STATE_WORD: Record<ProgramStepState, string> = {
	WAITING: "starting",
	GATED: "waiting",
	PLANNING: "planning",
	READY: "planned",
	RUNNING: "running",
	DONE: "done",
	FAILED: "failed",
};

/**
 * Turn the fog's `program` progress into a mark per graph node.
 *
 * Marks are by node id, from the chain the FOG compiled (its `steps`), so a
 * graph edited after submit shows fewer marks, never wrong ones: an id that no
 * longer exists is simply not drawn. Steps before the current one are done
 * with their gates; the current step and its gate carry the live state; agent
 * nodes carry "step i/n · state".
 * @param agentNodes - `agent_id → agent node ids` in the graph.
 * @param program - `MissionFeedback.program`.
 * @param agentNames - `agent_id → name`, for AgentHolding.
 * @returns `node id → mark`.
 */
export function programMarks(
	agentNodes: ReadonlyMap<string, readonly string[]>,
	program: Readonly<Record<string, ProgramProgress>> | undefined,
	agentNames: Readonly<Record<string, string>> = {},
): Map<string, RunMark> {
	const marks = new Map<string, RunMark>();
	if (!program) return marks;
	for (const [agentId, p] of Object.entries(program)) {
		const total = Math.max(p.steps_total, p.steps.length);
		const shown = Math.min(p.step_index + 1, total);
		for (const nodeId of agentNodes.get(agentId) ?? []) {
			marks.set(nodeId, {
				tone: toneOf(p.state),
				text:
					p.state === "DONE"
						? `done · ${total} step${total === 1 ? "" : "s"}`
						: `step ${shown}/${total} · ${STATE_WORD[p.state]}`,
			});
		}
		p.steps.forEach((step, index) => {
			const finished =
				index < p.step_index ||
				(index === p.step_index && p.state === "DONE");
			if (finished) {
				marks.set(step.step_id, { tone: "done", text: "done" });
				for (const g of step.gate_nodes)
					marks.set(g, { tone: "done", text: "held" });
				return;
			}
			if (index !== p.step_index) return;
			if (p.state === "GATED") {
				marks.set(step.step_id, { tone: "starting", text: "next" });
				for (const c of p.gate?.conditions ?? []) {
					marks.set(c.node_id, {
						tone: c.holds ? "done" : "waiting",
						text: gateText(c, p.gate?.waited_s ?? null, agentNames),
					});
				}
				return;
			}
			for (const g of step.gate_nodes)
				marks.set(g, { tone: "done", text: "held" });
			marks.set(step.step_id, {
				tone: toneOf(p.state),
				text: STATE_WORD[p.state],
			});
		});
	}
	return marks;
}

function toneOf(state: ProgramStepState): RunTone {
	switch (state) {
		case "RUNNING":
			return "running";
		case "DONE":
			return "done";
		case "FAILED":
			return "failed";
		case "GATED":
			return "waiting";
		default:
			return "starting";
	}
}

function gateText(
	c: ProgramGateCondition,
	waited: number | null,
	agentNames: Readonly<Record<string, string>>,
): string {
	if (c.holds) return "holds";
	if (c.op === "ElapsedSeconds") {
		return waited == null
			? `waits ${c.threshold} s from start`
			: `waiting ${Math.floor(waited)}/${c.threshold} s`;
	}
	if (c.op === "AgentHolding") {
		const name = agentNames[c.key] ?? c.key.slice(0, 8);
		return c.negate ? `waiting for ${name} to move` : `waiting for ${name}`;
	}
	return "waiting";
}
