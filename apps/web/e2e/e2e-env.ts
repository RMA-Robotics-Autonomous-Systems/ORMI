import { fileURLToPath } from "node:url";

/**
 * Settings shared by the Playwright config and the global setup.
 */

/** The running ORMI server under test. Never started by the suite. */
export const E2E_BASE_URL =
	// Read by the e2e suite only, which turbo never runs.
	// eslint-disable-next-line turbo/no-undeclared-env-vars
	(process.env.ORMI_E2E_BASE_URL ?? "http://localhost:3000").replace(
		/\/$/,
		"",
	);

/** Where the global setup leaves the signed-in (or signed-out) session. */
export const E2E_STORAGE_STATE = fileURLToPath(
	new URL("./.output/storage-state.json", import.meta.url),
);
