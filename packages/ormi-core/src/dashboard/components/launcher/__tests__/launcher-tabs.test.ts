/**
 * Tests for the launcher's remembered tab.
 *
 * The launcher itself is a DOM surface and the repo carries no DOM render
 * harness, so what is pinned here is the property the operator reported as a
 * bug: the panel's chrome state is per viewer and never reaches the dashboard
 * record, and every way storage can fail still opens the panel.
 */

import { describe, test, expect, afterEach } from "bun:test";

import {
	DEFAULT_LAUNCHER_TAB,
	LAUNCHER_TABS,
	LAUNCHER_TAB_STORAGE_KEY,
	isLauncherTab,
	readStoredLauncherTab,
	storeLauncherTab,
} from "../launcher-tabs";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const originalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

/** Install a stand-in for `localStorage` and return the store behind it. */
function installStorage(
	overrides: Partial<Pick<Storage, "getItem" | "setItem">> = {},
): Map<string, string> {
	const store = new Map<string, string>();

	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
			...overrides,
		},
	});

	return store;
}

/** Remove `localStorage` entirely, as on the server. */
function removeStorage(): void {
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: undefined,
	});
}

afterEach(() => {
	if (originalStorage) {
		Object.defineProperty(globalThis, "localStorage", originalStorage);
	} else {
		Reflect.deleteProperty(globalThis, "localStorage");
	}
});

// ---------------------------------------------------------------------------
// Tab narrowing
// ---------------------------------------------------------------------------

describe("isLauncherTab", () => {
	test("accepts every offered tab", () => {
		for (const tab of LAUNCHER_TABS) {
			expect(isLauncherTab(tab)).toBe(true);
		}
	});

	test("rejects anything else", () => {
		for (const value of ["", "Topics", "rail", null, undefined, 0, {}]) {
			expect(isLauncherTab(value)).toBe(false);
		}
	});

	test("opens on a tab it offers", () => {
		expect(LAUNCHER_TABS).toContain(DEFAULT_LAUNCHER_TAB);
	});
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe("readStoredLauncherTab / storeLauncherTab", () => {
	test("remembers the tab across a reload", () => {
		installStorage();

		storeLauncherTab("templates");

		expect(readStoredLauncherTab()).toBe("templates");
	});

	test("writes under its own key and nothing else", () => {
		const store = installStorage();

		storeLauncherTab("widgets");

		expect([...store.keys()]).toEqual([LAUNCHER_TAB_STORAGE_KEY]);
		expect(store.get(LAUNCHER_TAB_STORAGE_KEY)).toBe("widgets");
	});

	test("falls back to the default when nothing was stored", () => {
		installStorage();

		expect(readStoredLauncherTab()).toBe(DEFAULT_LAUNCHER_TAB);
	});

	test("falls back to the default for a tab this build dropped", () => {
		const store = installStorage();
		store.set(LAUNCHER_TAB_STORAGE_KEY, "transforms");

		expect(readStoredLauncherTab()).toBe(DEFAULT_LAUNCHER_TAB);
	});
});

// ---------------------------------------------------------------------------
// Hostile storage — a panel that will not open is worse than a forgotten tab
// ---------------------------------------------------------------------------

describe("storage failures", () => {
	test("reading survives a throwing localStorage", () => {
		installStorage({
			getItem: () => {
				throw new Error("The operation is insecure.");
			},
		});

		expect(readStoredLauncherTab()).toBe(DEFAULT_LAUNCHER_TAB);
	});

	test("writing survives a throwing localStorage", () => {
		installStorage({
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		});

		expect(() => storeLauncherTab("widgets")).not.toThrow();
	});

	test("both survive no localStorage at all", () => {
		removeStorage();

		expect(readStoredLauncherTab()).toBe(DEFAULT_LAUNCHER_TAB);
		expect(() => storeLauncherTab("topics")).not.toThrow();
	});
});
