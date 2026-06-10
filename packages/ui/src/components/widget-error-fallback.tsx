import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";

/** Maximum number of characters of the error message rendered in the fallback. */
const MAX_MESSAGE_LENGTH = 200;

/** Props for {@link WidgetErrorFallback}. */
export interface WidgetErrorFallbackProps {
	/**
	 * Optional error message to display under the headline. Truncated for
	 * compactness; pass `error.message` from the boundary that caught it.
	 */
	message?: string;
	/**
	 * Optional retry handler. When provided, a "Retry" button is rendered that
	 * clears the boundary's error state so a transient failure can recover.
	 * Display-only otherwise — it performs no datasource reconnect logic.
	 */
	onRetry?: () => void;
	/** Optional extra class names for the outer card. */
	className?: string;
}

/**
 * Standard display-only fallback shown by the per-widget error boundary when a
 * widget throws during render or in a lifecycle method.
 *
 * Presentational only: it holds no state and contains no boundary logic. The
 * boundary (which lives in `@workspace/ormi-core`) decides when to render it and
 * supplies the optional `onRetry`. Kept free of any `ormi-core` dependency so it
 * stays a pure presentational primitive, mirroring `DatasourceOffline`.
 *
 * The icon/color vocabulary matches the muted-card style of `DatasourceOffline`
 * so the two health affordances read consistently.
 *
 * @param props - Component props.
 * @returns A muted, centered card describing the failed widget.
 */
export function WidgetErrorFallback(props: WidgetErrorFallbackProps) {
	const { message, onRetry, className } = props;

	const truncated =
		message && message.length > MAX_MESSAGE_LENGTH
			? `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
			: message;

	return (
		<Card
			role="alert"
			aria-live="assertive"
			className={cn(
				"text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 border-dashed py-6 text-center text-sm",
				className,
			)}
		>
			<AlertTriangle className="text-destructive size-6" aria-hidden />
			<span className="font-medium">Widget failed to render</span>
			{truncated && (
				<span className="text-muted-foreground/80 max-w-full px-4 break-words text-xs">
					{truncated}
				</span>
			)}
			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					onClick={onRetry}
					className="mt-1"
				>
					<RotateCcw aria-hidden />
					Retry
				</Button>
			)}
		</Card>
	);
}
