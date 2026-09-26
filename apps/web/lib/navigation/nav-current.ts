/**
 * Which navbar entry the current route belongs to, as an `aria-current` value.
 *
 * `"page"` when the route is the entry's own page, `"true"` when it is inside
 * the section the entry leads to (a docs article under Docs, a workspace under
 * Dashboard, a plugin page under Apps), and `undefined` otherwise. Both values
 * draw the `nav-current` underline (globals.css); only `"page"` tells a screen
 * reader "this page".
 *
 * Pure, so it is unit-tested without a router.
 */

/** A navbar entry: the page it links to and, optionally, the section under it. */
export type NavTarget = {
	/** The entry's own page (`"/dashboard"`); `undefined` for a menu trigger. */
	href?: string;
	/** Routes under this prefix are in the entry's section (`"/docs/"`). */
	section?: string;
};

/**
 * @param pathname - The current path, as `usePathname()` returns it.
 * @param target - The entry's page and section.
 * @returns The `aria-current` value to set, or `undefined` for none.
 */
export function navCurrent(
	pathname: string | null | undefined,
	target: NavTarget,
): "page" | "true" | undefined {
	if (!pathname) return undefined;
	const path =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	if (target.href !== undefined && path === target.href) return "page";
	if (target.section && `${path}/`.startsWith(target.section)) {
		return path === target.section.replace(/\/$/u, "") ? undefined : "true";
	}
	return undefined;
}
