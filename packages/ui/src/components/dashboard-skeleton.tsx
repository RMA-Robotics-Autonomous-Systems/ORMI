import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";
import { Card } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";

/** Props for {@link DashboardSkeleton}. */
export interface DashboardSkeletonProps {
	/**
	 * Number of placeholder widget tiles to render in the grid.
	 * @default 6
	 */
	tileCount?: number;
	/** Optional extra class names for the outer container. */
	className?: string;
}

/**
 * Full-area loading placeholder for the dashboard while its initial data
 * (workspace metadata and persisted layout) is still resolving.
 *
 * Presentational only: it holds no state and triggers no work. It approximates
 * the dashboard chrome — a toolbar/header bar plus a responsive grid of
 * placeholder tiles — so the transition to the real dashboard reads as one
 * continuous loading state rather than several stacked spinners.
 *
 * The layout is intentionally generic and does not attempt to mirror the real
 * persisted layout (which is not yet known at this point).
 *
 * @param props - Component props.
 * @returns A muted skeleton approximating the dashboard surface.
 */
export function DashboardSkeleton(props: DashboardSkeletonProps) {
	const { tileCount = 6, className } = props;

	return (
		<div
			role="status"
			aria-busy="true"
			aria-live="polite"
			className={cn("flex h-full w-full flex-col gap-4 p-4", className)}
		>
			<span className="sr-only">Loading dashboard…</span>

			{/* Toolbar / header bar placeholder. */}
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<Skeleton className="size-9 rounded-md" />
					<Skeleton className="h-6 w-40" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="size-9 rounded-md" />
					<Skeleton className="size-9 rounded-md" />
					<Skeleton className="h-9 w-24 rounded-md" />
				</div>
			</div>

			{/* Grid of placeholder widget tiles. */}
			<div className="grid flex-1 auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: tileCount }).map((_, index) => (
					<Card
						key={index}
						className="flex min-h-40 flex-col gap-3 p-4"
						aria-hidden
					>
						<div className="flex items-center justify-between gap-2">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="size-4 rounded-sm" />
						</div>
						<Skeleton className="flex-1 rounded-md" />
					</Card>
				))}
			</div>
		</div>
	);
}
