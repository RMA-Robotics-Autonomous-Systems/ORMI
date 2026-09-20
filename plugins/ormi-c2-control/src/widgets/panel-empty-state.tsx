import type { ReactNode } from "react";

/**
 * The one empty/placeholder body every C2 panel renders ("no datasource",
 * "select a topic", "no missions yet"). Panels that each spelled their own
 * drifted apart — different sizes, alignment and padding for the same message.
 *
 * @param props.children - The message; keep it to one short sentence.
 * @param props.action - Optional control offered under the message.
 */
export function PanelEmptyState({
	children,
	action,
}: {
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
			<div>{children}</div>
			{action}
		</div>
	);
}
