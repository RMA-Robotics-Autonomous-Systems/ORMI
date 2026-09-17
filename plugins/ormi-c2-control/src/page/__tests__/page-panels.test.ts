/**
 * The page's panel contribution.
 *
 * This guards the one defect the surface cannot survive: with no datasource
 * configured, core's own `WIDGETS_LIST` filter at `Number.MAX_SAFE_INTEGER`
 * returns `[]`, every panel on the page resolves to the widget-not-found
 * placeholder, and the FLEX engine's factory caches that element per box id — so
 * the tiles stay puzzle icons until the page is reloaded, even once the operator
 * adds the C2 source. This filter runs after that gate; these tests are what say
 * it is idempotent rather than a second source of duplicates.
 */

import { describe, expect, it } from "bun:test";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";

import { widgetsExport } from "../../export";
import { ensurePagePanels, PAGE_WIDGETS_FILTER_ID } from "../page-panels";
import { defaultMissionControl } from "../default-mission-control";

/** Every panel id this plugin registers. */
const allIds = () => widgetsExport([]).map((widget) => widget.id);

describe("ensurePagePanels", () => {
	it("restores every panel when the datasource gate emptied the list", () => {
		const restored = ensurePagePanels([]);
		expect(restored.map((w) => w.id).sort()).toEqual(allIds().sort());
	});

	it("adds nothing when the gate already let them through", () => {
		const gated = widgetsExport([]);
		const before = gated.length;
		const after = ensurePagePanels(gated);
		expect(after.length).toBe(before);
		// One entry per id: a second copy would put two identical rows in the
		// rail and make `getDefinition` resolution order-dependent.
		expect(new Set(after.map((w) => w.id)).size).toBe(after.length);
	});

	it("leaves other plugins' widgets untouched and in place", () => {
		const foreign = { id: "some-other-widget" } as WidgetDefinition;
		const merged = ensurePagePanels([foreign]);
		expect(merged[0]).toBe(foreign);
		expect(merged.map((w) => w.id)).toContain("some-other-widget");
	});

	it("covers every panel the shipped arrangement places", () => {
		// The arrangement and the contribution are two lists; a panel placed but
		// not contributed is exactly the unsupported tile this exists to prevent.
		const placed = new Set(
			[...defaultMissionControl().widgets.values()].map(
				(w) => w.widget_id,
			),
		);
		const contributed = new Set(ensurePagePanels([]).map((w) => w.id));
		for (const id of placed) expect(contributed.has(id)).toBe(true);
	});

	it("keeps a filter id distinct from the plugin's own registrations", () => {
		// Registering under an id the plugin class already uses would replace
		// that filter instead of adding this one.
		expect(PAGE_WIDGETS_FILTER_ID).not.toBe("c2-control-widgets");
		expect(PAGE_WIDGETS_FILTER_ID).not.toBe("c2-control-widget-gating");
	});
});
