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

import type {
	MissionBehavior,
	MissionGeometry,
	MissionStatus,
} from "../types/c2-types";
import type {
	ProgramGateCondition,
	ProgramProgress,
	ProgramStepState,
} from "../types/mission-feedback";
import {
	CONDITION_OP_SHAPE,
	emptyMissionGraph,
	freshGraphId,
	graphCompiles,
	graphDocId,
	isOutdatedGraphDocument,
	normalizeCondition,
	readGraphDocument,
	type CompiledMissionGraph,
	type ConditionOp,
	type ConditionOpShape,
	type GraphCondition,
	type MissionGraph,
	type MissionGraphIssue,
	type MissionGraphNode,
} from "./mission-graph";
import { isMissionCommitted, resolveViewOnly } from "./map-view-mode";
import {
	connectionPlan,
	nodePorts,
	type PortRef,
	type PortType,
} from "./mission-graph-ports";

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
		case "flag":
			// A flag IS a name the operator typed — there is nothing to resolve.
			return key ? ` "${key}"` : " <no flag>";
	}
}

/** Render an op's `threshold`, in the unit the op actually reads it in. */
function formatThreshold(shape: ConditionOpShape, threshold: number): string {
	switch (shape.threshold) {
		case "none":
			// `StepDone`, `FlagSet`, `Always` and `Never` never read it, so
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

/**
 * The node whose parameters the details panel shows, if any.
 *
 * The panel exists to change a node's parameters, so it is open for exactly
 * ONE selected node and nothing else: a link carries no parameter (deleting
 * one stays on the Delete key), a multi-selection has no single set of
 * parameters to show, and an empty selection has nothing to edit. Derived from
 * the selection at render, never stored, so there is no open/closed state that
 * could disagree with what is selected.
 *
 * @param selectedNodeIds - The selected node ids.
 * @param selectedEdgeIds - The selected edge ids.
 * @returns The one selected node's id, or `null` when the panel stays closed.
 */
export function inspectedNodeId(
	selectedNodeIds: readonly string[],
	selectedEdgeIds: readonly string[],
): string | null {
	if (selectedNodeIds.length !== 1 || selectedEdgeIds.length > 0) return null;
	return selectedNodeIds[0] ?? null;
}

/** A node's rendered size, as xyflow measured it. */
export interface NodeSize {
	width: number;
	height: number;
}

/**
 * Fold xyflow's `dimensions` changes into the sizes the canvas nodes carry.
 *
 * With controlled nodes, xyflow keeps what it measured on its INTERNAL node
 * only until the next nodes array arrives: it rebuilds each internal node from
 * the user node, `measured` included, so a user node without `measured` resets
 * the size to unknown on every render. The minimap reads the user node and
 * skips any node without a size, which is why it drew no node at all. Carrying
 * the reported size on the node is the contract `applyNodeChanges` implements
 * for its own users; this keeps it for the one field, since everything else
 * this canvas renders comes from the mission graph.
 *
 * @param current - The sizes held now.
 * @param measured - The sizes xyflow just reported.
 * @returns `current` itself when nothing changed, else a new map.
 */
export function applyNodeSizes(
	current: ReadonlyMap<string, NodeSize>,
	measured: readonly ({ id: string } & NodeSize)[],
): ReadonlyMap<string, NodeSize> {
	let next: Map<string, NodeSize> | null = null;
	for (const { id, width, height } of measured) {
		const held = (next ?? current).get(id);
		if (held && held.width === width && held.height === height) continue;
		next ??= new Map(current);
		next.set(id, { width, height });
	}
	return next ?? current;
}

/** A screen box, in one coordinate space (client pixels, say). */
export interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * The shift along one axis that brings `[start, end]` into `[min, max]`.
 *
 * Nothing when it is already wholly inside. Otherwise the smallest move that
 * leaves `margin` of air on the side it came in from; a span too long to fit
 * with its margins lines its START up instead, so the part an operator reads
 * first (a node's header) is the part on screen.
 */
function revealAxis(
	start: number,
	end: number,
	min: number,
	max: number,
	margin: number,
): number {
	if (start >= min && end <= max) return 0;
	if (end - start > max - min - 2 * margin) return min + margin - start;
	if (end > max) return max - margin - end;
	return min + margin - start;
}

/**
 * How far to pan the view so a node is wholly visible, or `{0, 0}` when it is.
 *
 * Used when a click opens the details panel: the panel takes the right of the
 * canvas and the view deliberately does not move for it, so a node near the
 * right edge can end up underneath it. The pan is the MINIMUM that brings the
 * whole node back, per axis (an axis the node is already inside is left
 * alone), so a node that is in view never moves at all. Add the result to the
 * viewport's translation; the zoom is never touched.
 *
 * @param node - The node's box.
 * @param visible - The part of the canvas actually on screen, same space.
 * @param margin - Air to leave between the node and the edge it is pulled to.
 * @returns The translation to add, in the same pixels.
 */
export function revealDelta(
	node: ScreenRect,
	visible: ScreenRect,
	margin: number,
): { dx: number; dy: number } {
	return {
		dx: revealAxis(
			node.left,
			node.right,
			visible.left,
			visible.right,
			margin,
		),
		dy: revealAxis(
			node.top,
			node.bottom,
			visible.top,
			visible.bottom,
			margin,
		),
	};
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
// Showing rather than authoring
// ============================================================================

/** What decides whether the graph editor is showing rather than authoring. */
export interface GraphViewOnlyInput {
	/** The operator's own View/Author choice: true when they picked View. */
	readOnly: boolean;
	/** Live `MissionStatus` of the SELECTED mission, if any has arrived. */
	status: MissionStatus | null | undefined;
	/** The status under which the operator last deliberately took Author back. */
	editUnlockedAt: MissionStatus | null;
}

/**
 * Whether the graph editor's authoring affordances stand down.
 *
 * The same rule the mission map runs (`map-view-mode.ts`), applied to the other
 * surface that authors the same mission: approving a mission commits its plan,
 * and a canvas still armed over a graph the C2 has already dispatched lets an
 * operator nudge a running mission into the draft, where the next Submit picks
 * it up. The map has stood down since it shipped; this editor never did.
 *
 * `inMissionContext` is always true here — unlike the map, which also authors
 * map features that belong to no mission, this widget renders nothing at all
 * without a selected mission, so everything on it is about that one mission.
 *
 * Derived, never stored: a status-driven `setState` in an effect would
 * re-render on every feedback message, and silencing that lint rule would opt
 * the whole editor body out of React Compiler.
 *
 * @param input - See {@link GraphViewOnlyInput}.
 * @returns True when authoring stands down.
 */
export function resolveGraphViewOnly(input: GraphViewOnlyInput): boolean {
	return resolveViewOnly({
		readOnly: input.readOnly,
		inMissionContext: true,
		status: input.status,
		editUnlockedAt: input.editUnlockedAt,
	});
}

/**
 * What the View/Author toggle's title says, and why.
 *
 * A control whose affordances vanished with nobody pressing anything must say
 * why, or the operator reaches for the gear dialog or a reload. The cases are
 * genuinely different: the operator chose View, the plan is committed and the
 * editor stood down by itself, authoring is on over a committed plan, or
 * authoring is on.
 *
 * @param input - The same input {@link resolveGraphViewOnly} reads.
 * @returns A title for the toggle.
 */
export function graphModeTitle(input: GraphViewOnlyInput): string {
	if (!resolveGraphViewOnly(input))
		return isMissionCommitted(input.status)
			? "Author mode: editing an approved plan"
			: "Author mode";
	if (input.readOnly) return "View mode";
	return "Plan approved: view only. Choose Author to edit.";
}

// ============================================================================
// Reading the stored graph document
// ============================================================================

/**
 * What a mission's stored graph document turned out to be.
 *
 * A discriminated union rather than "the graph, or an empty one": an outdated
 * document and a mission nobody has authored a graph for are DIFFERENT states,
 * and collapsing them is what let the editor write `vehicles: []` over a stored
 * allocation before the operator touched anything. Same rule as the settled-topics
 * union in AGENTS.md — a consumer must not be able to reach the payload without
 * narrowing.
 */
export type StoredGraphLoad =
	{ kind: "graph"; graph: MissionGraph } | { kind: "outdated" };

/**
 * Read a mission's graph out of a `c2.missions.list` payload.
 *
 * Three outcomes collapse to two: a document this build reads is that graph, no
 * document at all is an empty canvas (the normal state of a mission nobody has
 * authored a graph for), and a document of another schema version is
 * `outdated` — which is NOT an empty graph. The caller must not load an empty
 * graph for one, because the graph is the sole author of the mission's
 * allocation: an empty one written into the draft clears `vehicles` and
 * `objective.geometries`, and the next Save persists the loss.
 *
 * @param missionId - The mission whose graph is wanted.
 * @param data - The raw `c2.missions.list` response.
 * @returns The graph to load, or `outdated`.
 */
export function readStoredGraph(
	missionId: string,
	data: unknown,
): StoredGraphLoad {
	const raw = data as { missions?: unknown[] } | unknown[] | null;
	const list = Array.isArray(raw)
		? raw
		: Array.isArray(raw?.missions)
			? raw.missions
			: [];
	const wanted = graphDocId(missionId);
	const found = list.find(
		(entry) =>
			entry != null &&
			typeof entry === "object" &&
			(entry as { mission_id?: unknown }).mission_id === wanted,
	);
	if (isOutdatedGraphDocument(found)) return { kind: "outdated" };
	return {
		kind: "graph",
		graph: readGraphDocument(found) ?? emptyMissionGraph(),
	};
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
 * Whether the mission's stored graph document could be read by this build.
 *
 * `"outdated"` is a LOADED state of its own, not an empty graph: see
 * {@link resolveGraphDraftWrite}.
 */
export type GraphLoadState = "ready" | "outdated";

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
 * ## An OUTDATED document authors nothing either
 *
 * "This build cannot read the stored graph" is not "this mission has no graph".
 * The stored document still describes an allocation the operator committed, so
 * until they deliberately start a new graph the draft is left exactly as it is —
 * `load: "outdated"` refuses the write outright, before any of the reasoning
 * above. Stating it here rather than relying on the editor happening to hold a
 * `null` graph is the point: `graph_compiles` is already on the draft of every
 * mission this editor has ever saved, so the empty-graph guard above does NOT
 * catch this case, and the write would land the moment anything loaded an empty
 * canvas for an unreadable document.
 *
 * @param graph - The graph that was compiled, or `null` when none is loaded.
 * @param compiled - Output of `compileMissionGraph`, or `null` when no graph
 *   is loaded.
 * @param draft - The current mission draft, or `null` when none is loaded.
 * @param load - Whether the stored graph document was readable. Defaults to
 *   `"ready"`.
 * @returns The slice to write, or `null` when the draft already carries it.
 */
export function resolveGraphDraftWrite(
	graph: Pick<MissionGraph, "nodes"> | null | undefined,
	compiled: CompiledMissionGraph | null | undefined,
	draft: GraphDraftView | null | undefined,
	load: GraphLoadState = "ready",
): GraphDraftSlice | null {
	if (load === "outdated") return null;
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
	LISTENING: "listening",
	DONE: "done",
	FAILED: "failed",
};

/** "2 of 3 contacts taken · sweep done" for an On contact node. */
function listeningText(p: ProgramProgress): string {
	const l = p.listening;
	if (!l) return "listening";
	const found = `${l.taken} of ${l.found} contact${l.found === 1 ? "" : "s"} taken`;
	return l.source_done ? `${found} · sweep done` : `${found} · sweep on`;
}

/**
 * Turn the fog's `program` progress into a mark per graph node.
 *
 * Marks are by node id, from the chain the FOG compiled (its `steps`), so a
 * graph edited after submit shows fewer marks, never wrong ones: an id that no
 * longer exists is simply not drawn. The steps the fog reports done (at least
 * once: a contact loop runs its steps again) are done with their gates; the
 * current step and its gate carry the live state; an On contact node shows
 * how many contacts it took; agent nodes carry the state.
 *
 * @param agentNodes - `agent_id → agent node ids` in the graph.
 * @param program - `MissionFeedback.program`.
 * @param nodeLabels - Graph node id → caption, for a `done` a gate waits on.
 * @returns `node id → mark`.
 */
export function programMarks(
	agentNodes: ReadonlyMap<string, readonly string[]>,
	program: Readonly<Record<string, ProgramProgress>> | undefined,
	nodeLabels: Readonly<Record<string, string>> = {},
): Map<string, RunMark> {
	const marks = new Map<string, RunMark>();
	if (!program) return marks;
	for (const [agentId, p] of Object.entries(program)) {
		for (const nodeId of agentNodes.get(agentId) ?? []) {
			marks.set(nodeId, {
				tone: toneOf(p.state),
				text:
					p.state === "LISTENING"
						? listeningText(p)
						: p.contact
							? `at a contact · ${STATE_WORD[p.state]}`
							: STATE_WORD[p.state],
			});
		}
		for (const step of p.steps) {
			if (!p.done_steps.includes(step.step_id)) continue;
			marks.set(step.step_id, { tone: "done", text: "done" });
			markPassedGate(marks, step);
		}
		const current = p.steps[p.step_index];
		if (!current || p.state === "DONE") continue;
		// The On contact node the agent is looping round, while it visits.
		if (p.contact?.node) {
			marks.set(p.contact.node, {
				tone: "running",
				text: "visiting a contact",
			});
		}
		if (p.state === "GATED") {
			marks.set(current.step_id, { tone: "starting", text: "next" });
			const wait = p.gate?.wait_node || current.wait_node;
			if (wait) {
				const conditions = p.gate?.conditions ?? [];
				const holding = conditions.filter((c) => c.holds).length;
				marks.set(wait, {
					tone: "waiting",
					text: `holding · ${holding}/${conditions.length} (${p.gate?.mode === "any" ? "any" : "all"})`,
				});
			}
			for (const c of p.gate?.conditions ?? []) {
				// A `done` a gate waits on is another step: its own mark stays.
				if (c.op === "StepDone") continue;
				marks.set(c.node_id, {
					tone: c.holds ? "done" : "waiting",
					text: gateText(c, p.gate?.waited_s ?? null, nodeLabels),
				});
			}
			continue;
		}
		markPassedGate(marks, current);
		marks.set(current.step_id, {
			tone: toneOf(p.state),
			text:
				p.state === "LISTENING"
					? listeningText(p)
					: STATE_WORD[p.state],
		});
	}
	return marks;
}

/**
 * A gate the chain has gone past: its Hold until let go. Under "all" every
 * input held; under "any" the fog does not say which one did, so the inputs
 * are left unmarked rather than all painted as held. A step whose `done` was
 * an input keeps its own mark.
 */
function markPassedGate(
	marks: Map<string, RunMark>,
	step: ProgramProgress["steps"][number],
): void {
	if (step.wait_node) {
		marks.set(step.wait_node, { tone: "done", text: "let go" });
	}
	if (step.mode === "any") return;
	for (const g of step.gate_nodes) {
		if (marks.get(g)?.text === "done") continue;
		marks.set(g, { tone: "done", text: "held" });
	}
}

/** Where one agent is, as the mission feedback lists it. */
export interface AgentPosition {
	agentId: string;
	/** The graph node of its current step (the last one once done). */
	stepId: string;
	tone: RunTone;
	/** "Navigate · running", "On contact · 2 of 3 contacts taken · sweep on" */
	text: string;
	/** While it holds at a gate: each input, e.g. "waiting 12/30 s". */
	gate: string[];
}

/**
 * One line per agent: which graph node it is at, and in what state. Node
 * captions come from the graph when it is loaded, else the node id is shown.
 *
 * @param program - `MissionFeedback.program`.
 * @param nodeLabels - Graph node id → caption, when the graph is loaded.
 * @returns One entry per agent, in the fog's chain order.
 */
export function agentPositions(
	program: Readonly<Record<string, ProgramProgress>> | undefined,
	nodeLabels: Readonly<Record<string, string>> = {},
): AgentPosition[] {
	if (!program) return [];
	return Object.entries(program)
		.sort(([, a], [, b]) => a.chain - b.chain)
		.map(([agentId, p]) => {
			const caption = nodeLabels[p.step_id] || p.step_id || "n/a";
			const text =
				p.state === "DONE"
					? `done · last ${caption}`
					: p.state === "LISTENING"
						? `${caption} · ${listeningText(p)}`
						: `${caption}${p.contact ? " (to a contact)" : ""} · ${STATE_WORD[p.state]}`;
			const gate =
				p.state === "GATED"
					? (p.gate?.conditions ?? []).map((c) =>
							gateText(c, p.gate?.waited_s ?? null, nodeLabels),
						)
					: [];
			return {
				agentId,
				stepId: p.step_id,
				tone: toneOf(p.state),
				text,
				gate,
			};
		});
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
		case "LISTENING":
			return "waiting";
		default:
			return "starting";
	}
}

function gateText(
	c: ProgramGateCondition,
	waited: number | null,
	nodeLabels: Readonly<Record<string, string>>,
): string {
	if (c.holds) return "holds";
	if (c.op === "ElapsedSeconds") {
		return waited == null
			? `waits ${c.threshold} s from start`
			: `waiting ${Math.floor(waited)}/${c.threshold} s`;
	}
	if (c.op === "StepDone") {
		return `waiting for ${nodeLabels[c.key] || c.key} to be done`;
	}
	if (c.op === "ContactsFound") {
		const wanted = `${c.threshold} contact${c.threshold === 1 ? "" : "s"}`;
		return c.value == null
			? `waiting for ${wanted}`
			: `waiting for ${wanted} (${c.value} so far)`;
	}
	return "waiting";
}

// ============================================================================
// Drop a wire on empty canvas: create the node it was heading for
// ============================================================================

/** A node the operator can create where a wire was dropped. */
export interface DropChoice {
	/** Stable key for the menu row. */
	key: string;
	/** Menu text, e.g. "Navigate". */
	label: string;
	/** The node to create (id and position are added by the editor). */
	node: Omit<MissionGraphNode, "id" | "position">;
	/** The port on the NEW node the dragged wire connects to. */
	port: string;
}

function action(act: "NAVIGATE" | "COVERAGE", port: string): DropChoice {
	return {
		key: `${act}-${port}`,
		label: act === "NAVIGATE" ? "Navigate" : "Coverage",
		node: {
			kind: "action",
			label: act === "NAVIGATE" ? "Navigate" : "Coverage",
			action: act,
		},
		port,
	};
}

const HOLD = (port: string): DropChoice => ({
	key: `wait-${port}`,
	label: "Hold until",
	node: { kind: "wait", label: "Hold until", mode: "all" },
	port,
});

const ON_CONTACT = (port: string): DropChoice => ({
	key: `on-contact-${port}`,
	label: "On contact",
	node: { kind: "on_contact", label: "On contact" },
	port,
});

/** The conditions offered into a Hold until: the ones a condition node holds. */
const DROP_CONDITIONS: readonly ConditionOp[] = [
	"ElapsedSeconds",
	"ContactsFound",
];

/**
 * What can be created at the end of a wire dropped on empty canvas, and which
 * of its ports the wire goes into.
 *
 * Only nodes with a port that FITS are offered, so every choice produces a
 * valid edge: a robot (agent wire) offers the next step, a zone offers a
 * COVERAGE, a `done` offers a Hold until, a Coverage's `on contact` offers an
 * On contact node. An agent node is not offered: which agent is a choice the
 * toolbar's Agent button makes.
 *
 * @param side - `"source"` when the wire left an output, `"target"` when it
 *   left an input.
 * @param type - The type of the port the wire left.
 * @returns The choices, in menu order; empty when nothing fits.
 */
export function dropChoices(
	side: "source" | "target",
	type: PortType,
): DropChoice[] {
	if (side === "source") {
		switch (type) {
			case "agent":
				return [
					action("NAVIGATE", "agent"),
					action("COVERAGE", "agent"),
					HOLD("agent"),
					ON_CONTACT("agent"),
				];
			case "waypoint":
				return [action("NAVIGATE", "target")];
			case "zone":
				return [action("COVERAGE", "target")];
			case "asset":
				return [
					action("NAVIGATE", "target"),
					action("COVERAGE", "target"),
				];
			case "bool":
				return [HOLD("when")];
			case "event":
				return [ON_CONTACT("event")];
		}
	}
	switch (type) {
		case "agent":
			return [
				action("NAVIGATE", "agent"),
				action("COVERAGE", "agent"),
				HOLD("agent"),
			];
		case "waypoint":
		case "zone":
		case "asset":
			return [
				{
					key: "asset-value",
					label: "Asset",
					node: { kind: "asset", label: "Asset" },
					port: "value",
				},
			];
		case "bool":
			return DROP_CONDITIONS.map((op) => ({
				key: `condition-${op}`,
				label: CONDITION_OP_SHAPE[op].label,
				node: {
					kind: "condition",
					label: CONDITION_OP_SHAPE[op].label,
					condition: normalizeCondition({ op }),
				},
				port: "value",
			}));
		case "event":
			return [
				{ ...action("COVERAGE", "contact"), key: "COVERAGE-contact" },
			];
		default:
			return [];
	}
}

// ============================================================================
// Wiring
// ============================================================================

/**
 * Wire an output into an input, or say why not.
 *
 * A port that takes one edge gives up the one it had ({@link connectionPlan}
 * names it), so re-wiring is one drag. Wiring an asset (or a contact's
 * position) into an action's target clears the target picked on the node: a
 * node that named two would be refused by the fog (NAVIGATE_TARGET) for a
 * choice the operator just made.
 *
 * @param graph - The graph.
 * @param from - The output.
 * @param to - The input.
 * @param featureTypes - The mission's asset types, for asset outputs.
 * @returns The new graph, or the reason it was refused.
 */
export function wireGraph(
	graph: MissionGraph,
	from: PortRef,
	to: PortRef,
	featureTypes?: Readonly<Record<string, string>>,
): { graph: MissionGraph } | { reason: string } {
	const plan = connectionPlan(
		graph.nodes,
		graph.edges,
		from,
		to,
		featureTypes,
	);
	if (!plan.ok) return { reason: plan.reason };
	const replaced = new Set(plan.replaces);
	const nodes = graph.nodes.map((node) => {
		if (node.id !== to.node) return node;
		if (to.port === "target" && node.feature_id) {
			const next = { ...node };
			delete next.feature_id;
			return next;
		}
		return node;
	});
	return {
		graph: {
			...graph,
			nodes,
			edges: [
				...graph.edges.filter((edge) => !replaced.has(edge.id)),
				{
					id: freshGraphId("edge"),
					source: from.node,
					source_port: from.port,
					target: to.node,
					target_port: to.port,
				},
			],
		},
	};
}

/** What deleting a node would take with it. */
export interface NodeDeletion {
	/** The node's caption, or its kind when it has none. */
	label: string;
	/** How many edges touch it — the wiring the delete destroys. */
	edges: number;
}

/**
 * What deleting a node costs, so the operator is told before it happens.
 *
 * A node with no wiring is its own explanation; one in the middle of a chain
 * takes the steps either side of it apart, and nothing on screen says so until
 * it is gone. Counted here rather than in JSX so the number the confirmation
 * names and the number the delete actually removes are the same one.
 *
 * @param graph - The graph, or null.
 * @param nodeId - The node about to be deleted.
 * @returns Its caption and the number of edges that would go with it.
 */
export function describeNodeDeletion(
	graph: MissionGraph | null | undefined,
	nodeId: string,
): NodeDeletion {
	const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
	return {
		label: node?.label || node?.kind || nodeId,
		edges: (graph?.edges ?? []).filter(
			(edge) => edge.source === nodeId || edge.target === nodeId,
		).length,
	};
}

/**
 * Drop the edges into or out of ports a node no longer has — an action that
 * stops being a COVERAGE loses its `on contact` output, and the wires from it
 * with it. Returns the same graph when nothing is dropped.
 *
 * @param graph - The graph, after a node was edited.
 * @param nodeId - The edited node.
 * @returns The graph without the orphaned edges.
 */
export function dropOrphanedEdges(
	graph: MissionGraph,
	nodeId: string,
): MissionGraph {
	const node = graph.nodes.find((n) => n.id === nodeId);
	if (!node) return graph;
	const ports = nodePorts(node);
	const inputs = new Set(ports.inputs.map((port) => port.id));
	const outputs = new Set(ports.outputs.map((port) => port.id));
	const edges = graph.edges.filter(
		(edge) =>
			(edge.target !== nodeId || inputs.has(edge.target_port)) &&
			(edge.source !== nodeId || outputs.has(edge.source_port)),
	);
	return edges.length === graph.edges.length ? graph : { ...graph, edges };
}

/**
 * The nodes of an On contact node's loop: what its `agent` output leads to
 * before coming back to it. The edges from them into it are the way back.
 */
function loopOf(graph: MissionGraph, onId: string): Set<string> {
	const out = new Set<string>();
	const stack = graph.edges
		.filter((edge) => edge.source === onId && edge.source_port === "agent")
		.map((edge) => edge.target);
	while (stack.length > 0) {
		const id = stack.pop() as string;
		if (id === onId || out.has(id)) continue;
		out.add(id);
		for (const edge of graph.edges) {
			if (
				edge.source === id &&
				edge.target_port === "agent" &&
				(edge.source_port === "agent" || edge.source_port === "no_more")
			)
				stack.push(edge.target);
		}
	}
	return out;
}

/**
 * Put a new step INTO a chain rather than beside it.
 *
 * Dropping a robot wire (an agent output) on empty canvas means "a step
 * here". Wiring it plainly would replace the link that was there and cut the
 * rest of the chain off. So the new step takes that link's place:
 * - `after`: X → Y (on X's output `port`) becomes X → new → Y;
 * - `before`: whatever handed the robot to X (one step, or the agents that
 *   start the chain) now hands it to the new step, which leads into X. The
 *   way back from an On contact node's own loop stays where it is.
 *
 * @param graph - The graph, already holding the new node.
 * An On contact node put into a chain goes on by `no more`: its `agent`
 * output is the robot's trip to each contact, not the rest of the chain.
 *
 * @param newId - The new step (an action, a Hold until or an On contact node).
 * @param at - The step the wire was dragged from.
 * @param where - Which side of it the new step goes.
 * @param port - `after`: the output of `at` it goes on (`agent`, `no_more`).
 * @returns The spliced graph.
 */
export function spliceStep(
	graph: MissionGraph,
	newId: string,
	at: string,
	where: "before" | "after",
	port = "agent",
): MissionGraph {
	const link = (source: string, sourcePort: string, target: string) => ({
		id: freshGraphId("edge"),
		source,
		source_port: sourcePort,
		target,
		target_port: "agent",
	});
	const onward =
		graph.nodes.find((node) => node.id === newId)?.kind === "on_contact"
			? "no_more"
			: "agent";
	if (where === "after") {
		const out = graph.edges.find(
			(edge) => edge.source === at && edge.source_port === port,
		);
		return {
			...graph,
			edges: [
				...graph.edges.filter((edge) => edge !== out),
				link(at, port, newId),
				...(out ? [link(newId, onward, out.target)] : []),
			],
		};
	}
	const loop =
		graph.nodes.find((node) => node.id === at)?.kind === "on_contact"
			? loopOf(graph, at)
			: new Set<string>();
	const into = graph.edges.filter(
		(edge) =>
			edge.target === at &&
			edge.target_port === "agent" &&
			!loop.has(edge.source),
	);
	return {
		...graph,
		edges: [
			...graph.edges.filter((edge) => !into.includes(edge)),
			...into.map((edge) => ({ ...edge, target: newId })),
			link(newId, onward, at),
		],
	};
}

/** Where a dropped wire came from. */
export interface DropOrigin {
	node: string;
	port: string;
	/** `"source"`: the wire left an output; `"target"`: it left an input. */
	side: "source" | "target";
}

/**
 * The graph after creating `choice` where a wire was dropped and wiring it in,
 * or `null` when it cannot be wired — the drop menu offers only choices that
 * return a graph, and creates nothing on `null`.
 *
 * A new STEP goes into the chain ({@link spliceStep}): after the step it was
 * dragged from, or before the step whose input it was dragged from. Dragged
 * from an agent that already starts a chain, it becomes that chain's first
 * step. Anything else is one wire, by {@link wireGraph}'s rules.
 *
 * @param graph - The graph.
 * @param from - The port the wire was dragged from.
 * @param choice - The node picked.
 * @param id - The new node's id.
 * @param position - Where it goes on the canvas.
 * @param featureTypes - The mission's asset types, for asset outputs.
 * @returns The new graph, or `null`.
 */
export function applyDrop(
	graph: MissionGraph,
	from: DropOrigin,
	choice: DropChoice,
	id: string,
	position: { x: number; y: number },
	featureTypes?: Readonly<Record<string, string>>,
): MissionGraph | null {
	const fromNode = graph.nodes.find((node) => node.id === from.node);
	if (!fromNode) return null;
	const withNode: MissionGraph = {
		...graph,
		nodes: [...graph.nodes, { ...choice.node, id, position }],
	};
	// A robot wire: the new step goes into the chain.
	const robotPort =
		from.side === "source"
			? from.port === "agent" || from.port === "no_more"
			: from.port === "agent";
	const step = robotPort && choice.port === "agent";
	if (step) {
		if (from.side === "target") {
			return spliceStep(withNode, id, from.node, "before");
		}
		const out = graph.edges.find(
			(edge) =>
				edge.source === from.node && edge.source_port === from.port,
		);
		if (out && fromNode.kind === "agent") {
			return spliceStep(withNode, id, out.target, "before");
		}
		if (out) return spliceStep(withNode, id, from.node, "after", from.port);
	}
	const ends =
		from.side === "source"
			? {
					from: { node: from.node, port: from.port },
					to: { node: id, port: choice.port },
				}
			: {
					from: { node: id, port: choice.port },
					to: { node: from.node, port: from.port },
				};
	const result = wireGraph(withNode, ends.from, ends.to, featureTypes);
	return "reason" in result ? null : result.graph;
}

// ============================================================================
// Layout: one lane per agent
// ============================================================================

/** Horizontal step between the steps of a lane. */
const LANE_COLUMN = 280;
/** Vertical step between lanes. */
const LANE_ROW = 260;
/** How far below its step a node that feeds it sits. */
const FEED_DROP = 130;

/**
 * Lay the graph out in lanes, one per agent: the agent at the left, its steps
 * to the right in the order the robot takes them (round an On contact loop,
 * then out by `no more`), and what feeds a step — its asset, the inputs of a
 * Hold until, a Coverage's contacts — just below it. Nodes no agent reaches
 * go in a last lane. Positions only: the graph means the same thing.
 *
 * @param graph - The graph.
 * @returns The same graph when nothing moves, else one with new positions.
 */
export function layoutLanes(graph: MissionGraph): MissionGraph {
	const placed = new Map<string, { x: number; y: number }>();
	const robotOut = (id: string) =>
		graph.edges
			.filter(
				(edge) =>
					edge.source === id &&
					edge.target_port === "agent" &&
					(edge.source_port === "agent" ||
						edge.source_port === "no_more"),
			)
			// The loop first, then the way out.
			.sort((a, b) =>
				a.source_port === b.source_port
					? 0
					: a.source_port === "agent"
						? -1
						: 1,
			)
			.map((edge) => edge.target);

	let lane = 0;
	for (const agent of graph.nodes) {
		if (agent.kind !== "agent" || placed.has(agent.id)) continue;
		const y = lane * LANE_ROW;
		placed.set(agent.id, { x: 0, y });
		let column = 1;
		const stack = [...robotOut(agent.id)].reverse();
		while (stack.length > 0) {
			const id = stack.pop() as string;
			if (placed.has(id)) continue;
			placed.set(id, { x: column * LANE_COLUMN, y });
			column += 1;
			stack.push(...[...robotOut(id)].reverse());
		}
		lane += 1;
	}

	// What feeds a placed step goes under it, one below the other.
	const feeds = new Map<string, number>();
	for (const edge of graph.edges) {
		if (edge.target_port === "agent") continue;
		if (placed.has(edge.source)) continue;
		const at = placed.get(edge.target);
		if (!at) continue;
		const k = feeds.get(edge.target) ?? 0;
		feeds.set(edge.target, k + 1);
		placed.set(edge.source, {
			x: at.x - 30,
			y: at.y + FEED_DROP + k * 70,
		});
	}

	// Whatever is left: a last lane.
	let column = 0;
	for (const node of graph.nodes) {
		if (placed.has(node.id)) continue;
		placed.set(node.id, { x: column * LANE_COLUMN, y: lane * LANE_ROW });
		column += 1;
	}

	let moved = false;
	const nodes = graph.nodes.map((node) => {
		const next = placed.get(node.id) as { x: number; y: number };
		if (next.x === node.position.x && next.y === node.position.y)
			return node;
		moved = true;
		return { ...node, position: next };
	});
	return moved ? { ...graph, nodes } : graph;
}

// ============================================================================
// Copy and paste
// ============================================================================

/** What Ctrl+C keeps: nodes and the edges between them. */
export interface GraphClip {
	nodes: MissionGraphNode[];
	edges: MissionGraph["edges"];
}

/**
 * Copy the selected nodes and the edges BETWEEN them. Agent nodes are left
 * out: an agent runs one chain, so a second node for it is AGENT_TWICE.
 *
 * @param graph - The graph.
 * @param ids - The selected node ids.
 * @returns The clip, or null when nothing copyable is selected.
 */
export function copySelection(
	graph: MissionGraph,
	ids: readonly string[],
): GraphClip | null {
	const wanted = new Set(ids);
	const nodes = graph.nodes.filter(
		(node) => wanted.has(node.id) && node.kind !== "agent",
	);
	if (nodes.length === 0) return null;
	const kept = new Set(nodes.map((node) => node.id));
	const edges = graph.edges.filter(
		(edge) => kept.has(edge.source) && kept.has(edge.target),
	);
	return structuredClone({ nodes, edges });
}

/**
 * Paste a clip: fresh ids, shifted by `offset`, its inner edges rewired to
 * the copies.
 *
 * @param graph - The graph.
 * @param clip - What was copied.
 * @param offset - How far from the originals the copies land.
 * @returns The graph with the copies, and their ids (to select them).
 */
export function pasteClip(
	graph: MissionGraph,
	clip: GraphClip,
	offset: { x: number; y: number } = { x: 40, y: 40 },
): { graph: MissionGraph; ids: string[] } {
	const ids = new Map(
		clip.nodes.map((node) => [node.id, freshGraphId(node.kind)]),
	);
	const nodes = clip.nodes.map((node) => ({
		...structuredClone(node),
		id: ids.get(node.id) as string,
		position: {
			x: node.position.x + offset.x,
			y: node.position.y + offset.y,
		},
	}));
	const edges = clip.edges.map((edge) => ({
		...edge,
		id: freshGraphId("edge"),
		source: ids.get(edge.source) as string,
		target: ids.get(edge.target) as string,
	}));
	return {
		graph: {
			...graph,
			nodes: [...graph.nodes, ...nodes],
			edges: [...graph.edges, ...edges],
		},
		ids: nodes.map((node) => node.id),
	};
}
