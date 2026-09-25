import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import {
	getThemeVersion,
	normalizeCssColor,
	resolveThemeColor,
	subscribeThemeChange,
	useThemeColors,
} from "../use-theme-colors";

/*
 * The repo has no DOM test environment (no jsdom / happy-dom), and Bun has no
 * canvas. The module only duck-types what it touches, so the DOM surface it
 * uses is stood in for here: `document`, `MutationObserver`, `getComputedStyle`
 * and `OffscreenCanvas` are installed on `globalThis` per test. The canvas
 * stand-in parses hex and rgb()/rgba() the way a browser canvas does (ignores
 * anything it cannot parse), which is enough to exercise the paint-and-read-back
 * path; the oklch -> sRGB conversion itself is the browser's and is not
 * reproduced here.
 */

const g = globalThis as unknown as Record<string, unknown>;

/* ----------------------------- DOM stand-ins ----------------------------- */

type FakeNode = {
	nodeName: string;
	id?: string;
	parentNode?: FakeNode | null;
	getAttribute?: (name: string) => string | null;
	addEventListener?: (type: string, cb: () => void) => void;
};

const html: FakeNode = { nodeName: "HTML" };
const head: FakeNode = { nodeName: "HEAD" };

class FakeMutationObserver {
	static instances: FakeMutationObserver[] = [];
	target: FakeNode | null = null;
	options: MutationObserverInit | null = null;
	connected = false;
	constructor(
		readonly callback: (records: unknown[], observer: unknown) => void,
	) {
		FakeMutationObserver.instances.push(this);
	}
	observe(target: FakeNode, options: MutationObserverInit) {
		this.target = target;
		this.options = options;
		this.connected = true;
	}
	disconnect() {
		this.connected = false;
	}
}

/** Deliver mutation records to the live observer watching `target`. */
function fire(target: FakeNode, records: Record<string, unknown>[]) {
	const observer = FakeMutationObserver.instances.find(
		(o) => o.connected && o.target === target,
	);
	if (!observer) throw new Error(`nothing observes ${target.nodeName}`);
	observer.callback(
		records.map((r) => ({ addedNodes: [], removedNodes: [], ...r })),
		observer,
	);
}

function presetStyle(): FakeNode {
	return { nodeName: "STYLE", id: "dynamic-theme-preset" };
}

function installDom(vars: Record<string, string> = {}) {
	g.document = {
		documentElement: html,
		head,
		createElement: () => {
			throw new Error("no canvas element in tests");
		},
	};
	g.MutationObserver = FakeMutationObserver;
	g.getComputedStyle = () => ({
		getPropertyValue: (name: string) => vars[name] ?? "",
	});
}

function removeDom() {
	delete g.document;
	delete g.MutationObserver;
	delete g.getComputedStyle;
	FakeMutationObserver.instances = [];
}

/* ---------------------------- Canvas stand-in ---------------------------- */

type Rgba = [number, number, number, number];

/** Parse the subset of CSS colour syntax the stand-in understands. */
function parseColor(value: string): Rgba | null {
	const v = value.trim().toLowerCase();
	const hex = /^#([0-9a-f]{6})$/.exec(v);
	if (hex) {
		const n = parseInt(hex[1]!, 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
	}
	const fn = /^rgba?\(([^)]+)\)$/.exec(v);
	if (fn) {
		const parts = fn[1]!
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number);
		if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
		const [r, gr, b, a = 1] = parts as [number, number, number, number?];
		return [r, gr, b, Math.round(a * 255)];
	}
	return null;
}

const canvasStats = { contexts: 0, reads: 0 };

class FakeContext {
	private style: Rgba = [0, 0, 0, 255];
	private pixel: Rgba = [0, 0, 0, 0];
	get fillStyle(): string {
		return this.style.join(",");
	}
	set fillStyle(value: string) {
		const parsed = parseColor(value);
		if (parsed) this.style = parsed; // a browser ignores what it cannot parse
	}
	clearRect() {
		this.pixel = [0, 0, 0, 0];
	}
	fillRect() {
		this.pixel = [...this.style];
	}
	getImageData() {
		canvasStats.reads += 1;
		return { data: Uint8ClampedArray.from(this.pixel) };
	}
}

