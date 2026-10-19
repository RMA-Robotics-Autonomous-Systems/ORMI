"use client";

import React, { useId, useState } from "react";
import { useAtomValue } from "jotai";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
	ControlProps,
	and,
	isControl,
	rankWith,
	schemaMatches,
} from "@jsonforms/core";
import { PuzzleIcon, Trash2Icon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Slider } from "@workspace/ui/components/slider";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";

import { appStore } from "../store";
import { formatCatalogueAge } from "../map-layers/catalogue-age";
import {
	mapLayerHealthAtom,
	mapServersAtom,
} from "../map-layers/map-servers-store";
import { useMapServersRegistryOptional } from "../map-layers/map-servers-provider";
import { useMapLayerProviders } from "../map-layers/use-map-layer-providers";
import { hasMapLayersSelectMarker } from "../map-layers/map-layers-property";
import {
	MAP_LAYER_FILTER_THRESHOLD,
	buildMapLayerSelectView,
	describeStaleMapLayerRef,
	filterMapLayerRows,
	removeMapLayerRef,
	setMapLayerEnabled,
	setMapLayerOpacity,
	type MapLayerSelectGroup,
	type MapLayerSelectRow,
	type StaleMapLayerRef,
} from "../map-layers/map-layers-selection";

/** Props for {@link MapLayersSelectControl}. */
export interface MapLayersSelectControlProps {
	/** The stored `MapLayerRef[]` (any shape is tolerated and kept). */
	value: unknown;
	/** Receives the whole next array on every operator edit. */
	onChange: (next: unknown[]) => void;
	/** Heading above the list. */
	label?: string;
	/** Optional description under the heading. */
	description?: string;
	/** `false` renders every control read-only. */
	enabled?: boolean;
	/** Validation errors to show under the list. */
	errors?: string;
	/** DOM id prefix. */
	id?: string;
}

/** Muted one-line notice. */
const Notice = ({ children }: { children: React.ReactNode }) => (
	<p className="text-muted-foreground text-sm">{children}</p>
);

/**
 * One catalogue layer: a switch, the title, and an opacity slider that is
 * enabled only while the layer is on and keeps its value while off.
 */
function LayerRow({
	row,
	serverKey,
	rowId,
	enabled,
	value,
	onChange,
}: {
	row: MapLayerSelectRow;
	serverKey: string;
	rowId: string;
	enabled: boolean;
	value: unknown;
	onChange: (next: unknown[]) => void;
}) {
	const on = row.ref?.enabled === true;
	const opacity = row.ref?.opacity ?? 1;
	return (
		<li
			className="grid grid-cols-[auto_minmax(0,1fr)_minmax(6rem,10rem)] items-center gap-3 py-1.5"
			data-map-layer-row={row.entry.id}
		>
			<Switch
				id={rowId}
				checked={on && row.selectable}
				disabled={!enabled || !row.selectable}
				onCheckedChange={(checked) =>
					onChange(
						setMapLayerEnabled(
							value,
							serverKey,
							row.entry.id,
							checked,
						),
					)
				}
			/>
			<div className="flex min-w-0 flex-col">
				<Label
					htmlFor={rowId}
					className={cn(
						"truncate text-sm font-normal",
						!row.selectable && "text-muted-foreground",
					)}
					title={row.entry.id}
				>
					{row.entry.title || row.entry.id}
				</Label>
				{!row.selectable && (
					<span className="text-muted-foreground text-xs">
						Not available in Web Mercator
					</span>
				)}
				{row.selectable && on && row.health === "not-responding" && (
					<span className="text-warning-text text-xs">
						Not responding
					</span>
				)}
			</div>
			{row.selectable ? (
				<div className="flex items-center gap-2">
					<Slider
						value={[opacity]}
						min={0}
						max={1}
						step={0.05}
						disabled={!enabled || !on}
						aria-label={`Opacity of ${row.entry.title || row.entry.id}`}
						onValueChange={(next) =>
							onChange(
								setMapLayerOpacity(
									value,
									serverKey,
									row.entry.id,
									next[0] ?? opacity,
								),
							)
						}
						className="flex-1"
					/>
					<span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
						{Math.round(opacity * 100)}%
					</span>
				</div>
			) : row.ref && enabled ? (
				<Button
					variant="ghost"
					size="sm"
					className="justify-self-end"
					onClick={() =>
						onChange(
							removeMapLayerRef(value, serverKey, row.entry.id),
						)
					}
				>
					<Trash2Icon aria-hidden />
					Remove
				</Button>
			) : (
				<span />
			)}
		</li>
	);
}

