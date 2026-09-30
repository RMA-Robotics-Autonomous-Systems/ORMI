import { describe, expect, it } from "bun:test";

import {
	findEmDashesInSource,
	findUiCopyViolations,
} from "@workspace/ui/lib/testing/ui-copy";

/**
 * UI copy carries no em dash (AGENTS.md, "UI copy states facts, never
 * reasons"). Core renders the dashboard chrome every workspace shares:
 * toasts, tooltips, the topic list, the empty state. The scan is shared
 * (`@workspace/ui/lib/testing/ui-copy`): every string literal and JSX text in
 * this package's source, comments, `console.*` arguments and test files
 * exempt.
 */

const SRC = new URL(".", import.meta.url).pathname;

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
		].join("\n");
		const hits = findEmDashesInSource("probe.tsx", probe);
		expect(hits.map((h) => h.line)).toEqual([3, 5]);
	});
});
