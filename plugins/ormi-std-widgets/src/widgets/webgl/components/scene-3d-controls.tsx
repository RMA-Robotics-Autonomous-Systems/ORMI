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
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Separator } from "@workspace/ui/components/separator";
import { Toggle } from "@workspace/ui/components/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";

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
	const [open, setOpen] = useState(true);

	const hasLayers = layers.length > 0;
	const hasScene = scene.length > 0;
	const itemCount = layers.length + scene.length;

	if (!hasLayers && !hasScene) {
		return null;
	}

	return (
		<div
			className="w-64 max-w-[calc(100%-1rem)]"
			style={{
				position: "absolute",
				top: "8px",
				right: "8px",
				zIndex: 10,
			}}
		>
			<Card className="bg-card/90 supports-[backdrop-filter]:bg-card/80 gap-0 rounded-lg border py-0 shadow-sm backdrop-blur-sm">
				<Collapsible open={open} onOpenChange={setOpen}>
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

					<CollapsibleContent>
						<Separator />
						<ScrollArea className="max-h-80">
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
						</ScrollArea>
					</CollapsibleContent>
				</Collapsible>
			</Card>
		</div>
	);
}
