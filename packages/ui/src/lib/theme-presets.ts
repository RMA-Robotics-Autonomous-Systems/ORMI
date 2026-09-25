/**
 * Theme presets: the shared type, and the CSS scoping that lets a preset be
 * previewed inside one element instead of the whole page.
 *
 * A preset (`apps/web/themes/*.css`) is tokens only, declared on `:root` and
 * `.dark`. The page applies one by injecting it verbatim. A preview card
 * applies one to its own subtree: the same declarations, with `:root`
 * rewritten to the card's attribute selector and `.dark` to that selector
 * under a dark ancestor. Everything here is pure and DOM-free.
 */

/** Display metadata for a preset, read from `apps/web/themes/themes.json`. */
export interface ThemePresetMeta {
	/** Display name, e.g. "Retro Arcade". */
	name: string;
	/** The design movement, a short label, e.g. "Memphis". */
	movement?: string;
	/** One line of UI copy: a fact, a few words. */
	description?: string;
}

/**
 * A preset as the server hands it to the client: its id (the CSS file name
 * without the extension), its metadata and its raw CSS.
 */
export interface ThemePreset extends ThemePresetMeta {
	id: string;
	css: string;
}

/** The attribute a preview container carries, set to the preset id. */
export const THEME_PREVIEW_ATTRIBUTE = "data-theme-preview";

/** Selectors that mean "the root element, light or unconditional". */
const ROOT_SELECTORS = new Set([":root", "html", ":host"]);
/** Selectors that mean "the root element in dark mode". */
const DARK_SELECTORS = new Set([
	".dark",
	":root.dark",
	".dark:root",
	"html.dark",
]);

/** At-rules whose block is recursed into and kept around the scoped rules. */
const CONDITIONAL_AT_RULES = new Set(["media", "supports"]);

/**
 * The attribute selector for one preset's preview container, with the id
 * escaped for a double-quoted CSS string.
 */
export function themePreviewSelector(id: string): string {
	const escaped = id.replace(/["\\\n\r\f]/gu, (char) =>
		char === '"' || char === "\\"
			? `\\${char}`
			: `\\${char.charCodeAt(0).toString(16)} `,
	);
	return `[${THEME_PREVIEW_ATTRIBUTE}="${escaped}"]`;
}

/** Whether one selector (not a list) targets the root element in any mode. */
export function isThemeRootSelector(selector: string): boolean {
	const normalised = selector.trim().replace(/\s+/gu, " ");
	return ROOT_SELECTORS.has(normalised) || DARK_SELECTORS.has(normalised);
}

/**
 * Whether every selector of a list targets the root element. Used to pick
 * the base tokens out of the page's stylesheets.
 */
export function isThemeRootSelectorList(selectorList: string): boolean {
	const selectors = splitTopLevel(selectorList, ",");
	return selectors.length > 0 && selectors.every(isThemeRootSelector);
}

/**
 * Map one selector list onto `scope`. `:root` becomes `scope`; `.dark`
 * becomes `:where(.dark) scope`, which keeps the specificity of both at one
 * attribute, as `:root` and `.dark` tie at one class: a later light
 * declaration still beats an earlier dark one, exactly as on the page.
 * Selectors that target anything else are dropped; `null` when none remain.
 */
function mapSelectorList(selectorList: string, scope: string): string | null {
	const mapped = new Set<string>();
	for (const raw of splitTopLevel(selectorList, ",")) {
		const selector = raw.trim().replace(/\s+/gu, " ");
		if (ROOT_SELECTORS.has(selector)) mapped.add(scope);
		else if (DARK_SELECTORS.has(selector))
			mapped.add(`:where(.dark) ${scope}`);
	}
	return mapped.size > 0 ? [...mapped].join(", ") : null;
}

/** Split on a separator at depth 0, outside strings, parens and brackets. */
function splitTopLevel(text: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let current = "";
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]!;
		if (quote !== null) {
			current += char;
			if (char === "\\") {
				current += text[index + 1] ?? "";
				index += 1;
			} else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === "(" || char === "[") depth += 1;
		else if (char === ")" || char === "]") depth -= 1;
		else if (char === separator && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim() !== "") parts.push(current);
	return parts;
}

/** One top-level item of a stylesheet. */
type CssNode =
	| { kind: "statement"; text: string }
	| { kind: "block"; prelude: string; body: string };

