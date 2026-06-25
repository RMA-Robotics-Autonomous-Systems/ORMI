"use client";

// ⚠ COORDINATE RULE — everything in this widget that touches MapLibre,
// terra-draw, GeoJSON, the saved MapDB C2Feature, and mission
// objective.geometries[].geometry.coordinates uses [lng, lat]. The ONLY swap in
// the system is mission_feedback waypoints (already swapped by S2; use .lngLat,
// never re-swap). Agent positions from /multi_robot/edge/feedback are geographic
// degrees with position.x = longitude, position.y = latitude — so an agent
// marker is [position.x, position.y] = [lng, lat], NO swap.

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	LocalDataSourcesProvider,
	RemoteCallDefinition,
	SelectedTopic,
	useAvailableRemoteCalls,
	useLocalDataSource,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Layers, Map as MapIcon, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreInstance } from "maplibre-gl";
import MapLibreMap, {
	Layer,
	Marker,
	Source,
	type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
	TerraDraw,
	TerraDrawLineStringMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawSelectMode,
	type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

import { C2Call } from "../datasource/remote-calls";
import { C2Feature } from "../types/c2-types";
import { setPickedFeature, setDraftGeometry } from "../state/map-editing-store";
import { publishFeatureNames } from "../state/c2-catalog-store";
import { useAgentName } from "../state/c2-agents-store";
import {
	DrawFeature,
	c2FeatureToDrawFeature,
	drawFeatureToC2Feature,
	drawFeatureToInlineGeometry,
	readFeatureId,
} from "./feature-geojson";
import { collectTelemetry, extractAgentPosition } from "./fleet-helpers";
import { parseMissionFeedback } from "../types/mission-feedback";
import { useMapInit } from "./maps-shared/use-map-init";
import { useMapStyle } from "./maps-shared/use-map-style";
import { MAP_OVERLAYS, resolveOverlays } from "./maps-shared/overlay-layers";
import { RAINVIEWER_OVERLAY_ID } from "./maps-shared/rainviewer";
import { RainviewerOverlay } from "./rainviewer-overlay";

/**
 * F6 — Map widget with full draw/edit + features layer + live overlay (D4).
 *
 * Three distinct layers:
 *  (a) terra-draw authoring layer (point/line/polygon), bright editing style.
 *  (b) persisted MapDB features (`c2.features.*`), muted palette, read-only
 *      geometry — clicking one picks it into the map-editing store (hand-off to
 *      the F5 mission editor); editing loads it into the draw layer.
 *  (c) live overlay: `mission_feedback` waypoint paths (S2 `.lngLat`) + agent
 *      position markers from `/multi_robot/edge/feedback`. Non-interactive,
 *      accent palette, gated independently via the topic health — its offline
 *      state never blocks the draw/feature CRUD core.
 *
 * CRUD is one-shot remote calls with refetch-after-write (like F4).
 */

/** Toolbar mode. */
type MapMode = "view" | "draw-point" | "draw-line" | "draw-polygon" | "edit";

/** Props for the MissionMap widget. */
interface MissionMapProps extends Record<string, unknown> {
	title: string;
	/** Raster XYZ tile URL template for the base map. */
	mapUrl?: string;
	/** Last-used MapDB collection (persisted in config). */
	defaultCollection?: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
	/** Overlay layer ids enabled by default (see `MAP_OVERLAYS`). */
	overlays?: string[];
	/** `/multi_robot/mission_feedback` topic for the waypoint overlay. */
	feedbackTopic?: SelectedTopic;
	/** `/multi_robot/edge/feedback` topic for live agent markers. */
	agentTopic?: SelectedTopic;
}

const DEFAULT_MAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Selectable raster base-map providers (XYZ tile templates), mirroring the
 * std-widgets map widget. Rendered as a dropdown via the JSON Schema `oneOf`.
 */
const MAP_TILE_PROVIDERS = [
	{
		const: "https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png",
		title: "Carto Voyager (labels under)",
	},
	{ const: DEFAULT_MAP_URL, title: "OpenStreetMap" },
	{
		const: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
		title: "OpenStreetMap Humanitarian",
	},
	{
		const: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
		title: "OpenTopoMap",
	},
	{
		const: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
		title: "Stadia Alidade Smooth Dark",
	},
	{
		const: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg",
		title: "Stadia Alidade Satellite",
	},
	{
		const: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		title: "ArcGIS World Imagery",
	},
	{
		const: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
		title: "ArcGIS World Topo Map",
	},
	{
		const: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
		title: "GeoDataCenter TopPlus (gray)",
	},
	{
		const: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
		title: "GeoDataCenter TopPlus (color)",
	},
];

/** Resolve a C2 call definition by name. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

/** Normalize the `c2.features.collections` response into a string list. */
function normalizeCollections(data: unknown): string[] {
	const raw = Array.isArray(data)
		? data
		: Array.isArray((data as { collections?: unknown })?.collections)
			? (data as { collections: unknown[] }).collections
			: [];
	const out: string[] = [];
	for (const entry of raw) {
		if (typeof entry === "string" && entry.length > 0) out.push(entry);
		else if (
			entry &&
			typeof entry === "object" &&
			typeof (entry as { name?: unknown }).name === "string"
		) {
			out.push((entry as { name: string }).name);
		}
	}
	return out;
}

/** Normalize the `c2.features.list` response into a `C2Feature[]`. */
function normalizeFeatures(data: unknown): C2Feature[] {
	const raw = Array.isArray(data)
		? data
		: Array.isArray((data as { features?: unknown })?.features)
			? (data as { features: unknown[] }).features
			: [];
	return raw.filter(
		(f): f is C2Feature =>
			f != null && typeof f === "object" && "geometry" in f,
	);
}

// ---------------------------------------------------------------------------
// Live overlay (layer c)
// ---------------------------------------------------------------------------

/** Per-topic buffered source shape. */
interface BufferedSource {
	data: unknown[];
}

/** One live agent marker on the map. */
interface AgentMarkerData {
	id: string;
	lngLat: [number, number];
}

/**
 * A single agent marker.
 *
 * A hoisted (module-level) component so it can call {@link useAgentName} for the
 * agent's namespace name — hooks can't run inside the `.map` of the parent. Its
 * identity is stable across renders, so markers don't remount. The full
 * `agent.id` stays in the `title` tooltip, with the resolved name shown as a
 * small label next to the dot.
 */
function AgentMarker({ agent }: { agent: AgentMarkerData }) {
	const name = useAgentName(agent.id);
	return (
		<Marker longitude={agent.lngLat[0]} latitude={agent.lngLat[1]}>
			<div className="flex items-center gap-1" title={agent.id}>
				<div className="w-3 h-3 rounded-full bg-sky-500 border-2 border-white shadow" />
				{name && (
					<span className="text-[10px] leading-none px-1 py-0.5 rounded bg-white/80 text-sky-900 shadow-sm whitespace-nowrap">
						{name}
					</span>
				)}
			</div>
		</Marker>
	);
}

/**
 * Live overlay body: renders mission_feedback waypoint paths and agent markers.
 * Reads its own LocalDataSource health and degrades silently — it never blocks
 * the draw/CRUD core (only its own paint disappears when offline).
 */
function LiveOverlay(props: {
	feedbackTopic?: SelectedTopic;
	agentTopic?: SelectedTopic;
}) {
	const { sources, getTopicHealth } = useLocalDataSource();

	// Waypoint paths from mission_feedback (S2 .lngLat — already [lng,lat]).
	const waypointPaths = useMemo<[number, number][][]>(() => {
		if (!props.feedbackTopic) return [];
		const paths: [number, number][][] = [];
		for (const source of (
			sources as Map<string, BufferedSource>
		).values()) {
			const latest = source.data[source.data.length - 1];
			if (latest == null) continue;
			const msg = latest as { mission_feedback?: string };
			const fb =
				typeof msg.mission_feedback === "string"
					? parseMissionFeedback(msg.mission_feedback)
					: parseMissionFeedback(latest as never);
			if (!fb) continue;
			for (const task of fb.tasks) {
				const line = task.waypoints.map((w) => w.lngLat);
				if (line.length > 0) paths.push(line);
			}
		}
		return paths;
	}, [sources, props.feedbackTopic]);

	// Agent markers from /edge/feedback: [position.x, position.y] = [lng, lat].
	const agentMarkers = useMemo<AgentMarkerData[]>(() => {
		if (!props.agentTopic) return [];
		const buffers = [
			...(sources as Map<string, BufferedSource>).values(),
		].map((s) => s.data);
		const out: AgentMarkerData[] = [];
		for (const t of collectTelemetry(buffers)) {
			const pos = t.position ?? extractAgentPosition(t);
			if (!pos) continue;
			out.push({ id: t.agent_id, lngLat: [pos.x, pos.y] });
		}
		return out;
	}, [sources, props.agentTopic]);

	const feedbackHealth = props.feedbackTopic
		? getTopicHealth(props.feedbackTopic)
		: "offline";

	const pathFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: waypointPaths.map((coords) => ({
				type: "Feature" as const,
				properties: {},
				geometry: { type: "LineString" as const, coordinates: coords },
			})),
		}),
		[waypointPaths],
	);

	return (
		<>
			{feedbackHealth === "online" && waypointPaths.length > 0 && (
				<Source id="c2-feedback-paths" type="geojson" data={pathFc}>
					<Layer
						id="c2-feedback-paths-line"
						type="line"
						paint={{
							"line-color": "#f97316",
							"line-width": 2,
							"line-dasharray": [2, 2],
						}}
					/>
				</Source>
			)}
			{agentMarkers.map((agent) => (
				<AgentMarker key={agent.id} agent={agent} />
			))}
		</>
	);
}

