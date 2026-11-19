import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL, E2E_STORAGE_STATE } from "./e2e/e2e-env";

/**
 * End-to-end suite: drives a RUNNING ORMI server in a real browser.
 *
 * The specs are `*.e2e.ts`, a suffix `bun test` does not collect (it takes
 * `*.test.*` and `*.spec.*`), so `bun test` and turbo's `test` task never run
 * them. Run with `bun run test:e2e` from `apps/web`; see `e2e/README.md`.
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.e2e.ts",
	outputDir: "./e2e/.output/test-results",
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: false,
	// One browser at a time: the specs are WebGL-heavy and share one server.
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	use: {
		baseURL: E2E_BASE_URL,
		storageState: E2E_STORAGE_STATE,
		viewport: { width: 1600, height: 1000 },
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1600, height: 1000 },
			},
		},
	],
});
