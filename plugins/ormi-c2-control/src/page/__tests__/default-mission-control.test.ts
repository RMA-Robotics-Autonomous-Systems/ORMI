/**
 * The layout the mission-control page opens with.
 *
 * A layout is not the kind of thing unit tests usually earn their keep on, but
 * this one has a failure mode that is silent by construction: the engine reads
 * its layout from one key, and finding nothing there it does not complain — it
 * stacks every panel into a single tab strip. A wrong key, a tab whose
 * `component` does not match a widget, or a panel in the layout that is not in
 * the widget map all produce a surface that renders and is wrong.
 */

import { describe, expect, it } from "bun:test";
import {
	defaultMissionControl,
	MISSION_CONTROL_LAYOUT_KEY,
} from "../default-mission-control";

/** Every tab node in a FlexLayout model, depth first. */
function tabs(node: unknown): Array<Record<string, unknown>> {
	if (typeof node !== "object" || node === null) return [];
	const n = node as { type?: string; children?: unknown[] };
	if (n.type === "tab") return [n as Record<string, unknown>];
	return (n.children ?? []).flatMap(tabs);
}

/** Every tabset node in a FlexLayout model, depth first. */
function tabsets(node: unknown): Array<{ children: unknown[] }> {
	if (typeof node !== "object" || node === null) return [];
	const n = node as { type?: string; children?: unknown[] };
	if (n.type === "tabset") return [n as { children: unknown[] }];
	return (n.children ?? []).flatMap(tabsets);
}

/** The model the default surface ships. */
const model = () =>
	defaultMissionControl().layouts[MISSION_CONTROL_LAYOUT_KEY] as {
		global: Record<string, unknown>;
		borders: unknown[];
		layout: { type: string; children: unknown[] };
	};

describe("the layout key", () => {
	it("is the one the FLEX engine reads", () => {
		// `flexLayoutEngineDefinition.layoutKey` in core. A layout under any
		// other key is not an error anywhere: the engine finds nothing, falls
		// back to one tabset holding all seven panels, and the surface looks
		// broken rather than misconfigured.
		//
		// This compares a literal against a literal, deliberately: core does
		// not export `flexLayoutEngineDefinition`, so the real constant cannot
		// be imported without a core change. The literal IS the contract — if
		// the FLEX engine ever renames its layout key, this test keeps passing
		// and the page silently degrades, so re-check it by hand then.
		expect(MISSION_CONTROL_LAYOUT_KEY).toBe("flex");
		expect(
			defaultMissionControl().layouts[MISSION_CONTROL_LAYOUT_KEY],
		).toBeDefined();
	});
});

