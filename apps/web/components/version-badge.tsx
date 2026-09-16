"use client";

import { useDevlogContext } from "@/components/devlogs/devlog-provider";

/**
 * The build stamp in the navbar, as `YYYYMMDD-<short sha>`.
 *
 * `NEXT_PUBLIC_APP_VERSION` is inlined at build time by next.config.mjs — see
 * `resolveAppVersion` there for how it is derived and why it is not part of the
 * validated runtime env.
 *
 * Clicking it opens the devlog history, which makes the stamp a way in to
 * "what changed since the version I was running" rather than only a label.
 */
export function VersionBadge() {
	const { showAll } = useDevlogContext();
	const version = process.env.NEXT_PUBLIC_APP_VERSION;

	if (!version) return null;

	return (
		<button
			type="button"
			onClick={showAll}
			title={`Build ${version} — see what's new`}
			className="cursor-pointer px-2 font-mono text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
		>
			{version}
		</button>
	);
}
