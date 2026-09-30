/**
 * Tests for the dashboard frame: the gutter geometry and the empty border
 * bars.
 *
 * Both halves of this contract live where no type checker looks. The
 * splitter overlap is a CSS literal that has to equal a number in the
 * FlexLayout model, which CSS cannot read back. If they drift, nothing
 * throws: every splitter drag lands the panel a few pixels from where it was
 * dropped, and the gutters stop being even. The empty-border auto-hide is a
 * default that saved layouts pick up only because the serializer does not
 * persist it, so a change there silently brings the 32px strip back for every
 * workspace saved before it.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Model, type IJsonModel } from "flexlayout-react";

import {
	deserializeFlexLayoutModel,
	getDefaultFlexLayoutConfig,
	serializeFlexLayoutModel,
} from "../layout-serializer";

const CSS = readFileSync(
	join(import.meta.dir, "..", "flex-layout-theme.css"),
	"utf8",
);

const GLOBALS = readFileSync(
	join(
		import.meta.dir,
		"..",
		"..",
		"..",
		"..",
		"..",
		"..",
		"ui",
		"src",
		"styles",
		"globals.css",
	),
	"utf8",
);

/** The declaration block of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string | undefined {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1];
}

describe("splitters overlay the seam", () => {
	test("each splitter is pulled back by exactly the model's splitter size", () => {
		const size = getDefaultFlexLayoutConfig().global?.splitterSize;
		expect(size).toBe(4);

		// Pulled back over the container BEFORE it (margin-left / margin-top),
		// which is the one placement FlexLayout's drag maths agrees with.
		const horz = ruleBody(
			CSS,
			".flexlayout__row > .flexlayout__splitter_horz",
		);
		const vert = ruleBody(
			CSS,
			".flexlayout__row > .flexlayout__splitter_vert",
		);
		expect(horz).toContain(`margin-left: -${size}px;`);
		expect(vert).toContain(`margin-top: -${size}px;`);
	});

	test("a saved layout keeps the splitter size the overlap assumes", () => {
		// The serializer writes `splitterSize || 4`; a saved layout that
		// somehow lost it must not come back with FlexLayout's own default.
		const model = deserializeFlexLayoutModel({
			global: {},
			borders: [],
			layout: { type: "row", children: [] },
		} as IJsonModel);
		expect(model.getSplitterSize()).toBe(4);
	});
});

describe("gutter geometry", () => {
	test("the gutter is split in two halves: around the frame and around each panel", () => {
		expect(ruleBody(CSS, ".ormi-frame")).toContain(
			"padding: calc(var(--frame-gutter) / 2);",
		);
		expect(ruleBody(CSS, ".flexlayout__tabset")).toContain(
			"margin: calc(var(--frame-gutter) / 2);",
		);
	});

	test("the inner half is never padding on the tabset container", () => {
		// Containers are flex-basis:0 items sized by weight; padding on one
		// sits outside its share and every splitter drag drifts.
		expect(ruleBody(CSS, ".flexlayout__tabset_container")).toBeUndefined();
	});

	test("the tab strip inset is the one --radius-inner subtracts", () => {
		// One token, read in both places: a literal in either lets a preset
		// that squares the strip (`--tabstrip-inset: 0`) leave the tab
		// corners cut for an inset that is no longer there, or the reverse.
		const strip = ruleBody(CSS, ".flexlayout__tabset_tabbar_outer_top");
		expect(strip).toContain(
			"padding: var(--tabstrip-inset) var(--tabstrip-inset) 0;",
		);
		expect(ruleBody(CSS, ".flexlayout__tabset_header")).toContain(
			"padding: var(--tabstrip-inset);",
		);
		expect(GLOBALS).toMatch(
			/--radius-inner:\s*max\(\s*0px,\s*calc\(\s*var\(--panel-radius\) - var\(--panel-border-width\) -\s*var\(--tabstrip-inset\)\s*\)\s*\)/,
		);
	});

	test("the tab strip inset defaults to 3px and is registered as a length", () => {
		// The stock look is a 3px inset; a registered `<length>` lets a
		// preset write a bare `0`.
		expect(GLOBALS).toMatch(/\n\t--tabstrip-inset: 3px;/);
		expect(GLOBALS).toMatch(
			/@property --tabstrip-inset \{\s*syntax: "<length>";\s*inherits: true;\s*initial-value: 3px;\s*\}/,
		);
	});

	test("no literal 3px strip inset is left in the theme", () => {
		for (const selector of [
			".flexlayout__tabset_header",
			".flexlayout__tabset_tabbar_outer_top",
		]) {
			expect(ruleBody(CSS, selector) ?? "").not.toContain("3px");
		}
	});

	test("the theme reads the frame tokens instead of redeclaring them", () => {
		// A declaration of a root token on .flexlayout__layout would shadow
		// the value a preset writes on :root.
		const bridge = ruleBody(CSS, ".flexlayout__layout") ?? "";
		for (const token of [
			"--panel-background",
			"--panel-border-color",
			"--panel-border-width",
			"--panel-radius",
			"--border-width",
			"--frame-gutter",
			"--tabstrip-inset",
			"--font-body",
			"--font-label",
			"--label-weight",
			"--tab-title-color",
			"--tab-title-active-color",
		]) {
			expect(bridge).not.toMatch(new RegExp(`\\s${token}:`));
		}
	});
});

describe("tab titles", () => {
	test("FlexLayout's own face is the body face, not Roboto", () => {
		// flexlayout-react's stylesheet declares `--font-family: Roboto, …`
		// and reads it on the tabset, so an unset `--font-label` inherited
		// Roboto rather than the app's face.
		expect(ruleBody(CSS, ".flexlayout__layout")).toContain(
			"--font-family: var(--font-body);",
		);
	});

	test("titles read the label and tab-title tokens", () => {
		const content = ruleBody(CSS, ".flexlayout__tab_button_content") ?? "";
		expect(content).toContain("font-family: var(--font-label);");
		expect(content).toContain("font-weight: var(--label-weight);");
		expect(ruleBody(CSS, ".flexlayout__tab_button")).toContain(
			"color: var(--tab-title-color);",
		);
		expect(ruleBody(CSS, ".flexlayout__tab_button--selected")).toContain(
			"color: var(--tab-title-active-color);",
		);
	});

	test("the tab-title colours default to the stock look", () => {
		expect(GLOBALS).toMatch(
			/\n\t--tab-title-color: var\(--muted-foreground\);/,
		);
		expect(GLOBALS).toMatch(
			/\n\t--tab-title-active-color: var\(--foreground\);/,
		);
		// Unset: the title keeps the tab button's own weight.
		expect(GLOBALS).toMatch(/\n\t--label-weight: initial;/);
	});
});

describe("empty border bars", () => {
	test("new layouts hide an empty border", () => {
		const model = Model.fromJson(getDefaultFlexLayoutConfig());
		for (const border of model.getBorderSet().getBorders()) {
			expect(border.isAutoHide()).toBe(true);
		}
	});

	test("a layout saved before auto-hide existed loads with it, without migration", () => {
		const legacy = {
			global: {
				enableEdgeDock: true,
				splitterSize: 4,
				splitterExtra: 4,
				tabSetMinHeight: 100,
				tabSetMinWidth: 100,
				borderMinSize: 100,
			},
			borders: [
				{ type: "border", location: "left", children: [] },
				{ type: "border", location: "right", children: [] },
			],
			layout: {
				type: "row",
				children: [{ type: "tabset", children: [] }],
			},
		} as IJsonModel;

		const model = deserializeFlexLayoutModel(legacy);
		const borders = model.getBorderSet().getBorders();
		expect(borders).toHaveLength(2);
		for (const border of borders) {
			expect(border.isAutoHide()).toBe(true);
		}
	});

	test("auto-hide is a default, not something a save persists", () => {
		const saved = serializeFlexLayoutModel(
			Model.fromJson(getDefaultFlexLayoutConfig()),
		) as { global: Record<string, unknown> };
		expect(saved.global).not.toHaveProperty("borderEnableAutoHide");
	});
});
