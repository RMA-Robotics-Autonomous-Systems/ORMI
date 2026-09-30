import { describe, expect, it } from "bun:test";

import {
	applySelectionChanges,
	compiledDraftSlice,
	formatCondition,
	inspectedNodeId,
	NO_CONDITION_LABEL,
	agentPositions,
	programMarks,
	resolveGraphDraftWrite,
	shouldHandleGraphShortcut,
	sortIssuesBySeverity,
	copySelection,
	layoutLanes,
	pasteClip,
	revealDelta,
	type ScreenRect,
	applyNodeSizes,
	type NodeSize,
} from "./mission-graph-editor-helpers";
import {
	CONDITION_OPS,
	type CompiledMissionGraph,
	type GraphCondition,
	type MissionGraph,
	type MissionGraphIssue,
} from "./mission-graph";
import { MissionBehavior } from "../types/c2-types";
import { parseMissionFeedback } from "../types/mission-feedback";

/** A condition literal, so each case only states what it is about. */
function condition(patch: Partial<GraphCondition>): GraphCondition {
	return { op: "Always", threshold: 0, negate: false, ...patch };
}

describe("formatCondition", () => {
	it("names the unset state rather than rendering an empty phrase", () => {
		expect(formatCondition(undefined)).toBe(NO_CONDITION_LABEL);
	});

	it("renders an op that uses no field as its bare label", () => {
		expect(formatCondition(condition({ op: "Always" }))).toBe("Always");
		expect(formatCondition(condition({ op: "Never" }))).toBe("Never");
	});

	it("prefixes NOT when the condition is inverted", () => {
		expect(formatCondition(condition({ op: "Never", negate: true }))).toBe(
			"NOT Never",
		);
	});

	it("resolves a zone key to its feature NAME, never a raw uuid", () => {
		const text = formatCondition(
			condition({
				op: "ZoneClear",
				key: "f-9f2c-aaaa",
				threshold: 1,
			}),
			{ featureNames: { "f-9f2c-aaaa": "North field" } },
		);
		expect(text).toBe('Zone clear "North field" ≥ 100%');
		expect(text).not.toContain("f-9f2c-aaaa");
	});

	it("falls back to the id when the name is not known", () => {
		expect(
			formatCondition(condition({ op: "ZoneClear", key: "f-1" })),
		).toBe('Zone clear "f-1" ≥ 0%');
	});

	it("shows a flag key verbatim — a flag IS a name", () => {
		expect(
			formatCondition(condition({ op: "FlagSet", key: "lane_cleared" })),
		).toBe('Flag set "lane_cleared"');
	});

	it("says so when an op needs a key and none is set", () => {
		expect(formatCondition(condition({ op: "ZoneClear" }))).toContain(
			"<no zone>",
		);
		expect(formatCondition(condition({ op: "FlagSet" }))).toContain(
			"<no flag>",
		);
	});

	it("renders the modality only for the op that reads one", () => {
		expect(
			formatCondition(
				condition({
					op: "ZoneCoveredBy",
					key: "f-1",
					arg: "EMI",
					threshold: 0.8,
				}),
				{ featureNames: { "f-1": "Lane A" } },
			),
		).toBe('Zone covered by "Lane A" (EMI) ≥ 80%');
		// ZoneClear's shape declares `arg: "none"`, so a stored arg is ignored.
		expect(
			formatCondition(
				condition({ op: "ZoneClear", key: "f-1", arg: "EMI" }),
			),
		).not.toContain("EMI");
	});

	it("renders each threshold in the unit its op reads", () => {
		expect(
			formatCondition(condition({ op: "ContactsFound", threshold: 3 })),
		).toBe("Contacts found ≥ 3");
		expect(
			formatCondition(condition({ op: "ElapsedSeconds", threshold: 45 })),
		).toBe("Elapsed time ≥ 45s");
		expect(
			formatCondition(
				condition({ op: "ZoneClear", key: "f", threshold: 0.35 }),
			),
		).toContain("≥ 35%");
	});

	it("renders NO threshold for the ops that never read one", () => {
		// A number on one of these would be a value the fog ignores.
		for (const op of ["StepDone", "FlagSet", "Always", "Never"] as const) {
			expect(
				formatCondition(condition({ op, key: "x", threshold: 7 })),
			).not.toContain("7");
		}
	});

	it("produces a non-empty phrase for every op in the vocabulary", () => {
		for (const op of CONDITION_OPS) {
			const text = formatCondition(condition({ op }));
			expect(text.length).toBeGreaterThan(0);
			expect(text).not.toBe(NO_CONDITION_LABEL);
		}
	});
});

