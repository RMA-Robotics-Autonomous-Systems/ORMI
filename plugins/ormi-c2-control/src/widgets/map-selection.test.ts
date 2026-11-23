import { describe, expect, it } from "bun:test";
import {
	type EditSnapshot,
	editKeyAction,
	editingLabel,
	hasUnsavedChanges,
	historyKeyAction,
	mapStateLabel,
	sameGeometry,
	openShapeContact,
	selectionChangeOnClick,
} from "./map-selection";

const ring = [
	[4.39, 50.84],
	[4.4, 50.84],
	[4.4, 50.85],
	[4.39, 50.84],
];

const original: EditSnapshot = {
	name: "Gravel yard",
	featureType: "zone",
	category: "",
	geometry: { type: "Polygon", coordinates: [ring] },
};

describe("sameGeometry", () => {
	it("matches an identical copy", () => {
		expect(
			sameGeometry(original.geometry, structuredClone(original.geometry)),
		).toBe(true);
	});

	it("ignores a difference below terra-draw's precision", () => {
		const nudged = structuredClone(ring);
		nudged[1]![0] = 4.4 + 1e-12;
		expect(
			sameGeometry(original.geometry, {
				type: "Polygon",
				coordinates: [nudged],
			}),
		).toBe(true);
	});

	it("sees a moved vertex, an added vertex and a type change", () => {
		const moved = structuredClone(ring);
		moved[1]![0] = 4.4001;
		expect(
			sameGeometry(original.geometry, {
				type: "Polygon",
				coordinates: [moved],
			}),
		).toBe(false);
		expect(
			sameGeometry(original.geometry, {
				type: "Polygon",
				coordinates: [[...ring.slice(0, 3), [4.395, 50.845], ring[3]]],
			}),
		).toBe(false);
		expect(
			sameGeometry(original.geometry, {
				type: "LineString",
				coordinates: [ring],
			}),
		).toBe(false);
	});

	it("treats two missing geometries as the same and one as different", () => {
		expect(sameGeometry(null, undefined)).toBe(true);
		expect(sameGeometry(null, original.geometry)).toBe(false);
	});
});

describe("hasUnsavedChanges", () => {
	it("is false for a feature opened and not touched", () => {
		expect(hasUnsavedChanges(structuredClone(original), original)).toBe(
			false,
		);
	});

	it("is true for a shape just drawn", () => {
		expect(hasUnsavedChanges(original, undefined)).toBe(true);
	});

	it("is true for each kind of change", () => {
		expect(
			hasUnsavedChanges({ ...original, name: "North yard" }, original),
		).toBe(true);
		expect(
			hasUnsavedChanges({ ...original, featureType: "risk" }, original),
		).toBe(true);
		expect(
			hasUnsavedChanges({ ...original, category: "holding" }, original),
		).toBe(true);
		const moved = structuredClone(ring);
		moved[0]![1] = 50.8401;
		moved[3]![1] = 50.8401;
		expect(
			hasUnsavedChanges(
				{
					...original,
					geometry: { type: "Polygon", coordinates: [moved] },
				},
				original,
			),
		).toBe(true);
	});

	it("ignores whitespace around the name, which the save trims", () => {
		expect(
			hasUnsavedChanges({ ...original, name: " Gravel yard " }, original),
		).toBe(false);
	});
});

describe("selectionChangeOnClick", () => {
	it("switches at once when nothing is open", () => {
		expect(selectionChangeOnClick(null, false, "a")).toBe("switch");
		expect(selectionChangeOnClick(null, false, null)).toBe("switch");
	});

	it("stays on a click on the open feature, changes or not", () => {
		expect(selectionChangeOnClick("a", false, "a")).toBe("stay");
		expect(selectionChangeOnClick("a", true, "a")).toBe("stay");
	});

	it("switches to another feature, or ends on empty map, with no changes", () => {
		expect(selectionChangeOnClick("a", false, "b")).toBe("switch");
		expect(selectionChangeOnClick("a", false, null)).toBe("switch");
	});

	it("asks before dropping changes", () => {
		expect(selectionChangeOnClick("a", true, "b")).toBe("ask");
		expect(selectionChangeOnClick("a", true, null)).toBe("ask");
	});
});

describe("openShapeContact", () => {
	const handle = {
		id: "h",
		properties: { selectionPoint: true, selectionPointFeatureId: "td-1" },
	};
	const midpoint = {
		id: "m",
		properties: { midPoint: true, midPointFeatureId: "td-1" },
	};

	it("finds a vertex handle or a midpoint of the open shape", () => {
		expect(openShapeContact([handle], "td-1")).toBe("guidance");
		expect(openShapeContact([midpoint], "td-1")).toBe("guidance");
	});

	it("prefers the guidance over the shape under it", () => {
		expect(
			openShapeContact(
				[{ id: "td-1", properties: {} }, midpoint],
				"td-1",
			),
		).toBe("guidance");
	});

	it("finds the shape itself", () => {
		expect(openShapeContact([{ id: "td-1", properties: {} }], "td-1")).toBe(
			"shape",
		);
	});

	it("ignores other shapes and an empty draw layer", () => {
		expect(
			openShapeContact(
				[
					{ id: "td-2", properties: {} },
					{ id: "m", properties: { midPointFeatureId: "td-2" } },
				],
				"td-1",
			),
		).toBeNull();
		expect(openShapeContact([], "td-1")).toBeNull();
		expect(openShapeContact([{ id: "td-1" }], null)).toBeNull();
	});
});

