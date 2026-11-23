"use client";

import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Move, Redo2, Save, Trash2, Undo2, X } from "lucide-react";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

import type { C2Feature } from "../types/c2-types";
import {
	FEATURE_TYPE_GEOMETRY,
	FEATURE_TYPE_LABELS,
	FEATURE_TYPES,
	type FeatureType,
	GEOMETRY_CLASS_LABELS,
	readFeatureCategory,
	readFeatureId,
} from "./feature-geojson";
import type { EditCardSide } from "./map-edit-card";
import { type GroupActions, featureCount } from "./map-multi-select";

/**
 * Colour of the group outline. Meaning against a basemap, so fixed in both
 * themes: a cyan that reads on imagery and on the light vector basemap, apart
 * from the picked amber (`#f59e0b`), the snap magenta (`#d946ef`), terra-draw's
 * blue handles and the risk red. A dark casing under it keeps it legible over
 * pale ground.
 */
export const GROUP_OUTLINE_COLOR = "#22d3ee";
/** The casing under the group outline. */
export const GROUP_OUTLINE_CASING = "#0f172a";

/** The "no category" option value: Radix Select refuses an empty string. */
const NO_CATEGORY = "__none__";

/**
 * The selected group, outlined on top of the map's features. A declarative
 * source of its own, so it never touches the style object and terra-draw's
 * layers survive it. Hidden features are left out by the caller.
 *
 * @param props.features - The group's features as drawn (moved while a
 *   move is under way).
 */
export function GroupSelectionLayer(props: { features: readonly C2Feature[] }) {
	const data = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: props.features
				.filter((f) => f.geometry && f.geometry.coordinates != null)
				.map((f) => ({
					type: "Feature" as const,
					properties: { feature_id: readFeatureId(f) ?? "" },
					geometry: {
						type: f.geometry?.type,
						coordinates: f.geometry?.coordinates,
					} as never,
				})),
		}),
		[props.features],
	);
	return (
		<Source id="c2-group-selection" type="geojson" data={data}>
			<Layer
				id="c2-group-selection-casing"
				type="line"
				filter={["!=", ["geometry-type"], "Point"]}
				paint={{ "line-color": GROUP_OUTLINE_CASING, "line-width": 6 }}
			/>
			<Layer
				id="c2-group-selection-line"
				type="line"
				filter={["!=", ["geometry-type"], "Point"]}
				paint={{ "line-color": GROUP_OUTLINE_COLOR, "line-width": 3 }}
			/>
			<Layer
				id="c2-group-selection-circle"
				type="circle"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 10,
					"circle-color": "rgba(0,0,0,0)",
					"circle-stroke-color": GROUP_OUTLINE_COLOR,
					"circle-stroke-width": 3,
				}}
			/>
		</Source>
	);
}

/**
 * The categories offered to a group: the known ones, and any a member
 * already carries, so none is reset by opening the list.
 *
 * @param known - The authoring list.
 * @param members - The group's stored features.
 * @returns The options, the carried ones first.
 */
export function groupCategoryOptions(
	known: readonly string[],
	members: readonly C2Feature[],
): string[] {
	const options = [...known];
	for (const member of members) {
		const category = readFeatureCategory(member);
		if (category && !options.includes(category)) options.unshift(category);
	}
	return options;
}

/**
 * The card of a selected group, in the edit card's place and with its
 * corner rule: the count, what is excluded, and what applies to all of
 * them. Type and category changes and a move are held until Save, which
 * writes one PUT per feature; Cancel puts everything back.
 */