describe("applySelectionChanges", () => {
	it("adds a newly selected id", () => {
		expect(
			applySelectionChanges([], [{ id: "n1", selected: true }]),
		).toEqual(["n1"]);
	});

	it("removes a deselected id", () => {
		expect(
			applySelectionChanges(
				["n1", "n2"],
				[{ id: "n1", selected: false }],
			),
		).toEqual(["n2"]);
	});

	it("applies a whole batch (xyflow deselects everything then selects one)", () => {
		expect(
			applySelectionChanges(
				["n1", "n2"],
				[
					{ id: "n1", selected: false },
					{ id: "n2", selected: false },
					{ id: "n3", selected: true },
				],
			),
		).toEqual(["n3"]);
	});

	it("returns the SAME array when nothing changed", () => {
		const current = ["n1"];
		expect(
			applySelectionChanges(current, [{ id: "n1", selected: true }]),
		).toBe(current);
		expect(applySelectionChanges(current, [])).toBe(current);
		expect(
			applySelectionChanges(current, [{ id: "n9", selected: false }]),
		).toBe(current);
	});
});

describe("inspectedNodeId: the details panel is for one node", () => {
	it("stays closed when nothing is selected", () => {
		expect(inspectedNodeId([], [])).toBeNull();
	});

	it("opens for exactly one selected node", () => {
		expect(inspectedNodeId(["n1"], [])).toBe("n1");
	});

	it("stays closed for a selected link, which has no parameter", () => {
		expect(inspectedNodeId([], ["e1"])).toBeNull();
	});

	it("stays closed for a node and a link together", () => {
		expect(inspectedNodeId(["n1"], ["e1"])).toBeNull();
	});

	it("stays closed for a multi-selection", () => {
		expect(inspectedNodeId(["n1", "n2"], [])).toBeNull();
	});
});

describe("applyNodeSizes: nodes keep the size xyflow measured", () => {
	const none: ReadonlyMap<string, NodeSize> = new Map();

	it("records a first measurement", () => {
		const next = applyNodeSizes(none, [
			{ id: "n1", width: 130, height: 90 },
		]);
		expect(next.get("n1")).toEqual({ width: 130, height: 90 });
	});

	it("returns the same map when the size is unchanged", () => {
		const held = applyNodeSizes(none, [
			{ id: "n1", width: 130, height: 90 },
		]);
		expect(
			applyNodeSizes(held, [{ id: "n1", width: 130, height: 90 }]),
		).toBe(held);
	});

	it("replaces a size that changed and keeps the others", () => {
		const held = applyNodeSizes(none, [
			{ id: "n1", width: 130, height: 90 },
			{ id: "n2", width: 100, height: 60 },
		]);
		const next = applyNodeSizes(held, [
			{ id: "n1", width: 130, height: 120 },
		]);
		expect(next).not.toBe(held);
		expect(next.get("n1")).toEqual({ width: 130, height: 120 });
		expect(next.get("n2")).toEqual({ width: 100, height: 60 });
		expect(held.get("n1")).toEqual({ width: 130, height: 90 });
	});

	it("returns the same map for an empty report", () => {
		expect(applyNodeSizes(none, [])).toBe(none);
	});
});

/** A box from its origin and size, so each case reads as a picture. */
function box(x: number, y: number, width: number, height: number): ScreenRect {
	return { left: x, top: y, right: x + width, bottom: y + height };
}

describe("revealDelta: a clicked node is brought out from under the panel", () => {
	// The canvas once the 256 px details panel has narrowed it: 0..1100 wide.
	const view = box(0, 0, 1100, 800);
	const MARGIN = 16;

	it("does not move a node that is already wholly visible", () => {
		expect(revealDelta(box(400, 300, 130, 90), view, MARGIN)).toEqual({
			dx: 0,
			dy: 0,
		});
	});

	it("does not move a node that exactly touches the edges", () => {
		expect(revealDelta(box(970, 0, 130, 800), view, MARGIN)).toEqual({
			dx: 0,
			dy: 0,
		});
	});

	it("pans left exactly far enough to leave the margin on the right", () => {
		// Right edge at 1210, 110 px under the panel: 126 px brings it to 1084.
		const { dx, dy } = revealDelta(box(1080, 300, 130, 90), view, MARGIN);
		expect(dx).toBe(-126);
		expect(dy).toBe(0);
		expect(1210 + dx).toBe(view.right - MARGIN);
	});

	it("pans left for a node that is only one pixel under the panel", () => {
		expect(revealDelta(box(971, 300, 130, 90), view, MARGIN).dx).toBe(-17);
	});

	it("pans right for a node cut off on the left", () => {
		expect(revealDelta(box(-40, 300, 130, 90), view, MARGIN)).toEqual({
			dx: 56,
			dy: 0,
		});
	});

	it("lines up the left edge of a node wider than the view", () => {
		expect(revealDelta(box(900, 300, 1200, 90), view, MARGIN).dx).toBe(
			MARGIN - 900,
		);
	});

	it("lines up the left edge when the node fits but not with its margins", () => {
		expect(revealDelta(box(1000, 300, 1080, 90), view, MARGIN).dx).toBe(
			MARGIN - 1000,
		);
	});

	it("leaves the vertical alone when only the horizontal is out", () => {
		expect(revealDelta(box(1080, 700, 130, 100), view, MARGIN).dy).toBe(0);
	});

	it("pans up for a node below the view", () => {
		expect(revealDelta(box(400, 750, 130, 90), view, MARGIN)).toEqual({
			dx: 0,
			dy: -56,
		});
	});

	it("pans down for a node above the view", () => {
		expect(revealDelta(box(400, -30, 130, 90), view, MARGIN)).toEqual({
			dx: 0,
			dy: 46,
		});
	});

	it("pans both ways for a node out on both axes", () => {
		expect(revealDelta(box(1080, 750, 130, 90), view, MARGIN)).toEqual({
			dx: -126,
			dy: -56,
		});
	});

	it("works in a view that does not start at the origin", () => {
		const offset = box(300, 150, 1100, 800);
		expect(revealDelta(box(1380, 400, 130, 90), offset, MARGIN)).toEqual({
			dx: -126,
			dy: 0,
		});
	});
});

