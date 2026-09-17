import * as React from "react";
import { Loader2, Settings2, XCircle } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";

/**
 * Non-online datasource health that this affordance can render.
 *
 * Mirrors the widget-facing `DatasourceHealth` from `@workspace/ormi-core`
 * narrowed to its non-`online` cases. Declared locally so `@workspace/ui`
 * stays free of an `ormi-core` dependency (presentational layer only).
 */
export type DatasourceOfflineHealth = "offline" | "connecting";

/**
 * Window event asking the host application to surface the datasource
 * configuration UI.
 *
 * A `window` event rather than a direct call because the offline affordance
 * lives in `@workspace/ui`, which must not depend on `@workspace/ormi-core`
 * where the datasource settings dialog is owned. The dialog listens for this
 * event; `@workspace/ui` only announces the intent.
 */
export const DATASOURCE_CONFIGURE_EVENT = "ormi:datasource-configure";

/** Detail payload carried by {@link DATASOURCE_CONFIGURE_EVENT}. */
export interface DatasourceConfigureEventDetail {
	/** Display title of the datasource the operator asked to configure. */
	title: string;
}

/**
 * Ask the host application to open the datasource configuration surface.
 *
 * No-op outside the browser so server rendering stays safe.
 *
 * @param title - Display title of the datasource to configure.
 */
export function requestDatasourceConfiguration(title: string): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<DatasourceConfigureEventDetail>(
			DATASOURCE_CONFIGURE_EVENT,
			{ detail: { title } },
		),
	);
}

/** Props for {@link DatasourceOffline}. */
export interface DatasourceOfflineProps {
	/** Display title of the backing datasource. */
	title: string;
	/** Current non-online health of the datasource. */
	health: DatasourceOfflineHealth;
	/** Optional extra class names for the outer card. */
	className?: string;
	/**
	 * Handler for the "Check configuration" action. Defaults to
	 * {@link requestDatasourceConfiguration}, which opens the workspace
	 * datasource settings. Pass a handler to route somewhere more specific.
	 */
	onConfigure?: () => void;
	// Reserved for an optional onRetry hook — a manual reconnect/retry control
	// would hang here (not currently wired).
}

/**
 * Standard affordance shown by a widget whose backing datasource is not
 * `online`.
 *
 * Holds no state. Pass the datasource title and its derived health; the widget
 * decides when to render it (typically an early return when `health !== "online"`).
 *
 * The icon/color vocabulary matches the navbar status badges so the two agree:
 * - `offline` → muted card with an offline (`XCircle`) icon.
 * - `connecting` → muted card with a spinner.
 *
 * Both states expose a single action back to the datasource configuration, so
 * a misconfigured datasource can be corrected from the widget that reports it
 * rather than by hunting for the settings dialog.
 *
 * @param props - Component props.
 * @returns A muted, centered card describing the datasource state.
 */
export function DatasourceOffline(props: DatasourceOfflineProps) {
	const { title, health, className, onConfigure } = props;

	const isConnecting = health === "connecting";
	const Icon = isConnecting ? Loader2 : XCircle;
	const message = isConnecting
		? `Connecting to '${title}'…`
		: `Datasource '${title}' offline`;

	const handleConfigure = () => {
		if (onConfigure) {
			onConfigure();
			return;
		}
		requestDatasourceConfiguration(title);
	};

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
			<Button
				variant="outline"
				size="sm"
				onClick={handleConfigure}
				aria-label={`Check configuration for datasource ${title}`}
			>
				<Settings2 aria-hidden />
				Check configuration
			</Button>
		</Card>
	);
}
