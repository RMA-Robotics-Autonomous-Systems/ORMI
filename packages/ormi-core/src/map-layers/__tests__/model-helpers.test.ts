import { describe, expect, it } from "bun:test";

import { sanitizeAttribution } from "../attribution";
import { formatCatalogueAge } from "../catalogue-age";
import { classifyFetchFailure, isAbortError } from "../fetch-failure";

describe("sanitizeAttribution", () => {
	const LINK = (href: string, text: string) =>
		`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

	it("keeps an http(s) link, rebuilt with only safe attributes", () => {
		expect(
			sanitizeAttribution(
				'&copy; <a href="https://www.openstreetmap.org/copyright" class="x" onclick="steal()">OpenStreetMap</a> contributors',
			),
		).toBe(
			`© ${LINK("https://www.openstreetmap.org/copyright", "OpenStreetMap")} contributors`,
		);
		expect(
			sanitizeAttribution(
				"<A HREF='http://lab.example/a?b=1&amp;c=2'>Lab</A>",
			),
		).toBe(LINK("http://lab.example/a?b=1&amp;c=2", "Lab"));
	});

	it("removes an image with an event handler", () => {
		const out = sanitizeAttribution(
			'Lab <img onx=1 onerror="alert(1)" src=x>',
		);
		expect(out).toBe("Lab ");
		expect(out).not.toContain("<img");
		expect(out).not.toContain("onerror");
	});

	it("removes an iframe with srcdoc", () => {
		const out = sanitizeAttribution(
			'<iframe srcdoc="<script>alert(1)</script>"></iframe>Tiles',
		);
		expect(out).not.toContain("<iframe");
		expect(out).not.toContain("<script");
		expect(out).toContain("Tiles");
		expect(/<(?!a |\/a>)/.test(out)).toBe(false);
	});

	it("drops a javascript:, data: or relative href and keeps the text", () => {
		expect(
			sanitizeAttribution('<a href="javascript:alert(1)">Lab</a>'),
		).toBe("Lab");
		expect(
			sanitizeAttribution('<a href="  java\nscript:alert(1)">Lab</a>'),
		).toBe("Lab");
		expect(
			sanitizeAttribution('<a href="&#106;avascript:alert(1)">Lab</a>'),
		).toBe("Lab");
		expect(
			sanitizeAttribution('<a href="data:text/html,<b>x</b>">Lab</a>'),
		).not.toContain("<a");
		expect(sanitizeAttribution('<a href="/about">Lab</a>')).toBe("Lab");
		expect(sanitizeAttribution("<a>Lab</a>")).toBe("Lab");
	});

	it("reduces a link's content to text", () => {
		expect(
			sanitizeAttribution(
				'<a href="https://x.example"><img src=x onerror=alert(1)><b>X</b></a>',
			),
		).toBe(LINK("https://x.example/", "X"));
	});

	it("escapes encoded markup and stray brackets", () => {
		expect(
			sanitizeAttribution("&lt;script&gt;alert(1)&lt;/script&gt;"),
		).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(sanitizeAttribution('a < b <img src=x onerror="y"')).toBe(
			"a &lt; b &lt;img src=x onerror=&quot;y&quot;",
		);
		expect(sanitizeAttribution("")).toBe("");
	});
});

describe("formatCatalogueAge", () => {
	const NOW = new Date("2026-10-19T12:00:00.000Z");

	it("states the age", () => {
		expect(formatCatalogueAge("2026-10-16T12:00:00.000Z", NOW)).toBe(
			"Updated 3 days ago",
		);
	});

	it("names a catalogue that was never discovered", () => {
		expect(formatCatalogueAge(null, NOW)).toBe("Not discovered yet");
		expect(formatCatalogueAge("not a date", NOW)).toBe(
			"Not discovered yet",
		);
	});

	it("never reads as a time in the future", () => {
		expect(formatCatalogueAge("2026-10-19T12:05:00.000Z", NOW)).toBe(
			"Updated less than a minute ago",
		);
	});
});

describe("fetch failure helpers", () => {
	it("recognises an abort", () => {
		expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
		expect(isAbortError({ name: "AbortError" })).toBe(true);
		expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
		expect(isAbortError(null)).toBe(false);
	});

	it("probes once with no credential: answered is cors", async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const answered = (async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;
		expect(await classifyFetchFailure("http://h/tile.png", answered)).toBe(
			"cors",
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("http://h/tile.png");
		expect(calls[0]?.init).toEqual({
			mode: "no-cors",
			credentials: "omit",
		});
	});

	it("a probe that rejects is unreachable", async () => {
		const down = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(await classifyFetchFailure("http://h/tile.png", down)).toBe(
			"unreachable",
		);
	});
});