/** A fake focused element, duck-typed the way the shared guard reads one. */
function element(tagName: string, contentEditable = false): EventTarget {
	return {
		tagName,
		isContentEditable: contentEditable,
		closest: () => null,
	} as unknown as EventTarget;
}

/** A fake document scope for the guard. */
function scope(options: { activeElement?: unknown; open?: string | null }): {
	activeElement?: unknown;
	querySelector: (s: string) => unknown;
} {
	return {
		activeElement: options.activeElement,
		querySelector: (selector: string) =>
			options.open && selector.includes(options.open)
				? { tagName: "DIV" }
				: null,
	};
}

describe("shouldHandleGraphShortcut", () => {
	it("allows a key press aimed at the canvas", () => {
		const event = { target: element("DIV") };
		expect(
			shouldHandleGraphShortcut(event, scope({ activeElement: null })),
		).toBe(true);
	});

	it("refuses while the operator is typing in a text field", () => {
		// The label field. Without this, Backspace deletes the node being
		// renamed instead of a character.
		const event = { target: element("INPUT") };
		expect(
			shouldHandleGraphShortcut(event, scope({ activeElement: null })),
		).toBe(false);
	});

	it("refuses for a textarea and for contenteditable", () => {
		expect(
			shouldHandleGraphShortcut(
				{ target: element("TEXTAREA") },
				scope({ activeElement: null }),
			),
		).toBe(false);
		expect(
			shouldHandleGraphShortcut(
				{ target: element("DIV", true) },
				scope({ activeElement: null }),
			),
		).toBe(false);
	});

	it("refuses on the FOCUSED element when the event carries no target", () => {
		// xyflow's `onBeforeDelete` has no event to inspect — this path is the
		// whole reason the guard falls back to `activeElement`.
		expect(
			shouldHandleGraphShortcut(
				undefined,
				scope({ activeElement: element("INPUT") }),
			),
		).toBe(false);
		expect(
			shouldHandleGraphShortcut(
				undefined,
				scope({ activeElement: element("DIV") }),
			),
		).toBe(true);
	});

	it("refuses while a modal dialog is open over the dashboard", () => {
		expect(
			shouldHandleGraphShortcut(
				{ target: element("DIV") },
				scope({ activeElement: null, open: "dialog" }),
			),
		).toBe(false);
	});

	it("refuses while an open Select listbox owns the keyboard", () => {
		// A Radix Select renders in a PORTAL, outside the inspector, so neither
		// xyflow's `.nokey` opt-out nor a container-scoped listener sees it.
		expect(
			shouldHandleGraphShortcut(
				{ target: element("DIV") },
				scope({ activeElement: null, open: "listbox" }),
			),
		).toBe(false);
	});

	it("prefers the composed path over a retargeted event target", () => {
		const event = {
			target: element("DIV"),
			composedPath: () => [element("INPUT"), element("DIV")],
		};
		expect(
			shouldHandleGraphShortcut(event, scope({ activeElement: null })),
		).toBe(false);
	});
});