/** Remove comments, leaving strings (which may contain `/*`) intact. */
function stripComments(css: string): string {
	let out = "";
	let quote: string | null = null;
	for (let index = 0; index < css.length; index += 1) {
		const char = css[index]!;
		if (quote !== null) {
			out += char;
			if (char === "\\") {
				out += css[index + 1] ?? "";
				index += 1;
			} else if (char === quote) quote = null;
			continue;
		}
		if (char === "/" && css[index + 1] === "*") {
			const end = css.indexOf("*/", index + 2);
			index = end === -1 ? css.length : end + 1;
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		out += char;
	}
	return out;
}

/**
 * Split comment-free CSS into top-level statements (`@import …;`) and blocks
 * (`prelude { body }`), balancing braces outside strings. An unterminated
 * block is discarded.
 */
function readNodes(css: string): CssNode[] {
	const nodes: CssNode[] = [];
	let quote: string | null = null;
	let depth = 0;
	let prelude = "";
	let body = "";
	for (let index = 0; index < css.length; index += 1) {
		const char = css[index]!;
		if (quote !== null) {
			if (depth === 0) prelude += char;
			else body += char;
			if (char === "\\") {
				const next = css[index + 1] ?? "";
				if (depth === 0) prelude += next;
				else body += next;
				index += 1;
			} else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			if (depth === 0) prelude += char;
			else body += char;
			continue;
		}
		if (depth === 0) {
			if (char === "{") {
				depth = 1;
				body = "";
			} else if (char === ";") {
				if (prelude.trim() !== "")
					nodes.push({ kind: "statement", text: prelude.trim() });
				prelude = "";
			} else prelude += char;
			continue;
		}
		if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				nodes.push({ kind: "block", prelude: prelude.trim(), body });
				prelude = "";
				body = "";
				continue;
			}
		}
		body += char;
	}
	return nodes;
}

function scopeNodes(css: string, scope: string): string[] {
	const out: string[] = [];
	for (const node of readNodes(css)) {
		// `@import`, `@charset`, `@layer a, b;`: global by nature.
		if (node.kind === "statement") continue;

		if (node.prelude.startsWith("@")) {
			const name = /^@([\w-]+)/u.exec(node.prelude)?.[1]?.toLowerCase();
			if (name !== undefined && CONDITIONAL_AT_RULES.has(name)) {
				const inner = scopeNodes(node.body, scope);
				if (inner.length > 0)
					out.push(`${node.prelude} {\n${inner.join("\n")}\n}`);
			}
			// Everything else (`@property`, `@font-face`, `@keyframes`,
			// `@layer` blocks, `@container`…) is either global or not a token
			// declaration, and would leak out of the card if kept.
			continue;
		}

		const selector = mapSelectorList(node.prelude, scope);
		// A nested block inside a rule is CSS nesting, which a token block
		// does not use: the rule is kept with its nested blocks removed.
		const declarations = readNodes(node.body)
			.filter((child) => child.kind === "statement")
			.map((child) => (child as { text: string }).text);
		const trailing = trailingDeclaration(node.body);
		if (trailing !== null) declarations.push(trailing);
		if (selector === null || declarations.length === 0) continue;
		out.push(`${selector} {\n\t${declarations.join(";\n\t")};\n}`);
	}
	return out;
}

/** The last declaration of a body when it has no closing semicolon. */
function trailingDeclaration(body: string): string | null {
	let quote: string | null = null;
	let depth = 0;
	let lastBoundary = 0;
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index]!;
		if (quote !== null) {
			if (char === "\\") index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) lastBoundary = index + 1;
		} else if (char === ";" && depth === 0) lastBoundary = index + 1;
	}
	const rest = body.slice(lastBoundary).trim();
	return rest === "" ? null : rest;
}

/**
 * Rewrite a preset stylesheet so it applies to `scope` (a selector, usually
 * from {@link themePreviewSelector}) and its descendants instead of the page.
 *
 * - `:root`, `html`, `:host` map to `scope`; `.dark`, `:root.dark`,
 *   `html.dark` map to `:where(.dark) scope`. Selector lists are mapped
 *   entry by entry and deduplicated.
 * - Any other selector is dropped, and a rule left with none is dropped:
 *   nothing outside the scope can be reached.
 * - `@media` and `@supports` blocks are kept, with their rules scoped.
 * - Every other at-rule (`@property`, `@font-face`, `@keyframes`, `@import`,
 *   `@layer`, `@container`…) is dropped: those are global, and the page
 *   already carries the ones globals.css declares.
 * - Comments are removed; declaration text, `!important` included, is kept
 *   verbatim.
 */
export function scopeThemeCss(css: string, scope: string): string {
	const scoped = scopeNodes(stripComments(css), scope);
	return scoped.length > 0 ? `${scoped.join("\n")}\n` : "";
}