class FakeOffscreenCanvas {
	getContext() {
		canvasStats.contexts += 1;
		return new FakeContext();
	}
}

/* --------------------------------- Tests --------------------------------- */

afterEach(removeDom);

describe("without a DOM (server)", () => {
	it("resolves every colour to an empty string", () => {
		expect(resolveThemeColor("--card")).toBe("");
	});

	it("subscribes without installing anything", () => {
		const before = getThemeVersion();
		const unsubscribe = subscribeThemeChange(() => {});
		expect(FakeMutationObserver.instances).toHaveLength(0);
		expect(getThemeVersion()).toBe(before);
		unsubscribe();
	});

	it("renders the hook with empty strings from the server snapshot", () => {
		function Probe() {
			const colors = useThemeColors({
				bg: "--card",
				text: "--foreground",
			});
			return createElement("pre", null, JSON.stringify(colors));
		}
		const markup = renderToString(createElement(Probe));
		expect(markup).toBe(
			`<pre>${JSON.stringify({ bg: "", text: "" }).replaceAll('"', "&quot;")}</pre>`,
		);
	});
});

describe("colour conversion without a canvas", () => {
	it("returns the trimmed raw value (the fallback path)", () => {
		expect(normalizeCssColor("  oklch(0.5 0.1 200) ")).toBe(
			"oklch(0.5 0.1 200)",
		);
		expect(normalizeCssColor("#123456")).toBe("#123456");
		expect(normalizeCssColor("   ")).toBe("");
	});
});

describe("colour conversion through the canvas", () => {
	beforeAll(() => {
		g.OffscreenCanvas = FakeOffscreenCanvas;
	});

	it("converts an opaque hex colour to #rrggbb", () => {
		expect(normalizeCssColor("#1A2b3C")).toBe("#1a2b3c");
	});

	it("converts rgb() to #rrggbb and a translucent rgba() to rgba()", () => {
		expect(normalizeCssColor("rgb(255, 128, 0)")).toBe("#ff8000");
		expect(normalizeCssColor("rgba(10, 20, 30, 0.5)")).toBe(
			"rgba(10, 20, 30, 0.502)",
		);
	});

	it("does not paint again for a value it has converted before", () => {
		normalizeCssColor("#abcdef");
		const reads = canvasStats.reads;
		expect(normalizeCssColor("#abcdef")).toBe("#abcdef");
		expect(normalizeCssColor(" #abcdef ")).toBe("#abcdef");
		expect(canvasStats.reads).toBe(reads);
		expect(canvasStats.contexts).toBe(1);
	});

	it("returns a value that is not a colour unchanged", () => {
		expect(normalizeCssColor("system-ui, sans-serif")).toBe(
			"system-ui, sans-serif",
		);
	});

	it("resolves a custom property through getComputedStyle", () => {
		installDom({ "--card": " rgb(1, 2, 3)", "--unset": "" });
		expect(resolveThemeColor("--card")).toBe("#010203");
		expect(resolveThemeColor("--unset")).toBe("");
		expect(resolveThemeColor("--missing")).toBe("");
	});
});

