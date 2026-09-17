"use client";

import { PuzzleIcon } from "lucide-react";
import { Card } from "@workspace/ui/components/card";

import type { UnconfiguredMapEntry } from "../unconfigured-entries";

/** Props for {@link UnconfiguredEntriesNotice}. */
interface UnconfiguredEntriesNoticeProps {
	/** Entries the map cannot draw from their stored settings. */
	entries: readonly UnconfiguredMapEntry[];
}

/**
 * In-map notice for topic entries that are not finished being configured.
 *
 * Deliberately the vocabulary of the unsupported-configuration cards (dashed
 * border, muted `PuzzleIcon`, the thing named, the settings said to be kept,
 * the way out spelled out) rather than error vocabulary: an entry waiting for
 * a topic is an expected state, and an operator has to recognise one state
 * whether they meet it on a tile, on a datasource card or here.
 *
 * It never leads with a technical message, and it stays inside the map so the
 * basemap, the layers and every entry that *is* configured keep working — the
 * failure is one entry's, not the map's. Bottom-left, clear of the layer panel
 * (top-right) and of the attribution.
 *
 * @param props - Component props.
 * @returns React element, or null when every entry is configured.
 */
export function UnconfiguredEntriesNotice({
	entries,
}: UnconfiguredEntriesNoticeProps) {
	if (entries.length === 0) return null;

	return (
		<div className="absolute bottom-2 left-2 z-10 w-72 max-w-[calc(100%-1rem)]">
			<Card
				role="status"
				aria-live="polite"
				className="bg-popover text-popover-foreground flex flex-row items-start gap-3 border-dashed p-3 shadow-md"
			>
				<PuzzleIcon
					className="text-muted-foreground mt-0.5 size-4 shrink-0"
					aria-hidden
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="text-sm font-medium">
						{entries.length === 1
							? "1 entry needs configuration"
							: `${entries.length} entries need configuration`}
					</span>

					<ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
						{entries.map((entry) => (
							<li key={entry.id}>
								<span className="font-medium">
									{entry.section} › {entry.name}
								</span>{" "}
								has no {entry.missing.join(" and no ")}, so it
								is not drawn.
							</li>
						))}
					</ul>

					<p className="text-muted-foreground text-xs">
						Their settings are kept as saved. Open this
						widget&apos;s settings to finish configuring them, or
						remove them from the list.
					</p>
				</div>
			</Card>
		</div>
	);
}