describe("editKeyAction", () => {
	const idle = { vertexSelected: false, hasChanges: false };
	const changed = { vertexSelected: false, hasChanges: true };

	it("deletes the selected vertex, or asks to delete the feature", () => {
		for (const key of ["Delete", "Backspace"]) {
			expect(
				editKeyAction(
					{ key },
					{ vertexSelected: true, hasChanges: true },
				),
			).toBe("delete-vertex");
			expect(editKeyAction({ key }, idle)).toBe("ask-delete-feature");
		}
	});

	it("saves on Enter only when there are changes", () => {
		expect(editKeyAction({ key: "Enter" }, changed)).toBe("save");
		expect(editKeyAction({ key: "Enter" }, idle)).toBeNull();
	});

	it("leaves Enter to a focused button", () => {
		expect(editKeyAction({ key: "Enter", onControl: true }, changed)).toBe(
			null,
		);
	});

	it("cancels on Escape, changes or not", () => {
		expect(editKeyAction({ key: "Escape" }, idle)).toBe("cancel");
		expect(editKeyAction({ key: "Escape" }, changed)).toBe("cancel");
	});

	it("leaves every key to an open list or menu", () => {
		for (const key of ["Escape", "Enter", "Delete"]) {
			expect(editKeyAction({ key, inPopup: true }, changed)).toBeNull();
		}
	});

	it("ignores modified keys and everything else", () => {
		expect(editKeyAction({ key: "Delete", ctrlKey: true }, idle)).toBe(
			null,
		);
		expect(editKeyAction({ key: "Enter", metaKey: true }, changed)).toBe(
			null,
		);
		expect(editKeyAction({ key: "Enter", shiftKey: true }, changed)).toBe(
			null,
		);
		expect(editKeyAction({ key: "Escape", altKey: true }, idle)).toBeNull();
		expect(editKeyAction({ key: "a" }, changed)).toBeNull();
	});
});

describe("editingLabel", () => {
	it("names the feature, or falls back to its type", () => {
		expect(editingLabel("Gravel yard", "Zone")).toBe("Editing Gravel yard");
		expect(editingLabel("  ", "Zone")).toBe("Editing Zone");
	});
});

describe("historyKeyAction", () => {
	it("undoes on Ctrl+Z and Cmd+Z", () => {
		expect(historyKeyAction({ key: "z", ctrlKey: true })).toBe("undo");
		expect(historyKeyAction({ key: "z", metaKey: true })).toBe("undo");
	});

	it("redoes on Ctrl/Cmd+Shift+Z and Ctrl+Y", () => {
		expect(
			historyKeyAction({ key: "Z", ctrlKey: true, shiftKey: true }),
		).toBe("redo");
		expect(
			historyKeyAction({ key: "z", metaKey: true, shiftKey: true }),
		).toBe("redo");
		expect(historyKeyAction({ key: "y", ctrlKey: true })).toBe("redo");
	});

	it("ignores the keys alone, with Alt, and other shortcuts", () => {
		expect(historyKeyAction({ key: "z" })).toBeNull();
		expect(historyKeyAction({ key: "y" })).toBeNull();
		expect(
			historyKeyAction({ key: "z", ctrlKey: true, altKey: true }),
		).toBeNull();
		expect(historyKeyAction({ key: "s", ctrlKey: true })).toBeNull();
		expect(historyKeyAction({ key: "r", ctrlKey: true })).toBeNull();
	});
});

describe("editKeyAction: Undo and Redo", () => {
	const state = {
		vertexSelected: false,
		hasChanges: true,
		canUndo: true,
		canRedo: true,
	};

	it("undoes and redoes while there is a step", () => {
		expect(editKeyAction({ key: "z", ctrlKey: true }, state)).toBe("undo");
		expect(
			editKeyAction({ key: "Z", ctrlKey: true, shiftKey: true }, state),
		).toBe("redo");
		expect(editKeyAction({ key: "y", ctrlKey: true }, state)).toBe("redo");
	});

	it("leaves the key to the browser with nothing to undo or redo", () => {
		const none = { ...state, canUndo: false, canRedo: false };
		expect(editKeyAction({ key: "z", ctrlKey: true }, none)).toBeNull();
		expect(editKeyAction({ key: "y", ctrlKey: true }, none)).toBeNull();
	});

	it("leaves it to an open list or menu", () => {
		expect(
			editKeyAction({ key: "z", ctrlKey: true, inPopup: true }, state),
		).toBeNull();
	});

	it("never claims Ctrl+S or Ctrl+R", () => {
		for (const key of ["s", "r"]) {
			expect(editKeyAction({ key, ctrlKey: true }, state)).toBeNull();
			expect(editKeyAction({ key, metaKey: true }, state)).toBeNull();
		}
	});
});

describe("mapStateLabel", () => {
	it("says nothing while nothing is open", () => {
		expect(mapStateLabel({ kind: "idle" })).toBe("");
	});

	it("names the feature open, the new shape, or the shape being drawn", () => {
		expect(
			mapStateLabel({
				kind: "editing",
				name: "Gravel yard",
				typeLabel: "Risk area",
			}),
		).toBe("Editing Gravel yard");
		expect(
			mapStateLabel({ kind: "editing", name: " ", typeLabel: "Zone" }),
		).toBe("Editing Zone");
		expect(mapStateLabel({ kind: "new", typeLabel: "Zone" })).toBe(
			"New zone",
		);
		expect(mapStateLabel({ kind: "drawing", typeLabel: "Road" })).toBe(
			"Drawing road",
		);
	});
});

describe("mapStateLabel for a group", () => {
	it("counts the selected features, and the ones moving", () => {
		expect(mapStateLabel({ kind: "group", count: 3 })).toBe("3 selected");
		expect(mapStateLabel({ kind: "moving", count: 3 })).toBe(
			"Moving 3 features",
		);
		expect(mapStateLabel({ kind: "moving", count: 1 })).toBe(
			"Moving 1 feature",
		);
	});
});