/** One registered server: its header, an optional filter, its layers. */
function ServerGroup({
	group,
	idPrefix,
	enabled,
	value,
	onChange,
}: {
	group: MapLayerSelectGroup;
	idPrefix: string;
	enabled: boolean;
	value: unknown;
	onChange: (next: unknown[]) => void;
}) {
	const [query, setQuery] = useState("");
	const { server } = group;
	const filterable = group.rows.length > MAP_LAYER_FILTER_THRESHOLD;
	const rows = filterable
		? filterMapLayerRows(group.rows, query)
		: group.rows;

	return (
		<section
			className="border-border flex flex-col gap-2 rounded-md border p-3"
			data-map-server={server.serverKey}
		>
			<header className="flex min-w-0 flex-wrap items-baseline gap-x-2">
				<span className="truncate text-sm font-medium">
					{server.title}
				</span>
				<span className="text-muted-foreground text-xs">
					{group.typeName}
				</span>
				<span className="text-muted-foreground ml-auto text-xs">
					{formatCatalogueAge(server.catalogFetchedAt)}
				</span>
			</header>
			{!group.adapterAvailable ? (
				<Notice>Server type not available ({server.adapterId}).</Notice>
			) : group.rows.length === 0 ? (
				<Notice>No layers.</Notice>
			) : (
				<>
					{filterable && (
						<Input
							type="search"
							value={query}
							placeholder="Filter layers"
							aria-label={`Filter layers of ${server.title}`}
							onChange={(event) => setQuery(event.target.value)}
						/>
					)}
					{rows.length === 0 ? (
						<Notice>No matching layers.</Notice>
					) : (
						<ul className="divide-border flex flex-col divide-y">
							{rows.map((row, index) => (
								<LayerRow
									key={row.entry.id}
									row={row}
									serverKey={server.serverKey}
									rowId={`${idPrefix}-${index}`}
									enabled={enabled}
									value={value}
									onChange={onChange}
								/>
							))}
						</ul>
					)}
				</>
			)}
		</section>
	);
}

/**
 * Stored refs the registry cannot place, in the unsupported-configuration
 * vocabulary (dashed border, muted puzzle icon, the named id, Remove), kept
 * exactly as saved until the operator removes them.
 */
