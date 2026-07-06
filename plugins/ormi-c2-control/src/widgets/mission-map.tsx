"use client";

// ⚠ COORDINATE RULE — everything in this widget that touches MapLibre,
// terra-draw, GeoJSON, the saved MapDB C2Feature, and mission
// objective.geometries[].geometry.coordinates uses [lng, lat]. The ONLY swap in
// the system is mission_feedback waypoints (already swapped by S2; use .lngLat,
// never re-swap).
//
// Agent markers are driven PRIMARILY by each agent's per-agent localization
// stream `{namespace}/edge/multi_robot/localization` (nav_msgs/msg/Odometry),
// one subscription per agent (see agent-localization-topics.ts). A position is
// GEOGRAPHIC — and a marker is drawn — ONLY when `header.frame_id === "map"`,
// where position.x = longitude and position.y = latitude (degrees), so the
// marker is [position.x, position.y] = [lng, lat], NO swap. A non-"map" frame is
// local/metric and yields no marker. The shared `agentTopic`
// (/multi_robot/edge/feedback) is kept ONLY as a fallback marker source for
// agents that have no namespace (plotting the embedded feedback `odometry` when
// geographic).

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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import {
	ChevronDown,
	Download,
	Layers,
	Lock,
	LockOpen,
	Map as MapIcon,
	Plus,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";
import type { Map as MapLibreInstance } from "maplibre-gl";
import MapLibreMap, {
	Layer,
	Marker,
	Popup,
	Source,
	useMap,
	type MapRef,
} from "react-map-gl/maplibre";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
	TerraDraw,
	TerraDrawLineStringMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawRectangleMode,
	TerraDrawSelectMode,
	type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

import { C2Call } from "../datasource/remote-calls";
import {
	C2Feature,
	MissionBehavior,
	MissionConfig,
	MissionStatus,
} from "../types/c2-types";
import {
	MissionConfigIssue,
	validateMissionConfig,
} from "../types/mission-config-validation";
import { publishFeatureNames } from "../state/c2-catalog-store";
import { useAgentName, useAgents } from "../state/c2-agents-store";
import { useSelectedMission } from "../state/selection-store";
import {
	editMissionDraft,
	hasMissionDraft,
	setMissionDraft,
	useMissionDraft,
} from "../state/mission-draft-store";
import {
	DrawFeature,
	c2FeatureToDrawFeature,
	drawFeatureToC2Feature,
	drawFeatureToInlineGeometry,
	readFeatureId,
} from "./feature-geojson";
import {
	DrawShape,
	drawShapeToMode,
	hydrateMissionDraft,
	mergeMissionOwnedFields,
} from "./mission-editor-helpers";
import {
	GeoJsonFeatureCollection,
	MapRegistryEntry,
	PlannerStatus,
	normalizeMapFeatures,
	normalizeMaps,
	normalizePlannerGraph,
	normalizePlannerStatus,
} from "./map-registry";
import {
	MissionGeometryFeature,
	inlineToDrawFeature,
	missionGeometriesToFeatureCollection,
} from "./mission-geometry";
import { normalizeMissions } from "./mission-list";
import { collectTelemetry, extractOdometryLngLat } from "./fleet-helpers";
import { fetchOsmRoads } from "./osm/overpass";
import {
	geofenceRingFromFeature,
	osmRoadsToFeatures,
	ringToBbox,
	type GeofenceRing,
} from "./osm/osm-to-features";
import { objectivesOutsideGeofence } from "./mission-geofence-check";
import { fetchOsmBuildings } from "./osm/buildings";
import type { OverpassBuildingWay } from "./osm/buildings";
import {
	osmBuildingsToExtrusionFc,
	osmBuildingsToRiskFeatures,
	type BuildingExtrusionFeatureCollection,
} from "./osm/osm-buildings";
import { useAgentLocalizationTopics } from "./agent-localization-topics";
import { FeedbackTask } from "../types/mission-feedback";
import { useMissionFeedback } from "../state/mission-feedback-store";
import { usePublishMissionFeedback } from "./mission-feedback-source";
import { vehicleColor } from "./plan-metrics";
import { useMapInit } from "./maps-shared/use-map-init";
import { useMapStyle } from "./maps-shared/use-map-style";
import { MAP_OVERLAYS, resolveOverlays } from "./maps-shared/overlay-layers";
import { RAINVIEWER_OVERLAY_ID } from "./maps-shared/rainviewer";
import { RainviewerOverlay } from "./rainviewer-overlay";

/**
 * F6 — Map widget on the first-class maps API, with a two-mode editing model.
 *
 * Two editing CONTEXTS (toolbar segmented toggle):
 *  - `map-editor` — edits per-map road/geofence/risk features in MapDB, scoped
 *    to the selected map (`c2.maps.*` + `c2.map.features.*`). Only Line (road)
 *    and Polygon (geofence/risk) geometry is valid here — the C2 rejects Point
 *    map features.
 *  - `mission` — edits the active mission's `objective.geometries[]`, saved back
 *    into the whole mission via fetch-modify-save (`c2.missions.*`). Gated on a
 *    selected mission (`useSelectedMission`).
 *
 * Within each context the TOOL is one of: view/pick · draw · edit · delete.
 *
 * Both feature layers render ALWAYS, in distinct styles, regardless of context:
 *  (a) map-feature layer — the selected map's features (muted palette).
 *  (b) mission-feature layer — the active mission's inline objective geometries
 *      (distinct accent), projected by `mission-geometry.ts`.
 *  (c) terra-draw authoring layer — bright editing style.
 *  (d) live overlay: `mission_feedback` waypoint paths (S2 `.lngLat`) + agent
 *      position markers. Markers come PRIMARILY from each agent's per-agent
 *      `{namespace}/edge/multi_robot/localization` Odometry stream, gated on
 *      `header.frame_id === "map"` (geographic); the shared `/edge/feedback`
 *      topic is a fallback for agents without a namespace. Non-interactive,
 *      accent palette, gated independently via the topic health — its offline
 *      state never blocks the editing core.
 *
 * A read-only planner-status badge (`c2.planner.status`) reports the map the
 * planner is actually using and warns when it has no routable features in range.
 *
 * Map-feature CRUD is one-shot remote calls with refetch-after-write; mission
 * geometry is owned end-to-end here (no mission-editor round trip).
 */

/** The editing context: which feature set the operator is authoring. */
type MapContext = "map-editor" | "mission";

/** The active tool within a context. */
type MapTool = "view" | "draw" | "edit" | "delete";

/** MapDB feature_type — the only valid feature types the C2 accepts. */
type FeatureType = "road" | "geofence" | "risk";

/** Allowed draw geometry per feature_type (the C2 validates this server-side). */
const FEATURE_TYPE_GEOMETRY: Record<FeatureType, "line" | "polygon"> = {
	road: "line",
	geofence: "polygon",
	risk: "polygon",
};

/** Human labels for the toolbar shape picker. */
const SHAPE_LABELS: Record<DrawShape, string> = {
	point: "Point",
	line: "Line",
	polygon: "Polygon",
	rectangle: "Rectangle",
};

/** Behavior options for the mission-panel enum select (mirrors F5). */
const BEHAVIOR_OPTIONS: [MissionBehavior, string][] = [
	[MissionBehavior.NAVIGATE, "0 — NAVIGATE"],
	[MissionBehavior.COVERAGE, "1 — COVERAGE"],
	[MissionBehavior.NAVIGATE_NO_PLANNING, "2 — NAVIGATE_NO_PLANNING"],
];

/**
 * One allocated-vehicle chip in the mission-panel read-only summary. Hoisted
 * (module-level) so it can call {@link useAgentName} for the namespace name —
 * hooks can't run in the parent's `.map`. Identity is stable (Pattern #10). The
 * primary allocation affordance is clicking the agent markers (R2.G); this is the
 * "who's assigned" readout.
 */
function AllocatedVehicleChip(props: { id: string }) {
	const name = useAgentName(props.id);
	return (
		<Badge variant="secondary" className="text-xs" title={props.id}>
			{name || props.id.slice(0, 8)}
		</Badge>
	);
}

/** Props for the MissionMap widget. */
interface MissionMapProps extends Record<string, unknown> {
	title: string;
	/** Raster XYZ tile URL template for the base map. */
	mapUrl?: string;
	/** Last-used map name (persisted in config). */
	defaultMap?: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
	/** Overlay layer ids enabled by default (see `MAP_OVERLAYS`). */
	overlays?: string[];
	/** `/multi_robot/mission_feedback` topic for the waypoint overlay. */
	feedbackTopic?: SelectedTopic;
	/**
	 * `/multi_robot/edge/feedback` topic — FALLBACK marker source for agents
	 * without a namespace (the embedded `odometry`, geographic-gated). Namespaced
	 * agents are plotted from their per-agent localization stream instead.
	 */
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

// ---------------------------------------------------------------------------
// Live overlay (layer d)
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
 * identity is stable across renders, so markers don't remount (Pattern #10). The
 * full `agent.id` stays in the `title` tooltip, with the resolved name shown as a
 * small label next to the dot.
 *
 * When `selectable` (mission context, a mission being edited, not read-only) the
 * marker is the PRIMARY robot-allocation affordance: clicking it toggles the
 * agent in the working mission's `vehicles` via `onSelect`. An allocated agent
 * (`selected`) renders visually distinct — an amber ring + filled badge — vs the
 * outline of an unallocated one. The click stops propagation so it does not also
 * fall through to the map's feature-pick handler.
 */
function AgentMarker(props: {
	agent: AgentMarkerData;
	selectable?: boolean;
	selected?: boolean;
	onSelect?: (agentId: string) => void;
}) {
	const { agent, selectable, selected, onSelect } = props;
	const name = useAgentName(agent.id);
	// Theme-following, high-contrast dot. Colors are app theme tokens (so the
	// marker tracks light/dark): an opaque themed fill, a `border-background` halo
	// that flips with the theme, plus a strong `ring`/shadow so the dot reads on
	// light, dark, and satellite basemaps. Selected (allocated) = the accent
	// `primary`, larger and ringed; unselected = the high-contrast `foreground`.
	const dotBase =
		"rounded-full border-2 border-background shadow-md ring-1 ring-foreground/40";
	const dotClass = selected
		? `${dotBase} w-5 h-5 bg-primary ring-2 ring-primary/60`
		: `${dotBase} w-4 h-4 bg-foreground`;
	// The label is absolutely positioned to the RIGHT of the dot so it overflows
	// the relative wrapper and does NOT enlarge the wrapper's box — keeping the
	// Marker's default `anchor="center"` pinned to the dot's centre, i.e. exactly
	// on the coordinate. Themed surface tokens for legibility on any basemap.
	const labelClass = selected
		? "absolute left-full top-1/2 -translate-y-1/2 ml-1.5 text-[10px] font-medium leading-none px-1.5 py-0.5 rounded bg-primary text-primary-foreground shadow-sm whitespace-nowrap pointer-events-none"
		: "absolute left-full top-1/2 -translate-y-1/2 ml-1.5 text-[10px] font-medium leading-none px-1.5 py-0.5 rounded bg-background text-foreground border border-border shadow-sm whitespace-nowrap pointer-events-none";
	// The Marker child is a wrapper sized to the DOT ONLY (relative). The dot fills
	// it, so with anchor="center" the dot's centre sits on the lng/lat. The label
	// is rendered absolutely and overflows without shifting the anchor.
	const inner = (
		<div className={`relative ${dotClass}`} title={agent.id}>
			{name && <span className={labelClass}>{name}</span>}
		</div>
	);
	return (
		<Marker
			longitude={agent.lngLat[0]}
			latitude={agent.lngLat[1]}
			anchor="center"
		>
			{selectable ? (
				<button
					type="button"
					className="cursor-pointer bg-transparent border-0 p-0"
					title={
						selected
							? `Unassign ${name || agent.id}`
							: `Assign ${name || agent.id}`
					}
					onClick={(e) => {
						// Stop the click from also reaching the map's feature-pick
						// handler (which would clear/override the selection).
						e.stopPropagation();
						onSelect?.(agent.id);
					}}
				>
					{inner}
				</button>
			) : (
				inner
			)}
		</Marker>
	);
}

/**
 * Per-agent localization overlay body — the PRIMARY agent-marker source.
 *
 * Reads each per-agent `{namespace}/edge/multi_robot/localization` Odometry
 * source (one subscription per agent), takes the latest message, and plots a
 * marker at `[lng, lat]` ONLY when the message frame is geographic
 * (`header.frame_id === "map"`, via {@link extractOdometryLngLat}). Skips agents
 * whose latest frame is non-geographic (no marker). Labels each source through
 * `agentByKey` (provider topic key → agent_id) so the hoisted {@link AgentMarker}
 * can resolve the namespace name. Degrades silently per source.
 */
function AgentLocalizationOverlayBody(props: {
	agentByKey: Map<string, string>;
	selectable?: boolean;
	selectedAgents?: Set<string>;
	onSelectAgent?: (agentId: string) => void;
}) {
	const { sources } = useLocalDataSource();

	const agentMarkers = useMemo<AgentMarkerData[]>(() => {
		const out: AgentMarkerData[] = [];
		for (const [key, source] of (
			sources as Map<string, BufferedSource>
		).entries()) {
			const agentId = props.agentByKey.get(key);
			if (!agentId) continue;
			const latest = source.data[source.data.length - 1];
			if (latest == null || typeof latest !== "object") continue;
			const msg = latest as { header?: { frame_id?: string } };
			const geo = extractOdometryLngLat(latest, msg.header?.frame_id);
			if (!geo) continue;
			out.push({ id: agentId, lngLat: [geo.lng, geo.lat] });
		}
		return out;
	}, [sources, props.agentByKey]);

	return (
		<>
			{agentMarkers.map((agent) => (
				<AgentMarker
					key={agent.id}
					agent={agent}
					selectable={props.selectable}
					selected={props.selectedAgents?.has(agent.id)}
					onSelect={props.onSelectAgent}
				/>
			))}
		</>
	);
}

/**
 * Agent localization overlay: subscribes one topic per agent (namespace + a
 * resolvable source) in its OWN local-datasource provider, driven by the
 * signature-stable topic set from {@link useAgentLocalizationTopics}. Renders
 * nothing when no agent has a namespaced localization stream yet.
 *
 * The agent namespace reaches the store via the REST roster (no ROS `source`),
 * so the per-agent subscriptions are built against `fallbackSource` — the ROS
 * datasource the operator already configured for the map's live telemetry.
 */
function AgentLocalizationOverlay(props: {
	fallbackSource?: DatasourceProviderSettings;
	selectable?: boolean;
	selectedAgents?: Set<string>;
	onSelectAgent?: (agentId: string) => void;
}) {
	const { topics, agentByKey } = useAgentLocalizationTopics(
		props.fallbackSource,
	);
	if (topics.length === 0) return null;
	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
			<AgentLocalizationOverlayBody
				agentByKey={agentByKey}
				selectable={props.selectable}
				selectedAgents={props.selectedAgents}
				onSelectAgent={props.onSelectAgent}
			/>
		</LocalDataSourcesProvider>
	);
}

/**
 * Whether a feedback `status` is a PREVIEW (planned) state — rendered dashed —
 * vs a committed/executing one (ACCEPTED/STARTED/PAUSED) — rendered solid.
 * Unknown / terminal states default to dashed (treated as not-yet-committed).
 */
function isPreviewStatus(status: MissionStatus): boolean {
	return (
		status === MissionStatus.PLANNED ||
		status === MissionStatus.PLANNED_ALTERNATIVE ||
		status === MissionStatus.PLANNED_FAILED ||
		!(
			status === MissionStatus.ACCEPTED ||
			status === MissionStatus.STARTED ||
			status === MissionStatus.PAUSED
		)
	);
}

/** A waypoint hover/click popover payload. */
interface WaypointPopover {
	lng: number;
	lat: number;
	vehicle: string;
	index: number;
	averageSpeed?: number;
	eta?: string | null;
}

/**
 * Hidden name-resolver: calls {@link useAgentName} for ONE vehicle id and
 * reports the resolved name up via `onName`. Hooks can't run in a `.map` with a
 * dynamic count, so the parent renders one keyed probe per visible vehicle to
 * build a `vehicleId → name` map for the route labels. Renders nothing.
 *
 * Hoisted (module-level) for a stable identity (Pattern #10).
 */
function VehicleNameProbe(props: {
	vehicleId: string;
	onName: (vehicleId: string, name: string) => void;
}) {
	const name = useAgentName(props.vehicleId);
	const { vehicleId, onName } = props;
	useEffect(() => {
		onName(vehicleId, name);
	}, [vehicleId, name, onName]);
	return null;
}

/**
 * Shared-feedback overlay body: renders per-vehicle mission_feedback routes and
 * FALLBACK agent markers for agents WITHOUT a namespace (plotting the embedded
 * feedback `odometry` when geographic). Agents with a namespace are covered by
 * {@link AgentLocalizationOverlay} and excluded here to avoid double markers.
 * Reads its own LocalDataSource health and degrades silently — it never blocks
 * the draw/CRUD core (only its own paint disappears when offline).
 *
 * Each task is its own `LineString` coloured by {@link vehicleColor} (the SAME
 * colour the feedback task list uses), styled solid (committed/executing) or
 * dashed (planned preview) by the feedback `status`. Numbered waypoint markers,
 * a per-route robot-name label, and a hover/click popover (speed + eta) make the
 * "which robot owns which route" attribution legible. Waypoints/labels use
 * MapLibre data-driven circle/symbol layers (performant for many points), unlike
 * the few React-marker agent positions.
 */
function LiveOverlay(props: {
	feedbackTopic?: SelectedTopic;
	agentTopic?: SelectedTopic;
	/** agent_ids already plotted by the per-agent localization overlay. */
	namespacedAgentIds: Set<string>;
	/** Marker selection threading (R2.G) — see {@link AgentMarker}. */
	selectable?: boolean;
	selectedAgents?: Set<string>;
	onSelectAgent?: (agentId: string) => void;
}) {
	const { sources, getTopicHealth } = useLocalDataSource();

	// Per-vehicle tasks from mission_feedback (S2 .lngLat — already [lng,lat]),
	// carrying the feedback `status` so the style can gate preview vs committed.
	//
	// `/multi_robot/mission_feedback` is a SINGLE shared topic carrying feedback
	// for ALL missions, interleaved. Reading the buffer tail directly redrew
	// whichever mission published last, flickering between plans. Instead: PUBLISH
	// every message into the per-mission feedback store (keyed by `mission_id`),
	// then READ ONLY the selected mission's slot — with no selection the store
	// returns the latest mission's slot, preserving the old "show whatever
	// published last" fallback. The store hands back a reference-stable, change-
	// fresh value per mission (deduped on `feedbackPlanSignature`), so an
	// interleaved message for ANOTHER mission updates THAT slot and never changes
	// `fb`'s identity here. `tasks` therefore stays referentially stable while the
	// shown plan is unchanged, the route/waypoint/label FC memos (keyed on `tasks`)
	// don't rebuild, and MapLibre stops repainting an unchanged plan — no flicker.
	usePublishMissionFeedback(
		sources as Map<string, { data: unknown[] }>,
		Boolean(props.feedbackTopic),
	);
	const selectedMission = useSelectedMission();
	const fb = useMissionFeedback(selectedMission);
	const tasks = useMemo<{ status: MissionStatus; task: FeedbackTask }[]>(
		() =>
			(fb?.tasks ?? [])
				.filter((task) => task.waypoints.length > 0)
				.map((task) => ({ status: fb!.status, task })),
		[fb],
	);

	// FALLBACK agent markers from /edge/feedback: only for agents with no
	// namespace (the namespaced ones come from the per-agent localization
	// overlay). The embedded `odometry` is geographic-gated via frame_id.
	const agentMarkers = useMemo<AgentMarkerData[]>(() => {
		if (!props.agentTopic) return [];
		const buffers = [
			...(sources as Map<string, BufferedSource>).values(),
		].map((s) => s.data);
		const out: AgentMarkerData[] = [];
		for (const t of collectTelemetry(buffers)) {
			if (props.namespacedAgentIds.has(t.agent_id)) continue;
			const raw = t as unknown as {
				odometry?: { header?: { frame_id?: string } };
				header?: { frame_id?: string };
			};
			const frameId =
				raw.odometry?.header?.frame_id ?? raw.header?.frame_id;
			const geo = extractOdometryLngLat(raw.odometry ?? t, frameId);
			if (!geo) continue;
			out.push({ id: t.agent_id, lngLat: [geo.lng, geo.lat] });
		}
		return out;
	}, [sources, props.agentTopic, props.namespacedAgentIds]);

	const feedbackHealth = props.feedbackTopic
		? getTopicHealth(props.feedbackTopic)
		: "offline";

	// Resolve vehicle names for the route labels: render one keyed probe per
	// visible vehicle (hooks can't run in the feature-building loop). Names land
	// in `names` and are stamped into the label features below.
	const vehicleIds = useMemo(
		() => [...new Set(tasks.map((t) => t.task.vehicle_id))],
		[tasks],
	);
	const [names, setNames] = useState<Record<string, string>>({});
	const handleName = useCallback((vehicleId: string, name: string) => {
		setNames((prev) =>
			prev[vehicleId] === name ? prev : { ...prev, [vehicleId]: name },
		);
	}, []);

	// Route line features — one LineString per task, data-driven colour + a
	// `dashed` flag (split into two filtered layers, since line-dasharray can't be
	// data-driven within one layer).
	const lineFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: tasks.map(({ status, task }) => ({
				type: "Feature" as const,
				properties: {
					vehicleId: task.vehicle_id,
					color: vehicleColor(task.vehicle_id),
					status,
					dashed: isPreviewStatus(status),
				},
				geometry: {
					type: "LineString" as const,
					coordinates: task.waypoints.map((w) => w.lngLat),
				},
			})),
		}),
		[tasks],
	);

	// Numbered waypoint point features (1-based index, colour, orientation).
	const pointFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: tasks.flatMap(({ task }) =>
				task.waypoints.map((w, i) => ({
					type: "Feature" as const,
					properties: {
						color: vehicleColor(task.vehicle_id),
						index: i + 1,
						orientation: w.orientation ?? 0,
						hasOrientation: w.orientation != null,
					},
					geometry: {
						type: "Point" as const,
						coordinates: w.lngLat,
					},
				})),
			),
		}),
		[tasks],
	);

	// Per-route label at the mid waypoint, carrying the resolved robot name.
	const labelFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: tasks.flatMap(({ task }) => {
				const wps = task.waypoints;
				const mid = wps[Math.floor(wps.length / 2)] ?? wps[0];
				if (!mid) return [];
				return [
					{
						type: "Feature" as const,
						properties: {
							color: vehicleColor(task.vehicle_id),
							name:
								names[task.vehicle_id] ??
								task.vehicle_id.slice(0, 8),
						},
						geometry: {
							type: "Point" as const,
							coordinates: mid.lngLat,
						},
					},
				];
			}),
		}),
		[tasks, names],
	);

	const [popover, setPopover] = useState<WaypointPopover | null>(null);

	const visible = feedbackHealth === "online" && tasks.length > 0;

	return (
		<>
			{vehicleIds.map((id) => (
				<VehicleNameProbe key={id} vehicleId={id} onName={handleName} />
			))}
			{visible && (
				<>
					<Source id="c2-feedback-paths" type="geojson" data={lineFc}>
						{/* Committed/executing routes: solid. */}
						<Layer
							id="c2-feedback-paths-solid"
							type="line"
							filter={["!", ["get", "dashed"]]}
							paint={{
								"line-color": ["get", "color"],
								"line-width": 3,
							}}
						/>
						{/* Planned preview routes: dashed. */}
						<Layer
							id="c2-feedback-paths-dashed"
							type="line"
							filter={["get", "dashed"]}
							paint={{
								"line-color": ["get", "color"],
								"line-width": 2.5,
								"line-dasharray": [2, 2],
							}}
						/>
					</Source>
					<Source
						id="c2-feedback-waypoints"
						type="geojson"
						data={pointFc}
					>
						<Layer
							id="c2-feedback-waypoints-circle"
							type="circle"
							paint={{
								"circle-radius": 8,
								"circle-color": ["get", "color"],
								"circle-stroke-color": "#ffffff",
								"circle-stroke-width": 1.5,
							}}
						/>
						<Layer
							id="c2-feedback-waypoints-index"
							type="symbol"
							layout={{
								"text-field": ["to-string", ["get", "index"]],
								"text-size": 10,
								"text-allow-overlap": true,
								"text-ignore-placement": true,
							}}
							paint={{ "text-color": "#ffffff" }}
						/>
						{/* Optional heading tick when orientation is present. */}
						<Layer
							id="c2-feedback-waypoints-heading"
							type="symbol"
							filter={["get", "hasOrientation"]}
							layout={{
								"text-field": "→",
								"text-size": 14,
								"text-rotate": ["get", "orientation"],
								"text-rotation-alignment": "map",
								"text-offset": [1.2, 0],
								"text-allow-overlap": true,
								"text-ignore-placement": true,
							}}
							paint={{
								"text-color": ["get", "color"],
								"text-halo-color": "#ffffff",
								"text-halo-width": 1,
							}}
						/>
					</Source>
					<Source
						id="c2-feedback-labels"
						type="geojson"
						data={labelFc}
					>
						<Layer
							id="c2-feedback-labels-text"
							type="symbol"
							layout={{
								"text-field": ["get", "name"],
								"text-size": 12,
								"text-offset": [0, -1.4],
								"text-anchor": "bottom",
								"text-allow-overlap": false,
							}}
							paint={{
								"text-color": ["get", "color"],
								"text-halo-color": "#ffffff",
								"text-halo-width": 1.5,
							}}
						/>
					</Source>
					{popover && (
						<Popup
							longitude={popover.lng}
							latitude={popover.lat}
							anchor="bottom"
							closeButton={false}
							closeOnClick={false}
							onClose={() => setPopover(null)}
						>
							<div className="text-xs">
								<div className="font-medium">
									{popover.vehicle} · waypoint {popover.index}
								</div>
								{popover.averageSpeed != null && (
									<div>speed: {popover.averageSpeed} m/s</div>
								)}
								{popover.eta && <div>eta: {popover.eta}</div>}
							</div>
						</Popup>
					)}
					{/* Drives the waypoint hover popover from the data-driven layer. */}
					<WaypointInteractions
						tasks={tasks}
						names={names}
						onShow={setPopover}
					/>
				</>
			)}
			{agentMarkers.map((agent) => (
				<AgentMarker
					key={agent.id}
					agent={agent}
					selectable={props.selectable}
					selected={props.selectedAgents?.has(agent.id)}
					onSelect={props.onSelectAgent}
				/>
			))}
		</>
	);
}

