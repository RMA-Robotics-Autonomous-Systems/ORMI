"use client";

/**
 * Theme colours for code that does not paint through CSS: canvas 2D, WebGL,
 * Three.js, SVG attributes, chart libraries.
 *
 * The app themes itself entirely through CSS custom properties (`--background`,
 * `--foreground`, `--card`, `--border`, `--primary`, `--chart-1`…, declared in
 * `packages/ui/src/styles/globals.css`). DOM content follows them for free; a
 * canvas does not, because its colours are strings handed to a drawing API once.
 * Such code must read the variables at runtime and read them again when the
 * theme changes, and the theme changes through **two independent sources**:
 *
 * 1. **Light/dark.** `next-themes` toggles the `dark` class (and a
 *    `color-scheme` style) on `<html>`.
 * 2. **Theme presets.** The theme configurator injects its preset as
 *    `<style id="dynamic-theme-preset">` in `<head>`, then replaces its text or
 *    removes it (`applyThemePreset`, `combined/themes/theme-configurator.tsx`).
 *    This one changes no React state anywhere, so a hook keyed on
 *    `useTheme().resolvedTheme` never hears about it.
 *
 * One module-level `MutationObserver` pair watches both and bumps a version
 * counter; hooks read that counter through `useSyncExternalStore`.
 *
 * Output is `#rrggbb` (opaque) or `rgba(r, g, b, a)`, never the raw variable
 * value. The variables are written in `oklch(...)` (and a preset may use
 * `color-mix(...)`); canvas 2D accepts those in current browsers, but Three.js
 * `Color`, most chart libraries and older SVG consumers do not, and a colour
 * they cannot parse turns into black or a console warning rather than an error.
 * Conversion paints the value onto a shared 1×1 canvas and reads the pixel back,
 * so whatever the browser understands as a colour comes out in sRGB (out-of-gamut
 * values are clipped by the browser, as they are on screen). Three.js accepts the
 * `rgba(...)` form but ignores its alpha.
 */

import { useMemo, useSyncExternalStore } from "react";

/** The `id` of the `<style>` element the theme configurator injects. */
const DYNAMIC_THEME_STYLE_ID = "dynamic-theme-preset";

/** Attributes on `<html>` that a theme switch writes. */
const ROOT_ATTRIBUTES = ["class", "style", "data-theme"];

/**
 * Snapshot served on the server and during hydration. Client versions start
 * at 1, so `0` always means "no DOM has been read".
 */
const SERVER_VERSION = 0;

let version = 1;
const listeners = new Set<() => void>();
let observers: MutationObserver[] | null = null;

/* ------------------------------------------------------------------------ */
/* Change detection                                                         */
/* ------------------------------------------------------------------------ */

/** Duck-typed node shape: tests and exotic realms have no `instanceof` to lean on. */
type NodeLike = {
	nodeName?: string;
	id?: string;
	parentNode?: NodeLike | null;
	getAttribute?: (name: string) => string | null;
	addEventListener?: (
		type: string,
		cb: () => void,
		options?: { once?: boolean },
	) => void;
};

function isPresetStyle(node: NodeLike | null | undefined): boolean {
	return (
		!!node &&
		node.nodeName === "STYLE" &&
		node.id === DYNAMIC_THEME_STYLE_ID
	);
}

function isStylesheetLink(node: NodeLike): boolean {
	if (node.nodeName !== "LINK") return false;
	const rel = node.getAttribute?.("rel") ?? "";
	return rel.toLowerCase().split(/\s+/).includes("stylesheet");
}

function isStyleNode(node: NodeLike): boolean {
	return node.nodeName === "STYLE" || isStylesheetLink(node);
}

function bump(): void {
	version += 1;
	for (const listener of Array.from(listeners)) listener();
}

/**
 * Whether one mutation in `<head>` can change the value of a theme variable.
 *
 * Text edits count only on the preset element: libraries rewrite their own
 * `<style>` text often (scroll locks, toasts), and none of them carry theme
 * variables. Adding or removing any stylesheet counts, because a stylesheet can
 * declare anything.
 */
function isThemeHeadMutation(record: MutationRecord): boolean {
	const target = record.target as unknown as NodeLike;
	if (record.type === "characterData")
		return isPresetStyle(target.parentNode);
	if (record.type !== "childList") return false;
	if (isPresetStyle(target)) return true;
	const changed = [
		...Array.from(record.addedNodes),
		...Array.from(record.removedNodes),
	] as unknown as NodeLike[];
	return changed.some(isStyleNode);
}

/**
 * A `<link rel=stylesheet>` changes nothing until it has loaded, so an added
 * one bumps again on `load`.
 */
function watchLinkLoads(record: MutationRecord): void {
	if (record.type !== "childList") return;
	for (const node of Array.from(record.addedNodes) as unknown as NodeLike[]) {
		if (isStylesheetLink(node)) {
			node.addEventListener?.("load", bump, { once: true });
		}
	}
}