export function GroupCard({
	cardRef,
	...props
}: {
	/** Features selected. */
	count: number;
	/** Selected features on a locked layer: excluded from every action. */
	lockedCount: number;
	/** Selected features on a hidden layer: selected, not drawn. */
	hiddenCount: number;
	/** The type shown: the draft's, else the one all share, else null. */
	typeValue: FeatureType | null;
	/** Types every eligible geometry takes. */
	legalTypes: readonly FeatureType[];
	onType: (type: FeatureType) => void;
	/** Whether the category row shows: every resulting type takes one. */
	showCategory: boolean;
	/** The category shown ("" for none), or null when they differ. */
	categoryValue: string | null;
	categoryOptions: readonly string[];
	onCategory: (category: string) => void;
	actions: GroupActions;
	/** Move is armed: a drag on the map moves the group. */
	moveArmed: boolean;
	onToggleMove: () => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	/** Save would write something. */
	dirty: boolean;
	busy: boolean;
	onSave: () => void;
	onCancel: () => void;
	onDelete: () => void;
	onClear: () => void;
	/** The top corner it sits in (`map-edit-card.ts`). */
	side: EditCardSide;
	/** The card's root, measured for its placement. */
	cardRef: React.RefObject<HTMLDivElement | null>;
}) {
	const title = featureCount(props.count);
	const legal = new Set(props.legalTypes);
	return (
		<div
			ref={cardRef}
			role="group"
			aria-label={title}
			data-side={props.side}
			className={`absolute top-2 ${props.side === "left" ? "left-2" : "right-2"} z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-2 shadow-md w-64 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] overflow-y-auto`}
		>
			<div className="truncate text-xs font-medium">{title}</div>
			{(props.lockedCount > 0 || props.hiddenCount > 0) && (
				<div className="flex flex-col text-[11px] text-muted-foreground">
					{props.lockedCount > 0 && (
						<span>{props.lockedCount} locked: excluded</span>
					)}
					{props.hiddenCount > 0 && (
						<span>{props.hiddenCount} hidden</span>
					)}
				</div>
			)}
			<Select
				value={props.typeValue ?? undefined}
				disabled={!props.actions.retype}
				onValueChange={(value) => props.onType(value as FeatureType)}
			>
				<SelectTrigger
					size="sm"
					className="w-full"
					aria-label="Type of the selected features"
				>
					<SelectValue placeholder="Mixed types" />
				</SelectTrigger>
				<SelectContent>
					{FEATURE_TYPES.map((type) => (
						<SelectItem
							key={type}
							value={type}
							disabled={!legal.has(type)}
						>
							{FEATURE_TYPE_LABELS[type]}
							{!legal.has(type) &&
								` (needs a ${GEOMETRY_CLASS_LABELS[FEATURE_TYPE_GEOMETRY[type]]})`}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{props.showCategory && (
				<Select
					value={
						props.categoryValue === null
							? undefined
							: props.categoryValue || NO_CATEGORY
					}
					disabled={!props.actions.categorise}
					onValueChange={(value) =>
						props.onCategory(value === NO_CATEGORY ? "" : value)
					}
				>
					<SelectTrigger
						size="sm"
						className="w-full"
						aria-label="Category of the selected features"
					>
						<SelectValue placeholder="Mixed categories" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NO_CATEGORY}>No category</SelectItem>
						{props.categoryOptions.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			<Button
				size="sm"
				variant={props.moveArmed ? "default" : "outline"}
				className="any-pointer-coarse:min-h-11"
				aria-pressed={props.moveArmed}
				disabled={!props.actions.move}
				onClick={props.onToggleMove}
			>
				<Move />
				Move
			</Button>
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					className="flex-1 any-pointer-coarse:min-h-11"
					aria-label="Undo"
					disabled={props.busy || !props.canUndo}
					onClick={props.onUndo}
				>
					<Undo2 />
					Undo
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="flex-1 any-pointer-coarse:min-h-11"
					aria-label="Redo"
					disabled={props.busy || !props.canRedo}
					onClick={props.onRedo}
				>
					<Redo2 />
					Redo
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					className="flex-1 any-pointer-coarse:min-h-11"
					disabled={props.busy || !props.dirty}
					onClick={props.onSave}
				>
					<Save />
					Save
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="any-pointer-coarse:min-h-11"
					disabled={props.busy || (!props.dirty && !props.moveArmed)}
					onClick={props.onCancel}
				>
					<X />
					Cancel
				</Button>
				<Button
					size="icon-sm"
					variant="outline"
					className="text-destructive any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
					aria-label="Delete selected features"
					title="Delete selected features"
					disabled={!props.actions.delete}
					onClick={props.onDelete}
				>
					<Trash2 />
				</Button>
			</div>
			<Button
				size="sm"
				variant="ghost"
				className="any-pointer-coarse:min-h-11"
				disabled={props.busy}
				onClick={props.onClear}
			>
				Clear selection
			</Button>
		</div>
	);
}
