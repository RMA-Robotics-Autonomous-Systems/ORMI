"use client";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";

import {
	focusMapFeature,
	groupByLayer,
	requestFeatureSelection,
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
 * In the map editor each feature has a checkbox, and each layer one that
 * selects all of it: this is the touch path to a group of features
 * (`map-multi-select.ts`). A checkbox asks the map, which owns the
 * selection and may first ask about unsaved changes.
 *
 * This is how a feature covered by another one is reached: on the Inta map
 * the geofence covered every road and risk area, and no click could pick
 * them (usability test 2026-11-12). Reads `state/map-layers-store.ts`, which
 * the mission map publishes; renders nothing until a map is shown.
 *
 * @param props.className - Extra classes for the root.
 */
/** The tap area around a checkbox: finger-sized on a coarse pointer. */
const CHECK_AREA_CLASS =
	"flex shrink-0 cursor-pointer items-center justify-center self-stretch px-1 any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11";
/** The box itself, larger for a finger. */
const CHECK_BOX_CLASS = "any-pointer-coarse:size-5";

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
				const ids = features.map((f) => f.featureId);
				const checkedCount = ids.filter((id) =>
					layers.selected.has(id),
				).length;
				const allChecked =
					checkedCount === 0
						? false
						: checkedCount === ids.length
							? true
							: "indeterminate";
				return (
					<div key={type} className="flex min-w-0 flex-col">
						<div className="flex min-w-0 items-center gap-1">
							{layers.selectable && (
								<label className={CHECK_AREA_CLASS}>
									<Checkbox
										className={CHECK_BOX_CLASS}
										aria-label={`Select all ${label}`}
										checked={allChecked}
										onCheckedChange={() =>
											requestFeatureSelection(
												ids,
												allChecked === true
													? "remove"
													: "add",
											)
										}
									/>
								</label>
							)}
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
								<li
									key={feature.featureId}
									className="flex min-w-0 items-center"
								>
									{layers.selectable && (
										<label className={CHECK_AREA_CLASS}>
											<Checkbox
												className={CHECK_BOX_CLASS}
												aria-label={`Select ${feature.name}`}
												checked={layers.selected.has(
													feature.featureId,
												)}
												onCheckedChange={() =>
													requestFeatureSelection(
														[feature.featureId],
														"toggle",
													)
												}
											/>
										</label>
									)}
									<button
										type="button"
										className={`min-w-0 flex-1 truncate rounded-sm px-2 py-1 text-left text-xs any-pointer-coarse:min-h-11 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${hidden ? "text-muted-foreground" : ""}`}
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