function install(): void {
	if (
		typeof document === "undefined" ||
		typeof MutationObserver === "undefined"
	) {
		return;
	}
	const root = new MutationObserver(() => bump());
	root.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ROOT_ATTRIBUTES,
	});
	const head = new MutationObserver((records) => {
		let relevant = false;
		for (const record of records) {
			watchLinkLoads(record);
			if (isThemeHeadMutation(record)) relevant = true;
		}
		if (relevant) bump();
	});
	if (document.head) {
		head.observe(document.head, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}
	observers = [root, head];
	// Nothing was watching until now, so the theme may have changed since the
	// last version was handed out (and between a first render and this
	// subscribe). Bumping makes every snapshot taken before this point stale.
	version += 1;
}

function uninstall(): void {
	for (const observer of observers ?? []) observer.disconnect();
	observers = null;
}

/**
 * Subscribe to theme changes, from either source: the light/dark class on
 * `<html>` or a theme preset `<style>` injected, rewritten or removed in
 * `<head>` (see the module comment).
 *
 * The observers are installed on the first subscription and disconnected when
 * the last one leaves. On the server (no `document`) this is a no-op.
 *
 * @param callback - Called after each theme change, once per batch of mutations.
 * @returns Unsubscribe.
 */
export function subscribeThemeChange(callback: () => void): () => void {
	listeners.add(callback);
	if (listeners.size === 1 && observers === null) install();
	return () => {
		listeners.delete(callback);
		if (listeners.size === 0) uninstall();
	};
}

/**
 * The current theme version: a counter that increases on every theme change
 * seen while at least one subscriber is attached. Only equality is meaningful.
 *
 * @returns The version; `useSyncExternalStore`'s client snapshot.
 */
export function getThemeVersion(): number {
	return version;
}

function getServerThemeVersion(): number {
	return SERVER_VERSION;
}

/* ------------------------------------------------------------------------ */
/* Colour conversion                                                        */
/* ------------------------------------------------------------------------ */

type Paint2D = Pick<
	CanvasRenderingContext2D,
	"fillStyle" | "clearRect" | "fillRect" | "getImageData"
>;

const COLOR_CACHE_LIMIT = 256;
const colorCache = new Map<string, string>();
let paintContext: Paint2D | null = null;

function getPaintContext(): Paint2D | null {
	if (paintContext) return paintContext;
	const options: CanvasRenderingContext2DSettings = {
		willReadFrequently: true,
	};
	try {
		if (typeof OffscreenCanvas !== "undefined") {
			paintContext = new OffscreenCanvas(1, 1).getContext("2d", options);
		} else if (typeof document !== "undefined") {
			const canvas = document.createElement("canvas");
			canvas.width = 1;
			canvas.height = 1;
			paintContext = canvas.getContext("2d", options);
		}
	} catch {
		paintContext = null;
	}
	return paintContext;
}

function hex2(n: number): string {
	return n.toString(16).padStart(2, "0");
}

/**
 * Paint `value` and read it back, or `null` when it is not a colour. A canvas
 * silently ignores an unparseable `fillStyle`, so validity is tested by setting
 * it over two different colours: a real colour reads back the same both times.
 */
function paint(ctx: Paint2D, value: string): string | null {
	ctx.fillStyle = "#000000";
	ctx.fillStyle = value;
	const overBlack = ctx.fillStyle;
	ctx.fillStyle = "#ffffff";
	ctx.fillStyle = value;
	if (ctx.fillStyle !== overBlack) return null;
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillRect(0, 0, 1, 1);
	const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
	if (a === 255) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
	const alpha = Math.round((a / 255) * 1000) / 1000;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Convert any CSS colour (`oklch(...)`, `color-mix(...)`, hex, `rgb(...)`,
 * named…) to `#rrggbb`, or `rgba(r, g, b, a)` when it is not opaque, which
 * canvas 2D, Three.js `Color`, SVG attributes and chart libraries all accept.
 *
 * Results are cached by input. A value that is not a colour comes back trimmed
 * but otherwise unchanged; so does everything when no canvas 2D context exists
 * (server, test runners), and those fallbacks are not cached, so a later call
 * with a canvas available converts properly.
 *
 * @param value - A CSS colour string, e.g. a custom property's value.
 * @returns The canonical colour, `""` for an empty input, or the trimmed input.
 */
export function normalizeCssColor(value: string): string {
	const raw = value.trim();
	if (!raw) return "";
	const cached = colorCache.get(raw);
	if (cached !== undefined) return cached;
	const ctx = getPaintContext();
	if (!ctx) return raw;
	const resolved = paint(ctx, raw) ?? raw;
	if (colorCache.size >= COLOR_CACHE_LIMIT) colorCache.clear();
	colorCache.set(raw, resolved);
	return resolved;
}

/**
 * Read a theme colour now, converted for non-CSS consumers.
 *
 * Reads `getComputedStyle(el ?? <html>)`, so passing an element inside a themed
 * container (a dialog, a preview) picks up that container's variables. Reads the
 * DOM on every call; in a React component prefer {@link useThemeColors}, and in a
 * render loop re-read only when {@link useThemeVersion} changes.
 *
 * Output is `#rrggbb` / `rgba(...)` rather than the `oklch(...)` the stylesheet
 * declares, because Three.js `Color` and most chart libraries cannot parse oklch
 * (see {@link normalizeCssColor}).
 *
 * @param name - The custom property, with its dashes: `"--card"`.
 * @param el - Element to resolve against; defaults to `<html>`.
 * @returns The colour, or `""` when the variable is unset or there is no DOM.
 */
export function resolveThemeColor(name: string, el?: Element | null): string {
	if (
		typeof document === "undefined" ||
		typeof getComputedStyle !== "function"
	) {
		return "";
	}
	const target = el ?? document.documentElement;
	if (!target) return "";
	return normalizeCssColor(getComputedStyle(target).getPropertyValue(name));
}

/* ------------------------------------------------------------------------ */
/* Hooks                                                                    */
/* ------------------------------------------------------------------------ */

type RecordEntry = { version: number; record: Record<string, string> };

/** Resolved records per element, then per serialised token set. */
const recordCache = new WeakMap<object, Map<string, RecordEntry>>();
/** The all-empty record per token set, served when no DOM may be read. */
const emptyRecords = new Map<string, Record<string, string>>();

function sameRecord(
	a: Record<string, string>,
	b: Record<string, string>,
): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => a[key] === b[key]);
}

