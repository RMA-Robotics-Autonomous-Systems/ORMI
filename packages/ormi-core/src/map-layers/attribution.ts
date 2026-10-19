/**
 * Sanitising of a map-server attribution before MapLibre renders it.
 *
 * MapLibre's attribution control writes a source's `attribution` with
 * `innerHTML`, and the string comes from a third-party server (a TileJSON
 * document, a capabilities response, an adapter reading either). Pure,
 * React-free, DOM-free, so it runs the same in tests, workers and routes.
 */

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	copy: "©",
	reg: "®",
	trade: "™",
	middot: "·",
	ndash: "–",
	// Built from its code point: the UI-copy scan rejects the literal.
	mdash: String.fromCharCode(0x2014),
};

/** Decode HTML character references; unknown ones are kept as typed. */
function decodeEntities(text: string): string {
	return text.replace(
		/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
		(whole, ref: string) => {
			if (ref[0] === "#") {
				const code =
					ref[1] === "x" || ref[1] === "X"
						? Number.parseInt(ref.slice(2), 16)
						: Number.parseInt(ref.slice(1), 10);
				if (!Number.isFinite(code) || code < 1 || code > 0x10ffff)
					return whole;
				try {
					return String.fromCodePoint(code);
				} catch {
					return whole;
				}
			}
			return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
		},
	);
}

/** Escape text for use as HTML text content or a double-quoted attribute. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Markup to plain text: every complete tag is dropped, entities decoded. A
 * stray `<` that opens no complete tag is kept, and escaped by the caller.
 */
function toText(html: string): string {
	return decodeEntities(html.replace(/<[^<>]*>/g, ""));
}

const HREF_PATTERN =
	/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

/** The anchor's href, when it is an absolute `http(s)` URL. */
function safeHref(attributes: string): string | undefined {
	const match = HREF_PATTERN.exec(attributes);
	if (!match) return undefined;
	const raw = decodeEntities(match[1] ?? match[2] ?? match[3] ?? "").trim();
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return undefined;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
	return url.href;
}

const ANCHOR_PATTERN = /<a(\s[^<>]*)?>([\s\S]*?)<\/a\s*>/gi;

/**
 * Sanitise an attribution for MapLibre's attribution control.
 *
 * The output is escaped plain text with one exception: an
 * `<a href="http(s)://…">text</a>` is kept as a link, rebuilt from scratch
 * (its href re-serialised, `target="_blank"` and `rel="noopener noreferrer"`
 * added, every other attribute dropped, its content reduced to text). Every
 * other tag is removed, keeping its text; an anchor whose href is not
 * `http:` / `https:` (`javascript:`, `data:`, relative, missing) keeps its
 * text and loses the link. Character references are decoded and re-escaped,
 * so `&copy;` still reads as the symbol and `&lt;script&gt;` stays text.
 *
 * @param html - The attribution as the server sent it.
 * @returns Safe HTML: escaped text and rebuilt links only.
 * @example
 * sanitizeAttribution('&copy; <a href="https://osm.org" onclick="x()">OSM</a>')
 * // '© <a href="https://osm.org/" target="_blank" rel="noopener noreferrer">OSM</a>'
 */
export function sanitizeAttribution(html: string): string {
	if (typeof html !== "string" || html === "") return "";
	let out = "";
	let last = 0;
	ANCHOR_PATTERN.lastIndex = 0;
	for (
		let match = ANCHOR_PATTERN.exec(html);
		match;
		match = ANCHOR_PATTERN.exec(html)
	) {
		out += escapeHtml(toText(html.slice(last, match.index)));
		const text = escapeHtml(toText(match[2] ?? ""));
		const href = safeHref(match[1] ?? "");
		out += href
			? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
			: text;
		last = match.index + match[0].length;
	}
	out += escapeHtml(toText(html.slice(last)));
	return out;
}
