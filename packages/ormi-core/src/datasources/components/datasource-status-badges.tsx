"use client";

/**
 * Datasource status badges — displays connection status for each configured datasource.
 * Does not consume context; accepts state as props for external rendering (e.g., navbar).
 */

import React from "react";
import { Datasource, DatasourceStatus } from "../datasource-interface";
import { Badge } from "@workspace/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@workspace/ui/components/tooltip";
import { CheckIcon, Loader2, AlertCircle, XCircle } from "lucide-react";

interface DatasourceStatusBadgesProps {
	/** Datasources to display badges for. */
	datasources: Datasource[];
	/** Per-datasource connection status. */
	datasourceStatuses: Map<string, DatasourceStatus>;
}

/**
 * Datasource Status Badges Container.
 *
 * Renders colored status badges for each datasource (connecting, ready, error, disposed).
 * Used in navbar to show at-a-glance datasource connection state.
 *
 * Does not use context — accepts datasources and statuses as props for external rendering.
 *
 * @param props - Component props.
 * @returns Badge container with status indicators, or null if no datasources configured.
 */
export const DatasourceStatusBadges = (props: DatasourceStatusBadgesProps) => {
	const { datasources, datasourceStatuses } = props;

	// No datasources configured
	if (datasources.length === 0) {
		return null;
	}

	const statusConfig = {
		connecting: {
			icon: Loader2,
			className: "border-transparent bg-info/15 text-info",
			iconClassName: "",
			label: "Connecting",
		},
		ready: {
			icon: CheckIcon,
			className: "border-transparent bg-success/15 text-success",
			iconClassName: "",
			label: "Ready",
		},
		error: {
			icon: AlertCircle,
			// Dark `--destructive` is too dim for text: the label stays
			// foreground and the icon carries the colour.
			className: "border-transparent bg-destructive/15 text-foreground",
			iconClassName: "text-destructive",
			label: "Error",
		},
		disposed: {
			icon: XCircle,
			className: "border-transparent bg-muted text-muted-foreground",
			iconClassName: "",
			label: "Disposed",
		},
	};

	return (
		<TooltipProvider>
			<div className="flex h-full items-center gap-2">
				{datasources.map((ds) => {
					const status =
						datasourceStatuses.get(ds.settings.id) || "connecting";
					const config = statusConfig[status];
					const Icon = config.icon;

					return (
						<Tooltip key={ds.settings.id}>
							<TooltipTrigger asChild>
								<Badge
									variant="secondary"
									className={`gap-1 ${config.className}`}
								>
									<Icon
										className={`h-3 w-3 ${config.iconClassName} ${status === "connecting" ? "animate-spin" : ""}`}
									/>
									<span>{ds.settings.title}</span>
								</Badge>
							</TooltipTrigger>
							<TooltipContent>
								<p>
									{ds.settings.title}: {config.label}
								</p>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</TooltipProvider>
	);
};