/**
 * Resolve a serialised token set against an element at a theme version.
 *
 * The record is shared by every caller asking for the same tokens on the same
 * element, and keeps its identity across a version bump that changed none of
 * its values (an unrelated stylesheet loading), so effects keyed on it do not
 * re-run for nothing.
 */
function resolveRecord(
	tokensKey: string,
	el: Element | null,
	themeVersion: number,
): Record<string, string> {
	const entries = JSON.parse(tokensKey) as [string, string][];
	const target =
		el ??
		(typeof document === "undefined" ? null : document.documentElement);
	if (themeVersion === SERVER_VERSION || !target) {
		let empty = emptyRecords.get(tokensKey);
		if (!empty) {
			empty = Object.fromEntries(entries.map(([key]) => [key, ""]));
			emptyRecords.set(tokensKey, empty);
		}
		return empty;
	}
	let byTokens = recordCache.get(target);
	if (!byTokens) {
		byTokens = new Map();
		recordCache.set(target, byTokens);
	}
	const cached = byTokens.get(tokensKey);
	if (cached?.version === themeVersion) return cached.record;
	const fresh = Object.fromEntries(
		entries.map(([key, name]) => [key, resolveThemeColor(name, target)]),
	);
	const record =
		cached && sameRecord(cached.record, fresh) ? cached.record : fresh;
	byTokens.set(tokensKey, { version: themeVersion, record });
	return record;
}

/**
 * The theme version, re-rendering the caller on every theme change (light/dark
 * or preset, see the module comment).
 *
 * For code that resolves colours imperatively, e.g. inside a render loop:
 * re-read with {@link resolveThemeColor} when this number changes. It is `0` on
 * the server and during hydration, when the DOM must not be read.
 *
 * @returns The current theme version.
 */
export function useThemeVersion(): number {
	return useSyncExternalStore(
		subscribeThemeChange,
		getThemeVersion,
		getServerThemeVersion,
	);
}

/**
 * Theme colours for canvas / WebGL / Three.js / chart code, re-resolved when the
 * theme changes from either source (the light/dark class on `<html>` or an
 * injected theme preset).
 *
 * @example
 * const colors = useThemeColors({ bg: "--card", text: "--foreground", grid: "--border" });
 * // colors.bg === "#ffffff", colors.grid === "#e5e5e5", …
 *
 * Values are `#rrggbb` / `rgba(...)`, never `oklch(...)`: see
 * {@link normalizeCssColor}. A value is `""` when the variable is unset, and
 * every value is `""` on the server and during hydration (the DOM cannot be read
 * there; the real values arrive on the next render), so apply a fallback where
 * one matters: `colors.bg || "#ffffff"`.
 *
 * The returned object keeps its identity until a colour in it changes, so it is
 * safe as an effect or memo dependency; `tokens` may be an inline literal (it is
 * compared by content, not identity).
 *
 * @param tokens - Map of result key to CSS custom property name.
 * @param el - Element to resolve against, for a themed container; defaults to `<html>`.
 * @returns The resolved colours, keyed like `tokens`.
 */
export function useThemeColors<T extends Record<string, string>>(
	tokens: T,
	el?: Element | null,
): { [K in keyof T]: string } {
	const themeVersion = useThemeVersion();
	const tokensKey = JSON.stringify(Object.entries(tokens));
	const element = el ?? null;
	return useMemo(
		() =>
			resolveRecord(tokensKey, element, themeVersion) as {
				[K in keyof T]: string;
			},
		[tokensKey, element, themeVersion],
	);
}
