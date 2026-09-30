import { describe, expect, it } from "bun:test";

import { findUiCopyViolations } from "@workspace/ui/lib/testing/ui-copy";

/**
 * UI copy carries no em dash (AGENTS.md, "UI copy states facts, never
 * reasons"). The scan is shared (`@workspace/ui/lib/testing/ui-copy`): every
 * string literal and JSX text, comments, `console.*` arguments and test files
 * exempt. `content/` is documentation, not UI, and is not scanned.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const SOURCE_DIRS = ["app", "components", "config", "hooks", "lib", "server"];

describe("UI copy", () => {
	for (const dir of SOURCE_DIRS) {
		it(`has no em dash in any string or JSX text under ${dir}/`, async () => {
			expect(await findUiCopyViolations(ROOT + dir)).toEqual([]);
		});
	}
});