// ---------------------------------------------------------------------------
// Open-source overlay layers — raster tiles above the base, below features
// ---------------------------------------------------------------------------

/**
 * Render the active open-source overlays as raster layers. `beforeId` pins them
 * under the C2 feature fill (so they sit above the base map but below the
 * feature / draw / live layers). The id is always present because
 * `FeatureLayers` renders unconditionally.
 */
function OverlayLayers(props: { active: string[] }) {
	return (
		<>
			{resolveOverlays(props.active).map((overlay) => (
				<Source
					key={overlay.id}
					id={`c2-overlay-${overlay.id}`}
					type="raster"
					tiles={overlay.tiles}
					tileSize={256}
				>
					<Layer
						id={`c2-overlay-${overlay.id}-layer`}
						type="raster"
						beforeId="c2-features-fill"
						paint={{ "raster-opacity": 1 }}
					/>
				</Source>
			))}
		</>
	);
}

/** In-map checklist to toggle overlays live (session-only; config seeds it). */
function OverlayPanel(props: {
	active: string[];
	onToggle: (id: string) => void;
	onClose: () => void;
}) {
	return (
		<div className="absolute top-2 right-2 z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-1.5 shadow-md w-56">
			<div className="flex items-center justify-between">
				<div className="text-xs font-medium">Overlay layers</div>
				<Button
					size="sm"
					variant="ghost"
					className="h-6 w-6 p-0"
					onClick={props.onClose}
				>
					<X className="w-3.5 h-3.5" />
				</Button>
			</div>
			{MAP_OVERLAYS.map((overlay) => (
				<label
					key={overlay.id}
					className="flex items-center gap-2 text-xs cursor-pointer"
				>
					<input
						type="checkbox"
						className="h-3.5 w-3.5"
						checked={props.active.includes(overlay.id)}
						onChange={() => props.onToggle(overlay.id)}
					/>
					{overlay.title}
				</label>
			))}
			{/* Dynamic (time-stamped, animated) overlay — not in MAP_OVERLAYS. */}
			<label className="flex items-center gap-2 text-xs cursor-pointer">
				<input
					type="checkbox"
					className="h-3.5 w-3.5"
					checked={props.active.includes(RAINVIEWER_OVERLAY_ID)}
					onChange={() => props.onToggle(RAINVIEWER_OVERLAY_ID)}
				/>
				RainViewer radar (live)
			</label>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Feature layer (layer b) — rendered as geojson sources by geometry type
// ---------------------------------------------------------------------------

/** Render the persisted MapDB features as muted fill/line/circle layers. */
function FeatureLayers(props: { features: C2Feature[] }) {
	const fc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: props.features
				.filter((f) => f.geometry && f.geometry.coordinates != null)
				.map((f) => ({
					type: "Feature" as const,
					properties: {
						feature_id: readFeatureId(f) ?? "",
						name: f.properties?.name ?? "",
					},
					geometry: {
						type: f.geometry?.type,
						coordinates: f.geometry?.coordinates,
					} as never,
				})),
		}),
		[props.features],
	);

	return (
		<Source id="c2-features" type="geojson" data={fc}>
			<Layer
				id="c2-features-fill"
				type="fill"
				filter={["==", ["geometry-type"], "Polygon"]}
				paint={{ "fill-color": "#64748b", "fill-opacity": 0.2 }}
			/>
			<Layer
				id="c2-features-line"
				type="line"
				filter={[
					"any",
					["==", ["geometry-type"], "Polygon"],
					["==", ["geometry-type"], "LineString"],
				]}
				paint={{ "line-color": "#475569", "line-width": 1.5 }}
			/>
			<Layer
				id="c2-features-circle"
				type="circle"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 5,
					"circle-color": "#64748b",
					"circle-stroke-color": "#1e293b",
					"circle-stroke-width": 1,
				}}
			/>
		</Source>
	);
}