describe("theme change detection", () => {
	/** Subscribe and return a counter of notifications plus the unsubscribe. */
	function watch() {
		const calls = { n: 0 };
		const unsubscribe = subscribeThemeChange(() => {
			calls.n += 1;
		});
		return { calls, unsubscribe };
	}

	it("observes <html> attributes and the <head> subtree, and invalidates on install", () => {
		installDom();
		const before = getThemeVersion();
		const { unsubscribe } = watch();
		expect(getThemeVersion()).toBeGreaterThan(before);
		const [root, headObserver] = FakeMutationObserver.instances;
		expect(root!.target).toBe(html);
		expect(root!.options).toEqual({
			attributes: true,
			attributeFilter: ["class", "style", "data-theme"],
		});
		expect(headObserver!.target).toBe(head);
		expect(headObserver!.options).toEqual({
			childList: true,
			subtree: true,
			characterData: true,
		});
		unsubscribe();
	});

	it("bumps when the dark class changes on <html>", () => {
		installDom();
		const { calls, unsubscribe } = watch();
		const before = getThemeVersion();
		fire(html, [
			{ type: "attributes", attributeName: "class", target: html },
		]);
		expect(getThemeVersion()).toBe(before + 1);
		expect(calls.n).toBe(1);
		unsubscribe();
	});

	it("bumps when the preset <style> is added, rewritten and removed", () => {
		installDom();
		const { calls, unsubscribe } = watch();
		const style = presetStyle();
		const text: FakeNode = { nodeName: "#text", parentNode: style };

		fire(head, [{ type: "childList", target: head, addedNodes: [style] }]);
		expect(calls.n).toBe(1);

		// `textContent = css` replaces the child text node.
		fire(head, [
			{
				type: "childList",
				target: style,
				addedNodes: [text],
				removedNodes: [{ nodeName: "#text" }],
			},
		]);
		expect(calls.n).toBe(2);

		// An in-place edit of the text node.
		fire(head, [{ type: "characterData", target: text }]);
		expect(calls.n).toBe(3);

		fire(head, [
			{ type: "childList", target: head, removedNodes: [style] },
		]);
		expect(calls.n).toBe(4);
		unsubscribe();
	});

	it("bumps once per batch, however many records it holds", () => {
		installDom();
		const { calls, unsubscribe } = watch();
		const style = presetStyle();
		fire(head, [
			{ type: "childList", target: head, addedNodes: [style] },
			{
				type: "childList",
				target: style,
				addedNodes: [{ nodeName: "#text" }],
			},
		]);
		expect(calls.n).toBe(1);
		unsubscribe();
	});

	it("bumps when a stylesheet link is added, and again when it loads", () => {
		installDom();
		const { calls, unsubscribe } = watch();
		let onLoad: (() => void) | null = null;
		const link: FakeNode = {
			nodeName: "LINK",
			getAttribute: (name) => (name === "rel" ? "stylesheet" : null),
			addEventListener: (type, cb) => {
				if (type === "load") onLoad = cb;
			},
		};
		fire(head, [{ type: "childList", target: head, addedNodes: [link] }]);
		expect(calls.n).toBe(1);
		(onLoad as (() => void) | null)?.();
		expect(calls.n).toBe(2);
		unsubscribe();
	});

	it("ignores mutations that cannot change a theme variable", () => {
		installDom();
		const { calls, unsubscribe } = watch();
		const before = getThemeVersion();
		const otherStyle: FakeNode = { nodeName: "STYLE", id: "scroll-lock" };
		const title: FakeNode = { nodeName: "TITLE" };
		fire(head, [
			// Meta, script and preload links come and go on navigation.
			{
				type: "childList",
				target: head,
				addedNodes: [
					{ nodeName: "META" },
					{ nodeName: "SCRIPT" },
					{
						nodeName: "LINK",
						getAttribute: (name: string) =>
							name === "rel" ? "preload" : null,
					},
				],
			},
			// Another library rewriting its own <style> text.
			{
				type: "childList",
				target: otherStyle,
				addedNodes: [{ nodeName: "#text", parentNode: otherStyle }],
			},
			{
				type: "characterData",
				target: { nodeName: "#text", parentNode: otherStyle },
			},
			// The page title changing.
			{
				type: "characterData",
				target: { nodeName: "#text", parentNode: title },
			},
		]);
		expect(calls.n).toBe(0);
		expect(getThemeVersion()).toBe(before);
		unsubscribe();
	});

	it("disconnects when the last subscriber leaves", () => {
		installDom();
		const a = watch();
		const b = watch();
		expect(FakeMutationObserver.instances).toHaveLength(2);
		a.unsubscribe();
		expect(FakeMutationObserver.instances.every((o) => o.connected)).toBe(
			true,
		);
		b.unsubscribe();
		expect(FakeMutationObserver.instances.some((o) => o.connected)).toBe(
			false,
		);
	});
});
