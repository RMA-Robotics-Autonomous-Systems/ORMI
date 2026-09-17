/**
 * Tests for the flex dashboard's overlay drawers.
 *
 * The left/right border panes are made to float over the canvas purely in
 * CSS, by targeting the class names `flexlayout-react` emits. That coupling
 * is the fragile part and it fails *silently*: if an upgrade renames a class
 * or the rules are dropped during a theme edit, nothing throws — the drawers
 * simply go back to shoving every widget sideways, which is exactly the
 * defect this is meant to remove. So the contract is pinned from both ends:
 * the class names against the library's own exported enum, and the rules
 * against the stylesheet.
 *
 * The literals below are written out rather than derived from `CLASSES`, so
 * a renamed class fails here instead of quietly agreeing with itself.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLASSES } from "flexlayout-react";

const CSS = readFileSync(
	join(import.meta.dir, "..", "flex-layout-theme.css"),
	"utf8",
);

/** The rules that float the drawers, isolated from the rest of the theme. */
const OVERLAY_SECTION = CSS.slice(CSS.indexOf("Overlay drawers (left / right"));

describe("flexlayout class contract", () => {
	test("the classes the overlay targets still carry their expected names", () => {
		// Widened to plain strings: comparing against the enum's own member
		// type would make every assertion tautologically true.
		const emitted: Record<string, string> = CLASSES;

		expect(emitted.FLEXLAYOUT__LAYOUT_BORDER_CONTAINER_INNER).toBe(
			"flexlayout__layout_border_container_inner",
		);
		expect(emitted.FLEXLAYOUT__LAYOUT_MAIN).toBe("flexlayout__layout_main");
		expect(emitted.FLEXLAYOUT__BORDER_TAB_CONTENTS).toBe(
			"flexlayout__border_tab_contents",
		);
		expect(emitted.FLEXLAYOUT__SPLITTER_BORDER).toBe(
			"flexlayout__splitter_border",
		);
		expect(emitted.FLEXLAYOUT__TAB_BORDER_).toBe("flexlayout__tab_border_");
	});
});

describe("overlay drawer rules", () => {
	test("the drawer row is a grid scoped to the row holding the centre", () => {
		expect(OVERLAY_SECTION).toContain(
			".flexlayout__layout_border_container_inner:has(> .flexlayout__layout_main)",
		);
		expect(OVERLAY_SECTION).toContain("display: grid;");
	});

	test("the centre area is taken out of flow so an open drawer cannot resize it", () => {
		// Without this the panes are flex items again and the centre reflows,
		// which is the whole defect.
		const centre = OVERLAY_SECTION.match(
			/> \.flexlayout__layout_main \{([^}]*)\}/,
		)?.[1];
		expect(centre).toBeDefined();
		expect(centre).toContain("position: absolute;");
		expect(centre).toContain("inset: 0;");
	});

	test("both panes and both splitters are placed in the drawer row", () => {
		// Left pane, its splitter, the right splitter, the right pane — the
		// splitters carry no size of their own here, they inherit the pane's
		// track, which is what keeps the drag handle on the pane's inner edge.
		for (const column of [
			"grid-column: 1;",
			"grid-column: 2;",
			"grid-column: 4;",
			"grid-column: 5;",
		]) {
			expect(OVERLAY_SECTION).toContain(column);
		}
		expect(OVERLAY_SECTION).toContain("+ .flexlayout__splitter_border {");
		expect(OVERLAY_SECTION).toContain(".flexlayout__splitter_border:has(");
	});

	test("the drawer stacks above widgets, below flexlayout's drag overlays", () => {
		const zIndexes = [...OVERLAY_SECTION.matchAll(/z-index:\s*(\d+)/g)].map(
			(m) => Number(m[1]),
		);
		expect(zIndexes.length).toBeGreaterThan(0);

		// FlexLayout's own scale: tab overlay 20, off-screen tab stamps 100,
		// drag rect / outline / edge marker / popup menu 1000. A drawer that
		// climbs above a drag overlay hides the drop indicator it is being
		// dragged onto; one that sinks below a widget is not a drawer.
		for (const z of zIndexes) {
			expect(z).toBeGreaterThan(20);
			expect(z).toBeLessThan(100);
		}
	});

	test("the drawer content is drawn above its own surface", () => {
		// The pane's surface and the tab that fills it are separate elements
		// at the same rect; the tab has to win or the drawer renders blank.
		const surface = Number(
			OVERLAY_SECTION.match(
				/\.flexlayout__border_tab_contents:first-child \{[^}]*z-index:\s*(\d+)/,
			)?.[1],
		);
		const content = Number(
			OVERLAY_SECTION.match(
				/\.flexlayout__tab_border_left,\s*\.flexlayout__tab_border_right \{[^}]*z-index:\s*(\d+)/,
			)?.[1],
		);
		expect(surface).toBeGreaterThan(0);
		expect(content).toBeGreaterThan(surface);
	});
});
