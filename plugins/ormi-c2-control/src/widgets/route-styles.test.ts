import { describe, expect, it } from "bun:test";

import {
	ROUTE_KINDS,
	ROUTE_STYLES,
	type RouteKind,
	feedbackRouteKind,
	routeCasingLayer,
	routeCoreLayer,
} from "./route-styles";

/** What tells two kinds apart without colour: width, pattern and casing. */
function shape(kind: RouteKind): string {
	const { casing, core } = ROUTE_STYLES[kind];
	return `${core.width}|${core.dash?.join(",") ?? "solid"}|${casing.color}`;
}

describe("the kind of a feedback route stretch", () => {
	it("is driven for what is done, whatever the mission's state", () => {
		expect(feedbackRouteKind("done", true)).toBe("driven");
		expect(feedbackRouteKind("done", false)).toBe("driven");
	});

	it("is planned once committed, a preview before", () => {
		expect(feedbackRouteKind("remaining", true)).toBe("planned");
		expect(feedbackRouteKind("remaining", false)).toBe("preview");
	});
});

describe("the robot line styles", () => {
	it("tell planned, driven and live path apart by width and pattern", () => {
		const shapes = new Set(
			(["planned", "driven", "intent"] as const).map(shape),
		);
		expect(shapes.size).toBe(3);
		const widths = new Set(
			(["planned", "driven", "intent"] as const).map(
				(kind) => ROUTE_STYLES[kind].core.width,
			),
		);
		expect(widths.size).toBe(3);
		// Planned is the widest: it is the road; driven the thinnest.
		expect(ROUTE_STYLES.planned.core.width).toBeGreaterThan(
			ROUTE_STYLES.intent.core.width,
		);
		expect(ROUTE_STYLES.intent.core.width).toBeGreaterThan(
			ROUTE_STYLES.driven.core.width,
		);
	});

	it("draws the live path as dots and a preview as dashes", () => {
		const intent = ROUTE_STYLES.intent.core;
		expect(intent.dash?.[0]).toBe(0);
		expect(intent.cap).toBe("round");
		const preview = ROUTE_STYLES.preview.core;
		expect(preview.dash?.[0]).toBeGreaterThan(0);
		expect(preview.width).toBe(ROUTE_STYLES.planned.core.width);
		expect(ROUTE_STYLES.planned.core.dash).toBeUndefined();
		expect(ROUTE_STYLES.driven.core.dash).toBeUndefined();
	});

	it("cases every core wider than itself, so it reads on any basemap", () => {
		for (const kind of ROUTE_KINDS) {
			const { casing, core } = ROUTE_STYLES[kind];
			expect(casing.width).toBeGreaterThan(core.width);
			expect(casing.color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it("colours each core by its robot and leaves the casing fixed", () => {
		for (const kind of ROUTE_KINDS) {
			expect(routeCoreLayer(kind).paint["line-color"]).toEqual([
				"get",
				"color",
			]);
			expect(routeCasingLayer(kind).paint["line-color"]).toBe(
				ROUTE_STYLES[kind].casing.color,
			);
		}
		expect(routeCoreLayer("intent").paint["line-dasharray"]).toEqual([
			0, 2,
		]);
		expect("line-dasharray" in routeCoreLayer("planned").paint).toBe(false);
	});

	it("names every kind once in the legend", () => {
		const labels = ROUTE_KINDS.map((kind) => ROUTE_STYLES[kind].label);
		expect(new Set(labels).size).toBe(ROUTE_KINDS.length);
		expect(new Set(ROUTE_KINDS)).toEqual(
			new Set(Object.keys(ROUTE_STYLES) as RouteKind[]),
		);
	});
});