describe("sortIssuesBySeverity", () => {
	/** An issue literal, so each case only states what it is about. */
	function issue(
		severity: MissionGraphIssue["severity"],
		message: string,
	): MissionGraphIssue {
		return { severity, message };
	}

	it("puts every error before every warning", () => {
		const sorted = sortIssuesBySeverity([
			issue("warning", "w1"),
			issue("error", "e1"),
			issue("warning", "w2"),
			issue("error", "e2"),
		]);
		expect(sorted.map((entry) => entry.message)).toEqual([
			"e1",
			"e2",
			"w1",
			"w2",
		]);
	});

	it("is stable within a severity — node order is the only order an operator can predict", () => {
		const sorted = sortIssuesBySeverity([
			issue("error", "a"),
			issue("error", "b"),
			issue("error", "c"),
		]);
		expect(sorted.map((entry) => entry.message)).toEqual(["a", "b", "c"]);
	});

	it("does not mutate the input", () => {
		const input = [issue("warning", "w"), issue("error", "e")];
		sortIssuesBySeverity(input);
		expect(input.map((entry) => entry.message)).toEqual(["w", "e"]);
	});
});

describe("resolveGraphDraftWrite", () => {
	/** A compiled result, so each case states only the part it is about. */
	function compiled(
		patch: Partial<CompiledMissionGraph> = {},
	): CompiledMissionGraph {
		return {
			behavior: MissionBehavior.NAVIGATE,
			vehicles: [],
			geometries: [],
			issues: [],
			...patch,
		};
	}

	/** A draft carrying exactly the four fields the decision reads. */
	function draftOf(slice: {
		vehicles: string[];
		geometries: { feature_id: string }[];
		behavior: MissionBehavior;
		graph_compiles: boolean;
	}) {
		return {
			vehicles: slice.vehicles,
			behavior: slice.behavior,
			graph_compiles: slice.graph_compiles,
			objective: { geometries: slice.geometries },
		};
	}

	/** A graph that has something on the canvas — one node is enough. */
	const AUTHORED: Pick<MissionGraph, "nodes"> = {
		nodes: [
			{
				id: "n1",
				kind: "agent",
				label: "A",
				position: { x: 0, y: 0 },
				agent_id: "robot_a",
			},
		],
	};
	const CLEAN = compiled({
		vehicles: ["robot_a"],
		geometries: [{ feature_id: "zone-1" }],
		behavior: MissionBehavior.COVERAGE,
	});

	it("writes the whole slice when the draft carries none of it", () => {
		// The operator's bug, in one assertion: an authored agent must reach
		// `draft.vehicles` with no second gesture.
		const write = resolveGraphDraftWrite(
			AUTHORED,
			CLEAN,
			draftOf({
				vehicles: [],
				geometries: [],
				behavior: MissionBehavior.NAVIGATE,
				graph_compiles: false,
			}),
		);
		expect(write).toEqual({
			vehicles: ["robot_a"],
			geometries: [{ feature_id: "zone-1" }],
			behavior: MissionBehavior.COVERAGE,
			graph_compiles: true,
		});
	});

	it("writes `graph_compiles: false` when the compile has errors", () => {
		const write = resolveGraphDraftWrite(
			AUTHORED,
			compiled({
				vehicles: ["robot_a"],
				issues: [{ severity: "error", message: "no objective" }],
			}),
			draftOf({
				vehicles: [],
				geometries: [],
				behavior: MissionBehavior.NAVIGATE,
				graph_compiles: true,
			}),
		);
		expect(write?.graph_compiles).toBe(false);
	});

	it("still writes the allocation from a graph that does not compile — with the verdict beside it", () => {
		// The decision, asserted rather than only commented. A graph with one
		// agent node and no asset node does NOT compile, and withholding
		// `vehicles` there is exactly the reported bug: an agent the operator
		// authored that the mission says is not there. What makes it safe is
		// that `graph_compiles` goes false in the SAME slice, so nothing can
		// observe the allocation without the verdict — and the C2 refuses a
		// submit for as long as it is false.
		const write = resolveGraphDraftWrite(
			AUTHORED,
			compiled({
				vehicles: ["robot_a"],
				geometries: [],
				issues: [
					{ severity: "error", message: "the graph names no asset" },
				],
			}),
			draftOf({
				vehicles: [],
				geometries: [],
				behavior: MissionBehavior.NAVIGATE,
				graph_compiles: false,
			}),
		);
		expect(write).not.toBeNull();
		expect(write?.vehicles).toEqual(["robot_a"]);
		expect(write?.graph_compiles).toBe(false);
	});

	it("a warning is not an error — a graph with only warnings still compiles", () => {
		const write = resolveGraphDraftWrite(
			AUTHORED,
			compiled({
				vehicles: ["robot_a"],
				geometries: [{ feature_id: "zone-1" }],
				issues: [
					{ severity: "warning", message: "navigates AND covers" },
				],
			}),
			draftOf({
				vehicles: [],
				geometries: [],
				behavior: MissionBehavior.NAVIGATE,
				graph_compiles: false,
			}),
		);
		expect(write?.graph_compiles).toBe(true);
	});

	it("IDEMPOTENCE — a draft that already carries the slice is not written again", () => {
		// `editMissionDraft` marks the draft dirty unconditionally and always
		// replaces the slot, which re-notifies, re-renders and re-compiles. A
		// re-derivation of something already there must therefore be no write
		// at all, or merely rendering a loaded mission marks it unsaved and the
		// effect loops.
		const draft = draftOf({
			vehicles: ["robot_a"],
			geometries: [{ feature_id: "zone-1" }],
			behavior: MissionBehavior.COVERAGE,
			graph_compiles: true,
		});
		expect(resolveGraphDraftWrite(AUTHORED, CLEAN, draft)).toBeNull();
	});

	it("IDEMPOTENCE — re-resolving after applying the write is a no-op", () => {
		// The loop-termination property, end to end: write, fold in, resolve
		// again, and there must be nothing left to do.
		let draft = draftOf({
			vehicles: [],
			geometries: [],
			behavior: MissionBehavior.NAVIGATE,
			graph_compiles: false,
		});
		const first = resolveGraphDraftWrite(AUTHORED, CLEAN, draft);
		expect(first).not.toBeNull();
		draft = draftOf({
			vehicles: first!.vehicles,
			geometries: first!.geometries as { feature_id: string }[],
			behavior: first!.behavior,
			graph_compiles: first!.graph_compiles,
		});
		expect(resolveGraphDraftWrite(AUTHORED, CLEAN, draft)).toBeNull();
	});

	it("an unrelated draft edit does not provoke a write", () => {
		// Renaming a mission must not make the graph re-author its allocation:
		// a write on every unrelated edit is a dirty flag the operator cannot
		// attribute to anything they did.
		const draft = {
			...draftOf({
				vehicles: ["robot_a"],
				geometries: [{ feature_id: "zone-1" }],
				behavior: MissionBehavior.COVERAGE,
				graph_compiles: true,
			}),
			name: "renamed",
		};
		expect(resolveGraphDraftWrite(AUTHORED, CLEAN, draft)).toBeNull();
	});

	it("notices a changed vehicle list, order included", () => {
		const draft = draftOf({
			vehicles: ["robot_a"],
			geometries: [{ feature_id: "zone-1" }],
			behavior: MissionBehavior.COVERAGE,
			graph_compiles: true,
		});
		const swapped = compiled({
			...CLEAN,
			vehicles: ["robot_b", "robot_a"],
		});
		expect(
			resolveGraphDraftWrite(AUTHORED, swapped, draft)?.vehicles,
		).toEqual(["robot_b", "robot_a"]);
	});

	it("notices a changed objective, including a removed one", () => {
		const draft = draftOf({
			vehicles: ["robot_a"],
			geometries: [{ feature_id: "zone-1" }],
			behavior: MissionBehavior.COVERAGE,
			graph_compiles: true,
		});
		const dropped = compiled({
			...CLEAN,
			geometries: [],
			issues: [{ severity: "error", message: "no objective" }],
		});
		const write = resolveGraphDraftWrite(AUTHORED, dropped, draft);
		expect(write?.geometries).toEqual([]);
		expect(write?.graph_compiles).toBe(false);
	});

	it("notices a changed behavior on its own", () => {
		const draft = draftOf({
			vehicles: ["robot_a"],
			geometries: [{ feature_id: "zone-1" }],
			behavior: MissionBehavior.NAVIGATE,
			graph_compiles: true,
		});
		expect(resolveGraphDraftWrite(AUTHORED, CLEAN, draft)?.behavior).toBe(
			MissionBehavior.COVERAGE,
		);
	});

	it("treats a draft with no objective block as carrying no geometries", () => {
		// A freshly built draft may have an objective the hydrator left bare;
		// reading it as "already correct" would strand the mission with no
		// objective and no explanation.
		const write = resolveGraphDraftWrite(AUTHORED, CLEAN, {
			vehicles: ["robot_a"],
			behavior: MissionBehavior.COVERAGE,
			graph_compiles: true,
		});
		expect(write?.geometries).toEqual([{ feature_id: "zone-1" }]);
	});

	it("writes nothing when there is no graph or no loaded mission", () => {
		// Both are ordinary states — a mission nobody has authored a graph for,
		// and a graph editor open beside a mission the map has not loaded.
		expect(
			resolveGraphDraftWrite(
				AUTHORED,
				null,
				draftOf({
					vehicles: [],
					geometries: [],
					behavior: MissionBehavior.NAVIGATE,
					graph_compiles: false,
				}),
			),
		).toBeNull();
		expect(resolveGraphDraftWrite(AUTHORED, CLEAN, null)).toBeNull();
	});
});

