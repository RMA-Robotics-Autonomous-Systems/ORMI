/**
 * Single-topic display widgets gate their body on datasource health
 * (AGENTS.md "Widget offline gating"), so an offline robot reads as offline
 * rather than as a level instrument pointing north.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDICATORS = [
	"indicators/heading/heading.tsx",
	"indicators/airspeed/airspeed.tsx",
	"indicators/level/level.tsx",
];

describe("flight indicators", () => {
	for (const file of INDICATORS) {
		test(`${file} gates its body with DatasourceGate`, () => {
			const source = readFileSync(join(import.meta.dir, file), "utf8");
			expect(source).toMatch(/<DatasourceGate\s+health=\{health\}/);
		});
	}
});
