import { describe, expect, test } from "bun:test";

import { navCurrent } from "../nav-current";

describe("navCurrent", () => {
	test("the entry's own page is the current page", () => {
		expect(navCurrent("/", { href: "/" })).toBe("page");
		expect(navCurrent("/plugins", { href: "/plugins" })).toBe("page");
		expect(navCurrent("/plugins/", { href: "/plugins" })).toBe("page");
	});

	test("home is not current on every page", () => {
		expect(navCurrent("/plugins", { href: "/" })).toBeUndefined();
		expect(navCurrent("/dashboard", { href: "/" })).toBeUndefined();
	});

	test("a route under the section marks the entry, not as the page", () => {
		const docs = { href: "/docs", section: "/docs/" };
		expect(navCurrent("/docs", docs)).toBe("page");
		expect(navCurrent("/docs/home", docs)).toBe("true");
		const dashboard = { href: "/dashboard", section: "/dashboard/" };
		expect(navCurrent("/dashboard", dashboard)).toBe("page");
		expect(navCurrent("/dashboard/ws/abc", dashboard)).toBe("true");
	});

	test("a prefix that is not a path segment does not match", () => {
		const docs = { href: "/docs", section: "/docs/" };
		expect(navCurrent("/docsearch", docs)).toBeUndefined();
	});

	test("a menu trigger with only a section", () => {
		const apps = { section: "/plugin-pages/" };
		expect(navCurrent("/plugin-pages/c2", apps)).toBe("true");
		expect(navCurrent("/plugin-pages/c2/mission", apps)).toBe("true");
		expect(navCurrent("/plugin-pages", apps)).toBeUndefined();
		expect(navCurrent("/plugins", apps)).toBeUndefined();
	});

	test("no path, no current entry", () => {
		expect(navCurrent(null, { href: "/" })).toBeUndefined();
		expect(navCurrent("", { href: "/" })).toBeUndefined();
	});
});
