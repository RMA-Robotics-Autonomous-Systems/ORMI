"use client";

import React from "react";
import { LayoutDashboard } from "lucide-react";

/** Props for {@link DashboardEmptyState}. */
export interface DashboardEmptyStateProps {
	/** True when at least one datasource is configured in this workspace. */
	hasDatasource: boolean;
}

/**
 * Cold-start placeholder shown while a dashboard holds no widgets.
 *
 * Names the one next step rather than leaving an empty canvas under a toolbar.
 * The step is always the same button — the one in the bottom-right corner —
 * because it is the only way into this dashboard and it is already on screen.
 * A workspace without a datasource has no topics to offer yet, so it points at
 * connecting one first and at clicking a topic afterwards.
 *
 * Keep the wording pointing at something the operator can see from where they
 * are standing. This text used to say "on the left", from a side panel that no
 * longer exists, which is worse than no instruction at all: it sends someone
 * looking for a thing that is not there and reads as the product being broken.
 *
 * Shared by every layout engine so the operator reads the same instruction in
 * the same words whichever engine the workspace uses.
 *
 * @param props - Component props.
 * @returns React element.
 */
export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({
	hasDatasource,
}) => (
	<div className="flex h-full w-full items-center justify-center p-6">
		<div className="text-muted-foreground flex max-w-md flex-col items-center gap-3 text-center">
			<LayoutDashboard className="size-10" aria-hidden />
			<h2 className="text-foreground text-base font-medium">
				{hasDatasource
					? "This dashboard has no widgets yet"
					: "Connect a datasource to get started"}
			</h2>
			<p className="text-sm">
				{hasDatasource ? (
					<>
						Open{" "}
						<span className="text-foreground font-medium">＋</span>{" "}
						in the bottom-right corner and click a topic — it opens
						in the widget that fits it. Or pick a panel yourself
						from{" "}
						<span className="text-foreground font-medium">
							Widgets
						</span>
						. Save the dashboard when the layout suits you.
					</>
				) : (
					<>
						Open{" "}
						<span className="text-foreground font-medium">＋</span>{" "}
						in the bottom-right corner and add the system you want
						to monitor. Once it connects, its topics appear there
						and one click puts one on the dashboard.
					</>
				)}
			</p>
		</div>
	</div>
);
