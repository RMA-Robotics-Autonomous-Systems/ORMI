"use client";

/**
 * Datasource status badges — displays connection status for each configured datasource.
 * Does not consume context; accepts state as props for external rendering (e.g., navbar).
 */

import React from "react";
import { Datasource } from "../datasource-interface";
import { Badge } from "@workspace/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@workspace/ui/components/tooltip";
import { CheckIcon, Loader2, AlertCircle, XCircle } from "lucide-react";

/** Datasource connection status. */
type DatasourceStatus = "connecting" | "ready" | "error" | "disposed";

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
			variant: "secondary" as const,
			color: "text-blue-600",
			label: "Connecting",
		},
		ready: {
			icon: CheckIcon,
			variant: "default" as const,
			color: "text-green-600",
			label: "Ready",
		},
		error: {
			icon: AlertCircle,
			variant: "destructive" as const,
			color: "text-red-600",
			label: "Error",
		},
		disposed: {
			icon: XCircle,
			variant: "outline" as const,
			color: "text-gray-600",
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
									variant={config.variant}
									className="gap-1"
								>
									<Icon
										className={`h-3 w-3 ${config.color} ${status === "connecting" ? "animate-spin" : ""}`}
									/>
									<span className={config.color}>
										{ds.settings.title}
									</span>
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
