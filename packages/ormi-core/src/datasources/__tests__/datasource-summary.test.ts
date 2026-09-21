/**
 * The allowlist that decides what a stored settings blob may show on screen.
 *
 * Every rule here fails silently in production if it rots: a key that should
 * have been skipped is a leak, and a key that should have been shown is a row
 * an operator cannot tell apart from the one above it.
 */

import { describe, test, expect } from "bun:test";

import { resolveDatasourceSummary } from "../components/known-datasource-list";
import type {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";

/**
 * Build a definition carrying only the allowlist.
 *
 * @param summaryProps - The declared allowlist, or `undefined` to declare none.
 * @returns A definition with only what the helper reads.
 */
function makeDefinition(summaryProps?: string[]): DatasourceDefinition {
	return {
		id: "test-source",
		name: "Test",
		description: "Test",
		summaryProps,
		schema: {},
		data: { id: "", title: "", enable: true },
		Provider: () => null,
	} as unknown as DatasourceDefinition;
}

/**
 * Build a settings blob.
 *
 * @param extra - Plugin-owned fields beside the base settings.
 * @returns Settings carrying `extra`.
 */
function makeSettings(
	extra: Record<string, unknown> = {},
): DatasourceProviderSettings {
	return {
		id: "instance-1",
		title: "Rover",
		enable: true,
		...extra,
	} as DatasourceProviderSettings;
}

describe("resolveDatasourceSummary", () => {
	test("declares nothing, shows nothing — there is no fallback", () => {
		const settings = makeSettings({ url: "ws://robot:8765" });

		expect(resolveDatasourceSummary(settings, makeDefinition())).toEqual(
			[],
		);
	});

	test("an empty allowlist shows nothing", () => {
		const settings = makeSettings({ url: "ws://robot:8765" });

		expect(resolveDatasourceSummary(settings, makeDefinition([]))).toEqual(
			[],
		);
	});

	test("a declared string is returned", () => {
		const settings = makeSettings({ url: "ws://robot:8765" });

		expect(
			resolveDatasourceSummary(settings, makeDefinition(["url"])),
		).toEqual(["ws://robot:8765"]);
	});

	test("a declared number is returned as its own text", () => {
		const settings = makeSettings({ port: 9090 });

		expect(
			resolveDatasourceSummary(settings, makeDefinition(["port"])),
		).toEqual(["9090"]);
	});

	test("an undeclared key is never returned, whatever it holds", () => {
		const settings = makeSettings({
			url: "ws://robot:8765",
			token: "sentinel-token",
		});

		expect(
			resolveDatasourceSummary(settings, makeDefinition(["url"])),
		).toEqual(["ws://robot:8765"]);
	});

	test("a declared key of the wrong shape is skipped", () => {
		const settings = makeSettings({
			flag: true,
			nested: { url: "ws://robot:8765" },
			list: ["a", "b"],
			nothing: null,
			missing: undefined,
		});

		expect(
			resolveDatasourceSummary(
				settings,
				makeDefinition([
					"flag",
					"nested",
					"list",
					"nothing",
					"missing",
				]),
			),
		).toEqual([]);
	});

	test("a key the stored settings do not carry is skipped", () => {
		const settings = makeSettings({ url: "ws://robot:8765" });

		expect(
			resolveDatasourceSummary(
				settings,
				makeDefinition(["url", "addedLater"]),
			),
		).toEqual(["ws://robot:8765"]);
	});

	test("an empty or whitespace-only string renders nothing, not a blank line", () => {
		const settings = makeSettings({ url: "", bagName: "   " });

		expect(
			resolveDatasourceSummary(
				settings,
				makeDefinition(["url", "bagName"]),
			),
		).toEqual([]);
	});

	test("a non-finite number is skipped — NaN names no remote", () => {
		const settings = makeSettings({ port: Number.NaN, other: Infinity });

		expect(
			resolveDatasourceSummary(
				settings,
				makeDefinition(["port", "other"]),
			),
		).toEqual([]);
	});

	test("order follows the declared array, not the settings key order", () => {
		const settings = makeSettings({ b: "second", a: "first" });

		expect(
			resolveDatasourceSummary(settings, makeDefinition(["a", "b"])),
		).toEqual(["first", "second"]);
		expect(
			resolveDatasourceSummary(settings, makeDefinition(["b", "a"])),
		).toEqual(["second", "first"]);
	});

	test("values come back verbatim — shortening is the view's job", () => {
		const long = `http://${"a".repeat(300)}.internal:5001/path?x=1`;
		const settings = makeSettings({ url: long });

		expect(
			resolveDatasourceSummary(settings, makeDefinition(["url"])),
		).toEqual([long]);
	});
});
