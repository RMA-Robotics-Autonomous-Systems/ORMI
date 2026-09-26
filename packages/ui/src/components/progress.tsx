"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@workspace/ui/lib/utils";

/**
 * A progress bar. The fill jumps to each new value by default: progress is
 * usually live data (a mission's progress), and a value never moves through
 * numbers nobody reported. `animated` eases the fill over `--motion-base` for
 * progress the operator drives themselves (a step through a form).
 */
function Progress({
	className,
	value,
	animated = false,
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
	/** Ease the fill between values. Default `false`. */
	animated?: boolean;
}) {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			className={cn(
				"bg-primary/20 relative h-2 w-full overflow-hidden rounded-(--radius-pill)",
				className,
			)}
			{...props}
		>
			<ProgressPrimitive.Indicator
				data-slot="progress-indicator"
				className={cn(
					"bg-primary h-full w-full flex-1",
					animated &&
						"transition-transform duration-(--motion-base) ease-(--motion-ease)",
				)}
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		</ProgressPrimitive.Root>
	);
}

export { Progress };
