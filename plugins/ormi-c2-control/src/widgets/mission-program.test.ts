import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	compileProgram,
	notExecutableYet,
	type ProgramIssue,
} from "./mission-program";

/**
 * Parity with the fog. Every golden fixture the fog's `test_mission_program`
 * runs is run here too (`__fixtures__/mission-graphs/`, a copy), so the editor
 * refuses exactly what the fog refuses, with the same codes on the same nodes.
 */

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__", "mission-graphs");

interface Fixture {
	name: string;
	known_agents: string[];
	graph: unknown;
	expect: {
		errors: [string, string][];
		program?: unknown;
		not_executable_yet?: [string, string][];
	};
}

function fixtures(): Fixture[] {
	return readdirSync(FIXTURE_DIR)
		.filter((file) => file.endsWith(".json"))
		.sort()
		.map(
			(file) =>
				JSON.parse(
					readFileSync(join(FIXTURE_DIR, file), "utf8"),
				) as Fixture,
		);
}

const pairs = (issues: readonly ProgramIssue[]) =>
	issues.map((issue) => [issue.code, issue.nodeId]).sort();
const sorted = (expected: readonly [string, string][]) =>
	[...expected].map((pair) => [...pair]).sort();

describe("the editor compiles a graph exactly as the fog does", () => {
	it("has the fixtures (a missing copy would pass vacuously)", () => {
		expect(fixtures().length).toBeGreaterThanOrEqual(20);
	});

	for (const fixture of fixtures()) {
		it(fixture.name, () => {
			const result = compileProgram(
				fixture.graph,
				new Set(fixture.known_agents),
			);
			expect(pairs(result.errors)).toEqual(sorted(fixture.expect.errors));
			if (fixture.expect.program !== undefined) {
				expect(result.program).toEqual(fixture.expect.program as never);
			}
			if (fixture.expect.not_executable_yet !== undefined) {
				expect(pairs(notExecutableYet(result.program))).toEqual(
					sorted(fixture.expect.not_executable_yet),
				);
			}
		});
	}

	it("says why for every error", () => {
		for (const fixture of fixtures()) {
			const result = compileProgram(
				fixture.graph,
				new Set(fixture.known_agents),
			);
			for (const issue of result.errors)
				expect(issue.message).not.toBe("");
		}
	});

	it("calls a graph that is not an object malformed", () => {
		expect(compileProgram([], new Set()).errors.map((e) => e.code)).toEqual(
			["MALFORMED"],
		);
	});
});
