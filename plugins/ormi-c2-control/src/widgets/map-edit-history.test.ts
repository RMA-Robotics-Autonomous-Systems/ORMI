import { describe, expect, it } from "bun:test";

import {
	EDIT_HISTORY_LIMIT,
	canRedo,
	canUndo,
	emptyHistory,
	recordGeometry,
	redoGeometry,
	undoGeometry,
	type GeometryHistory,
} from "./map-edit-history";
import { hasUnsavedChanges, sameGeometry } from "./map-selection";

type Geometry = { type: string; coordinates: unknown };

function square(dx = 0): Geometry {
	return {
		type: "Polygon",
		coordinates: [
			[
				[4.39 + dx, 50.84],
				[4.4 + dx, 50.84],
				[4.4 + dx, 50.85],
				[4.39 + dx, 50.84],
			],
		],
	};
}

const opened = square();
const dragged = square(0.001);
const draggedAgain = square(0.002);

describe("the geometry history of an open edit", () => {
	it("starts with nothing to undo or redo", () => {
		expect(canUndo(undefined)).toBe(false);
		expect(canRedo(undefined)).toBe(false);
		expect(canUndo(emptyHistory())).toBe(false);
		expect(undoGeometry(undefined, opened)).toBeNull();
		expect(redoGeometry(emptyHistory<Geometry>(), opened)).toBeNull();
	});

	it("records a change, and not a change that moved nothing", () => {
		const none = emptyHistory<Geometry>();
		expect(recordGeometry(none, opened, structuredClone(opened))).toBe(
			none,
		);
		const one = recordGeometry(undefined, opened, dragged);
		expect(one.past).toEqual([opened]);
		expect(one.future).toEqual([]);
		expect(canUndo(one)).toBe(true);
	});

	it("undoes back to the shape as opened, which has nothing to save", () => {
		const history = recordGeometry(undefined, opened, dragged);
		const step = undoGeometry(history, dragged)!;
		expect(step.geometry).toEqual(opened);
		expect(canUndo(step.history)).toBe(false);
		expect(canRedo(step.history)).toBe(true);
		const original = {
			name: "Gravel yard",
			featureType: "risk",
			category: "",
			geometry: opened,
		};
		expect(
			hasUnsavedChanges(
				{ ...original, geometry: step.geometry },
				original,
			),
		).toBe(false);
	});

	it("redoes what was undone, in order", () => {
		let history: GeometryHistory<Geometry> = recordGeometry(
			undefined,
			opened,
			dragged,
		);
		history = recordGeometry(history, dragged, draggedAgain);
		let shown = draggedAgain;
		for (const expected of [dragged, opened]) {
			const step = undoGeometry(history, shown)!;
			expect(step.geometry).toEqual(expected);
			history = step.history;
			shown = step.geometry;
		}
		expect(undoGeometry(history, shown)).toBeNull();
		for (const expected of [dragged, draggedAgain]) {
			const step = redoGeometry(history, shown)!;
			expect(step.geometry).toEqual(expected);
			history = step.history;
			shown = step.geometry;
		}
		expect(redoGeometry(history, shown)).toBeNull();
		expect(canUndo(history)).toBe(true);
	});

	it("drops what was undone when a new change is made", () => {
		const history = recordGeometry(undefined, opened, dragged);
		const undone = undoGeometry(history, dragged)!;
		const branched = recordGeometry(undone.history, opened, draggedAgain);
		expect(canRedo(branched)).toBe(false);
		expect(branched.past).toEqual([opened]);
	});

	it("folds the end of a gesture into the step it started", () => {
		// A drag from a midpoint: the vertex is inserted, then moved.
		const inserted = square(0.0005);
		const afterInsert = recordGeometry(undefined, opened, inserted);
		const afterMove = recordGeometry(afterInsert, inserted, dragged, {
			continuesLastStep: true,
		});
		expect(afterMove.past).toEqual([opened]);
		const step = undoGeometry(afterMove, dragged)!;
		expect(sameGeometry(step.geometry, opened)).toBe(true);
		expect(canUndo(step.history)).toBe(false);
	});

	it("records a continuation with nothing before it as its own step", () => {
		const history = recordGeometry(undefined, opened, dragged, {
			continuesLastStep: true,
		});
		expect(history.past).toEqual([opened]);
	});

	it("keeps the newest steps when the limit is reached", () => {
		let history: GeometryHistory<Geometry> | undefined;
		let shown = square(0);
		for (let i = 1; i <= EDIT_HISTORY_LIMIT + 5; i++) {
			const next = square(i * 0.0001);
			history = recordGeometry(history, shown, next);
			shown = next;
		}
		expect(history!.past).toHaveLength(EDIT_HISTORY_LIMIT);
		expect(history!.past[0]).toEqual(square(5 * 0.0001));
	});
});