/**
 * Wires hover interactivity for the waypoint circle layer: on `mousemove` over
 * `c2-feedback-waypoints-circle` it resolves the hovered waypoint back to its
 * task/index and surfaces a speed/eta popover; clears it on `mouseleave`. A
 * hoisted component (Pattern #10) that registers/cleans up its own map handlers.
 */
function WaypointInteractions(props: {
	tasks: { status: MissionStatus; task: FeedbackTask }[];
	names: Record<string, string>;
	onShow: (p: WaypointPopover | null) => void;
}) {
	const { current: map } = useMap();
	const { tasks, names, onShow } = props;

	useEffect(() => {
		if (!map) return;
		const layer = "c2-feedback-waypoints-circle";

		const onMove = (e: maplibregl.MapLayerMouseEvent) => {
			const feat = e.features?.[0];
			if (!feat) return;
			map.getCanvas().style.cursor = "pointer";
			// Resolve the hovered point back to its task/waypoint by index + coord.
			const index = Number(feat.properties?.index);
			const geom = feat.geometry;
			if (geom.type !== "Point") return;
			const [lng, lat] = geom.coordinates as [number, number];
			for (const { task } of tasks) {
				const w = task.waypoints[index - 1];
				if (w && w.lngLat[0] === lng && w.lngLat[1] === lat) {
					onShow({
						lng,
						lat,
						vehicle:
							names[task.vehicle_id] ??
							task.vehicle_id.slice(0, 8),
						index,
						averageSpeed: w.average_speed,
						eta: w.eta,
					});
					return;
				}
			}
		};
		const onLeave = () => {
			map.getCanvas().style.cursor = "";
			onShow(null);
		};

		map.on("mousemove", layer, onMove);
		map.on("mouseleave", layer, onLeave);
		return () => {
			map.off("mousemove", layer, onMove);
			map.off("mouseleave", layer, onLeave);
		};
	}, [map, tasks, names, onShow]);

	return null;
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

/**
 * R2.F — extrude OSM building footprints as a MapLibre `fill-extrusion` 3D layer.
 * `fill-extrusion-height` reads the numeric `height` (metres) baked onto each
 * footprint by `osmBuildingsToExtrusionFc`; `fill-extrusion-base` is 0 (footprint
 * sits on the ground). Stable module-level component (Pattern #10).
 */
function Buildings3DLayer(props: { data: BuildingExtrusionFeatureCollection }) {
	return (
		<Source id="c2-buildings-3d" type="geojson" data={props.data}>
			<Layer
				id="c2-buildings-3d-extrusion"
				type="fill-extrusion"
				paint={{
					"fill-extrusion-color": "#94a3b8",
					"fill-extrusion-opacity": 0.6,
					"fill-extrusion-base": 0,
					"fill-extrusion-height": ["get", "height"],
				}}
			/>
		</Source>
	);
}

/**
 * Render the planner's navigation graph as a FAINT backdrop: thin low-contrast
 * edge lines + tiny low-opacity nodes. `beforeId="c2-features-fill"` pins both
 * layers UNDER the operator's map/mission feature layers (and the DOM agent
 * markers, which always paint above the canvas), so the graph reads as a subtle
 * reference, never competing with the operator's own geometry. Stable
 * module-level component (Pattern #10). An empty FeatureCollection draws nothing.
 */
function PlannerGraphLayer(props: { data: GeoJsonFeatureCollection }) {
	return (
		<Source id="c2-planner-graph" type="geojson" data={props.data as never}>
			{/* Edges (LineString): thin, subtle neutral, low opacity. */}
			<Layer
				id="c2-planner-graph-edges"
				type="line"
				beforeId="c2-features-fill"
				filter={["==", ["geometry-type"], "LineString"]}
				paint={{
					"line-color": "#64748b",
					"line-width": 1,
					"line-opacity": 0.35,
				}}
			/>
			{/* Nodes (Point): very small, low-opacity circles. */}
			<Layer
				id="c2-planner-graph-nodes"
				type="circle"
				beforeId="c2-features-fill"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 1.5,
					"circle-color": "#64748b",
					"circle-opacity": 0.35,
				}}
			/>
		</Source>
	);
}

