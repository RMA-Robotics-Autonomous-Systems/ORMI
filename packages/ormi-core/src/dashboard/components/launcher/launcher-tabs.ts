/**
 * Tabs of the dashboard launcher, and where the operator's last choice lives.
 *
 * Pure and React-free so it can be tested directly: the launcher itself is a
 * DOM surface and the repo carries no DOM render harness.
 */

/** Tabs the launcher offers, in display order. */
export const LAUNCHER_TABS = ["topics", "widgets", "templates"] as const;

/** One launcher tab. */
export type LauncherTab = (typeof LAUNCHER_TABS)[number];

/** Tab the launcher opens on when nothing has been remembered. */
export const DEFAULT_LAUNCHER_TAB: LauncherTab = "topics";

/**
 * `localStorage` key holding the last tab the operator opened.
 *
 * Deliberately **not** the dashboard record. Which panel someone last looked at
 * is a property of the person, not of the workspace: it is not something a
 * second operator opening the same dashboard should inherit, and — the reason
 * this constant exists at all — writing it into the dashboard's `layouts` makes
 * merely opening the panel an unsaved change, so the dashboard asks to be saved
 * when nothing about it changed. Chrome state stays out of anything the
 * persistence layer watches.
 */
export const LAUNCHER_TAB_STORAGE_KEY = "ormi.dashboard-launcher.tab";

/**
 * Narrow an unknown value to a known tab.
 *
 * @param value - Value to test.
 * @returns True when the value names a tab this build offers.
 */
export function isLauncherTab(value: unknown): value is LauncherTab {
	return (
		typeof value === "string" &&
		(LAUNCHER_TABS as readonly string[]).includes(value)
	);
}

/**
 * Read the remembered tab.
 *
 * Every failure resolves to the default rather than propagating: `localStorage`
 * is absent server-side and *throws on access* in a private window or with site
 * data blocked, and a dashboard that will not open because of a remembered tab
 * is worse than one that opens on Topics. A value written by another build is
 * treated the same way.
 *
 * @returns The remembered tab, or {@link DEFAULT_LAUNCHER_TAB}.
 */
export function readStoredLauncherTab(): LauncherTab {
	try {
		const stored = globalThis.localStorage?.getItem(
			LAUNCHER_TAB_STORAGE_KEY,
		);
		return isLauncherTab(stored) ? stored : DEFAULT_LAUNCHER_TAB;
	} catch {
		return DEFAULT_LAUNCHER_TAB;
	}
}

/**
 * Remember the tab for the next time this viewer opens the launcher.
 *
 * Best effort by design — see {@link readStoredLauncherTab} for why a throw
 * here must never reach the operator.
 *
 * @param tab - Tab to remember.
 */
export function storeLauncherTab(tab: LauncherTab): void {
	try {
		globalThis.localStorage?.setItem(LAUNCHER_TAB_STORAGE_KEY, tab);
	} catch {
		// A viewer whose browser refuses storage simply starts on the default
		// next time; nothing else depends on this succeeding.
	}
}