describe("compiledDraftSlice", () => {
	it("derives `graph_compiles` from the issues and carries the rest verbatim", () => {
		expect(
			compiledDraftSlice({
				behavior: MissionBehavior.COVERAGE,
				vehicles: ["robot_a"],
				geometries: [{ feature_id: "zone-1" }],
				issues: [{ severity: "warning", message: "advisory" }],
			}),
		).toEqual({
			vehicles: ["robot_a"],
			geometries: [{ feature_id: "zone-1" }],
			behavior: MissionBehavior.COVERAGE,
			graph_compiles: true,
		});
	});
});

describe("resolveGraphDraftWrite — an unauthored graph", () => {
	/** A graph with nothing on the canvas. */
	const EMPTY: Pick<MissionGraph, "nodes"> = { nodes: [] };

	/** What an empty graph compiles to: nothing, and two errors saying so. */
	const NOTHING: CompiledMissionGraph = {
		behavior: MissionBehavior.NAVIGATE,
		vehicles: [],
		geometries: [],
		issues: [
			{ severity: "error", message: "the graph allocates no agent" },
			{ severity: "error", message: "the graph names no map asset" },
		],
	};

	it("writes nothing — opening the editor must not clear a mission or mark it unsaved", () => {
		// An empty graph is "nobody has authored one", not "authored as
		// nothing". Writing from it would clear an allocation on the strength
		// of a panel merely being rendered.
		expect(
			resolveGraphDraftWrite(EMPTY, NOTHING, {
				vehicles: ["robot_a"],
				behavior: MissionBehavior.NAVIGATE,
				objective: { geometries: [{ feature_id: "zone-1" }] },
			}),
		).toBeNull();
	});

	it("DOES write once the graph has authored the draft before", () => {
		// Deleting the last node is an edit, not an absence: by then the graph
		// is demonstrably the author of these fields, and leaving a vehicle
		// behind that no node allocates is the stale value this change removes.
		const write = resolveGraphDraftWrite(EMPTY, NOTHING, {
			vehicles: ["robot_a"],
			behavior: MissionBehavior.NAVIGATE,
			graph_compiles: true,
			objective: { geometries: [{ feature_id: "zone-1" }] },
		});
		expect(write).toEqual({
			vehicles: [],
			geometries: [],
			behavior: MissionBehavior.NAVIGATE,
			graph_compiles: false,
		});
	});

	it("writes nothing when no graph is loaded at all", () => {
		expect(
			resolveGraphDraftWrite(null, NOTHING, {
				vehicles: ["robot_a"],
				behavior: MissionBehavior.NAVIGATE,
				graph_compiles: true,
			}),
		).toBeNull();
	});
});