describe("the model", () => {
	it("places every widget it declares, and declares every widget it places", () => {
		const dash = defaultMissionControl();
		// By tab **id**: that is what the engine resolves a tab to a widget by
		// (`useWidgetFactory` reads `node.getId()`). A tab whose id names no
		// widget renders an empty pane; a widget with no tab is invisible and
		// unreachable. Both load cleanly.
		const placed = tabs(model().layout).map((t) => String(t.id));
		const declared = [...dash.widgets.keys()];
		expect(placed.slice().sort()).toEqual(declared.slice().sort());
	});

	it("keeps each tab's component equal to its id", () => {
		// FlexLayout states its own factory contract in terms of `component`,
		// so the two identifiers are kept equal; a tab where they disagree is a
		// pane that renders and is wrong.
		for (const t of tabs(model().layout)) {
			expect(t.component).toBe(t.id);
			expect(String(t.name).length).toBeGreaterThan(0);
		}
	});

	it("opens with the seven mission panels", () => {
		const dash = defaultMissionControl();
		expect(dash.widgets.size).toBe(7);
		const types = [...dash.widgets.values()].map((w) => w.widget_id);
		expect(types.slice().sort()).toEqual(
			[
				"c2-fleet-status-widget",
				"c2-mission-browser-widget",
				"c2-mission-control-panel-widget",
				"c2-mission-editor-widget",
				"c2-mission-feedback-widget",
				"c2-mission-map-widget",
				"c2-swarm-log-widget",
			].sort(),
		);
	});

	it("gives the map the whole left edge", () => {
		// The reason this arrangement was picked: the map is the one panel that
		// is better at every size, and it is the first child of the root row —
		// so it spans the full height rather than sharing a column with a
		// stack. A later edit that nests it under something else would still
		// render, and would quietly take that away.
		const [first, ...rest] = model().layout.children as Array<{
			type: string;
			weight: number;
			children?: Array<{ id?: string }>;
		}>;
		expect(first?.type).toBe("tabset");
		expect(first?.children?.map((c) => c.id)).toEqual(["c2-map"]);
		// And it is the widest thing at the top level.
		for (const sibling of rest) {
			expect(first!.weight).toBeGreaterThanOrEqual(sibling.weight);
		}
	});

	it("keeps the lifecycle panel out of every shared tabset", () => {
		// It holds Pause and Stop. A control that halts a vehicle must not be
		// one click behind a tab strip, and a tab that has to be found first is
		// exactly that.
		const shared = tabsets(model().layout).filter(
			(set) => set.children.length > 1,
		);
		for (const set of shared) {
			const ids = set.children.map((c) =>
				String((c as { id?: unknown }).id),
			);
			expect(ids).not.toContain("c2-control");
		}
	});

	it("shares one tabset between the editor and the log", () => {
		// Authoring happens before a mission runs and the log is read once
		// something has gone wrong; neither is watched continuously, so a pane
		// each would spend a third of the centre column on an idle panel.
		const shared = tabsets(model().layout)
			.filter((set) => set.children.length > 1)
			.map((set) =>
				set.children
					.map((c) => String((c as { id?: unknown }).id))
					.sort(),
			);
		expect(shared).toContainEqual(["c2-editor", "c2-log"]);
	});

	it("seeds each panel with its definition's own defaults, not just a title", () => {
		// A widget reads `widget.settings`, never the schema: a panel seeded
		// with only a title gets `undefined` for everything else. The mission
		// map is the one that shows — a missing `mapUrl` is an undefined tile
		// template, and the map renders blank.
		const dash = defaultMissionControl();
		const map = [...dash.widgets.values()].find(
			(w) => w.widget_id === "c2-mission-map-widget",
		);
		expect(typeof map?.settings.mapUrl).toBe("string");
		expect(String(map?.settings.mapUrl).length).toBeGreaterThan(0);
		for (const widget of dash.widgets.values()) {
			// Every C2 widget schema `required`s `title`, and the widget host
			// refuses settings that miss a required property with no default —
			// it renders an unsupported-configuration card instead of the panel.
			expect(typeof widget.settings.title).toBe("string");
			expect(widget.settings.title).toBe(widget.title);
		}
	});

	it("seeds no datasource", () => {
		// The plugin cannot know this deployment's C2 host. A pre-filled
		// instance either nags forever as pristine or claims to be configured
		// while pointing at localhost; an empty list states the truth, and the
		// page carries the Datasources dialog to fix it.
		expect(defaultMissionControl().datasources.size).toBe(0);
	});

	it("is a fresh object each call, so a caller cannot mutate the template", () => {
		const a = defaultMissionControl();
		const b = defaultMissionControl();
		expect(a.layouts[MISSION_CONTROL_LAYOUT_KEY]).not.toBe(
			b.layouts[MISSION_CONTROL_LAYOUT_KEY],
		);
		expect(a.widgets).not.toBe(b.widgets);
		// And the settings must not alias the registry's definition objects:
		// a definition is shared by every instance of that widget type, so a
		// write through here would move the defaults for the whole session.
		const map = (d: ReturnType<typeof defaultMissionControl>) =>
			[...d.widgets.values()].find(
				(w) => w.widget_id === "c2-mission-map-widget",
			)!.settings;
		expect(map(a)).not.toBe(map(b));
	});

	it("floors a pane above the size at which the panels stop being usable", () => {
		const g = model().global;
		expect(Number(g.tabSetMinHeight)).toBeGreaterThanOrEqual(120);
		expect(Number(g.tabSetMinWidth)).toBeGreaterThanOrEqual(160);
	});
});
