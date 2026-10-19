/**
 * Namespace-agnostic helpers over a parsed XML document.
 *
 * OGC capabilities documents mix default and prefixed namespaces (`ows:`,
 * `xlink:`), and servers differ in which prefix they bind. Every lookup here
 * matches on `localName`, never on a qualified name, so `ows:Identifier` and
 * `Identifier` under another prefix are the same element.
 *
 * Only the DOM Level 2 surface is used (`childNodes`, `localName`,
 * `textContent`, `getAttribute*`), so the same code runs on the browser's
 * `DOMParser` and on `@xmldom/xmldom` in tests.
 */

/** Minimal DOM element surface the parsers rely on. */
export interface XmlElement {
	readonly localName: string | null;
	readonly nodeType: number;
	readonly childNodes: ArrayLike<XmlElement>;
	readonly textContent: string | null;
	getAttribute(name: string): string | null;
	getAttributeNS?(namespace: string | null, localName: string): string | null;
}

/** Minimal DOM document surface the parsers rely on. */
export interface XmlDocument {
	readonly documentElement: XmlElement | null;
	getElementsByTagName?(name: string): ArrayLike<unknown>;
}

/** Parses XML text into a document. The browser default is `DOMParser`. */
export type XmlParser = (text: string) => XmlDocument;

const ELEMENT_NODE = 1;
const XLINK_NS = "http://www.w3.org/1999/xlink";

/** Thrown when a response body is not a well-formed XML document. */
export class XmlParseError extends Error {
	constructor(message = "Not a well-formed XML document") {
		super(message);
		this.name = "XmlParseError";
	}
}

/**
 * Parses with the browser's `DOMParser`. A malformed document does not throw
 * there: it yields a document holding a `<parsererror>`, which is detected
 * and turned into an {@link XmlParseError}.
 */
export const browserXmlParser: XmlParser = (text) => {
	const Parser = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
	if (!Parser) throw new XmlParseError("No XML parser available");
	return new Parser().parseFromString(
		text,
		"application/xml",
	) as unknown as XmlDocument;
};

/**
 * Parses `text` and returns its root element, or throws {@link XmlParseError}
 * for anything that is not a well-formed document.
 */
export function parseXmlRoot(
	text: string,
	parse: XmlParser = browserXmlParser,
): XmlElement {
	let doc: XmlDocument;
	try {
		doc = parse(text);
	} catch (err) {
		throw err instanceof XmlParseError ? err : new XmlParseError();
	}
	const root = doc.documentElement;
	if (!root || !root.localName) throw new XmlParseError();
	if (
		root.localName === "parsererror" ||
		doc.getElementsByTagName?.("parsererror").length
	) {
		throw new XmlParseError();
	}
	return root;
}

/** Direct element children of `el`, optionally limited to one local name. */
export function children(el: XmlElement, localName?: string): XmlElement[] {
	const out: XmlElement[] = [];
	const nodes = el.childNodes;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node || node.nodeType !== ELEMENT_NODE) continue;
		if (localName === undefined || node.localName === localName)
			out.push(node);
	}
	return out;
}

/** First direct child with this local name. */
export function child(
	el: XmlElement,
	localName: string,
): XmlElement | undefined {
	return children(el, localName)[0];
}

/** Follows a path of local names through first-match children. */
export function path(
	el: XmlElement,
	...names: string[]
): XmlElement | undefined {
	let cur: XmlElement | undefined = el;
	for (const name of names) {
		if (!cur) return undefined;
		cur = child(cur, name);
	}
	return cur;
}

/** Trimmed text of the first child with this local name, or `undefined` when absent or blank. */
export function childText(
	el: XmlElement,
	localName: string,
): string | undefined {
	const text = child(el, localName)?.textContent?.trim();
	return text ? text : undefined;
}

/** Trimmed texts of every direct child with this local name. */
export function childTexts(el: XmlElement, localName: string): string[] {
	return children(el, localName)
		.map((c) => c.textContent?.trim() ?? "")
		.filter((t) => t.length > 0);
}

/** `xlink:href` of an element, whatever prefix the document bound to the xlink namespace. */
export function xlinkHref(el: XmlElement): string | undefined {
	const value =
		el.getAttributeNS?.(XLINK_NS, "href") ?? el.getAttribute("xlink:href");
	return value ? value : undefined;
}

/** Thrown when a well-formed document is not the capabilities it was asked for. */
export class NotCapabilitiesError extends Error {
	constructor(rootName: string) {
		super(`Unexpected document root <${rootName}>`);
		this.name = "NotCapabilitiesError";
	}
}

/** Parses a finite number, or `undefined`. */
export function toNumber(text: string | undefined | null): number | undefined {
	if (text === undefined || text === null || text.trim() === "")
		return undefined;
	const n = Number(text);
	return Number.isFinite(n) ? n : undefined;
}