describe("the graph shows where each agent is while the mission runs", () => {
	// The fog's own progress for the 2026-09-23 screenshot graph, 12 s in:
	// Es sweeps, Ge waits at its 30 s gate.
	const program = parseMissionFeedback(
		JSON.stringify({
			mission_id: "m1",
			status: 5,
			tasks: [],
			program: {
				"agent-es": {
					chain: 0,
					step_index: 0,
					steps_total: 1,
					step_id: "go-es",
					state: "RUNNING",
					steps: [
						{
							step_id: "go-es",
							kind: "STEP",
							wait_node: "",
							mode: "all",
							gate_nodes: [],
						},
					],
					done_steps: [],
				},
				"agent-ge": {
					chain: 1,
					step_index: 0,
					steps_total: 2,
					step_id: "go-ge",
					state: "GATED",
					steps: [
						{
							step_id: "go-ge",
							kind: "STEP",
							wait_node: "wait-1",
							mode: "any",
							gate_nodes: ["when"],
						},
						{
							step_id: "back-ge",
							kind: "STEP",
							wait_node: "wait-2",
							mode: "all",
							gate_nodes: ["late"],
						},
					],
					done_steps: [],
					gate: {
						node_ids: ["when"],
						wait_node: "wait-1",
						mode: "any",
						waited_s: 12.4,
						conditions: [
							{
								node_id: "when",
								op: "ElapsedSeconds",
								key: "",
								threshold: 30,
								negate: false,
								holds: false,
							},
						],
					},
				},
			},
		}),
	)?.program;
	const agentNodes = new Map([
		["agent-es", ["es"]],
		["agent-ge", ["ge"]],
	]);

	it("parses the fog's program progress", () => {
		expect(program?.["agent-ge"]?.gate?.waited_s).toBe(12.4);
		expect(program?.["agent-ge"]?.steps).toHaveLength(2);
	});

	it("marks the running step, the gate countdown and the agents", () => {
		const marks = programMarks(agentNodes, program);
		expect(marks.get("go-es")).toEqual({
			tone: "running",
			text: "running",
		});
		expect(marks.get("when")).toEqual({
			tone: "waiting",
			text: "waiting 12/30 s",
		});
		expect(marks.get("go-ge")).toEqual({ tone: "starting", text: "next" });
		// The Hold until the agent is held at, and how far its inputs are.
		expect(marks.get("wait-1")).toEqual({
			tone: "waiting",
			text: "holding · 0/1 (any)",
		});
		expect(marks.get("es")?.text).toBe("running");
		expect(marks.get("ge")?.text).toBe("waiting");
		// Ge's second step is ahead: no mark yet.
		expect(marks.has("back-ge")).toBe(false);
	});

	it("marks finished steps and their gates done, and a failed step failed", () => {
		const later = {
			"agent-ge": {
				...program!["agent-ge"]!,
				step_index: 1,
				state: "FAILED" as const,
				gate: undefined,
				done_steps: ["go-ge"],
			},
		};
		const marks = programMarks(agentNodes, later);
		expect(marks.get("go-ge")?.tone).toBe("done");
		// Wait-1 was "any": it let go, but which input held is not known,
		// so none is painted as held.
		expect(marks.has("when")).toBe(false);
		expect(marks.get("wait-1")).toEqual({ tone: "done", text: "let go" });
		expect(marks.get("back-ge")?.tone).toBe("failed");
		expect(marks.get("late")?.tone).toBe("done");
	});

	it("says which step a hold waits to be done, and leaves that step's own mark", () => {
		const waiting = {
			...program!,
			"agent-ge": {
				...program!["agent-ge"]!,
				step_index: 1,
				state: "GATED" as const,
				gate: {
					node_ids: ["go-es"],
					wait_node: "wait-2",
					mode: "all" as const,
					waited_s: 40,
					conditions: [
						{
							node_id: "go-es",
							op: "StepDone",
							key: "go-es",
							threshold: 1,
							negate: false,
							holds: false,
						},
					],
				},
			},
		};
		// The step waited on is Es's: it stays marked as Es's running step.
		expect(programMarks(agentNodes, waiting).get("go-es")?.text).toBe(
			"running",
		);
		expect(
			agentPositions(waiting, { "go-es": "Sweep field" })[1]?.gate,
		).toEqual(["waiting for Sweep field to be done"]);
	});

	it("shows an On contact node's contacts, and the contact being visited", () => {
		const loop = {
			"agent-ge": {
				chain: 1,
				step_index: 0,
				steps_total: 2,
				step_id: "on",
				state: "LISTENING" as const,
				steps: [
					{
						step_id: "on",
						kind: "ON_CONTACT" as const,
						wait_node: "",
						mode: "all" as const,
						gate_nodes: [],
					},
					{
						step_id: "visit",
						kind: "STEP" as const,
						wait_node: "",
						mode: "all" as const,
						gate_nodes: [],
					},
				],
				done_steps: ["visit"],
				listening: {
					node: "on",
					source_step: "sweep",
					taken: 2,
					found: 2,
					source_done: false,
				},
			},
		};
		const marks = programMarks(agentNodes, loop);
		expect(marks.get("on")).toEqual({
			tone: "waiting",
			text: "2 of 2 contacts taken · sweep on",
		});
		expect(marks.get("visit")?.text).toBe("done");
		expect(marks.get("ge")?.text).toBe("2 of 2 contacts taken · sweep on");

		const visiting = {
			"agent-ge": {
				...loop["agent-ge"],
				step_index: 1,
				step_id: "visit",
				state: "RUNNING" as const,
				listening: undefined,
				contact: { uid: "c3", lon: 4.39, lat: 50.84, node: "on" },
			},
		};
		const now = programMarks(agentNodes, visiting);
		expect(now.get("visit")?.text).toBe("running");
		expect(now.get("on")?.text).toBe("visiting a contact");
		expect(now.get("ge")?.text).toBe("at a contact · running");
	});

	it("counts a finding gate towards its threshold", () => {
		const waiting = {
			"agent-ge": {
				...program!["agent-ge"]!,
				step_index: 1,
				state: "GATED" as const,
				gate: {
					node_ids: ["late"],
					wait_node: "wait-2",
					mode: "all" as const,
					waited_s: 12,
					conditions: [
						{
							node_id: "late",
							op: "ContactsFound",
							key: "",
							threshold: 2,
							negate: false,
							holds: false,
							value: 1,
						},
					],
				},
			},
		};
		expect(programMarks(agentNodes, waiting).get("late")?.text).toBe(
			"waiting for 2 contacts (1 so far)",
		);
	});

	it("lists where each agent is, for the mission feedback", () => {
		const rows = agentPositions(program, {
			"go-es": "Sweep field",
			"go-ge": "Go to hold",
		});
		expect(rows.map((r) => r.agentId)).toEqual(["agent-es", "agent-ge"]);
		expect(rows[0]).toMatchObject({
			stepId: "go-es",
			tone: "running",
			text: "Sweep field · running",
			gate: [],
		});
		expect(rows[1]).toMatchObject({
			stepId: "go-ge",
			tone: "waiting",
			text: "Go to hold · waiting",
			gate: ["waiting 12/30 s"],
		});
		// No graph loaded: the node id stands in for its caption.
		expect(agentPositions(program)[0]?.text).toBe("go-es · running");
		expect(agentPositions(undefined)).toEqual([]);
	});

	it("draws nothing without progress, and nothing for nodes that are gone", () => {
		expect(programMarks(agentNodes, undefined).size).toBe(0);
		const marks = programMarks(new Map(), program);
		expect(marks.has("es")).toBe(false);
	});
});