/** In-map checklist to toggle overlays live (session-only; config seeds it). */
function OverlayPanel(props: {
	active: string[];
	onToggle: (id: string) => void;
	onClose: () => void;
	buildings3d: boolean;
	onToggleBuildings3d: () => void;
	plannerGraph: boolean;
	onTogglePlannerGraph: () => void;
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
			{/* 3D buildings — a fill-extrusion source from Overpass footprints,
			    not a raster overlay (held in its own toggle, not MAP_OVERLAYS). */}
			<label className="flex items-center gap-2 text-xs cursor-pointer">
				<input
					type="checkbox"
					className="h-3.5 w-3.5"
					checked={props.buildings3d}
					onChange={props.onToggleBuildings3d}
				/>
				3D buildings
			</label>
			{/* Planner navigation graph — a faint node/edge backdrop fetched from
			    the C2 (c2.planner.graph), not a raster overlay. */}
			<label className="flex items-center gap-2 text-xs cursor-pointer">
				<input
					type="checkbox"
					className="h-3.5 w-3.5"
					checked={props.plannerGraph}
					onChange={props.onTogglePlannerGraph}
				/>
				Planner graph
			</label>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Feature layer (layer b) — rendered as geojson sources by geometry type
// ---------------------------------------------------------------------------

/**
 * Layer (b) — the selected map's persisted MapDB features in a muted slate
 * palette. `risk` polygons are filled more strongly than `geofence` outlines so
 * the three feature types stay distinguishable; legacy Point features (no longer
 * authorable) still render as a small dot. `feature_id`/`feature_type` ride in
 * the properties so the View tool can pick a feature under the cursor.
 */
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
						feature_type: f.properties?.feature_type ?? "",
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
				paint={{
					"fill-color": [
						"case",
						["==", ["get", "feature_type"], "risk"],
						"#b91c1c",
						"#64748b",
					],
					"fill-opacity": [
						"case",
						["==", ["get", "feature_type"], "risk"],
						0.25,
						0.15,
					],
				}}
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
// Mission-feature layer (layer b') — the active mission's inline geometries
// ---------------------------------------------------------------------------

/**
 * Render the active mission's inline `objective.geometries[]` in a distinct
 * indigo accent so the operator can see the mission geometry on top of the map
 * features. Each feature carries its source `index` so the Mission-context View
 * tool can pick (and the Edit/Delete tools act on) a specific entry. Pure
 * `feature_id` references are not rendered here (those are map features).
 */
function MissionFeatureLayers(props: {
	geometries: {
		type: "FeatureCollection";
		features: MissionGeometryFeature[];
	};
}) {
	return (
		<Source id="c2-mission-geom" type="geojson" data={props.geometries}>
			<Layer
				id="c2-mission-geom-fill"
				type="fill"
				filter={["==", ["geometry-type"], "Polygon"]}
				paint={{ "fill-color": "#6366f1", "fill-opacity": 0.2 }}
			/>
			<Layer
				id="c2-mission-geom-line"
				type="line"
				filter={[
					"any",
					["==", ["geometry-type"], "Polygon"],
					["==", ["geometry-type"], "LineString"],
				]}
				paint={{ "line-color": "#4f46e5", "line-width": 2.5 }}
			/>
			<Layer
				id="c2-mission-geom-circle"
				type="circle"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 6,
					"circle-color": "#6366f1",
					"circle-stroke-color": "#ffffff",
					"circle-stroke-width": 1.5,
				}}
			/>
		</Source>
	);
}

// ---------------------------------------------------------------------------
// Save prompt
// ---------------------------------------------------------------------------

/**
 * Inline name + feature_type prompt for a MAP feature (map-editor context),
 * shown after a draw finishes or on edit save. The feature_type is constrained
 * to the C2's three valid types; it drives the saved `feature_type` (and, while
 * drawing, the allowed geometry — see `FEATURE_TYPE_GEOMETRY`).
 */
