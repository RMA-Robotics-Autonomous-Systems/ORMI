/**
 * The hand-picked selection.
 *
 * Two things are worth a test here and nothing else is. The key must be an
 * identity rather than a position, because a selection stored as indices
 * silently exports different detections after any parameter change. And the two
 * implementations of that key — one in the atoms, one in the pure exporter,
 * which has no store and must not import one — have to agree, or a pick made in
 * a panel matches nothing in the file it produces.
 */

import { describe, expect, it } from "bun:test";
import { appStore } from "@workspace/ormi-core";
import {
	clearEmiSelection,
	detectionKey,
	targetKey,
	emiSelectionAtom,
	toggleEmiSelection,
} from "../atoms";
import { exportKey, exportTargetKey } from "../../mission/geojson";

describe("the detection key", () => {
	it("is the coil and the sample it peaked on", () => {
		expect(detectionKey({ coil: 3, iPeak: 4021 })).toBe("3:4021");
	});

	it("agrees with the exporter's copy", () => {
		// Duplicated on purpose — `mission/geojson.ts` is pure and imports no
		// store — so this is the thing holding the two together.
		for (const d of [
			{ coil: 1, iPeak: 0 },
			{ coil: 5, iPeak: 99_999 },
			{ coil: 2, iPeak: 7 },
		]) {
			expect(detectionKey(d)).toBe(exportKey(d));
		}
	});
});

describe("toggling", () => {
	it("replaces the set rather than mutating it", () => {
		// Every consumer subscribes by identity: a `Set` mutated in place is the
		// same object, so nothing would re-render and the count would freeze.
		clearEmiSelection();
		const before = appStore.get(emiSelectionAtom);
		toggleEmiSelection(["2:100"]);
		const after = appStore.get(emiSelectionAtom);
		expect(after).not.toBe(before);
		expect(after.has("2:100")).toBe(true);
	});

	it("completes a partly selected chain instead of inverting it", () => {
		// Clicking a chain whose front coil is already picked should end with
		// the whole chain picked. Inverting per-key would swap which half is in.
		clearEmiSelection();
		toggleEmiSelection(["2:100"]);
		toggleEmiSelection(["2:100", "4:300"]);
		const set = appStore.get(emiSelectionAtom);
		expect([...set].sort()).toEqual(["2:100", "4:300"]);
	});

	it("drops a chain that is already whole", () => {
		clearEmiSelection();
		toggleEmiSelection(["2:100", "4:300"]);
		toggleEmiSelection(["2:100", "4:300"]);
		expect(appStore.get(emiSelectionAtom).size).toBe(0);
	});

	it("clears", () => {
		toggleEmiSelection(["1:1", "2:2"]);
		clearEmiSelection();
		expect(appStore.get(emiSelectionAtom).size).toBe(0);
	});
});

describe("targetKey", () => {
	it("agrees with the export's copy", () => {
		// Two modules, one format, on purpose: the export is pure so it can be
		// tested over a fixture, and this is what keeps the duplicate honest.
		for (const id of [0, 1, 7, 4021]) {
			expect(targetKey(id)).toBe(exportTargetKey(id));
		}
	});

	it("cannot collide with a detection key", () => {
		// One set holds both kinds. A detection key is `<digits>:<digits>` and a
		// target key is `t:<digits>`, so the spaces are disjoint by
		// construction — a barycentre and a detection can never toggle each
		// other off.
		expect(targetKey(300)).not.toBe(detectionKey({ coil: 4, iPeak: 300 }));
		expect(targetKey(300).startsWith("t:")).toBe(true);
	});
});