describe("tidy: one lane per agent", () => {
	const at = { x: 5, y: 5 };
	const n = (
		id: string,
		kind: "agent" | "action" | "asset" | "on_contact",
	) => ({
		id,
		kind,
		label: id,
		position: at,
	});
	const e = (source: string, sp: string, target: string, tp: string) => ({
		id: `${source}.${sp}-${target}.${tp}`,
		source,
		source_port: sp,
		target,
		target_port: tp,
	});

	it("puts each agent's steps in a row, in the robot's order, loop before exit", () => {
		const g = layoutLanes({
			version: 3,
			nodes: [
				n("fr", "agent"),
				n("sweep", "action"),
				n("zone", "asset"),
				n("ge", "agent"),
				n("on", "on_contact"),
				n("visit", "action"),
				n("home", "action"),
				n("stray", "action"),
			],
			edges: [
				e("fr", "agent", "sweep", "agent"),
				e("zone", "value", "sweep", "target"),
				e("ge", "agent", "on", "agent"),
				e("on", "agent", "visit", "agent"),
				e("visit", "agent", "on", "agent"),
				e("on", "no_more", "home", "agent"),
				e("sweep", "contact", "on", "event"),
			],
		});
		const p = (id: string) => g.nodes.find((x) => x.id === id)!.position;
		expect(p("fr").y).toBe(p("sweep").y);
		expect(p("sweep").x).toBeGreaterThan(p("fr").x);
		expect(p("ge").y).toBeGreaterThan(p("fr").y);
		expect([p("on").x, p("visit").x, p("home").x]).toEqual([
			p("on").x,
			p("on").x + 280,
			p("on").x + 560,
		]);
		// What feeds a step sits below it.
		expect(p("zone").y).toBeGreaterThan(p("sweep").y);
		// Unreached: a last lane.
		expect(p("stray").y).toBeGreaterThan(p("ge").y);
	});

	it("returns the same graph when it is already laid out", () => {
		const once = layoutLanes({
			version: 3,
			nodes: [n("a", "agent"), n("go", "action")],
			edges: [e("a", "agent", "go", "agent")],
		});
		expect(layoutLanes(once)).toBe(once);
	});
});

