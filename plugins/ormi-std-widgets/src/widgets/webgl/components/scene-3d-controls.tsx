"use client";

import { useState } from "react";
import {
	Axis3d,
	Box,
	Eye,
	EyeOff,
	Grid3x3,
	Layers,
	Map as MapIcon,
	Share2,
	Spline,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { Separator } from "@workspace/ui/components/separator";
import { Toggle } from "@workspace/ui/components/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { LayerTransformStatus } from "../types/scene-3d-types";

/** Kind of toggleable element in the 3D scene. */
export type SceneLayerKind =
	| "pointcloud"
	| "path"
	| "mapgrid"
	| "transformTree"
	| "grid"
	| "axes";

/**
 * A single toggleable entry rendered as a row in the scene control panel.
 * Visibility is runtime-only state owned by `Scene3DComp` — toggling never
 * writes back to the saved widget configuration.
 */
export interface SceneLayerEntry {
	/** Stable key, also used as the visibility-state key. */
	key: string;
	/** Human-readable label (topic name or a generic fallback). */
	label: string;
	kind: SceneLayerKind;
	visible: boolean;
	/** Transform status reported by the layer's renderer (data layers only). */
	status?: LayerTransformStatus;
}

/**
 * Badge color + description per transform status. Colors are inline (not Tailwind palette
 * classes): the app's Tailwind v4 `@theme` does not emit the default `emerald`/`amber`
 * utilities, so class-based dots render with no background. `--muted-foreground` is a theme token.
 */
const STATUS_META: Record<
	LayerTransformStatus,
	{ color: string; label: string; description: string }
> = {
	resolved: {
		color: "#22c55e",
		label: "TF ok",
		description: "Transform to the target frame resolved.",
	},
	fallback: {
		color: "#f59e0b",
		label: "TF fallback",
		description:
			"Target frame unreachable — rendering in the layer's own root frame.",
	},
	"no-data": {
		color: "var(--muted-foreground)",
		label: "no data",
		description: "No data received on this layer's topic yet.",
	},
};

/** Small colored status dot with a tooltip, shown for data layers. */
function StatusDot({ status }: { status: LayerTransformStatus }) {
	const meta = STATUS_META[status];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="status"
					aria-label={meta.label}
					className="ring-border/50 h-2.5 w-2.5 shrink-0 rounded-full ring-1"
					style={{ backgroundColor: meta.color }}
				/>
			</TooltipTrigger>
			<TooltipContent>{meta.description}</TooltipContent>
		</Tooltip>
	);
}

const KIND_ICON: Record<
	SceneLayerKind,
	React.ComponentType<{ className?: string }>
> = {
	pointcloud: Box,
	path: Spline,
	mapgrid: MapIcon,
	transformTree: Share2,
	grid: Grid3x3,
	axes: Axis3d,
};

/** One layer row: an icon, a label, and a show/hide toggle. */
function LayerRow({
	entry,
	onToggle,
}: {
	entry: SceneLayerEntry;
	onToggle: (key: string, visible: boolean) => void;
}) {
	const Icon = KIND_ICON[entry.kind];
	return (
		<div className="flex items-center gap-2 rounded px-1 py-0.5">
			<Icon
				className={cn(
					"h-4 w-4 shrink-0",
					entry.visible ? "text-primary" : "text-muted-foreground",
				)}
			/>
			<span className="min-w-0 flex-1 truncate text-sm">
				{entry.label}
			</span>
			{entry.status && entry.visible && (
				<StatusDot status={entry.status} />
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<Toggle
						size="sm"
						pressed={entry.visible}
						onPressedChange={(pressed) =>
							onToggle(entry.key, pressed)
						}
						className="h-6 w-6 min-w-6 shrink-0 p-0"
						aria-label={entry.visible ? "Hide layer" : "Show layer"}
					>
						{entry.visible ? (
							<Eye className="h-3 w-3" />
						) : (
							<EyeOff className="h-3 w-3" />
						)}
					</Toggle>
				</TooltipTrigger>
				<TooltipContent>
					{entry.visible ? "Hide" : "Show"} &quot;{entry.label}&quot;
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

/**
 * Consolidated, collapsible control panel anchored top-right of the 3D viewer.
 *
 * Mirrors the Map widget's control panel: it lets users enable/disable scene
 * layers and helpers at runtime without overwriting the saved widget config.
 * The `layers` group holds data-driven layers (point clouds, paths, map grids,
 * transform tree); the `scene` group holds visual helpers (grid, axes). Each
 * group only renders when it has entries; when both are empty the panel renders
 * nothing.
 *
 * @param props - Component props.
 * @returns React element or null when there is nothing to toggle.
 */
export function Scene3DControlPanel({
	layers,
	scene,
	onToggle,
}: {
	layers: SceneLayerEntry[];
	scene: SceneLayerEntry[];
	onToggle: (key: string, visible: boolean) => void;
}) {
	const [open, setOpen] = useState(false);

	const hasLayers = layers.length > 0;
	const hasScene = scene.length > 0;
	const itemCount = layers.length + scene.length;

	if (!hasLayers && !hasScene) {
		return null;
	}

	return (
		<div
			className="flex max-h-[calc(100%-1rem)] w-64 max-w-[calc(100%-1rem)] flex-col"
			style={{
				position: "absolute",
				top: "8px",
				right: "8px",
				zIndex: 10,
			}}
		>
			<Card className="bg-popover text-popover-foreground min-h-0 flex-1 gap-0 overflow-hidden rounded-md border py-0 shadow-md">
				<Collapsible
					open={open}
					onOpenChange={setOpen}
					className="flex min-h-0 flex-1 flex-col"
				>
					<CollapsibleTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-9 w-full justify-start gap-2 px-3 text-sm font-medium"
						>
							<Layers className="h-4 w-4" />
							<span>Scene layers</span>
							<Badge variant="secondary" className="ml-auto">
								{itemCount}
							</Badge>
						</Button>
					</CollapsibleTrigger>

					<CollapsibleContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
						<Separator />
						<div className="max-h-80 min-h-0 flex-1 overflow-y-auto">
							<div className="flex flex-col gap-3 p-2">
								{hasLayers && (
									<div className="flex flex-col gap-1">
										<span className="text-muted-foreground px-1 text-xs font-medium uppercase">
											Layers
										</span>
										{layers.map((entry) => (
											<LayerRow
												key={entry.key}
												entry={entry}
												onToggle={onToggle}
											/>
										))}
									</div>
								)}

								{hasLayers && hasScene && <Separator />}

								{hasScene && (
									<div className="flex flex-col gap-1">
										<span className="text-muted-foreground px-1 text-xs font-medium uppercase">
											Scene
										</span>
										{scene.map((entry) => (
											<LayerRow
												key={entry.key}
												entry={entry}
												onToggle={onToggle}
											/>
										))}
									</div>
								)}
							</div>
						</div>
					</CollapsibleContent>
				</Collapsible>
			</Card>
		</div>
	);
}
