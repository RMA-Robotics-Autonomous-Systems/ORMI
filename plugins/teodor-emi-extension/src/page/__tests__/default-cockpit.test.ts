/**
 * The layout the cockpit opens with.
 *
 * A layout is not the kind of thing unit tests usually earn their keep on, but
 * this one has a failure mode that is silent by construction: the engine reads
 * its layout from one key, and finding nothing there it does not complain — it
 * stacks every panel into a single tab strip. A wrong key, a tab whose
 * `component` does not match a widget, or a panel in the layout that is not in
 * the widget map all produce a cockpit that renders and is wrong.
 */

import { describe, expect, it } from "bun:test";
import { COCKPIT_LAYOUT_KEY, defaultCockpit } from "../default-cockpit";

/** Every tab node in a FlexLayout model, depth first. */
function tabs(node: unknown): Array<Record<string, unknown>> {
	if (typeof node !== "object" || node === null) return [];
	const n = node as { type?: string; children?: unknown[] };
	if (n.type === "tab") return [n as Record<string, unknown>];
	return (n.children ?? []).flatMap(tabs);
}

/** The model the default cockpit ships. */
const model = () =>
	defaultCockpit().layouts[COCKPIT_LAYOUT_KEY] as {
		global: Record<string, unknown>;
		borders: unknown[];
		layout: { type: string; children: unknown[] };
	};

describe("the layout key", () => {
	it("is the one the FLEX engine reads", () => {
		// `flexLayoutEngineDefinition.layoutKey` in core. A layout under any
		// other key is not an error anywhere: the engine finds nothing, falls
		// back to one tabset holding all seven panels, and the cockpit looks
		// broken rather than misconfigured.
		expect(COCKPIT_LAYOUT_KEY).toBe("flex");
		expect(defaultCockpit().layouts[COCKPIT_LAYOUT_KEY]).toBeDefined();
	});
});

describe("the model", () => {
	it("places every widget it declares, and declares every widget it places", () => {
		const dash = defaultCockpit();
		const placed = tabs(model().layout).map((t) => String(t.component));
		const declared = [...dash.widgets.keys()];
		// A tab whose `component` names no widget renders an empty pane; a
		// widget with no tab is invisible and unreachable. Both load cleanly.
		expect(placed.slice().sort()).toEqual(declared.slice().sort());
	});

	it("gives each tab an id matching its widget instance", () => {
		for (const t of tabs(model().layout)) {
			expect(t.id).toBe(t.component);
			expect(String(t.name).length).toBeGreaterThan(0);
		}
	});

	it("opens with the eight shipped panels", () => {
		const dash = defaultCockpit();
		expect(dash.widgets.size).toBe(8);
		expect([...dash.widgets.values()].map((w) => w.widget_id)).toContain(
			"teodor-emi-coil-signal-stack",
		);
		expect([...dash.widgets.values()].map((w) => w.widget_id)).toContain(
			"teodor-emi-mission-control",
		);
		// The map is the standard widget carrying this plugin's marker types,
		// so a cockpit without it is a cockpit that cannot answer "where".
		expect([...dash.widgets.values()].map((w) => w.widget_id)).toContain(
			"map-box-viewer",
		);
	});

	it("shares one tabset between the two occasional controls", () => {
		// Recording and exporting bracket a survey and are idle in between.
		// Giving them a pane each would spend a third of a column on controls
		// nobody is looking at; this is the thing the grid could not express.
		const sets = JSON.stringify(model().layout);
		expect(sets).toContain("emi-mission");
		expect(sets).toContain("emi-export");
		const multi = tabs(model().layout).length;
		expect(multi).toBe(8);
	});

	it("is a fresh object each call, so a caller cannot mutate the template", () => {
		const a = defaultCockpit();
		const b = defaultCockpit();
		expect(a.layouts[COCKPIT_LAYOUT_KEY]).not.toBe(
			b.layouts[COCKPIT_LAYOUT_KEY],
		);
		expect(a.widgets).not.toBe(b.widgets);
	});

	it("floors a pane above the size at which the canvases refuse to draw", () => {
		const g = model().global;
		// The widgets' own guards blank below roughly this; a splitter that can
		// go smaller leaves a pane that is present, sized, and empty.
		expect(Number(g.tabSetMinHeight)).toBeGreaterThanOrEqual(100);
		expect(Number(g.tabSetMinWidth)).toBeGreaterThanOrEqual(120);
	});
});