function StaleGroup({
	stale,
	enabled,
	value,
	onChange,
}: {
	stale: StaleMapLayerRef[];
	enabled: boolean;
	value: unknown;
	onChange: (next: unknown[]) => void;
}) {
	return (
		<section
			className="border-border flex flex-col gap-2 rounded-md border border-dashed p-3"
			data-map-layers-stale=""
		>
			<header className="text-sm font-medium">Not available</header>
			<ul className="flex flex-col gap-2">
				{stale.map((item) => (
					<li
						key={`${item.ref.serverKey}\u0000${item.ref.layerId}`}
						className="flex items-center gap-3"
						data-map-layer-stale={item.kind}
					>
						<PuzzleIcon
							className="text-muted-foreground size-4 shrink-0"
							aria-hidden
						/>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-sm">
								{item.ref.layerId}
							</span>
							<span className="text-muted-foreground truncate text-xs">
								{describeStaleMapLayerRef(item)}. Kept as saved.
							</span>
						</div>
						{enabled && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									onChange(
										removeMapLayerRef(
											value,
											item.ref.serverKey,
											item.ref.layerId,
										),
									)
								}
							>
								<Trash2Icon aria-hidden />
								Remove
							</Button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

/**
 * The map-layer selection of one map: one group per registered server with a
 * switch and an opacity slider per layer, plus a "Not available" group for
 * stored refs the registry cannot place.
 *
 * Reads the registry (`mapServersAtom` on `appStore`) and the adapters
 * (`MAP_LAYER_PROVIDERS`) **when it renders**. In every state other than
 * settled it shows a notice and never writes, so the saved array is
 * untouched. Usable outside JSON Forms (a plugin page's own settings).
 *
 * @param props - Component props.
 * @returns React element.
 */
export function MapLayersSelectControl({
	value,
	onChange,
	label,
	description,
	enabled = true,
	errors,
	id,
}: MapLayersSelectControlProps) {
	const generatedId = useId();
	const idPrefix = id ?? generatedId;
	const state = useAtomValue(mapServersAtom, { store: appStore });
	const health = useAtomValue(mapLayerHealthAtom, { store: appStore });
	const providers = useMapLayerProviders();
	const registry = useMapServersRegistryOptional();

	let body: React.ReactNode;
	if (state.status === "unavailable") {
		body = <Notice>Map servers are not available here.</Notice>;
	} else if (state.status === "waiting") {
		body = <Notice>Loading map servers</Notice>;
	} else if (state.status === "failed") {
		body = (
			<Notice>
				Map servers could not be loaded. Saved layers are kept.
			</Notice>
		);
	} else {
		const view = buildMapLayerSelectView(
			state.servers,
			value,
			providers,
			health,
		);
		body = (
			<>
				{view.groups.length === 0 && (
					<Notice>
						No map servers.
						{registry?.settingsHref && (
							<>
								{" "}
								<a
									href={registry.settingsHref}
									className="text-primary underline-offset-4 hover:underline"
								>
									Add a map server
								</a>
							</>
						)}
					</Notice>
				)}
				{view.groups.map((group, index) => (
					<ServerGroup
						key={group.server.serverKey}
						group={group}
						idPrefix={`${idPrefix}-${index}`}
						enabled={enabled}
						value={value}
						onChange={onChange}
					/>
				))}
				{view.stale.length > 0 && (
					<StaleGroup
						stale={view.stale}
						enabled={enabled}
						value={value}
						onChange={onChange}
					/>
				)}
			</>
		);
	}

	return (
		<div
			className="flex flex-col gap-3"
			data-map-layers-select={state.status}
		>
			{label && (
				<span className="text-sm leading-none font-medium">
					{label}
				</span>
			)}
			{description && (
				<p className="text-muted-foreground text-sm">{description}</p>
			)}
			{body}
			{errors && <p className="text-destructive text-sm">{errors}</p>}
		</div>
	);
}

/**
 * JSON Forms control for a property carrying the `mapLayersSelect` marker
 * (`mapLayersProperty`). Writes the whole array through `handleChange`, so
 * edits go through the dialog's normal commit.
 *
 * @param props - JSON Forms control props.
 * @returns React element, or `null` when hidden.
 */
const MapLayersSelectJsonFormsControl = (props: ControlProps) => {
	const {
		id,
		data,
		handleChange,
		path,
		label,
		description,
		enabled,
		visible,
		errors,
	} = props;
	if (!visible) return null;
	return (
		<MapLayersSelectControl
			id={id}
			value={data}
			onChange={(next) => handleChange(path, next)}
			label={label}
			description={description}
			enabled={enabled}
			errors={errors}
		/>
	);
};

/**
 * Tester: any control whose resolved schema carries the `mapLayersSelect`
 * marker. Ranked 20, above the shadcn array-list renderer, which claims every
 * object array at 10 (a tie goes to whichever registry entry comes first).
 */
export const mapLayersSelectTester = rankWith(
	20,
	and(
		isControl,
		schemaMatches((schema) => hasMapLayersSelectMarker(schema)),
	),
);

export default withJsonFormsControlProps(MapLayersSelectJsonFormsControl);
