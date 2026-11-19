import { describe, expect, it } from "bun:test";
import { classifyDrawFinish, nextPendingOnFinish } from "./map-draw-finish";

interface Pending {
	feature: { id: string; coords: number[][] };
	featureId?: string;
	name: string;
	featureType: string;
}

const opened: Pending = {
	feature: { id: "draw-1", coords: [[0, 0]] },
	featureId: "wp-gate",
	name: "WP gate",
	featureType: "waypoint",
};

const moved = { id: "draw-1", coords: [[1, 1]] };

const createNew = (feature: Pending["feature"]): Pending => ({
	feature,
	name: "",
	featureType: "risk",
});

describe("classifyDrawFinish", () => {
	it("treats a draw-mode finish as a new shape", () => {
		expect(
			classifyDrawFinish({ mode: "polygon", action: "draw" }, false),
		).toBe("create");
	});

	it("treats every select-mode edit as an update of the open save", () => {
		for (const action of [
			"dragCoordinate",
			"dragFeature",
			"deleteCoordinate",
			"insertMidpoint",
			"dragCoordinateResize",
			"edit",
		]) {
			expect(classifyDrawFinish({ mode: "select", action }, true)).toBe(
				"update",
			);
		}
	});

	it("ignores an edit when nothing is open", () => {
		expect(
			classifyDrawFinish(
				{ mode: "select", action: "dragFeature" },
				false,
			),
		).toBe("ignore");
	});

	it("counts a missing context as a draw", () => {
		expect(classifyDrawFinish(undefined, true)).toBe("create");
	});
});

describe("nextPendingOnFinish", () => {
	it("keeps the edited feature's id, name and type when a waypoint is dragged", () => {
		const next = nextPendingOnFinish(
			opened,
			moved,
			{ mode: "select", action: "dragFeature" },
			createNew,
		);
		// The usability test (2026-11-12) saw this become an empty new "risk"
		// feature, and Save then duplicated the waypoint.
		expect(next?.featureId).toBe("wp-gate");
		expect(next?.name).toBe("WP gate");
		expect(next?.featureType).toBe("waypoint");
		expect(next?.feature).toEqual(moved);
	});

	it("keeps identity on a vertex drag, a vertex delete and a midpoint insert", () => {
		for (const action of [
			"dragCoordinate",
			"deleteCoordinate",
			"insertMidpoint",
		]) {
			const next = nextPendingOnFinish(
				opened,
				moved,
				{ mode: "select", action },
				createNew,
			);
			expect(next?.featureId).toBe("wp-gate");
		}
	});

	it("starts a new save when a draw mode finishes a shape", () => {
		const next = nextPendingOnFinish(
			null,
			moved,
			{ mode: "polygon", action: "draw" },
			createNew,
		);
		expect(next).toEqual({ feature: moved, name: "", featureType: "risk" });
	});

	it("leaves nothing open when an edit finishes with no save open", () => {
		expect(
			nextPendingOnFinish(
				null,
				moved,
				{ mode: "select", action: "dragFeature" },
				createNew,
			),
		).toBeNull();
	});
});