// ---------------------------------------------------------------------------
// Save prompt
// ---------------------------------------------------------------------------

/** Inline name/feature_type prompt shown after a draw finishes / on edit save. */
function SavePrompt(props: {
	initialName: string;
	initialType: string;
	onCancel: () => void;
	onConfirm: (name: string, featureType: string) => void;
	busy: boolean;
}) {
	const [name, setName] = useState(props.initialName);
	const [featureType, setFeatureType] = useState(props.initialType);
	return (
		<div className="absolute top-2 left-2 z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-2 shadow-md w-64">
			<div className="text-xs font-medium">Save feature</div>
			<Input
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="Feature name"
				className="h-7 text-xs"
			/>
			<Input
				value={featureType}
				onChange={(e) => setFeatureType(e.target.value)}
				placeholder="Feature type (geofence, road, poi…)"
				className="h-7 text-xs"
			/>
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					className="h-7 flex-1"
					disabled={props.busy || name.trim().length === 0}
					onClick={() =>
						props.onConfirm(name.trim(), featureType.trim())
					}
				>
					<Save className="w-3.5 h-3.5 mr-1" />
					Save
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7"
					disabled={props.busy}
					onClick={props.onCancel}
				>
					<X className="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Map body
// ---------------------------------------------------------------------------

/** A geometry pending the save prompt (drawn or being edited). */
interface PendingSave {
	feature: DrawFeature;
	/** Preserved feature_id when editing; undefined when creating. */
	featureId?: string;
	name: string;
	featureType: string;
}

/** Inner body once the CRUD call definitions are resolved. */
function MissionMapBody(props: {
	mapUrl: string;
	defaultCollection?: string;
	collectionsDef: RemoteCallDefinition;
	listDef?: RemoteCallDefinition;
	saveDef?: RemoteCallDefinition;
	deleteDef?: RemoteCallDefinition;
	feedbackTopic?: SelectedTopic;
	agentTopic?: SelectedTopic;
	overlays?: string[];
}) {
	const collectionsCall = useRemoteCall<Record<string, never>, unknown>(
		props.collectionsDef,
	);
	const listCall = useRemoteCall<{ collectionName: string }, unknown>(
		props.listDef ?? props.collectionsDef,
	);
	const saveCall = useRemoteCall<
		{ collectionName: string; feature: unknown },
		unknown
	>(props.saveDef ?? props.collectionsDef);
	const deleteCall = useRemoteCall<
		{ collectionName: string; featureId: string },
		unknown
	>(props.deleteDef ?? props.collectionsDef);

	const { startingLocation } = useMapInit();
	const mapStyle = useMapStyle(props.mapUrl);
	const mapRef = useRef<MapRef>(null);
	const drawRef = useRef<TerraDraw | null>(null);

	const [mode, setMode] = useState<MapMode>("view");
	const [collections, setCollections] = useState<string[]>([]);
	const [collection, setCollection] = useState<string>(
		props.defaultCollection ?? "",
	);
	const [features, setFeatures] = useState<C2Feature[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [pending, setPending] = useState<PendingSave | null>(null);
	const [pickedId, setPickedId] = useState<string | null>(null);
	const [activeOverlays, setActiveOverlays] = useState<string[]>(
		() => props.overlays ?? [],
	);
	const [overlaysOpen, setOverlaysOpen] = useState(false);

	// Toggle a single overlay on/off (session-only; config seeds the initial set).
	const toggleOverlay = useCallback((id: string) => {
		setActiveOverlays((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	}, []);

	const { execute: executeCollections } = collectionsCall;
	const { execute: executeList } = listCall;

	// Fetch collections on mount; default to first (or persisted last-used).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const result = await executeCollections({});
			if (cancelled || !result.success) {
				if (!cancelled && !result.success) {
					setError(result.error ?? "Failed to list collections");
				}
				return;
			}
			const list = normalizeCollections(result.data);
			setCollections(list);
			setCollection((current) =>
				current && list.includes(current) ? current : (list[0] ?? ""),
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [executeCollections]);

	// Refetch the feature list whenever the active collection changes.
	const refetchFeatures = useCallback(async () => {
		if (!collection) {
			setFeatures([]);
			return;
		}
		const result = await executeList({ collectionName: collection });
		if (!result.success) {
			setError(result.error ?? "Failed to list features");
			return;
		}
		setError(null);
		const nextFeatures = normalizeFeatures(result.data);
		setFeatures(nextFeatures);
		publishFeatureNames(
			nextFeatures.flatMap((f) => {
				const id = readFeatureId(f);
				return id ? [{ feature_id: id, name: f.properties?.name }] : [];
			}),
		);
	}, [collection, executeList]);

	useEffect(() => {
		void refetchFeatures();
	}, [refetchFeatures]);

	// terra-draw lifecycle — construct on map load, tear down on unmount.
	const handleMapLoad = useCallback(() => {
		const map = mapRef.current?.getMap();
		if (!map || drawRef.current) return;
		const draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({
				map: map as MapLibreInstance,
			}),
			modes: [
				new TerraDrawPointMode(),
				new TerraDrawLineStringMode(),
				new TerraDrawPolygonMode(),
				new TerraDrawSelectMode(),
			],
		});
		draw.start();
		draw.setMode("static");
		// A finished draw becomes a pending save (create flow) AND is published to
		// the map-editing store so the F5 mission editor can pick it up inline via
		// "Add drawn geometry" (one-way hand-off; [lng,lat] preserved, no swap).
		draw.on("finish", (id) => {
			const snap = draw.getSnapshotFeature(id);
			if (!snap) return;
			const drawn = snap as unknown as DrawFeature;
			setPending({
				feature: drawn,
				name: "",
				featureType: collectionToType(collection),
			});
			const inline = drawFeatureToInlineGeometry(drawn);
			setDraftGeometry(inline.geometry);
		});
		drawRef.current = draw;
	}, [collection]);

	useEffect(() => {
		return () => {
			if (drawRef.current) {
				try {
					drawRef.current.stop();
				} catch {
					/* already torn down */
				}
				drawRef.current = null;
			}
		};
	}, []);

	// Drive terra-draw mode from the toolbar mode.
	useEffect(() => {
		const draw = drawRef.current;
		if (!draw || !draw.enabled) return;
		switch (mode) {
			case "draw-point":
				draw.setMode("point");
				break;
			case "draw-line":
				draw.setMode("linestring");
				break;
			case "draw-polygon":
				draw.setMode("polygon");
				break;
			case "edit":
				draw.setMode("select");
				break;
			case "view":
			default:
				draw.setMode("static");
				break;
		}
	}, [mode]);

	/** Confirm a pending save: build the C2Feature and persist, then refetch. */
	const confirmSave = useCallback(
		async (name: string, featureType: string) => {
			if (!pending) return;
			if (!props.saveDef || !collection) {
				setError("c2.features.save or collection unavailable");
				return;
			}
			const feature = drawFeatureToC2Feature(pending.feature, {
				name,
				feature_type: featureType,
				feature_id: pending.featureId,
			});
			setBusy(true);
			const result = await saveCall.execute({
				collectionName: collection,
				feature,
			});
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to save feature");
				return;
			}
			setError(null);
			setPending(null);
			// Clear the authoring layer and return to view.
			drawRef.current?.clear();
			setMode("view");
			await refetchFeatures();
		},
		[pending, props.saveDef, collection, saveCall, refetchFeatures],
	);

	/** Load a stored feature into the draw layer for editing (same id). */
	const editFeature = useCallback((feature: C2Feature) => {
		const draw = drawRef.current;
		if (!draw) return;
		const drawn = c2FeatureToDrawFeature(feature);
		if (!drawn) {
			setError("Feature geometry can't be edited.");
			return;
		}
		draw.clear();
		draw.addFeatures([drawn as unknown as GeoJSONStoreFeatures]);
		setPending({
			feature: drawn,
			featureId: readFeatureId(feature) ?? undefined,
			name:
				typeof feature.properties?.name === "string"
					? feature.properties.name
					: "",
			featureType:
				typeof feature.properties?.feature_type === "string"
					? feature.properties.feature_type
					: "",
		});
		setMode("edit");
	}, []);

	/** Delete the selected stored feature, then refetch. */
	const deleteFeature = useCallback(
		async (feature: C2Feature) => {
			const featureId = readFeatureId(feature);
			if (!props.deleteDef || !collection || !featureId) {
				setError("c2.features.delete unavailable");
				return;
			}
			if (
				typeof window !== "undefined" &&
				!window.confirm(
					`Delete feature "${feature.properties?.name ?? featureId}"?`,
				)
			) {
				return;
			}
			setBusy(true);
			const result = await deleteCall.execute({
				collectionName: collection,
				featureId,
			});
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to delete feature");
				return;
			}
			setError(null);
			if (pickedId === featureId) {
				setPickedId(null);
				setPickedFeature(null);
			}
			await refetchFeatures();
		},
		[props.deleteDef, collection, deleteCall, refetchFeatures, pickedId],
	);

	/** Map click → in View mode, pick a feature under the cursor (hand-off). */
	const handleMapClick = useCallback(
		(event: { point: { x: number; y: number } }) => {
			if (mode !== "view") return;
			const map = mapRef.current?.getMap();
			if (!map) return;
			const hits = map.queryRenderedFeatures(
				[event.point.x, event.point.y],
				{
					layers: [
						"c2-features-fill",
						"c2-features-line",
						"c2-features-circle",
					],
				},
			);
			const id = hits[0]?.properties?.feature_id;
			if (typeof id === "string" && id.length > 0) {
				setPickedId(id);
				setPickedFeature(id);
			}
		},
		[mode],
	);

	const pickedFeature = useMemo(
		() => features.find((f) => readFeatureId(f) === pickedId) ?? null,
		[features, pickedId],
	);

	return (
		<div className="h-full w-full flex flex-col text-sm">
			{/* Toolbar */}
			<div className="flex items-center gap-2 p-2 shrink-0 flex-wrap border-b">
				<div className="flex items-center gap-1">
					{(
						[
							["view", "View"],
							["draw-point", "Point"],
							["draw-line", "Line"],
							["draw-polygon", "Polygon"],
							["edit", "Edit"],
						] as [MapMode, string][]
					).map(([value, label]) => (
						<Button
							key={value}
							size="sm"
							variant={mode === value ? "default" : "outline"}
							className="h-7 text-xs"
							onClick={() => setMode(value)}
						>
							{label}
						</Button>
					))}
				</div>

				<Select
					value={collection || undefined}
					onValueChange={(value) => {
						setCollection(value);
						setPickedId(null);
						setPickedFeature(null);
					}}
				>
					<SelectTrigger className="h-7 w-40 text-xs">
						<SelectValue placeholder="Collection" />
					</SelectTrigger>
					<SelectContent>
						{collections.map((name) => (
							<SelectItem key={name} value={name}>
								{name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Badge variant="secondary">{features.length} features</Badge>

				<Button
					size="sm"
					variant={overlaysOpen ? "default" : "outline"}
					className="h-7 text-xs ml-auto"
					onClick={() => setOverlaysOpen((open) => !open)}
				>
					<Layers className="w-3.5 h-3.5 mr-1" />
					Layers
					{activeOverlays.length > 0 && (
						<Badge variant="secondary" className="ml-1 px-1">
							{activeOverlays.length}
						</Badge>
					)}
				</Button>
			</div>

			{error && (
				<div className="text-xs text-destructive bg-destructive/10 px-2 py-1 shrink-0">
					{error}
				</div>
			)}

			{/* Picked-feature actions (hand-off to F5 + edit/delete) */}
			{pickedFeature && (
				<div className="flex items-center gap-2 px-2 py-1 shrink-0 border-b bg-muted/40 text-xs">
					<span className="truncate flex-1" title={pickedId ?? ""}>
						Picked: {pickedFeature.properties?.name ?? pickedId}
					</span>
					<Button
						size="sm"
						variant="outline"
						className="h-6 text-xs"
						onClick={() => editFeature(pickedFeature)}
					>
						Edit
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 w-6 p-0 text-destructive"
						disabled={busy}
						onClick={() => void deleteFeature(pickedFeature)}
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			)}

			{/* Map */}
			<div className="relative flex-1 min-h-0">
				{pending && (
					<SavePrompt
						initialName={pending.name}
						initialType={pending.featureType}
						busy={busy}
						onCancel={() => {
							setPending(null);
							drawRef.current?.clear();
							setMode("view");
						}}
						onConfirm={(name, featureType) =>
							void confirmSave(name, featureType)
						}
					/>
				)}
				{overlaysOpen && (
					<OverlayPanel
						active={activeOverlays}
						onToggle={toggleOverlay}
						onClose={() => setOverlaysOpen(false)}
					/>
				)}
				<MapLibreMap
					ref={mapRef}
					mapStyle={mapStyle}
					initialViewState={{
						longitude: startingLocation[0],
						latitude: startingLocation[1],
						zoom: 14,
					}}
					onLoad={handleMapLoad}
					onClick={handleMapClick}
					style={{ width: "100%", height: "100%" }}
				>
					<OverlayLayers active={activeOverlays} />
					{activeOverlays.includes(RAINVIEWER_OVERLAY_ID) && (
						<RainviewerOverlay />
					)}
					<FeatureLayers features={features} />
					{(props.feedbackTopic || props.agentTopic) && (
						<LocalDataSourcesProvider
							SelectedTopics={
								[props.feedbackTopic, props.agentTopic].filter(
									Boolean,
								) as SelectedTopic[]
							}
							buffersSize={128}
						>
							<LiveOverlay
								feedbackTopic={props.feedbackTopic}
								agentTopic={props.agentTopic}
							/>
						</LocalDataSourcesProvider>
					)}
				</MapLibreMap>
			</div>
		</div>
	);
}

/** Default feature_type seed derived from the active collection name. */
function collectionToType(collection: string): string {
	return collection || "feature";
}

/**
 * Host: resolves the `c2.features.*` definitions (optionally pinned to a
 * datasource). Renders a placeholder until the collections call exists.
 */
const MissionMapWidget: React.FC<MissionMapProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const collectionsDef = useMemo(
		() => findCall(calls, C2Call.FeaturesCollections),
		[calls],
	);
	const listDef = useMemo(
		() => findCall(calls, C2Call.FeaturesList),
		[calls],
	);
	const saveDef = useMemo(
		() => findCall(calls, C2Call.FeaturesSave),
		[calls],
	);
	const deleteDef = useMemo(
		() => findCall(calls, C2Call.FeaturesDelete),
		[calls],
	);

	if (!collectionsDef) {
		return (
			<div className="h-full flex items-center justify-center p-3 text-sm text-muted-foreground text-center">
				No C2 datasource available. Add a C2 Control datasource to draw
				and manage map features.
			</div>
		);
	}

	return (
		<MissionMapBody
			mapUrl={props.mapUrl?.trim() || DEFAULT_MAP_URL}
			defaultCollection={props.defaultCollection}
			collectionsDef={collectionsDef}
			listDef={listDef}
			saveDef={saveDef}
			deleteDef={deleteDef}
			feedbackTopic={props.feedbackTopic}
			agentTopic={props.agentTopic}
			overlays={props.overlays}
		/>
	);
};

/**
 * Widget definition for the mission map widget (F6).
 * @returns Widget definition.
 */
export function MissionMapDefinition(): WidgetDefinition<MissionMapProps> {
	return {
		id: "c2-mission-map-widget",
		name: "C2 Mission Map",
		description:
			"Draw/edit MapDB features (c2.features.*) + live mission_feedback waypoint and agent-position overlay",
		titleProp: "title",
		icon: <MapIcon />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				mapUrl: {
					type: "string",
					title: "Base map",
					oneOf: MAP_TILE_PROVIDERS,
					default: DEFAULT_MAP_URL,
				},
				defaultCollection: {
					type: "string",
					title: "Default collection",
				},
				datasource_id: {
					type: "string",
					title: "C2 datasource id (optional)",
				},
				overlays: {
					type: "array",
					title: "Default overlay layers",
					uniqueItems: true,
					items: {
						type: "string",
						oneOf: [
							...MAP_OVERLAYS.map((o) => ({
								const: o.id,
								title: o.title,
							})),
							{
								const: RAINVIEWER_OVERLAY_ID,
								title: "RainViewer radar (live)",
							},
						],
					},
				},
				feedbackTopic: {
					type: "object",
					title: "Mission feedback topic",
				},
				agentTopic: { type: "object", title: "Edge feedback topic" },
			},
			required: ["title"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/mapUrl",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/defaultCollection",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/datasource_id",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/overlays",
				} as ControlElement,
				{
					type: "TopicSelect",
					scope: "#/properties/feedbackTopic",
					options: {
						dataRequirements: {
							accepts: [],
							acceptsRaw: ["c2_msgs/msg/MissionFeedback"],
						},
					},
				} as TopicSelectElement,
				{
					type: "TopicSelect",
					scope: "#/properties/agentTopic",
					options: {
						dataRequirements: {
							accepts: [],
							acceptsRaw: ["task_msgs/msg/Feedback"],
						},
					},
				} as TopicSelectElement,
			],
		} as VerticalLayout,

		data: {
			title: "Mission Map",
			mapUrl: DEFAULT_MAP_URL,
			overlays: [],
		},
		Component: MissionMapWidget,
	} as WidgetDefinition<MissionMapProps>;
}
