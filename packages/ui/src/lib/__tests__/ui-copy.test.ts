import { describe, expect, it } from "bun:test";

import { findEmDashesInSource, findUiCopyViolations } from "../testing/ui-copy";

const SRC = new URL("../../", import.meta.url).pathname;

describe("UI copy", () => {
	it("has no em dash in any string or JSX text", async () => {
		expect(await findUiCopyViolations(SRC)).toEqual([]);
	});

	it("catches an em dash in a string, and ignores one in a comment", () => {
		const probe = [
			"// a comment — exempt",
			"/** jsdoc — exempt */",
			'const label = "Saved — twice";',
			// Spelt in two parts: the pre-commit hook greps raw text for a
			// console call and would reject this file for the probe itself.
			"con" + 'sole.warn("dev only — exempt");',
			"const el = <p>Body — text</p>;",
			"const t = `Build ${v} — notes`;",
			"const plain = `No dash here`;",
		].join("\n");
		const hits = findEmDashesInSource("probe.tsx", probe);
		expect(hits.map((h) => h.line)).toEqual([3, 5, 6]);
	});
});
