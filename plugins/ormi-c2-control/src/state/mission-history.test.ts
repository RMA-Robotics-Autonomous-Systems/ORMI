import { describe, expect, it } from "bun:test";

import {
	amendLastCommand,
	EMPTY_MISSION_HISTORY,
	type MissionCommand,
	type MissionHistory,
	pushCommand,
	redoStep,
	undoStep,
} from "./mission-history";

/** A graph-only step from `from` to `to`. */
function step(from: number, to: number, gesture?: string): MissionCommand {
	return {
		label: `${from}->${to}`,
		gesture,
		before: { graph: from },
		after: { graph: to },
	};
}

/** Push steps in order. */
function pushAll(
	steps: MissionCommand[],
	limit?: number,
	start: MissionHistory = EMPTY_MISSION_HISTORY,
): MissionHistory {
	return steps.reduce((h, s) => pushCommand(h, s, limit), start);
}

describe("pushCommand", () => {
	it("keeps at most `limit` steps, dropping the oldest", () => {
		const history = pushAll(
			Array.from({ length: 5 }, (_, i) => step(i, i + 1)),
			3,
		);
		expect(history.past.map((s) => s.label)).toEqual([
			"2->3",
			"3->4",
			"4->5",
		]);
	});

	it("folds the edits of one gesture into one step", () => {
		const history = pushAll([
			step(0, 1, "move:1"),
			step(1, 2, "move:1"),
			step(2, 3, "move:1"),
			step(3, 4, "move:2"),
		]);
		expect(history.past).toHaveLength(2);
		expect(history.past[0]?.before).toEqual({ graph: 0 });
		expect(history.past[0]?.after).toEqual({ graph: 3 });
	});

	it("a gesture folds parts it adds, keeping the first before", () => {
		const history = pushAll([
			step(0, 1, "g"),
			{
				label: "x",
				gesture: "g",
				before: { draft: "a" },
				after: { draft: "b" },
			},
		]);
		expect(history.past[0]?.before).toEqual({ graph: 0, draft: "a" });
		expect(history.past[0]?.after).toEqual({ graph: 1, draft: "b" });
	});

	it("a new edit drops what could be redone", () => {
		const undone = undoStep(pushAll([step(0, 1), step(1, 2)]))!.history;
		expect(undone.future).toHaveLength(1);
		const history = pushCommand(undone, step(1, 9));
		expect(history.future).toHaveLength(0);
		expect(history.past.map((s) => s.label)).toEqual(["0->1", "1->9"]);
	});

	it("never folds a gesture into a step from before an undo", () => {
		const undone = undoStep(
			pushAll([step(0, 1, "g"), step(1, 2, "h")]),
		)!.history;
		const history = pushCommand(undone, step(1, 5, "g"));
		expect(history.past).toHaveLength(2);
	});
});

describe("undoStep / redoStep", () => {
	it("moves one step between past and future, and back", () => {
		const history = pushAll([step(0, 1), step(1, 2)]);
		const undone = undoStep(history)!;
		expect(undone.command.label).toBe("1->2");
		expect(undone.history.past).toHaveLength(1);
		expect(undone.history.future.map((s) => s.label)).toEqual(["1->2"]);
		const redone = redoStep(undone.history)!;
		expect(redone.command.label).toBe("1->2");
		expect(redone.history.past).toHaveLength(2);
		expect(redone.history.future).toHaveLength(0);
	});

	it("has nothing to do on an empty side", () => {
		expect(undoStep(EMPTY_MISSION_HISTORY)).toBeNull();
		expect(redoStep(EMPTY_MISSION_HISTORY)).toBeNull();
	});
});

describe("amendLastCommand", () => {
	it("adds a derived part to the last step", () => {
		const history = amendLastCommand(
			pushAll([step(0, 1)]),
			{ draft: "a" },
			{ draft: "b" },
		);
		expect(history.past[0]?.before).toEqual({ graph: 0, draft: "a" });
		expect(history.past[0]?.after).toEqual({ graph: 1, draft: "b" });
	});

	it("keeps the step's own before for a part it already changed", () => {
		const history = amendLastCommand(
			pushAll([step(0, 1)]),
			{ graph: 1 },
			{ graph: 7 },
		);
		expect(history.past[0]?.before).toEqual({ graph: 0 });
		expect(history.past[0]?.after).toEqual({ graph: 7 });
	});

	it("is a no-op with no step", () => {
		expect(
			amendLastCommand(EMPTY_MISSION_HISTORY, { draft: 1 }, { draft: 2 }),
		).toBe(EMPTY_MISSION_HISTORY);
	});
});
