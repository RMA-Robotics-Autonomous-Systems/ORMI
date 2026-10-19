import { readFileSync } from "node:fs";

import { DOMParser } from "@xmldom/xmldom";
import type { DiscoveryContext } from "@workspace/ormi-core/map-layers/model";

/**
 * Test support. The repo has no DOM test environment, so the browser's
 * `DOMParser` is provided by `@xmldom/xmldom`, which the parsers' DOM Level 2
 * surface is written against.
 */
export function installDomParser(): void {
	/** Throws on errors, as a malformed document must not parse, instead of logging them. */
	class QuietDomParser {
		parseFromString(text: string, mimeType: string) {
			return new DOMParser({
				onError: (level: string, message: string) => {
					if (level !== "warning") throw new Error(message);
				},
			}).parseFromString(text, mimeType);
		}
	}
	(globalThis as { DOMParser?: unknown }).DOMParser = QuietDomParser;
}

/** A fixture captured from the GeoServer 2.27.1 on :8095 (trimmed). */
export function fixture(name: string): string {
	return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

/** A response, or a function that throws to simulate a rejected fetch. */
export type Route = Response | (() => Response) | "reject";

/**
 * A `DiscoveryContext` whose fetch answers by URL substring. Unmatched URLs
 * answer 404. Records every URL asked for.
 */
export function routedContext(
	routes: Record<string, Route>,
): DiscoveryContext & { requested: string[] } {
	const requested: string[] = [];
	return {
		requested,
		signal: new AbortController().signal,
		fetch: async (url: string) => {
			requested.push(url);
			for (const [needle, route] of Object.entries(routes)) {
				if (!url.includes(needle)) continue;
				if (route === "reject") throw new TypeError("Failed to fetch");
				return typeof route === "function" ? route() : route.clone();
			}
			return new Response("not found", { status: 404 });
		},
	};
}

/** Replaces `globalThis.fetch` (the opaque CORS probe) for the duration of `run`. */
export async function withProbe<T>(
	answers: boolean,
	run: () => Promise<T>,
): Promise<T> {
	const original = globalThis.fetch;
	globalThis.fetch = (async () => {
		if (!answers) throw new TypeError("Failed to fetch");
		return new Response(null, { status: 200 });
	}) as unknown as typeof fetch;
	try {
		return await run();
	} finally {
		globalThis.fetch = original;
	}
}

/** An XML response. */
export function xml(text: string, status = 200): Response {
	return new Response(text, {
		status,
		headers: { "content-type": "application/xml" },
	});
}
