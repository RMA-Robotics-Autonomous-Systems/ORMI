import { describe, expect, it } from "bun:test";

import { crossMapEdit, crossMapEditMessage } from "./map-editing-guards";

/**
 * P0-adjacent #6 — cross-map feature corruption.
 *
 * `c2.map.features.update` is a PUT **upsert**. Switching the map `<Select>`
 * cleared only `pickedId`, so a pending EDIT holding map A's `featureId` survived
 * into map B and the confirm silently wrote a copy of A's feature into B.
 */

describe("crossMapEdit", () => {
	it("catches an edit confirmed after the map was switched", () => {
		expect(
			crossMapEdit({ mapName: "alpha", featureId: "f1" }, "bravo"),
		).toBe(true);
	});

	it("allows an edit confirmed on its own map", () => {
		expect(
			crossMapEdit({ mapName: "alpha", featureId: "f1" }, "alpha"),
		).toBe(false);
	});

	it("allows a CREATE across maps — it cannot collide", () => {
		// No featureId: the server assigns a fresh one, so there is nothing to
		// overwrite. Blocking it would break drawing a feature after a switch.
		expect(crossMapEdit({ mapName: "alpha" }, "bravo")).toBe(false);
	});

	it("allows an edit with no recorded provenance", () => {
		// This is the SECOND line of defence; refusing on missing provenance would
		// block legitimate edits rather than protect anything.
		expect(crossMapEdit({ featureId: "f1" }, "bravo")).toBe(false);
	});

	it("is false when nothing is pending", () => {
		expect(crossMapEdit(null, "bravo")).toBe(false);
		expect(crossMapEdit(undefined, "bravo")).toBe(false);
	});

	it("names both maps so the operator can act on the message", () => {
		const message = crossMapEditMessage(
			{ mapName: "alpha", featureId: "f1" },
			"bravo",
		);
		expect(message).toContain("alpha");
		expect(message).toContain("bravo");
	});
});
