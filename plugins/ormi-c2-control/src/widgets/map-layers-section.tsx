"use client";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";

import {
	focusMapFeature,
	groupByLayer,
	toggleLayerHidden,
	toggleLayerLocked,
	useMapLayers,
} from "../state/map-layers-store";

/** Plural labels for the layers (`feature_type`). */
const LAYER_LABEL: Record<string, string> = {
	waypoint: "Waypoints",
	cue: "Cues",
	road: "Roads",
	zone: "Zones",
	risk: "Risk areas",
	geofence: "Geofences",
};

/**
 * The selected map's features, listed by layer, with a hide and a lock per
 * layer. Clicking a feature selects it on the mission map and flies to it;
 * while authoring, it opens with its handles, as a click on the map does.
 *
 * This is how a feature covered by another one is reached: on the Inta map
 * the geofence covered every road and risk area, and no click could pick
 * them (usability test 2026-11-12). Reads `state/map-layers-store.ts`, which
 * the mission map publishes; renders nothing until a map is shown.
 *
 * @param props.className - Extra classes for the root.
 */
export function MapLayersSection(props: { className?: string }) {
	const layers = useMapLayers();
	if (!layers.map || layers.features.length === 0) return null;
	const groups = groupByLayer(layers.features);
	return (
		<section
			aria-label="Map layers"
			className={`flex min-w-0 flex-col gap-1.5 text-sm ${props.className ?? ""}`}
		>
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-medium">Map {layers.map}</span>
				<Badge variant="secondary">
					{layers.features.length} feature
					{layers.features.length === 1 ? "" : "s"}
				</Badge>
			</div>
			{groups.map(([type, features]) => {
				const label = LAYER_LABEL[type] ?? type;
				const hidden = layers.hidden.has(type);
				const locked = layers.locked.has(type);
				return (
					<div key={type} className="flex min-w-0 flex-col">
						<div className="flex min-w-0 items-center gap-1">
							<span
								className={`flex-1 truncate text-xs font-medium ${hidden ? "text-muted-foreground" : ""}`}
							>
								{label} ({features.length})
							</span>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-pressed={hidden}
								aria-label={
									hidden ? `Show ${label}` : `Hide ${label}`
								}
								title={
									hidden ? `Show ${label}` : `Hide ${label}`
								}
								onClick={() => toggleLayerHidden(type)}
							>
								{hidden ? <EyeOff /> : <Eye />}
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-pressed={locked}
								aria-label={
									locked ? `Unlock ${label}` : `Lock ${label}`
								}
								title={
									locked ? `Unlock ${label}` : `Lock ${label}`
								}
								onClick={() => toggleLayerLocked(type)}
							>
								{locked ? <Lock /> : <LockOpen />}
							</Button>
						</div>
						<ul className="flex min-w-0 flex-col">
							{features.map((feature) => (
								<li key={feature.featureId} className="min-w-0">
									<button
										type="button"
										className={`w-full truncate rounded-sm px-2 py-1 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${hidden ? "text-muted-foreground" : ""}`}
										title={feature.name}
										onClick={() =>
											focusMapFeature(feature.featureId)
										}
									>
										{feature.name}
									</button>
								</li>
							))}
						</ul>
					</div>
				);
			})}
		</section>
	);
}