function SavePrompt(props: {
	initialName: string;
	initialType: FeatureType;
	onCancel: () => void;
	onConfirm: (name: string, featureType: FeatureType) => void;
	busy: boolean;
}) {
	const [name, setName] = useState(props.initialName);
	const [featureType, setFeatureType] = useState<FeatureType>(
		props.initialType,
	);
	return (
		<div className="absolute top-2 left-2 z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-2 shadow-md w-64">
			<div className="text-xs font-medium">Save map feature</div>
			<Input
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="Feature name"
				className="h-7 text-xs"
			/>
			<Select
				value={featureType}
				onValueChange={(value) => setFeatureType(value as FeatureType)}
			>
				<SelectTrigger className="h-7 text-xs">
					<SelectValue placeholder="Feature type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="road">road (line)</SelectItem>
					<SelectItem value="geofence">geofence (polygon)</SelectItem>
					<SelectItem value="risk">risk (polygon)</SelectItem>
				</SelectContent>
			</Select>
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					className="h-7 flex-1"
					disabled={props.busy || name.trim().length === 0}
					onClick={() => props.onConfirm(name.trim(), featureType)}
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

/** A map feature pending the save prompt (drawn or being edited). */
interface PendingSave {
	feature: DrawFeature;
	/** Preserved feature_id when editing; undefined when creating. */
	featureId?: string;
	name: string;
	featureType: FeatureType;
}

/**
 * Snapshot of the values the stable terra-draw `finish` handler reads. Kept in a
 * ref so the handler (registered once on map load) always sees the current
 * context/tool/featureType without re-registering — the React-Compiler-safe
 * alternative to closing over reactive state.
 */
interface DrawContextRef {
	context: MapContext;
	tool: MapTool;
	/** Pending map-editor feature_type when drawing a map feature. */
	mapFeatureType: FeatureType;
	/** The active mission id (so the once-registered finish handler edits the
	 *  right shared draft slot without re-registering on every selection). */
	selectedMission: string | null;
}

/**
 * Latest-ref interval: keep the callback in a ref refreshed every render, and arm
 * the interval purely on `delayMs`. This fully decouples "what to run" from "when
 * to run", so an unstable callback/closure can never re-arm (or leak) the timer.
 * `delayMs = null` disables it. (Tactical hardening; superseded once the
 * ORMI-native polled-remote-call hook lands.)
 *
 * @param callback - The function to invoke on each tick.
 * @param delayMs - Interval in ms, or `null` to disable.
 */
function useInterval(callback: () => void, delayMs: number | null): void {
	const saved = useRef(callback);
	useEffect(() => {
		saved.current = callback;
	});
	useEffect(() => {
		if (delayMs == null) return;
		const id = setInterval(() => saved.current(), delayMs);
		return () => clearInterval(id);
	}, [delayMs]);
}

/**
 * Clear the terra-draw authoring layer safely.
 *
 * terra-draw's MapLibre adapter creates its GeoJSON sources lazily on the first
 * render (the first time a feature is drawn/added). `clear()` calls `setData`
 * directly, assuming the source exists, so clearing before anything has been
 * drawn throws `Cannot read properties of undefined (reading 'setData')`. The
 * store snapshot is read from terra-draw's in-memory state (not the map source),
 * so it is safe to probe: an empty store means nothing to clear.
 */
function clearDraw(draw: TerraDraw | null): void {
	if (!draw || draw.getSnapshot().length === 0) return;
	draw.clear();
}

/** Inner body once the CRUD call definitions are resolved. */
function MissionMapBody(props: {
	mapUrl: string;
	defaultMap?: string;
	mapsListDef: RemoteCallDefinition;
	mapsCreateDef?: RemoteCallDefinition;
	mapsDeleteDef?: RemoteCallDefinition;
	featuresListDef?: RemoteCallDefinition;
	featuresAddDef?: RemoteCallDefinition;
	featuresUpdateDef?: RemoteCallDefinition;
	featuresDeleteDef?: RemoteCallDefinition;
	plannerStatusDef?: RemoteCallDefinition;
	plannerGraphDef?: RemoteCallDefinition;
	missionsListDef?: RemoteCallDefinition;
	missionsSaveDef?: RemoteCallDefinition;
	feedbackTopic?: SelectedTopic;
	agentTopic?: SelectedTopic;
	overlays?: string[];
}) {
	// All calls are routed through one fallback definition so the hook order stays
	// stable when an individual call is unavailable (we guard at call sites).
	const fallbackDef = props.mapsListDef;
	const mapsListCall = useRemoteCall<Record<string, never>, unknown>(
		props.mapsListDef,
	);
	const mapsCreateCall = useRemoteCall<{ name: string }, unknown>(
		props.mapsCreateDef ?? fallbackDef,
	);
	const mapsDeleteCall = useRemoteCall<{ name: string }, unknown>(
		props.mapsDeleteDef ?? fallbackDef,
	);
	const featuresListCall = useRemoteCall<{ name: string }, unknown>(
		props.featuresListDef ?? fallbackDef,
	);
	const featuresAddCall = useRemoteCall<
		{ name: string; feature: unknown },
		unknown
	>(props.featuresAddDef ?? fallbackDef);
	const featuresUpdateCall = useRemoteCall<
		{ name: string; featureId: string; feature: unknown },
		unknown
	>(props.featuresUpdateDef ?? fallbackDef);
	const featuresDeleteCall = useRemoteCall<
		{ name: string; featureId: string },
		unknown
	>(props.featuresDeleteDef ?? fallbackDef);
	const plannerStatusCall = useRemoteCall<Record<string, never>, unknown>(
		props.plannerStatusDef ?? fallbackDef,
	);
	const plannerGraphCall = useRemoteCall<Record<string, never>, unknown>(
		props.plannerGraphDef ?? fallbackDef,
	);
	const missionsListCall = useRemoteCall<Record<string, never>, unknown>(
		props.missionsListDef ?? fallbackDef,
	);
	const missionsSaveCall = useRemoteCall<{ mission: unknown }, unknown>(
		props.missionsSaveDef ?? fallbackDef,
	);

	const { startingLocation } = useMapInit();
	const mapStyle = useMapStyle(props.mapUrl);
	const mapRef = useRef<MapRef>(null);
	const drawRef = useRef<TerraDraw | null>(null);
	// terra-draw id of the feature currently loaded into the draw layer for
	// editing. Captured when `editFeature`/`editMissionGeometry` add it, so the
	// save path can read the LIVE (post-drag/reshape) geometry by id rather than
	// re-serializing the stale pre-edit snapshot.
	const editingDrawIdRef = useRef<string | number | null>(null);

	// The ROS source the per-agent localization overlay falls back to when an
	// agent (roster-fed) carries no own source: the operator's configured
	// telemetry source (edge feedback, else mission feedback).
	const localizationFallbackSource =
		props.agentTopic?.source ?? props.feedbackTopic?.source;

	// Agents already plotted by the per-agent localization overlay (those with a
	// namespace AND a resolvable source — own or fallback). The shared-feedback
	// fallback in <LiveOverlay> excludes these so an agent never gets two markers.
	const agents = useAgents();
	const namespacedAgentIds = useMemo(
		() =>
			new Set(
				agents
					.filter(
						(a) =>
							a.namespace &&
							(a.source ?? localizationFallbackSource),
					)
					.map((a) => a.agent_id),
			),
		[agents, localizationFallbackSource],
	);

	// Stable live-overlay topic set: this body re-renders on the 5 s planner-status
	// poll, and a fresh array literal in the JSX would re-subscribe the feedback/
	// agent topics every render (unsubscribe→subscribe), flickering the overlay
	// (AGENTS.md subscription-thrash rule). Key it on the topic identities.
	const liveTopics = useMemo(
		() =>
			[props.feedbackTopic, props.agentTopic].filter(
				Boolean,
			) as SelectedTopic[],
		[props.feedbackTopic, props.agentTopic],
	);

	// --- Two-mode model -----------------------------------------------------
	// Mission editing is the daily task; map editing is occasional → default here.
	const [context, setContext] = useState<MapContext>("mission");
	const [tool, setTool] = useState<MapTool>("view");
	// Read-only (View) mode: hides every authoring affordance and forces the
	// `view` tool; map features + mission geometry still render and pan/zoom work.
	const [readOnly, setReadOnly] = useState(false);
	// Operator-chosen draw shape (line / polygon / rectangle). Mission context
	// defaults to polygon (the core "can't draw a polygon" fix); map-editor context
	// constrains it by the selected feature_type below.
	const [drawShape, setDrawShape] = useState<DrawShape>("polygon");
	const selectedMission = useSelectedMission();

	// --- Map-editor state ---------------------------------------------------
	const [maps, setMaps] = useState<MapRegistryEntry[]>([]);
	const [selectedMap, setSelectedMap] = useState<string>(
		props.defaultMap ?? "",
	);
	const [features, setFeatures] = useState<C2Feature[]>([]);
	const [pickedId, setPickedId] = useState<string | null>(null);
	const [pending, setPending] = useState<PendingSave | null>(null);
	/** Feature_type chosen for the NEXT map-feature draw (drives the draw tool). */
	const [mapFeatureType, setMapFeatureType] = useState<FeatureType>("road");

	// --- Mission state ------------------------------------------------------
	/**
	 * Working copy of the active mission, bound to the SHARED draft store so edits
	 * here (draw / vehicle / behavior / geometry) propagate to the editor (F5) and
	 * vice-versa. A {@link MissionDraft} is a superset of {@link MissionConfig}, so
	 * all the reads/memos below treat it as a `MissionConfig` unchanged.
	 */
	const missionConfig = useMissionDraft(selectedMission);
	/** Index of the selected mission geometry (Edit/Delete target). */
	const [pickedGeomIndex, setPickedGeomIndex] = useState<number | null>(null);
	const [missionIssues, setMissionIssues] = useState<MissionConfigIssue[]>(
		[],
	);

	// --- Shared UI state ----------------------------------------------------
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	/**
	 * Pending destructive confirmation, driving the shadcn AlertDialog. `null` when
	 * idle. `onConfirm` runs the actual delete once the operator confirms (replaces
	 * the blocking `window.confirm`).
	 */
	const [confirmState, setConfirmState] = useState<{
		title: string;
		description: string;
		onConfirm: () => void;
	} | null>(null);
	const [plannerStatus, setPlannerStatus] = useState<PlannerStatus | null>(
		null,
	);
	const [activeOverlays, setActiveOverlays] = useState<string[]>(
		() => props.overlays ?? [],
	);
	const [overlaysOpen, setOverlaysOpen] = useState(false);
	// 3D buildings (MapLibre fill-extrusion). The footprints come from the SAME
	// Overpass building fetch the risk-import path uses; this holds the derived
	// extrusion FeatureCollection (null until the first fetch resolves).
	const [buildings3d, setBuildings3d] = useState(false);
	const [buildingsFc, setBuildingsFc] =
		useState<BuildingExtrusionFeatureCollection | null>(null);
	// Planner navigation graph (faint backdrop). The FeatureCollection is fetched
	// from the C2 on toggle-on and refreshed when the planner's loaded_map changes
	// (a cheap, event-driven refresh — never per render). Null until first fetch.
	const [plannerGraph, setPlannerGraph] = useState(false);
	const [plannerGraphFc, setPlannerGraphFc] =
		useState<GeoJsonFeatureCollection | null>(null);

	// Ref the stable terra-draw `finish` handler reads (avoids re-registration).
	// Kept fresh in an effect (never written during render).
	const drawCtxRef = useRef<DrawContextRef>({
		context: "map-editor",
		tool: "view",
		mapFeatureType: "road",
		selectedMission: null,
	});
	useEffect(() => {
		drawCtxRef.current = {
			context,
			tool,
			mapFeatureType,
			selectedMission,
		};
	}, [context, tool, mapFeatureType, selectedMission]);

	// Toggle a single overlay on/off (session-only; config seeds the initial set).
	const toggleOverlay = useCallback((id: string) => {
		setActiveOverlays((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	}, []);

	// Toggle the 3D-buildings layer. Turning it off drops the cached footprints so
	// a later re-enable always refetches for the current geofence / map view.
	const toggleBuildings3d = useCallback(() => {
		setBuildings3d((on) => {
			if (on) setBuildingsFc(null);
			return !on;
		});
	}, []);

	// Toggle the planner-graph backdrop. Turning it off drops the cached graph so
	// a later re-enable refetches the current graph.
	const togglePlannerGraph = useCallback(() => {
		setPlannerGraph((on) => {
			if (on) setPlannerGraphFc(null);
			return !on;
		});
	}, []);

	const { execute: executeMapsList } = mapsListCall;
	const { execute: executeFeaturesList } = featuresListCall;
	const { execute: executePlannerStatus } = plannerStatusCall;
	const { execute: executeMissionsList } = missionsListCall;

	// Fetch the maps registry; refetch via this when a map is created/deleted.
	const refetchMaps = useCallback(async () => {
		const result = await executeMapsList({});
		if (!result.success) {
			setError(result.error ?? "Failed to list maps");
			return [] as MapRegistryEntry[];
		}
		const list = normalizeMaps(result.data);
		setMaps(list);
		return list;
	}, [executeMapsList]);

	// Fit the map view to a registry entry's bounds, when present.
	const fitToBounds = useCallback((entry?: MapRegistryEntry) => {
		const map = mapRef.current?.getMap();
		if (!map || !entry?.bounds) return;
		const { minLon, minLat, maxLon, maxLat } = entry.bounds;
		map.fitBounds(
			[
				[minLon, minLat],
				[maxLon, maxLat],
			],
			{ padding: 40, duration: 600 },
		);
	}, []);

	// Initial maps fetch on mount; keep the persisted/last-used map if it exists.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const list = await refetchMaps();
			if (cancelled) return;
			setSelectedMap((current) =>
				current && list.some((m) => m.name === current)
					? current
					: (list[0]?.name ?? ""),
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [refetchMaps]);

	// Refetch the selected map's features. Returns the next list (or null on a
	// failure / no-map) WITHOUT calling setState itself, so both the effect and
	// the post-write refetch can drive state without a synchronous in-effect set.
	const fetchFeatures = useCallback(async (): Promise<C2Feature[] | null> => {
		if (!selectedMap) return [];
		const result = await executeFeaturesList({ name: selectedMap });
		if (!result.success) {
			setError(result.error ?? "Failed to list features");
			return null;
		}
		setError(null);
		const nextFeatures = normalizeMapFeatures(result.data);
		publishFeatureNames(
			nextFeatures.flatMap((f) => {
				const id = readFeatureId(f);
				return id ? [{ feature_id: id, name: f.properties?.name }] : [];
			}),
		);
		return nextFeatures;
	}, [selectedMap, executeFeaturesList]);

	// Apply a fresh feature fetch to state (shared by the effect + writes).
	const refetchFeatures = useCallback(async () => {
		const next = await fetchFeatures();
		if (next) setFeatures(next);
	}, [fetchFeatures]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const next = await fetchFeatures();
			if (!cancelled && next) setFeatures(next);
		})();
		return () => {
			cancelled = true;
		};
	}, [fetchFeatures]);

	// Fit to the selected map's bounds when its registry entry is known.
	useEffect(() => {
		fitToBounds(maps.find((m) => m.name === selectedMap));
	}, [selectedMap, maps, fitToBounds]);

	// --- Planner status (read-only, polled) --------------------------------
	const pollPlannerStatus = useCallback(async () => {
		if (!props.plannerStatusDef) return;
		const result = await executePlannerStatus({});
		if (result.success) {
			setPlannerStatus(normalizePlannerStatus(result.data));
		}
	}, [props.plannerStatusDef, executePlannerStatus]);

	// Immediate poll on mount and whenever the selected map changes.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (cancelled) return;
			await pollPlannerStatus();
		})();
		return () => {
			cancelled = true;
		};
	}, [pollPlannerStatus, selectedMap]);

	// Steady 5 s poll via the latest-ref interval — disabled until the call exists,
	// and never re-armed by closure/dep churn.
	useInterval(
		() => void pollPlannerStatus(),
		props.plannerStatusDef ? 5000 : null,
	);

	// --- Planner graph (faint backdrop, fetched on demand) -----------------
	const { execute: executePlannerGraph } = plannerGraphCall;
	// Fetch the graph: on toggle-on and whenever the planner's loaded_map changes
	// (a cheap, event-driven refresh keyed on the existing planner-status poll, so
	// it never refetches per render). Empty / note-only responses normalize to an
	// empty FeatureCollection (nothing drawn, no error spam).
	const plannerLoadedMap = plannerStatus?.loaded_map ?? null;
	useEffect(() => {
		if (!plannerGraph || !props.plannerGraphDef) return;
		let cancelled = false;
		void (async () => {
			const result = await executePlannerGraph({});
			if (cancelled || !result.success) return;
			setPlannerGraphFc(normalizePlannerGraph(result.data));
		})();
		return () => {
			cancelled = true;
		};
	}, [
		plannerGraph,
		plannerLoadedMap,
		props.plannerGraphDef,
		executePlannerGraph,
	]);

	// --- Mission config load (fetch the selected mission's stored config) ---
	const loadMissionConfig = useCallback(
		async (missionId: string): Promise<MissionConfig | null> => {
			const result = await executeMissionsList({});
			if (!result.success) {
				setError(result.error ?? "Failed to load mission");
				return null;
			}
			const row = normalizeMissions(result.data).find(
				(r) => r.mission_id === missionId,
			);
			return (row?.raw as MissionConfig | undefined) ?? null;
		},
		[executeMissionsList],
	);

	// Load the working copy into the shared draft store whenever the active mission
	// changes. Load coordination: if a slot already exists (F5 loaded it, or an
	// in-progress edit lives there), ADOPT it — do not refetch and clobber the
	// edit. Only fetch + `setMissionDraft` when no slot exists, so F5 and F6 never
	// double-fetch the same mission and a cross-widget edit survives the bind.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (!selectedMission) {
				setPickedGeomIndex(null);
				return;
			}
			if (hasMissionDraft(selectedMission)) {
				// Already in the shared store → bind to it, no fetch.
				setPickedGeomIndex(null);
				return;
			}
			const config = await loadMissionConfig(selectedMission);
			if (cancelled) return;
			if (config) setMissionDraft(hydrateMissionDraft(config));
			setPickedGeomIndex(null);
		})();
		return () => {
			cancelled = true;
		};
	}, [selectedMission, loadMissionConfig]);

	// Toggle read-only (View) mode. Entering View forces the `view` tool, drops any
	// pending authoring state, and clears the draw layer so nothing is left armed.
	// Done in the event handler (not an effect) to avoid a cascading-render set.
	const toggleReadOnly = useCallback(() => {
		const enteringView = !readOnly;
		setReadOnly(enteringView);
		if (enteringView) {
			setTool("view");
			setPending(null);
			editingDrawIdRef.current = null;
			clearDraw(drawRef.current);
		}
	}, [readOnly]);

	// Switch editing context, resetting all transient per-context selections.
	const changeContext = useCallback((next: MapContext) => {
		setContext(next);
		setTool("view");
		setPending(null);
		setPickedId(null);
		setPickedGeomIndex(null);
		setMissionIssues([]);
		editingDrawIdRef.current = null;
		clearDraw(drawRef.current);
	}, []);

	// terra-draw lifecycle — construct on map load, tear down on unmount.
	const handleMapLoad = useCallback(() => {
		const map = mapRef.current?.getMap();
		if (!map || drawRef.current) return;
		const draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({
				map: map as MapLibreInstance,
			}),
			// The point mode (".mode" === "point") authors single-vertex MISSION
			// objective geometry only — C2 map features stay line/polygon (the
			// map-editor context never offers it). The rectangle mode (".mode" ===
			// "rectangle") draws an axis-aligned bounding box as a Polygon.
			modes: [
				new TerraDrawPointMode(),
				new TerraDrawLineStringMode(),
				new TerraDrawPolygonMode(),
				new TerraDrawRectangleMode(),
				// Edit tool: select-mode editing enabled per geometry — feature
				// dragging, draggable midpoints, and draggable/deletable vertices
				// (a point is feature-draggable only). The flags key is each mode's
				// `.mode` string.
				new TerraDrawSelectMode({
					flags: {
						point: { feature: { draggable: true } },
						linestring: {
							feature: {
								draggable: true,
								coordinates: {
									midpoints: true,
									draggable: true,
									deletable: true,
								},
							},
						},
						polygon: {
							feature: {
								draggable: true,
								coordinates: {
									midpoints: true,
									draggable: true,
									deletable: true,
								},
							},
						},
						rectangle: {
							feature: {
								draggable: true,
								coordinates: {
									midpoints: true,
									draggable: true,
									deletable: true,
								},
							},
						},
					},
				}),
			],
		});
		draw.start();
		draw.setMode("static");
		// A finished draw is routed by the CURRENT context (read fresh from the
		// ref): map-editor → a pending map-feature save; mission → pushed straight
		// onto the working mission geometry. [lng,lat] preserved end-to-end.
		draw.on("finish", (id) => {
			const snap = draw.getSnapshotFeature(id);
			if (!snap) return;
			const drawn = snap as unknown as DrawFeature;
			const ctx = drawCtxRef.current;
			if (ctx.context === "map-editor") {
				setPending({
					feature: drawn,
					name: "",
					featureType: ctx.mapFeatureType,
				});
				return;
			}
			// Mission context: append the inline geometry to the shared draft.
			const inline = drawFeatureToInlineGeometry(drawn);
			if (ctx.selectedMission) {
				editMissionDraft(ctx.selectedMission, (prev) => {
					const geometries = [
						...(prev.objective?.geometries ?? []),
						inline,
					];
					return {
						...prev,
						objective: { ...prev.objective, geometries },
					};
				});
			}
			clearDraw(draw);
			setTool("view");
		});
		drawRef.current = draw;
	}, []);

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

	// Whether the Draw tool is allowed in the current context (gated on a
	// selected map / mission respectively).
	const canEdit =
		context === "map-editor"
			? selectedMap.length > 0
			: missionConfig != null;

	// Shapes the operator may pick, by context. Mission → free (point/line/
	// polygon/rectangle; Point is a mission-objective-only capability). Map-editor
	// → constrained by feature_type: a `road` is line-only (single option → the
	// picker is hidden), `geofence`/`risk` are polygon or rectangle (rectangle is
	// a fast axis-aligned polygon). The C2 rejects Point map features, so the
	// map-editor context never offers it.
	const availableShapes = useMemo<DrawShape[]>(() => {
		if (context !== "map-editor")
			return ["point", "line", "polygon", "rectangle"];
		return FEATURE_TYPE_GEOMETRY[mapFeatureType] === "line"
			? ["line"]
			: ["polygon", "rectangle"];
	}, [context, mapFeatureType]);

	// The effective draw shape, honoring the map-editor feature-type constraint:
	// in map-editor a `road` is line-only and a `geofence`/`risk` is polygon-or-
	// rectangle, so a `line` shape is coerced to polygon (and vice-versa). In
	// mission context the operator's chosen shape is used as-is.
	const effectiveShape: DrawShape = useMemo(() => {
		if (context !== "map-editor") return drawShape;
		if (FEATURE_TYPE_GEOMETRY[mapFeatureType] === "line") return "line";
		// geofence / risk → polygon or rectangle (never a line).
		return drawShape === "rectangle" ? "rectangle" : "polygon";
	}, [context, drawShape, mapFeatureType]);

	// The terra-draw geometry mode for the Draw tool, derived from the shape.
	const drawGeometryMode = drawShapeToMode(effectiveShape);

	// Drive terra-draw mode from the toolbar tool + chosen draw geometry.
	useEffect(() => {
		const draw = drawRef.current;
		if (!draw || !draw.enabled) return;
		if (tool === "draw" && canEdit) {
			draw.setMode(drawGeometryMode);
		} else if (tool === "edit" && canEdit) {
			draw.setMode("select");
		} else {
			draw.setMode("static");
		}
	}, [tool, canEdit, drawGeometryMode]);

	/** Confirm a pending MAP-feature save: POST (create) or PUT (edit). */
	const confirmSave = useCallback(
		async (name: string, featureType: FeatureType) => {
			if (!pending) return;
			if (!selectedMap) {
				setError("Select a map first.");
				return;
			}
			const editing = pending.featureId != null;
			// On an EDIT, read the LIVE geometry from terra-draw (capturing any
			// vertex drag / midpoint reshape the operator made in select mode); fall
			// back to the pending snapshot if the live feature can't be resolved. A
			// CREATE always uses the freshly-drawn `pending.feature`.
			const liveId = editingDrawIdRef.current;
			const liveFeature =
				editing && liveId != null
					? (drawRef.current?.getSnapshotFeature(liveId) as
							| DrawFeature
							| undefined)
					: undefined;
			const source = liveFeature ?? pending.feature;
			const feature = drawFeatureToC2Feature(source, {
				name,
				feature_type: featureType,
				feature_id: pending.featureId,
			});
			if (editing && !props.featuresUpdateDef) {
				setError("c2.map.features.update unavailable");
				return;
			}
			if (!editing && !props.featuresAddDef) {
				setError("c2.map.features.add unavailable");
				return;
			}
			setBusy(true);
			const result = editing
				? await featuresUpdateCall.execute({
						name: selectedMap,
						featureId: pending.featureId as string,
						feature,
					})
				: await featuresAddCall.execute({
						name: selectedMap,
						feature,
					});
			setBusy(false);
			if (!result.success) {
				// Surface the server's 400 {error} verbatim (geometry-type mismatch).
				setError(result.error ?? "Failed to save feature");
				return;
			}
			setError(null);
			setPending(null);
			editingDrawIdRef.current = null;
			clearDraw(drawRef.current);
			setTool("view");
			await refetchFeatures();
		},
		[
			pending,
			selectedMap,
			props.featuresAddDef,
			props.featuresUpdateDef,
			featuresAddCall,
			featuresUpdateCall,
			refetchFeatures,
		],
	);

	/** Load a stored map feature into the draw layer for editing (same id). */
	const editFeature = useCallback((feature: C2Feature) => {
		const draw = drawRef.current;
		if (!draw) return;
		const drawn = c2FeatureToDrawFeature(feature);
		if (!drawn) {
			setError("Feature geometry can't be edited.");
			return;
		}
		const storedType = feature.properties?.feature_type;
		const featureType: FeatureType =
			storedType === "geofence" || storedType === "risk"
				? storedType
				: "road";
		clearDraw(draw);
		const validations = draw.addFeatures([
			drawn as unknown as GeoJSONStoreFeatures,
		]);
		// Track the terra-draw id so the save path can read the LIVE edited
		// geometry (post drag/reshape) instead of the stale pre-edit snapshot.
		editingDrawIdRef.current = validations[0]?.id ?? null;
		setPending({
			feature: drawn,
			featureId: readFeatureId(feature) ?? undefined,
			name:
				typeof feature.properties?.name === "string"
					? feature.properties.name
					: "",
			featureType,
		});
		setTool("edit");
	}, []);

	/**
	 * Delete the selected stored map feature, then refetch. The caller is
	 * responsible for confirming (via the AlertDialog) before invoking this.
	 */
	const deleteFeature = useCallback(
		async (feature: C2Feature) => {
			const featureId = readFeatureId(feature);
			if (!props.featuresDeleteDef || !selectedMap || !featureId) {
				setError("c2.map.features.delete unavailable");
				return;
			}
			setBusy(true);
			const result = await featuresDeleteCall.execute({
				name: selectedMap,
				featureId,
			});
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to delete feature");
				return;
			}
			// The C2 reply is `{ deleted: <count>, map }`. A 200 with deleted:0
			// means nothing matched (the id never reached the collection) — surface
			// it instead of silently "succeeding".
			const deleted = (result.data as { deleted?: number } | null)
				?.deleted;
			if (deleted === 0) {
				setError(
					`Server matched no feature for id ${featureId} — nothing deleted.`,
				);
				return;
			}
			setError(null);
			if (pickedId === featureId) setPickedId(null);
			// Optimistically drop it locally: the delete is confirmed server-side,
			// so don't depend on the refetch (a cached/stale GET could otherwise
			// re-add the just-deleted feature). The refetch then reconciles.
			setFeatures((prev) =>
				prev.filter((f) => readFeatureId(f) !== featureId),
			);
			await refetchFeatures();
		},
		[
			props.featuresDeleteDef,
			selectedMap,
			featuresDeleteCall,
			refetchFeatures,
			pickedId,
		],
	);

	/**
	 * Bulk-save OSM-imported `road` features into the selected map via the batch
	 * `c2.map.features.add` body (`{ features: [...] }`), then refetch. The caller
	 * confirms (via the AlertDialog) before invoking this.
	 */
	const importOsmRoads = useCallback(
		async (roads: C2Feature[]) => {
			if (!selectedMap) {
				setError("Select a map first.");
				return;
			}
			if (!props.featuresAddDef) {
				setError("c2.map.features.add unavailable");
				return;
			}
			if (roads.length === 0) {
				setError("No roads to import.");
				return;
			}
			setBusy(true);
			// The add call POSTs `feature` verbatim; the backend accepts a batch
			// `{ features: [...] }` in the same body (MAP_API §2).
			const result = await featuresAddCall.execute({
				name: selectedMap,
				feature: { features: roads },
			});
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to import roads");
				return;
			}
			setError(null);
			await refetchFeatures();
		},
		[selectedMap, props.featuresAddDef, featuresAddCall, refetchFeatures],
	);

	/**
	 * Import drivable OSM roads for the selected geofence: derive its bbox, query
	 * Overpass, convert/clip to `road` features, then open the confirm dialog whose
	 * confirm runs the bulk save. Reuses the shared busy/error channel.
	 */
	const requestImportOsmRoads = useCallback(
		async (geofence: C2Feature) => {
			if (!selectedMap) {
				setError("Select a map first.");
				return;
			}
			if (!props.featuresAddDef) {
				setError("c2.map.features.add unavailable");
				return;
			}
			const ring = geofenceRingFromFeature(geofence);
			const bbox = ring ? ringToBbox(ring) : null;
			if (!ring || !bbox) {
				setError("Geofence has no usable polygon to import roads for.");
				return;
			}
			setBusy(true);
			const result = await fetchOsmRoads(bbox);
			setBusy(false);
			if (!result.ok) {
				setError(result.error);
				return;
			}
			const roads = osmRoadsToFeatures(result.data, ring);
			if (roads.length === 0) {
				setError("No drivable roads found inside this geofence.");
				return;
			}
			setError(null);
			setConfirmState({
				title: "Import OSM roads",
				description: `Import ${roads.length} road${
					roads.length === 1 ? "" : "s"
				} into "${selectedMap}"?`,
				onConfirm: () => void importOsmRoads(roads),
			});
		},
		[selectedMap, props.featuresAddDef, importOsmRoads],
	);

	/**
	 * Bulk-save OSM-derived `risk` building footprints into the selected map via
	 * the batch `c2.map.features.add` body, then refetch. The caller confirms (via
	 * the AlertDialog) before invoking this. Mirrors {@link importOsmRoads}.
	 */
	const importOsmBuildings = useCallback(
		async (risks: C2Feature[]) => {
			if (!selectedMap) {
				setError("Select a map first.");
				return;
			}
			if (!props.featuresAddDef) {
				setError("c2.map.features.add unavailable");
				return;
			}
			if (risks.length === 0) {
				setError("No buildings to import.");
				return;
			}
			setBusy(true);
			const result = await featuresAddCall.execute({
				name: selectedMap,
				feature: { features: risks },
			});
			setBusy(false);
			if (!result.success) {
				setError(result.error ?? "Failed to import buildings");
				return;
			}
			setError(null);
			await refetchFeatures();
		},
		[selectedMap, props.featuresAddDef, featuresAddCall, refetchFeatures],
	);

	/**
	 * Import OSM building footprints as `risk` zones for the selected geofence:
	 * derive its bbox, query Overpass for `building=*`, convert/clip to closed
	 * `risk` Polygons, then open the confirm dialog whose confirm runs the bulk
	 * save. Reuses the shared busy/error channel and the same building fetch the 3D
	 * layer consumes.
	 */
	const requestImportOsmBuildings = useCallback(
		async (geofence: C2Feature) => {
			if (!selectedMap) {
				setError("Select a map first.");
				return;
			}
			if (!props.featuresAddDef) {
				setError("c2.map.features.add unavailable");
				return;
			}
			const ring = geofenceRingFromFeature(geofence);
			const bbox = ring ? ringToBbox(ring) : null;
			if (!ring || !bbox) {
				setError(
					"Geofence has no usable polygon to import buildings for.",
				);
				return;
			}
			setBusy(true);
			const result = await fetchOsmBuildings(bbox);
			setBusy(false);
			if (!result.ok) {
				setError(result.error);
				return;
			}
			const risks = osmBuildingsToRiskFeatures(result.data, ring);
			if (risks.length === 0) {
				setError("No building footprints found inside this geofence.");
				return;
			}
			setError(null);
			setConfirmState({
				title: "Import risk from buildings",
				description: `Import ${risks.length} building footprint${
					risks.length === 1 ? "" : "s"
				} as risk zones into "${selectedMap}"?`,
				onConfirm: () => void importOsmBuildings(risks),
			});
		},
		[selectedMap, props.featuresAddDef, importOsmBuildings],
	);

	/** Create a new map (prompt for a name); select it on success. */
	const createMap = useCallback(async () => {
		if (!props.mapsCreateDef) {
			setError("c2.maps.create unavailable");
			return;
		}
		if (typeof window === "undefined") return;
		const name = window.prompt("New map name")?.trim();
		if (!name) return;
		setBusy(true);
		const result = await mapsCreateCall.execute({ name });
		setBusy(false);
		if (!result.success) {
			// 409 already-exists surfaces verbatim from the transport.
			setError(result.error ?? "Failed to create map");
			return;
		}
		setError(null);
		await refetchMaps();
		setSelectedMap(name);
		setPickedId(null);
	}, [props.mapsCreateDef, mapsCreateCall, refetchMaps]);

	/**
	 * Delete the selected map, then reselect the first map. The caller confirms
	 * (via the AlertDialog) before invoking this.
	 */
	const deleteMap = useCallback(async () => {
		if (!props.mapsDeleteDef || !selectedMap) {
			setError("c2.maps.delete unavailable");
			return;
		}
		setBusy(true);
		const result = await mapsDeleteCall.execute({ name: selectedMap });
		setBusy(false);
		if (!result.success) {
			setError(result.error ?? "Failed to delete map");
			return;
		}
		setError(null);
		setPickedId(null);
		const list = await refetchMaps();
		setSelectedMap(list[0]?.name ?? "");
	}, [props.mapsDeleteDef, selectedMap, mapsDeleteCall, refetchMaps]);

	// --- Destructive-action confirmation (AlertDialog) ----------------------

	/** Open the AlertDialog to confirm deleting a stored map feature. */
	const requestDeleteFeature = useCallback(
		(feature: C2Feature) => {
			const label =
				(typeof feature.properties?.name === "string" &&
					feature.properties.name) ||
				readFeatureId(feature) ||
				"feature";
			setConfirmState({
				title: "Delete feature?",
				description: `Permanently delete the feature "${label}" from this map.`,
				onConfirm: () => void deleteFeature(feature),
			});
		},
		[deleteFeature],
	);

	/** Open the AlertDialog to confirm deleting the selected map. */
	const requestDeleteMap = useCallback(() => {
		if (!selectedMap) return;
		setConfirmState({
			title: "Delete map?",
			description: `Permanently delete the map "${selectedMap}" and all of its features.`,
			onConfirm: () => void deleteMap(),
		});
	}, [selectedMap, deleteMap]);

	// --- Mission field setters (behavior / vehicles) ------------------------

	/** Set the working mission's behavior. */
	const setMissionBehavior = useCallback(
		(behavior: MissionBehavior) => {
			if (!selectedMission) return;
			editMissionDraft(selectedMission, (prev) => ({
				...prev,
				behavior,
			}));
		},
		[selectedMission],
	);

	/** Toggle a vehicle in the working mission's allocation (by agent_id). */
	const toggleMissionVehicle = useCallback(
		(id: string) => {
			if (!selectedMission) return;
			editMissionDraft(selectedMission, (prev) => {
				const current = prev.vehicles ?? [];
				const vehicles = current.includes(id)
					? current.filter((v) => v !== id)
					: [...current, id];
				return { ...prev, vehicles };
			});
		},
		[selectedMission],
	);

	// --- Mission geometry edit/delete + save -------------------------------

	/** Load a mission geometry into the draw layer for editing (by index). */
	const editMissionGeometry = useCallback(
		(index: number) => {
			const draw = drawRef.current;
			if (!draw || !missionConfig) return;
			const entry = missionConfig.objective?.geometries?.[index];
			const geojson = entry?.geometry
				? inlineToDrawFeature(entry.geometry)
				: null;
			if (!geojson) {
				setError("That mission geometry can't be edited inline.");
				return;
			}
			clearDraw(draw);
			const validations = draw.addFeatures([
				geojson as unknown as GeoJSONStoreFeatures,
			]);
			// Track the draw id so the save reads the LIVE edited geometry.
			editingDrawIdRef.current = validations[0]?.id ?? null;
			setPickedGeomIndex(index);
			setTool("edit");
		},
		[missionConfig],
	);

	/** Delete a mission geometry from the working copy (by index). */
	const deleteMissionGeometry = useCallback(
		(index: number) => {
			if (selectedMission) {
				editMissionDraft(selectedMission, (prev) => {
					const geometries = (
						prev.objective?.geometries ?? []
					).filter((_, i) => i !== index);
					return {
						...prev,
						objective: { ...prev.objective, geometries },
					};
				});
			}
			setPickedGeomIndex(null);
			editingDrawIdRef.current = null;
			clearDraw(drawRef.current);
			setTool("view");
		},
		[selectedMission],
	);

	/**
	 * Save mission geometry via fetch-modify-save: re-fetch the stored config,
	 * apply ONLY the `objective.geometries[]` change, validate, then save the full
	 * config. The map owns `objective.geometries`, `vehicles`, `behavior`, and
	 * `name` — only those are overlaid (via {@link mergeMissionOwnedFields}), so
	 * F5's advanced `transit` / `start` / `arrival_time` blocks are preserved.
	 * Authoring all four owned fields here is what breaks the save deadlock: a
	 * mission F4 created (empty) gains the required quartet and validates.
	 *
	 * When a geometry is being edited in the draw layer, its LIVE (post drag /
	 * reshape) geometry is captured by terra-draw id and overlaid onto the saved
	 * geometries at its index — so vertex edits are not lost.
	 */
	const saveMission = useCallback(async () => {
		// Re-entry guard: the Save button is disabled while `busy`, but a fast
		// double-click can fire two calls before the disable lands — bail if a
		// save is already in flight so the mission can't be double-submitted.
		if (busy) return;
		if (!selectedMission || !missionConfig) return;
		if (!props.missionsSaveDef) {
			setError("c2.missions.save unavailable");
			return;
		}
		setBusy(true);
		const fresh = await loadMissionConfig(selectedMission);
		if (!fresh) {
			setBusy(false);
			setError("Could not re-fetch the mission for saving.");
			return;
		}
		// Capture the live in-draw edit (if any) into the geometry list by index.
		let geometries = missionConfig.objective?.geometries ?? [];
		const liveId = editingDrawIdRef.current;
		if (pickedGeomIndex != null && liveId != null) {
			const live = drawRef.current?.getSnapshotFeature(liveId) as
				| DrawFeature
				| undefined;
			if (live) {
				const inline = drawFeatureToInlineGeometry(live);
				geometries = geometries.map((g, i) =>
					i === pickedGeomIndex ? inline : g,
				);
			}
		}
		const merged = mergeMissionOwnedFields(fresh, {
			geometries,
			vehicles: missionConfig.vehicles ?? [],
			behavior: missionConfig.behavior,
			name: missionConfig.name,
		});
		const issues = validateMissionConfig(merged);
		setMissionIssues(issues);
		if (issues.some((i) => i.severity === "error")) {
			setBusy(false);
			setError(
				"Mission config has errors — fix them below before saving.",
			);
			return;
		}
		const result = await missionsSaveCall.execute({ mission: merged });
		setBusy(false);
		if (!result.success) {
			setError(result.error ?? "Failed to save mission");
			return;
		}
		setError(null);
		// Write the merged config back as the shared draft (dirty=false), so F5
		// reflects the saved state and the shared dirty flag clears.
		setMissionDraft(hydrateMissionDraft(merged));
		setPickedGeomIndex(null);
		editingDrawIdRef.current = null;
		clearDraw(drawRef.current);
		setTool("view");
	}, [
		busy,
		selectedMission,
		missionConfig,
		pickedGeomIndex,
		props.missionsSaveDef,
		loadMissionConfig,
		missionsSaveCall,
	]);

	/**
	 * Resolve the feature / mission geometry under a click point, by context. In
	 * map-editor it returns the hit map feature (id + the resolved {@link C2Feature}
	 * for edit/delete); in mission context it returns the hit geometry's source
	 * index. `null` when nothing is under the cursor. Pure lookup — no state writes.
	 */
	const pickAt = useCallback(
		(point: {
			x: number;
			y: number;
		}):
			| { kind: "feature"; id: string; feature: C2Feature }
			| { kind: "geometry"; index: number }
			| null => {
			const map = mapRef.current?.getMap();
			if (!map) return null;
			if (context === "map-editor") {
				const hits = map.queryRenderedFeatures([point.x, point.y], {
					layers: [
						"c2-features-fill",
						"c2-features-line",
						"c2-features-circle",
					],
				});
				const id = hits[0]?.properties?.feature_id;
				if (typeof id !== "string" || id.length === 0) return null;
				const feature = features.find((f) => readFeatureId(f) === id);
				if (!feature) return null;
				return { kind: "feature", id, feature };
			}
			const hits = map.queryRenderedFeatures([point.x, point.y], {
				layers: [
					"c2-mission-geom-fill",
					"c2-mission-geom-line",
					"c2-mission-geom-circle",
				],
			});
			const idx = hits[0]?.properties?.index;
			if (typeof idx !== "number") return null;
			return { kind: "geometry", index: idx };
		},
		[context, features],
	);

	/**
	 * Map click → dispatch by the active tool (for view / edit / delete; the draw
	 * tool is handled by terra-draw, not here):
	 *  - `view`   → select only (action bar).
	 *  - `edit`   → select AND load into the draw layer for editing.
	 *  - `delete` → select AND delete (confirm-gated for the destructive map-feature
	 *    case via the AlertDialog; mission geometry is a local working-copy edit).
	 */
	const handleMapClick = useCallback(
		(event: { point: { x: number; y: number } }) => {
			if (tool === "draw") return;
			const hit = pickAt(event.point);
			if (!hit) return;
			if (hit.kind === "feature") {
				setPickedId(hit.id);
				if (tool === "edit") editFeature(hit.feature);
				else if (tool === "delete") requestDeleteFeature(hit.feature);
				return;
			}
			setPickedGeomIndex(hit.index);
			if (tool === "edit") editMissionGeometry(hit.index);
			else if (tool === "delete") deleteMissionGeometry(hit.index);
		},
		[
			tool,
			pickAt,
			editFeature,
			requestDeleteFeature,
			editMissionGeometry,
			deleteMissionGeometry,
		],
	);

	const pickedFeature = useMemo(
		() => features.find((f) => readFeatureId(f) === pickedId) ?? null,
		[features, pickedId],
	);

	// Projected mission geometry for the mission-feature layer (always rendered).
	const missionGeometryFc = useMemo(
		() => missionGeometriesToFeatureCollection(missionConfig),
		[missionConfig],
	);

	// Live validation of the working mission (recomputed on every edit), so the
	// operator sees blocking issues and the disabled Save without a save attempt.
	// The save path re-runs `validateMissionConfig` on the freshly-merged config
	// (catching server-side drift) and stores those in `missionIssues`.
	const liveMissionIssues = useMemo(
		() => (missionConfig ? validateMissionConfig(missionConfig) : []),
		[missionConfig],
	);

	// Issues to surface: prefer the post-save merged issues when present, else the
	// live ones. Error-severity blocks save; warnings are advisory.
	const missionErrorIssues = (
		missionIssues.length > 0 ? missionIssues : liveMissionIssues
	).filter((i) => i.severity === "error");

	// Whether the working mission would pass validation (mirrors F5's `submittable`);
	// drives the Save button's disabled state so an invalid save is unreachable.
	const missionSubmittable = useMemo(
		() => !liveMissionIssues.some((i) => i.severity === "error"),
		[liveMissionIssues],
	);

	// Advisory (non-blocking) geofence check: objective geometries drawn outside
	// every loaded geofence give the planner 0 routable nodes there, so planning
	// fails. Checked against the CURRENTLY-LOADED map's geofences (`features`);
	// the planner ultimately picks the active map. Empty when no geofence is
	// loaded — containment is undeterminable, so we don't warn.
	const objectivesOutsideGeofenceIndices = useMemo(
		() =>
			objectivesOutsideGeofence(
				missionConfig?.objective?.geometries,
				features,
			),
		[missionConfig?.objective?.geometries, features],
	);

	// Allocated vehicle set, also used to render allocated agent markers distinct
	// and to drive the mission-panel summary (stable identity).
	const allocatedVehicles = useMemo(
		() => new Set(missionConfig?.vehicles ?? []),
		[missionConfig?.vehicles],
	);

	// Robot allocation by clicking agent markers is the PRIMARY affordance, active
	// only while a mission is being edited and not read-only (R2.G).
	const markersSelectable =
		context === "mission" && missionConfig != null && !readOnly;

	// The picked geofence both imports operate on (roads / risk-from-buildings).
	// Null when the picked feature is not a geofence — the Import control is then
	// disabled with a "Pick a geofence first" tooltip.
	const importGeofence = useMemo<C2Feature | null>(
		() =>
			pickedFeature?.properties?.feature_type === "geofence"
				? pickedFeature
				: null,
		[pickedFeature],
	);

	// 3D-buildings footprint source. When a geofence is picked its ring scopes the
	// Overpass fetch (and clips the result); otherwise the current map view bounds
	// are used. Re-keyed by the picked geofence's id so the fetch effect re-runs
	// on a geofence change, not on every render.
	const buildings3dRing = useMemo<GeofenceRing | null>(() => {
		if (pickedFeature?.properties?.feature_type === "geofence") {
			return geofenceRingFromFeature(pickedFeature);
		}
		return null;
	}, [pickedFeature]);

	// Fetch building footprints once when 3D is toggled on (and whenever the
	// scoping geofence changes while on); off → drop the source. The fetch is the
	// SAME Overpass building read the risk import uses; only the output differs.
	useEffect(() => {
		if (!buildings3d) return;
		const ring = buildings3dRing;
		const bbox = ring
			? ringToBbox(ring)
			: (() => {
					const map = mapRef.current?.getMap();
					if (!map) return null;
					const b = map.getBounds();
					return {
						minLon: b.getWest(),
						minLat: b.getSouth(),
						maxLon: b.getEast(),
						maxLat: b.getNorth(),
					};
				})();
		if (!bbox) return;
		const controller = new AbortController();
		void (async () => {
			const result = await fetchOsmBuildings(bbox, controller.signal);
			if (controller.signal.aborted) return;
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setBuildingsFc(
				osmBuildingsToExtrusionFc(
					result.data as OverpassBuildingWay[],
					ring ?? undefined,
				),
			);
		})();
		return () => controller.abort();
	}, [buildings3d, buildings3dRing]);

	return (
		<div className="h-full w-full flex flex-col text-sm">
			{/* Toolbar */}
			<div className="flex items-center gap-2 p-2 shrink-0 flex-wrap border-b">
				{/* Context toggle */}
				<div className="flex items-center gap-1">
					{(
						[
							["map-editor", "Map editor"],
							["mission", "Mission"],
						] as [MapContext, string][]
					).map(([value, label]) => (
						<Button
							key={value}
							size="sm"
							variant={context === value ? "default" : "outline"}
							className="h-7 text-xs"
							onClick={() => changeContext(value)}
						>
							{label}
						</Button>
					))}
					{/* Read-only (View) toggle: locks every authoring affordance. */}
					<Button
						size="sm"
						variant={readOnly ? "default" : "outline"}
						className="h-7 text-xs"
						title={
							readOnly
								? "View mode — authoring locked"
								: "Edit mode — authoring enabled"
						}
						onClick={toggleReadOnly}
					>
						{readOnly ? (
							<Lock className="w-3.5 h-3.5 mr-1" />
						) : (
							<LockOpen className="w-3.5 h-3.5 mr-1" />
						)}
						{readOnly ? "View" : "Edit"}
					</Button>
				</div>

				{/* Tools */}
				{!readOnly && (
					<div className="flex items-center gap-1">
						{(
							[
								["view", "Pick"],
								["draw", "Draw"],
								["edit", "Edit"],
								["delete", "Delete"],
							] as [MapTool, string][]
						).map(([value, label]) => (
							<Button
								key={value}
								size="sm"
								variant={tool === value ? "default" : "outline"}
								className="h-7 text-xs"
								disabled={value !== "view" && !canEdit}
								onClick={() => setTool(value)}
							>
								{label}
							</Button>
						))}
					</div>
				)}

				{/* Shape buttons — the geometry the Draw tool authors. In map-editor it
				    is constrained by the feature_type (road → line only, hidden;
				    geofence/risk → polygon or rectangle); in mission the operator
				    chooses freely (point / line / polygon / rectangle). */}
				{!readOnly && availableShapes.length > 1 && (
					<div className="flex items-center gap-1">
						{availableShapes.map((shape) => {
							const active =
								(availableShapes.includes(drawShape)
									? drawShape
									: effectiveShape) === shape;
							return (
								<Button
									key={shape}
									size="sm"
									variant={active ? "default" : "outline"}
									className="h-7 text-xs"
									onClick={() => setDrawShape(shape)}
								>
									{SHAPE_LABELS[shape]}
								</Button>
							);
						})}
					</div>
				)}

				{context === "map-editor" ? (
					<>
						<Select
							value={selectedMap || undefined}
							onValueChange={(value) => {
								setSelectedMap(value);
								setPickedId(null);
							}}
						>
							<SelectTrigger className="h-7 w-44 text-xs">
								<SelectValue placeholder="Map" />
							</SelectTrigger>
							<SelectContent>
								{maps.map((m) => (
									<SelectItem key={m.name} value={m.name}>
										{m.name} ({m.feature_count})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{!readOnly && (
							<>
								<Button
									size="sm"
									variant="outline"
									className="h-7 text-xs"
									disabled={busy || !props.mapsCreateDef}
									onClick={() => void createMap()}
								>
									<Plus className="w-3.5 h-3.5 mr-1" />
									New map
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-7 w-7 p-0 text-destructive"
									disabled={
										busy ||
										!selectedMap ||
										!props.mapsDeleteDef
									}
									title="Delete map"
									onClick={requestDeleteMap}
								>
									<Trash2 className="w-3.5 h-3.5" />
								</Button>
							</>
						)}
						<Badge variant="secondary">
							{features.length} features
						</Badge>
						{/* Feature-type buttons — each implies its draw geometry
						    (road → line, geofence/risk → polygon). */}
						{!readOnly && (
							<div className="flex items-center gap-1">
								{(
									[
										["road", "Road"],
										["geofence", "Geofence"],
										["risk", "Risk"],
									] as [FeatureType, string][]
								).map(([value, label]) => (
									<Button
										key={value}
										size="sm"
										variant={
											mapFeatureType === value
												? "default"
												: "outline"
										}
										className="h-7 text-xs"
										onClick={() => setMapFeatureType(value)}
									>
										{label}
									</Button>
								))}
							</div>
						)}
						{/* Import ▾ — roads or risk-from-buildings into the picked
						    geofence. Disabled (with a tooltip) until a geofence is
						    picked; hidden in read-only mode. */}
						{!readOnly && (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										{/* span keeps the tooltip working while
										    the trigger is disabled */}
										<span>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														size="sm"
														variant="outline"
														className="h-7 text-xs"
														disabled={
															busy ||
															!importGeofence ||
															!props.featuresAddDef
														}
													>
														<Download className="w-3.5 h-3.5 mr-1" />
														Import
														<ChevronDown className="w-3.5 h-3.5 ml-1" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start">
													<DropdownMenuItem
														onSelect={() => {
															if (importGeofence)
																void requestImportOsmRoads(
																	importGeofence,
																);
														}}
													>
														Import OSM roads
													</DropdownMenuItem>
													<DropdownMenuItem
														onSelect={() => {
															if (importGeofence)
																void requestImportOsmBuildings(
																	importGeofence,
																);
														}}
													>
														Import risk from
														buildings
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</span>
									</TooltipTrigger>
									{!importGeofence && (
										<TooltipContent>
											Pick a geofence first
										</TooltipContent>
									)}
								</Tooltip>
							</TooltipProvider>
						)}
					</>
				) : (
					<Badge variant="secondary">
						{missionGeometryFc.features.length} mission geometries
					</Badge>
				)}

				<PlannerStatusBadge status={plannerStatus} />

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

			{/* Context hint when editing is gated off. */}
			{context === "map-editor" && !selectedMap && (
				<div className="text-xs text-muted-foreground bg-muted/40 px-2 py-1 shrink-0">
					Select or create a map to draw and manage its features.
				</div>
			)}
			{context === "mission" && !selectedMission && (
				<div className="text-xs text-muted-foreground bg-muted/40 px-2 py-1 shrink-0">
					Select a mission to edit its geometry.
				</div>
			)}

			{/* Map-editor: picked-feature actions (edit/delete). */}
			{context === "map-editor" && pickedFeature && !readOnly && (
				<div className="flex items-center gap-2 px-2 py-1 shrink-0 border-b bg-muted/40 text-xs">
					<span className="truncate flex-1" title={pickedId ?? ""}>
						Picked: {pickedFeature.properties?.name ?? pickedId} (
						{pickedFeature.properties?.feature_type ?? "?"})
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
						onClick={() => requestDeleteFeature(pickedFeature)}
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			)}

			{/* Mission: behavior + a read-only vehicle-allocation summary (the
			    PRIMARY allocation affordance is clicking the agent markers,
			    R2.G). The map authors the full required quartet, so a new mission
			    can save without F5. */}
			{context === "mission" &&
				selectedMission &&
				missionConfig &&
				!readOnly && (
					<div className="flex flex-col gap-2 px-2 py-2 shrink-0 border-b bg-muted/40 text-xs">
						<div className="flex items-center gap-2 flex-wrap">
							<Label className="text-xs">Behavior</Label>
							<Select
								value={String(missionConfig.behavior)}
								onValueChange={(value) =>
									setMissionBehavior(
										Number(value) as MissionBehavior,
									)
								}
							>
								<SelectTrigger className="h-7 w-52 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{BEHAVIOR_OPTIONS.map(([value, label]) => (
										<SelectItem
											key={value}
											value={String(value)}
										>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1">
							<Label className="text-xs">
								Vehicles ({missionConfig.vehicles?.length ?? 0}{" "}
								allocated)
							</Label>
							{allocatedVehicles.size === 0 ? (
								<span className="text-muted-foreground">
									Click an agent marker on the map to assign
									it.
								</span>
							) : (
								<div className="flex flex-wrap gap-1">
									{[...allocatedVehicles].map((id) => (
										<AllocatedVehicleChip
											key={id}
											id={id}
										/>
									))}
								</div>
							)}
						</div>
					</div>
				)}

			{/* Mission: picked-geometry actions + save. */}
			{context === "mission" && selectedMission && !readOnly && (
				<div className="flex items-center gap-2 px-2 py-1 shrink-0 border-b bg-muted/40 text-xs">
					{pickedGeomIndex != null ? (
						<>
							<span className="truncate flex-1">
								Picked geometry #{pickedGeomIndex + 1}
							</span>
							<Button
								size="sm"
								variant="outline"
								className="h-6 text-xs"
								onClick={() =>
									editMissionGeometry(pickedGeomIndex)
								}
							>
								Edit
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="h-6 w-6 p-0 text-destructive"
								onClick={() =>
									deleteMissionGeometry(pickedGeomIndex)
								}
							>
								<Trash2 className="w-3.5 h-3.5" />
							</Button>
						</>
					) : (
						<span className="truncate flex-1 text-muted-foreground">
							Pick / draw a mission geometry, then save.
						</span>
					)}
					<Button
						size="sm"
						className="h-6 text-xs"
						disabled={
							busy || missionConfig == null || !missionSubmittable
						}
						title={
							missionSubmittable
								? "Save mission"
								: "Resolve the errors below before saving"
						}
						onClick={() => void saveMission()}
					>
						<Save className="w-3.5 h-3.5 mr-1" />
						Save mission
					</Button>
				</div>
			)}

			{/* Mission validation errors (blocking). */}
			{context === "mission" && missionErrorIssues.length > 0 && (
				<div className="text-xs text-destructive bg-destructive/10 px-2 py-1 shrink-0 space-y-0.5">
					{missionErrorIssues.map((issue, i) => (
						<div key={`${issue.path}-${i}`}>
							<span className="font-medium">{issue.path}</span>:{" "}
							{issue.message}
						</div>
					))}
				</div>
			)}

			{/* Geofence advisory (non-blocking): objectives outside the loaded
			    geofences would give the planner no routable nodes there. */}
			{context === "mission" &&
				objectivesOutsideGeofenceIndices.length > 0 && (
					<div className="text-xs text-warning bg-warning/10 px-2 py-1 shrink-0 space-y-0.5">
						{objectivesOutsideGeofenceIndices.map((index) => (
							<div key={`outside-geofence-${index}`}>
								<span className="font-medium">
									Objective #{index + 1}
								</span>{" "}
								is outside the map geofence — the planner has no
								routable nodes there and will fail to plan. Draw
								it inside a geofence.
							</div>
						))}
						<div className="text-warning/80">
							Checked against the currently loaded map; the
							planner ultimately selects the active map.
						</div>
					</div>
				)}

			{/* Map */}
			<div className="relative flex-1 min-h-0">
				{context === "map-editor" && pending && !readOnly && (
					<SavePrompt
						initialName={pending.name}
						initialType={pending.featureType}
						busy={busy}
						onCancel={() => {
							setPending(null);
							clearDraw(drawRef.current);
							setTool("view");
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
						buildings3d={buildings3d}
						onToggleBuildings3d={toggleBuildings3d}
						plannerGraph={plannerGraph}
						onTogglePlannerGraph={togglePlannerGraph}
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
					{/* Planner navigation graph — faint backdrop UNDER the
					    operator's features (beforeId), drawn before them. */}
					{plannerGraph && plannerGraphFc && (
						<PlannerGraphLayer data={plannerGraphFc} />
					)}
					{/* Both feature layers always render, in distinct styles. */}
					<FeatureLayers features={features} />
					<MissionFeatureLayers geometries={missionGeometryFc} />
					{buildings3d && buildingsFc && (
						<Buildings3DLayer data={buildingsFc} />
					)}
					{/* Primary agent markers: one localization subscription per
					    namespaced agent, in its own signature-stable provider.
					    The roster carries no ROS source, so subscriptions fall
					    back to the operator's configured telemetry source (the
					    edge-feedback topic, else the mission-feedback topic). */}
					<AgentLocalizationOverlay
						fallbackSource={localizationFallbackSource}
						selectable={markersSelectable}
						selectedAgents={allocatedVehicles}
						onSelectAgent={toggleMissionVehicle}
					/>
					{(props.feedbackTopic || props.agentTopic) && (
						<LocalDataSourcesProvider
							SelectedTopics={liveTopics}
							buffersSize={128}
						>
							<LiveOverlay
								feedbackTopic={props.feedbackTopic}
								agentTopic={props.agentTopic}
								namespacedAgentIds={namespacedAgentIds}
								selectable={markersSelectable}
								selectedAgents={allocatedVehicles}
								onSelectAgent={toggleMissionVehicle}
							/>
						</LocalDataSourcesProvider>
					)}
				</MapLibreMap>
			</div>

			{/* Destructive-action confirmation (replaces window.confirm). */}
			<AlertDialog
				open={confirmState != null}
				onOpenChange={(open) => {
					if (!open) setConfirmState(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmState?.title}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmState?.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								confirmState?.onConfirm();
								setConfirmState(null);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/**
 * Read-only planner-status badge: shows the map the planner is actually using
 * (selection is automatic — report-only) and warns when it has no routable
 * features in range. Hoisted for a stable identity (Pattern #10).
 */
function PlannerStatusBadge(props: { status: PlannerStatus | null }) {
	const { status } = props;
	if (!status) return null;
	const noGraph = status.loaded_map != null && status.graph_nodes === 0;
	return (
		<Badge
			variant={noGraph ? "destructive" : "outline"}
			title={
				noGraph
					? "The loaded map has no routable features in range."
					: (status.note ?? status.mode ?? undefined)
			}
		>
			Planner: {status.loaded_map ?? "no map"}
			{noGraph ? " · no routable features" : ""}
		</Badge>
	);
}

/**
 * Host: resolves the first-class `c2.maps.*` / `c2.map.features.*` definitions
 * (optionally pinned to a datasource). Renders a placeholder until the maps-list
 * call exists.
 */
const MissionMapWidget: React.FC<MissionMapProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const mapsListDef = useMemo(
		() => findCall(calls, C2Call.MapsList),
		[calls],
	);
	const mapsCreateDef = useMemo(
		() => findCall(calls, C2Call.MapsCreate),
		[calls],
	);
	const mapsDeleteDef = useMemo(
		() => findCall(calls, C2Call.MapsDelete),
		[calls],
	);
	const featuresListDef = useMemo(
		() => findCall(calls, C2Call.MapFeaturesList),
		[calls],
	);
	const featuresAddDef = useMemo(
		() => findCall(calls, C2Call.MapFeaturesAdd),
		[calls],
	);
	const featuresUpdateDef = useMemo(
		() => findCall(calls, C2Call.MapFeaturesUpdate),
		[calls],
	);
	const featuresDeleteDef = useMemo(
		() => findCall(calls, C2Call.MapFeaturesDelete),
		[calls],
	);
	const plannerStatusDef = useMemo(
		() => findCall(calls, C2Call.PlannerStatus),
		[calls],
	);
	const plannerGraphDef = useMemo(
		() => findCall(calls, C2Call.PlannerGraph),
		[calls],
	);
	const missionsListDef = useMemo(
		() => findCall(calls, C2Call.MissionsList),
		[calls],
	);
	const missionsSaveDef = useMemo(
		() => findCall(calls, C2Call.MissionsSave),
		[calls],
	);

	if (!mapsListDef) {
		return (
			<div className="h-full flex items-center justify-center p-3 text-sm text-muted-foreground text-center">
				No C2 datasource available. Add a C2 Control datasource to draw
				and manage maps and mission geometry.
			</div>
		);
	}

	return (
		<MissionMapBody
			mapUrl={props.mapUrl?.trim() || DEFAULT_MAP_URL}
			defaultMap={props.defaultMap}
			mapsListDef={mapsListDef}
			mapsCreateDef={mapsCreateDef}
			mapsDeleteDef={mapsDeleteDef}
			featuresListDef={featuresListDef}
			featuresAddDef={featuresAddDef}
			featuresUpdateDef={featuresUpdateDef}
			featuresDeleteDef={featuresDeleteDef}
			plannerStatusDef={plannerStatusDef}
			plannerGraphDef={plannerGraphDef}
			missionsListDef={missionsListDef}
			missionsSaveDef={missionsSaveDef}
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
			"Edit per-map MapDB features (c2.maps.* / c2.map.features.*) and the active mission's objective geometry, with live mission_feedback waypoints, per-agent localization markers (frame_id-gated), and planner status",
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
				defaultMap: {
					type: "string",
					title: "Default map",
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
				agentTopic: {
					type: "object",
					title: "Edge feedback (fallback for no-namespace agents)",
				},
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
					scope: "#/properties/defaultMap",
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