describe("copy and paste", () => {
	const at = { x: 10, y: 20 };
	const graph = {
		version: 3,
		nodes: [
			{
				id: "a",
				kind: "agent" as const,
				label: "A",
				position: at,
				agent_id: "r",
			},
			{
				id: "go",
				kind: "action" as const,
				label: "Go",
				position: at,
				action: "NAVIGATE" as const,
			},
			{
				id: "wp",
				kind: "asset" as const,
				label: "Hold",
				position: at,
				feature_id: "f",
			},
		],
		edges: [
			{
				id: "e1",
				source: "a",
				source_port: "agent",
				target: "go",
				target_port: "agent",
			},
			{
				id: "e2",
				source: "wp",
				source_port: "value",
				target: "go",
				target_port: "target",
			},
		],
	};

	it("copies the selected nodes (never an agent) and only the edges between them", () => {
		const clip = copySelection(graph, ["a", "go", "wp"])!;
		expect(clip.nodes.map((n) => n.id)).toEqual(["go", "wp"]);
		expect(clip.edges.map((e) => e.id)).toEqual(["e2"]);
		expect(copySelection(graph, ["a"])).toBeNull();
	});

	it("pastes copies under new ids, beside the originals, wired to each other", () => {
		const clip = copySelection(graph, ["go", "wp"])!;
		const { graph: next, ids } = pasteClip(graph, clip);
		expect(next.nodes).toHaveLength(5);
		expect(ids).toHaveLength(2);
		expect(ids).not.toContain("go");
		const copyOfGo = next.nodes.find((n) => n.id === ids[0])!;
		expect(copyOfGo.position).toEqual({ x: 50, y: 60 });
		const wired = next.edges.find((e) => e.target === ids[0])!;
		expect(wired.source).toBe(ids[1] as string);
		expect(wired.target_port).toBe("target");
	});
});
