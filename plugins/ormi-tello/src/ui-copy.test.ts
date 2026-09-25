import { expect, it } from "bun:test";

import { findUiCopyViolations } from "@workspace/ui/lib/testing/ui-copy";

/**
 * UI copy carries no em dash (AGENTS.md, "UI copy states facts, never
 * reasons"). The scan is shared (`@workspace/ui/lib/testing/ui-copy`): every
 * string literal and JSX text in this package's source, comments, `console.*`
 * arguments and test files exempt.
 */
it("UI copy has no em dash in any string or JSX text", async () => {
	const src = new URL(".", import.meta.url).pathname;
	expect(await findUiCopyViolations(src)).toEqual([]);
});
