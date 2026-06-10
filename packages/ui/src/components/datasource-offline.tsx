import * as React from "react";
import { Loader2, XCircle } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { Card } from "@workspace/ui/components/card";

/**
 * Non-online datasource health that this affordance can render.
 *
 * Mirrors the widget-facing `DatasourceHealth` from `@workspace/ormi-core`
 * narrowed to its non-`online` cases. Declared locally so `@workspace/ui`
 * stays free of an `ormi-core` dependency (presentational layer only).
 */
export type DatasourceOfflineHealth = "offline" | "connecting";

/** Props for {@link DatasourceOffline}. */
export interface DatasourceOfflineProps {
	/** Display title of the backing datasource. */
	title: string;
	/** Current non-online health of the datasource. */
	health: DatasourceOfflineHealth;
	/** Optional extra class names for the outer card. */
	className?: string;
	// Reserved for an optional onRetry hook — a manual reconnect/retry control
	// would hang here (not currently wired).
}

/**
 * Standard display-only affordance shown by a widget whose backing datasource
 * is not `online`.
 *
 * Presentational only: it renders nothing interactive (no retry button) and
 * holds no state. Pass the datasource title and its derived health; the widget
 * decides when to render it (typically an early return when `health !== "online"`).
 *
 * The icon/color vocabulary matches the navbar status badges so the two agree:
 * - `offline` → muted card with an offline (`XCircle`) icon.
 * - `connecting` → muted card with a spinner.
 *
 * @param props - Component props.
 * @returns A muted, centered card describing the datasource state.
 */
export function DatasourceOffline(props: DatasourceOfflineProps) {
	const { title, health, className } = props;

	const isConnecting = health === "connecting";
	const Icon = isConnecting ? Loader2 : XCircle;
	const message = isConnecting
		? `Connecting to '${title}'…`
		: `Datasource '${title}' offline`;

	return (
		<Card
			role="status"
			aria-live="polite"
			className={cn(
				"text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 border-dashed py-6 text-center text-sm",
				className,
			)}
		>
			<Icon
				className={cn("size-6", isConnecting && "animate-spin")}
				aria-hidden
			/>
			<span>{message}</span>
		</Card>
	);
}
