import { afterEach, describe, expect, it } from "bun:test";

import {
	EDITOR_PANEL_ATTRIBUTE,
	EDITOR_PANEL_ID_ATTRIBUTE,
	type EditorKeyAction,
	type EditorKeyEvent,
	type EditorKeyState,
	__resetEditorKeys,
	editorKeyAction,
	editorPanelProps,
	keyPanelId,
	panelIdOf,
} from "./editor-keys";

afterEach(() => __resetEditorKeys());

/** The state of each kind of panel a key can be pressed in. */
const CONTEXTS: Record<string, EditorKeyState> = {
	// Node editor, nodes selected, history in reach.
	graphSelected: {
		deletes: "now",
		canUndo: true,
		canRedo: true,
		canEscape: true,
	},
	// Node editor, nothing selected, nothing to undo.
	graphEmpty: {},
	// Map, a stored feature open with changes, no vertex selected.
	storedOpen: {
		deletes: "ask",
		canSave: true,
		canUndo: true,
		canRedo: false,
		canEscape: true,
	},
	// Map, a mission asset open, a vertex selected.
	assetVertex: {
		vertexSelected: true,
		deletes: "now",
		canSave: false,
		canUndo: true,
		canEscape: true,
	},
	// Map, a group of features with unsaved changes.
	group: {
		deletes: "ask",
		canSave: true,
		canUndo: false,
		canRedo: true,
		canEscape: true,
	},
	// Map, View: a pick, nothing deletable.
	viewPick: { deletes: null, canEscape: true },
};

const KEYS: Record<string, EditorKeyEvent> = {
	undo: { key: "z", ctrlKey: true },
	undoMac: { key: "z", metaKey: true },
	redo: { key: "Z", ctrlKey: true, shiftKey: true },
	redoY: { key: "y", ctrlKey: true },
	delete: { key: "Delete" },
	backspace: { key: "Backspace" },
	escape: { key: "Escape" },
	enter: { key: "Enter" },
};

/** Expected action per context, then per key. */
const TABLE: Record<string, Record<string, EditorKeyAction | null>> = {
	graphSelected: {
		undo: "undo",
		undoMac: "undo",
		redo: "redo",
		redoY: "redo",
		delete: "delete",
		backspace: "delete",
		escape: "escape-step",
		enter: null,
	},
	graphEmpty: {
		undo: null,
		undoMac: null,
		redo: null,
		redoY: null,
		delete: null,
		backspace: null,
		escape: null,
		enter: null,
	},
	storedOpen: {
		undo: "undo",
		undoMac: "undo",
		redo: null,
		redoY: null,
		delete: "ask-delete",
		backspace: "ask-delete",
		escape: "escape-step",
		enter: "save",
	},
	assetVertex: {
		undo: "undo",
		undoMac: "undo",
		redo: null,
		redoY: null,
		delete: "delete-vertex",
		backspace: "delete-vertex",
		escape: "escape-step",
		enter: null,
	},
	group: {
		undo: null,
		undoMac: null,
		redo: "redo",
		redoY: "redo",
		delete: "ask-delete",
		backspace: "ask-delete",
		escape: "escape-step",
		enter: "save",
	},
	viewPick: {
		undo: null,
		undoMac: null,
		redo: null,
		redoY: null,
		delete: null,
		backspace: null,
		escape: "escape-step",
		enter: null,
	},
};

describe("editorKeyAction: the key table", () => {
	for (const [context, row] of Object.entries(TABLE)) {
		for (const [key, expected] of Object.entries(row)) {
			it(`${context}: ${key} → ${expected ?? "nothing"}`, () => {
				expect(editorKeyAction(KEYS[key]!, CONTEXTS[context]!)).toBe(
					expected,
				);
			});
		}
	}
});

describe("editorKeyAction: what no context takes", () => {
	const all: EditorKeyState = {
		vertexSelected: false,
		deletes: "now",
		canSave: true,
		canUndo: true,
		canRedo: true,
		canEscape: true,
	};

	it("Escape never deletes", () => {
		for (const state of Object.values(CONTEXTS)) {
			const action = editorKeyAction({ key: "Escape" }, state);
			expect(action === null || action === "escape-step").toBe(true);
		}
	});

	it("leaves every key to an open list or menu", () => {
		for (const key of Object.values(KEYS)) {
			expect(editorKeyAction({ ...key, inPopup: true }, all)).toBeNull();
		}
	});

	it("leaves Enter to a focused button", () => {
		expect(editorKeyAction({ key: "Enter", onControl: true }, all)).toBe(
			null,
		);
	});

	it("ignores modified keys, Alt with Ctrl+Z, and other shortcuts", () => {
		expect(editorKeyAction({ key: "Delete", ctrlKey: true }, all)).toBe(
			null,
		);
		expect(editorKeyAction({ key: "Enter", metaKey: true }, all)).toBe(
			null,
		);
		expect(editorKeyAction({ key: "Enter", shiftKey: true }, all)).toBe(
			null,
		);
		expect(editorKeyAction({ key: "Escape", altKey: true }, all)).toBe(
			null,
		);
		expect(
			editorKeyAction({ key: "z", ctrlKey: true, altKey: true }, all),
		).toBeNull();
		expect(editorKeyAction({ key: "a" }, all)).toBeNull();
	});

	it("never claims Ctrl+S or Ctrl+R", () => {
		for (const key of ["s", "r"]) {
			expect(editorKeyAction({ key, ctrlKey: true }, all)).toBeNull();
			expect(editorKeyAction({ key, metaKey: true }, all)).toBeNull();
		}
	});
});

/** A minimal element: its panel is whatever `closest` finds. */
function elementIn(panelId: string | null, connected = true) {
	const panel =
		panelId === null
			? null
			: {
					isConnected: connected,
					getAttribute: (name: string) =>
						name === EDITOR_PANEL_ID_ATTRIBUTE ? panelId : null,
				};
	return {
		closest: (selector: string) =>
			selector === `[${EDITOR_PANEL_ID_ATTRIBUTE}]` ? panel : null,
	};
}

describe("key ownership", () => {
	it("a key is the panel's that holds focus", () => {
		expect(keyPanelId(elementIn("map"), null)).toBe("map");
		// Focus wins over the panel last pressed in.
		expect(keyPanelId(elementIn("graph"), "map")).toBe("graph");
	});

	it("with focus outside every panel, it is the panel last pressed in", () => {
		// Focus on the body, after the node that held it was deleted.
		expect(keyPanelId(elementIn(null), "graph")).toBe("graph");
		expect(keyPanelId(null, "map")).toBe("map");
	});

	it("with neither, a key is no panel's", () => {
		expect(keyPanelId(elementIn(null), null)).toBeNull();
		expect(keyPanelId(undefined, null)).toBeNull();
	});

	it("a panel no longer in the page holds no key", () => {
		expect(panelIdOf(elementIn("map", false))).toBeNull();
		expect(keyPanelId(elementIn("map", false), "graph")).toBe("graph");
	});

	it("reads only elements", () => {
		expect(panelIdOf({})).toBeNull();
		expect(panelIdOf("map")).toBeNull();
	});

	it("marks a panel by kind and instance", () => {
		expect(editorPanelProps("graph", ":r1:")).toEqual({
			[EDITOR_PANEL_ATTRIBUTE]: "graph",
			[EDITOR_PANEL_ID_ATTRIBUTE]: ":r1:",
		});
	});
});
