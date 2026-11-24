import { describe, expect, it } from "bun:test";

import { routeUndo } from "./editor-undo-route";

const none = { canUndo: false, canRedo: false };
const both = { canUndo: true, canRedo: true };
const undoOnly = { canUndo: true, canRedo: false };

describe("routeUndo", () => {
	it("the open edit's own step comes first", () => {
		expect(routeUndo("undo", { edit: both, mission: both })).toBe("edit");
		expect(routeUndo("redo", { edit: both, mission: both })).toBe("edit");
	});

	it("an open edit with nothing to take back falls through to the mission", () => {
		expect(routeUndo("undo", { edit: none, mission: both })).toBe(
			"mission",
		);
		// Per direction: the edit can undo but not redo.
		expect(routeUndo("redo", { edit: undoOnly, mission: both })).toBe(
			"mission",
		);
	});

	it("a group's unsaved move comes before the mission", () => {
		expect(routeUndo("undo", { group: both, mission: both })).toBe("group");
		expect(routeUndo("undo", { group: none, mission: both })).toBe(
			"mission",
		);
	});

	it("with nothing open, the mission's history", () => {
		expect(routeUndo("undo", { mission: undoOnly })).toBe("mission");
		expect(routeUndo("redo", { mission: undoOnly })).toBeNull();
	});

	it("view only freezes the mission's history but not a local one", () => {
		expect(routeUndo("undo", { mission: both, frozen: true })).toBeNull();
		expect(
			routeUndo("undo", { edit: both, mission: both, frozen: true }),
		).toBe("edit");
	});

	it("outside a mission, nothing to fall through to", () => {
		expect(routeUndo("undo", { edit: none })).toBeNull();
		expect(routeUndo("undo", {})).toBeNull();
	});
});
