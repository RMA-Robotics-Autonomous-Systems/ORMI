"use client";

import { useButtonHolderRegistryContext } from "./button-holder-provider";

/**
 * Renders the registered buttons for a specific widget bucket, sorted ascending
 * by priority. Reads the reactive registry directly by `widgetId`, so it
 * re-renders in place when that bucket changes (no portals, no DOM-identity
 * coupling). Place it where the buttons belong (grid tile header / flex tab
 * strip).
 * @param props - The widget id whose bucket to render.
 * @returns React element, or null when the bucket is empty.
 */
export function ButtonHolderHost({ widgetId }: { widgetId: string }) {
	const { registry } = useButtonHolderRegistryContext();
	const items = registry.get(widgetId);

	if (!items || items.size === 0) {
		return null;
	}

	return (
		<div className="flex flex-row space-x-2">
			{Array.from(items.values())
				.sort((a, b) => a.priority - b.priority)
				.map((item, index) => (
					<div key={index}>{item.component}</div>
				))}
		</div>
	);
}
