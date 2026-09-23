import { describe, expect, it } from "bun:test";

import {
	applySelectionChanges,
	compiledDraftSlice,
	formatCondition,
	NO_CONDITION_LABEL,
	resolveGraphDraftWrite,
	shouldHandleGraphShortcut,
	sortIssuesBySeverity,
} from "./mission-graph-editor-helpers";
import {
	CONDITION_OPS,
	type CompiledMissionGraph,
	type GraphCondition,
	type MissionGraph,
	type MissionGraphIssue,
} from "./mission-graph";
import { MissionBehavior } from "../types/c2-types";

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

	it("resolves an agent key to its agent NAME", () => {
		expect(
			formatCondition(condition({ op: "AgentHolding", key: "a-1" }), {
				agentNames: { "a-1": "Rover 1" },
			}),
		).toBe('Agent holding "Rover 1"');
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
		expect(formatCondition(condition({ op: "AgentHolding" }))).toContain(
			"<no agent>",
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
			formatCondition(condition({ op: "ItemsFound", threshold: 3 })),
		).toBe("Items found ≥ 3");
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
		for (const op of [
			"AgentHolding",
			"FlagSet",
			"Always",
			"Never",
		] as const) {
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
