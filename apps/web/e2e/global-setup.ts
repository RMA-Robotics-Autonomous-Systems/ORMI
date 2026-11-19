import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { request } from "@playwright/test";

import { E2E_BASE_URL, E2E_STORAGE_STATE } from "./e2e-env";

/**
 * Log in once and store the session for every spec.
 *
 * ORMI signs in through NextAuth's `login` credentials provider
 * (`apps/web/server/auth.ts`), which takes a username of an EXISTING user and
 * nothing else. The suite never creates one: it reads `ORMI_E2E_USERNAME` and
 * signs in through the same endpoint the sign-in form posts to.
 *
 * Without the variable the specs run signed out. The C2 Mission Control page
 * does not require a session (it keeps everything in local storage), so the
 * suite does not need one; a spec that does must check for it itself.
 */
export default async function globalSetup(): Promise<void> {
	await mkdir(dirname(E2E_STORAGE_STATE), { recursive: true });
	// Read by the e2e suite only, which turbo never runs.
	// eslint-disable-next-line turbo/no-undeclared-env-vars
	const username = process.env.ORMI_E2E_USERNAME?.trim();
	if (!username) {
		console.log(
			"[e2e] ORMI_E2E_USERNAME is not set: running signed out. The C2 page does not need a session.",
		);
		await writeFile(
			E2E_STORAGE_STATE,
			JSON.stringify({ cookies: [], origins: [] }),
		);
		return;
	}

	const api = await request.newContext({ baseURL: E2E_BASE_URL });
	try {
		const csrf = await api.get("/api/auth/csrf");
		if (!csrf.ok())
			throw new Error(`GET /api/auth/csrf answered ${csrf.status()}`);
		const { csrfToken } = (await csrf.json()) as { csrfToken: string };
		const login = await api.post("/api/auth/callback/login", {
			form: {
				csrfToken,
				username,
				json: "true",
				callbackUrl: E2E_BASE_URL,
			},
			maxRedirects: 0,
		});
		if (login.status() >= 400)
			throw new Error(
				`signing in as "${username}" failed (POST /api/auth/callback/login answered ${login.status()}). The user must already exist; the suite never creates one.`,
			);
		const session = await api.get("/api/auth/session");
		const body = (await session.json()) as { user?: { name?: string } };
		if (body.user?.name !== username)
			throw new Error(
				`no session for "${username}" after signing in. The user must already exist; the suite never creates one.`,
			);
		await api.storageState({ path: E2E_STORAGE_STATE });
		console.log(`[e2e] signed in as ${username}`);
	} finally {
		await api.dispose();
	}
}
