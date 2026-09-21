"use client";

// ⚠ COORDINATE RULE — everything in this widget that touches MapLibre,
// terra-draw, GeoJSON, the saved MapDB C2Feature, and mission
// objective.geometries[].geometry.coordinates uses [lng, lat]. The ONLY swap in
// the system is mission_feedback waypoints (already swapped by the feedback parser; use .lngLat,
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
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
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

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
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
	commitSavedDraft,
	editMissionDraft,
	getMissionDraft,
	hasMissionDraft,
	setMissionDraft,
	useMissionDraft,
} from "../state/mission-draft-store";
import {
	DrawFeature,
	c2FeatureToDrawFeature,
	describeUneditableGeometry,
	drawFeatureToC2Feature,
	drawFeatureToInlineGeometry,
	readFeatureId,
} from "./feature-geojson";
import {
	DrawShape,
	applyMissionOwnedFields,
	cleanMissionConfig,
	drawShapeToMode,
	hydrateMissionDraft,
	mergeMissionOwnedFields,
	missionContentEquals,
	missionOwnedFieldsSignature,
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
import { PanelEmptyState } from "./panel-empty-state";
import { fetchOsmBuildings } from "./osm/buildings";
import type { OverpassBuildingWay } from "./osm/buildings";
import {
	osmBuildingsToExtrusionFc,
	osmBuildingsToRiskFeatures,
	type BuildingExtrusionFeatureCollection,
} from "./osm/osm-buildings";
import {
	TRAJECTORY_RAW_TYPE,
	useAgentLocalizationTopics,
	useAgentTopics,
} from "./agent-localization-topics";
import { FeedbackTask } from "../types/mission-feedback";
import {
	useMissionFeedbackExact,
	useMissionFeedbackOrigin,
} from "../state/mission-feedback-store";
import {
	freshTrajectories,
	recordTrajectory,
	useTrajectories,
} from "../state/trajectory-store";
import { useWaypointHighlight } from "../state/waypoint-highlight-store";
import { recordBreadcrumb, useBreadcrumbs } from "../state/breadcrumb-store";
import { isMissionCommitted, resolveViewOnly } from "./map-view-mode";
import { usePublishMissionFeedback } from "./mission-feedback-source";
import { vehicleColor } from "./plan-metrics";
import {
	formatClock,
	formatTaskProgressLine,
	splitRoute,
	taskProgress,
} from "./mission-progress";
import { AutoSelectActiveMission, useNow } from "./now-playing";
import { parseAutonomyTrajectory } from "./robot-track";
import { useContainerSize } from "./responsive";
import { MissionFeedbackHistorySync } from "./feedback-history";
import { useMapInit } from "./maps-shared/use-map-init";
import { useMapStyle } from "./maps-shared/use-map-style";
import {
	BASEMAPS_REQUIRING_KEY,
	DEFAULT_BASEMAP_URL,
	MAP_MAX_ZOOM,
	ORMI_STYLE_ANCHORS,
	ORMI_BUILDINGS_3D_LAYER,
	basemapOneOf,
	isVectorBasemap,
	resolveAnchor,
	setLayerVisibility,
} from "@workspace/utils";
import { MapChrome } from "@workspace/utils/map-chrome";
import { crossMapEdit, crossMapEditMessage } from "./map-editing-guards";
import { MAP_OVERLAYS, resolveOverlays } from "./maps-shared/overlay-layers";
import { RAINVIEWER_OVERLAY_ID } from "./maps-shared/rainviewer";
import { RainviewerOverlay } from "./rainviewer-overlay";

/**
 * Mission map widget on the first-class maps API, with a two-mode editing model.
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
 *  (d) live overlay: `mission_feedback` waypoint paths (parsed `.lngLat`) + agent
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

/**
 * Toolbar segmented-control items size to their label. The stock item is
 * `flex-1`, which splits a group into equal columns — fine for "On / Off", but it
 * squeezes the longest label ("Geofence", "Rectangle") against its borders.
 */
const TOGGLE_ITEM_CLASS = "flex-none px-2.5";

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

/** Behavior options for the mission-panel enum select (mirrors the mission editor). */
const BEHAVIOR_OPTIONS: [MissionBehavior, string][] = [
	[MissionBehavior.NAVIGATE, "0 — NAVIGATE"],
	[MissionBehavior.COVERAGE, "1 — COVERAGE"],
	[MissionBehavior.NAVIGATE_NO_PLANNING, "2 — NAVIGATE_NO_PLANNING"],
];

/**
 * One allocated-vehicle chip in the mission-panel read-only summary. Hoisted
 * (module-level) so it can call {@link useAgentName} for the namespace name —
 * hooks can't run in the parent's `.map`. Identity is stable (Pattern #10). The
 * primary allocation affordance is clicking the agent markers; this is the
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
	/** Operator-supplied key for basemaps that require one (Carto, Stadia). */
	basemapApiKey?: string;
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

/**
 * Basemap used when a widget's `mapUrl` is unset or blank.
 *
 * Also the schema default. Shared with the std-widgets map so the two agree;
 * see `DEFAULT_BASEMAP_URL` in `@workspace/utils`.
 */
const DEFAULT_MAP_URL = DEFAULT_BASEMAP_URL;

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

	// "Where it has been": every geographic fix feeds the per-robot breadcrumb
	// (decimated ~0.5 m and capped in `robot-track.ts`). In an effect — it
	// mutates a store — and keyed on the marker list, which is rebuilt exactly
	// when a localization message arrived.
	useEffect(() => {
		for (const marker of agentMarkers) {
			recordBreadcrumb(marker.id, marker.lngLat);
		}
	}, [agentMarkers]);

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

/** A robot's breadcrumb line feature. */
interface BreadcrumbFeature {
	type: "Feature";
	properties: { color: string };
	geometry: { type: "LineString"; coordinates: [number, number][] };
}

/**
 * Breadcrumb features keyed by the published trail they were built from. The
 * store keeps an unchanged robot's trail identity across publishes, so only the
 * robots that actually moved get a new feature.
 */
const breadcrumbFeatures = new WeakMap<[number, number][], BreadcrumbFeature>();

/**
 * The line feature for one robot's trail, reused while the trail is unchanged.
 *
 * @param agentId - The robot (colours the line).
 * @param trail - Its published trail, `[lng, lat]`.
 * @returns The feature.
 */
function breadcrumbFeature(
	agentId: string,
	trail: [number, number][],
): BreadcrumbFeature {
	const cached = breadcrumbFeatures.get(trail);
	if (cached) return cached;
	const feature: BreadcrumbFeature = {
		type: "Feature",
		properties: { color: vehicleColor(agentId) },
		geometry: { type: "LineString", coordinates: trail },
	};
	breadcrumbFeatures.set(trail, feature);
	return feature;
}

/**
 * "Where it has been": each robot's session breadcrumb (see
 * `state/breadcrumb-store.ts`), a thin line in the robot's colour. Fed by
 * {@link AgentLocalizationOverlayBody}; drawn for every robot with a geographic
 * localization stream, whatever mission is selected — it is the robot's own
 * trail, not a mission's.
 */
function BreadcrumbLayer() {
	const trails = useBreadcrumbs();
	const fc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: Object.entries(trails)
				.filter(([, trail]) => trail.length >= 2)
				.map(([agentId, trail]) => breadcrumbFeature(agentId, trail)),
		}),
		[trails],
	);
	if (fc.features.length === 0) return null;
	return (
		<Source id="c2-breadcrumbs" type="geojson" data={fc}>
			<Layer
				id="c2-breadcrumbs-line"
				type="line"
				layout={{ "line-cap": "round", "line-join": "round" }}
				paint={{
					"line-color": ["get", "color"],
					"line-width": 2,
					"line-opacity": 0.55,
				}}
			/>
		</Source>
	);
}

/**
 * Trajectory overlay body: parses each robot's latest `autonomy_trajectory` (v2
 * only — see `robot-track.ts`) into a line in the robot's colour.
 */
function AgentTrajectoryOverlayBody(props: {
	agentByKey: Map<string, string>;
	agentIds: readonly string[];
}) {
	const { sources } = useLocalDataSource();

	// Record each NEWLY arrived plan with its arrival time (a new buffer array
	// is a new message), so a plan that stopped arriving can age out.
	const seenRef = useRef<WeakSet<object>>(new WeakSet());
	useEffect(() => {
		const seen = seenRef.current;
		for (const [key, source] of (
			sources as Map<string, BufferedSource>
		).entries()) {
			if (seen.has(source.data)) continue;
			seen.add(source.data);
			const agentId = props.agentByKey.get(key);
			if (!agentId) continue;
			const line = parseAutonomyTrajectory(
				source.data[source.data.length - 1],
			);
			if (line) recordTrajectory(agentId, line);
		}
	}, [sources, props.agentByKey]);

	// Draw only plans younger than TRAJECTORY_MAX_AGE_MS: the bridge republishes
	// at 1 Hz while it drives, so an older plan belongs to a goal that is over.
	const trajectories = useTrajectories();
	const now = useNow(1000);
	const fc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: freshTrajectories(trajectories, props.agentIds, now).map(
				([agentId, line]) => ({
					type: "Feature" as const,
					properties: { color: vehicleColor(agentId) },
					geometry: {
						type: "LineString" as const,
						coordinates: line,
					},
				}),
			),
		}),
		[trajectories, props.agentIds, now],
	);
	if (fc.features.length === 0) return null;
	return (
		<Source id="c2-trajectories" type="geojson" data={fc}>
			{/* White casing so the plan reads over the route of the same colour. */}
			<Layer
				id="c2-trajectories-casing"
				type="line"
				layout={{ "line-cap": "round", "line-join": "round" }}
				paint={{ "line-color": "#ffffff", "line-width": 4.5 }}
			/>
			<Layer
				id="c2-trajectories-line"
				type="line"
				layout={{ "line-cap": "round", "line-join": "round" }}
				paint={{
					"line-color": ["get", "color"],
					"line-width": 2,
					"line-dasharray": [1, 1.5],
				}}
			/>
		</Source>
	);
}

/**
 * "What the robot is planning": the Nav2 global plan of each robot of the
 * selected mission, from `{namespace}/edge/multi_robot/autonomy_trajectory`.
 *
 * Subscribed only for the vehicles of the selected mission while it is
 * STARTED (live, not a stored snapshot), and each plan is dropped once it is
 * older than 5 s — a plan left over from a finished goal is a lie. Through the same
 * per-agent topic derivation as the localization markers — no new topic
 * configuration. Renders nothing until a v2 trajectory arrives: the legacy
 * payload is metric and is ignored.
 */
function AgentTrajectoryOverlay(props: {
	fallbackSource?: DatasourceProviderSettings;
	agentIds: readonly string[];
}) {
	const { topics, agentByKey } = useAgentTopics(
		"autonomy_trajectory",
		TRAJECTORY_RAW_TYPE,
		props.fallbackSource,
		props.agentIds,
	);
	if (topics.length === 0) return null;
	return (
		<LocalDataSourcesProvider SelectedTopics={topics} buffersSize={1}>
			<AgentTrajectoryOverlayBody
				agentByKey={agentByKey}
				agentIds={props.agentIds}
			/>
		</LocalDataSourcesProvider>
	);
}

/**
 * Whether a feedback `status` is a PREVIEW (planned) state — rendered dashed —
 * vs a committed/executing one — rendered solid. Unknown / terminal states
 * default to dashed (treated as not-yet-committed).
 *
 * The ACCEPTED/STARTED/PAUSED triple is {@link isMissionCommitted}, NOT a second
 * copy of it: this widget spelled the same three states out again, so "committed"
 * could drift between the line style here and the authoring stand-down rule that
 * decides whether the operator may edit at all — two answers to one question,
 * on the same screen.
 */
function isPreviewStatus(status: MissionStatus): boolean {
	return !isMissionCommitted(status);
}

/** A waypoint hover/click popover payload. */
interface WaypointPopover {
	lng: number;
	lat: number;
	vehicle: string;
	index: number;
	averageSpeed?: number;
	eta?: string | null;
	/** v2: when the robot reached it. */
	reachedAt?: string | null;
	/** v2: stop point (true) / pass-through (false) / unknown. */
	stop?: boolean;
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
	/** Marker selection threading — see {@link AgentMarker}. */
	selectable?: boolean;
	selectedAgents?: Set<string>;
	onSelectAgent?: (agentId: string) => void;
}) {
	const { sources, getTopicHealth } = useLocalDataSource();

	// Per-vehicle tasks from mission_feedback (parsed .lngLat — already [lng,lat]),
	// carrying the feedback `status` so the style can gate preview vs committed.
	//
	// `/multi_robot/mission_feedback` is a SINGLE shared topic carrying feedback
	// for ALL missions, interleaved. Reading the buffer tail directly redrew
	// whichever mission published last, flickering between plans. Instead: PUBLISH
	// every message into the per-mission feedback store (keyed by `mission_id`),
	// then READ ONLY the selected mission's slot — with no selection, nothing
	// (the old "show whatever published last" fallback drew another mission's
	// plan with no tell; the map banner now says what is playing instead). The
	// store hands back a reference-stable, change-fresh value per mission
	// (deduped on `feedbackSignature`), so an interleaved message for ANOTHER
	// mission updates THAT slot and never changes `fb`'s identity here — no
	// flicker. While a v2 mission runs its content does change about once a
	// second (position, distance, ETA), and the FC memos below rebuild with it:
	// that is the done/remaining split following the robot, not churn.
	usePublishMissionFeedback(
		sources as Map<string, { data: unknown[] }>,
		Boolean(props.feedbackTopic),
	);
	const selectedMission = useSelectedMission();
	// EXACTLY the selected mission: with nothing selected the map draws no
	// routes (the banner says so) instead of whichever mission published last.
	const fb = useMissionFeedbackExact(selectedMission);
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

	// Route line features — per task, the REMAINING part in the vehicle colour
	// (solid when committed, dashed for a planned preview — two filtered layers,
	// since line-dasharray can't be data-driven within one layer) and the DONE
	// part in grey, split at `current_waypoint_index` (MissionFeedback v2; with a
	// v1 producer everything is "remaining", which draws exactly as before).
	const lineFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: tasks.flatMap(({ status, task }) => {
				const split = splitRoute(task);
				const color = vehicleColor(task.vehicle_id);
				const out = [];
				if (split.remaining.length >= 2) {
					out.push({
						type: "Feature" as const,
						properties: {
							vehicleId: task.vehicle_id,
							color,
							status,
							dashed: isPreviewStatus(status),
							done: false,
						},
						geometry: {
							type: "LineString" as const,
							coordinates: split.remaining,
						},
					});
				}
				if (split.done.length >= 2) {
					out.push({
						type: "Feature" as const,
						properties: {
							vehicleId: task.vehicle_id,
							color,
							status,
							dashed: false,
							done: true,
						},
						geometry: {
							type: "LineString" as const,
							coordinates: split.done,
						},
					});
				}
				return out;
			}),
		}),
		[tasks],
	);

	// Numbered waypoint point features (1-based index, colour, orientation),
	// flagged `done` (passed → grey), `current` (the next waypoint → ringed and
	// labelled) and `stop`.
	const pointFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: tasks.flatMap(({ task }) => {
				const progress = taskProgress(task);
				return task.waypoints.map((w, i) => ({
					type: "Feature" as const,
					properties: {
						color: vehicleColor(task.vehicle_id),
						index: i + 1,
						orientation: w.orientation ?? 0,
						hasOrientation: w.orientation != null,
						done: i < progress.done,
						current: i === progress.currentIndex,
						stop: w.stop === true,
					},
					geometry: {
						type: "Point" as const,
						coordinates: w.lngLat,
					},
				}));
			}),
		}),
		[tasks],
	);

	// The waypoint hovered / pinned in the feedback widget (route graph station
	// or Gantt tick), for the selected mission only.
	const highlight = useWaypointHighlight();
	const highlightFc = useMemo(() => {
		const empty = { type: "FeatureCollection" as const, features: [] };
		if (!highlight || !fb || highlight.missionId !== fb.mission_id) {
			return empty;
		}
		const task = fb.tasks.find((t) => t.vehicle_id === highlight.vehicleId);
		const wp = task?.waypoints[highlight.index];
		if (!task || !wp) return empty;
		return {
			type: "FeatureCollection" as const,
			features: [
				{
					type: "Feature" as const,
					properties: {
						color: vehicleColor(task.vehicle_id),
						label: `WP ${highlight.index + 1}`,
					},
					geometry: {
						type: "Point" as const,
						coordinates: wp.lngLat,
					},
				},
			],
		};
	}, [highlight, fb]);

	// The next waypoint's label: "Next · WP 22/56 · 14 m · ETA 10:42".
	const nextFc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: tasks.flatMap(({ task }) => {
				const progress = taskProgress(task);
				const wp =
					progress.currentIndex != null
						? task.waypoints[progress.currentIndex]
						: undefined;
				const line = formatTaskProgressLine(task);
				if (!wp || !line) return [];
				return [
					{
						type: "Feature" as const,
						properties: {
							color: vehicleColor(task.vehicle_id),
							label: `Next · ${line}`,
						},
						geometry: {
							type: "Point" as const,
							coordinates: wp.lngLat,
						},
					},
				];
			}),
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
						{/* Already driven: grey, under the remaining route. */}
						<Layer
							id="c2-feedback-paths-done"
							type="line"
							filter={["get", "done"]}
							paint={{
								"line-color": "#9ca3af",
								"line-width": 3,
								"line-opacity": 0.8,
							}}
						/>
						{/* Committed/executing routes: solid. */}
						<Layer
							id="c2-feedback-paths-solid"
							type="line"
							filter={[
								"all",
								["!", ["get", "dashed"]],
								["!", ["get", "done"]],
							]}
							paint={{
								"line-color": ["get", "color"],
								"line-width": 3,
							}}
						/>
						{/* Planned preview routes: dashed. */}
						<Layer
							id="c2-feedback-paths-dashed"
							type="line"
							filter={[
								"all",
								["get", "dashed"],
								["!", ["get", "done"]],
							]}
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
						{/* The next waypoint: a wide halo under its dot. */}
						<Layer
							id="c2-feedback-waypoints-next"
							type="circle"
							filter={["get", "current"]}
							paint={{
								"circle-radius": 14,
								"circle-color": ["get", "color"],
								"circle-opacity": 0.25,
								"circle-stroke-color": ["get", "color"],
								"circle-stroke-width": 2.5,
							}}
						/>
						<Layer
							id="c2-feedback-waypoints-circle"
							type="circle"
							paint={{
								"circle-radius": [
									"case",
									["get", "current"],
									10,
									8,
								],
								"circle-color": [
									"case",
									["get", "done"],
									"#9ca3af",
									["get", "color"],
								],
								// A stop point gets a dark ring; pass-through
								// points keep the white one.
								"circle-stroke-color": [
									"case",
									["get", "stop"],
									"#111827",
									"#ffffff",
								],
								"circle-stroke-width": [
									"case",
									["get", "stop"],
									2.5,
									1.5,
								],
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
					<Source id="c2-feedback-next" type="geojson" data={nextFc}>
						<Layer
							id="c2-feedback-next-label"
							type="symbol"
							layout={{
								"text-field": ["get", "label"],
								"text-size": 12,
								"text-offset": [0, 1.6],
								"text-anchor": "top",
								"text-allow-overlap": true,
								"text-ignore-placement": true,
							}}
							paint={{
								"text-color": ["get", "color"],
								"text-halo-color": "#ffffff",
								"text-halo-width": 2,
							}}
						/>
					</Source>
					<Source
						id="c2-waypoint-highlight"
						type="geojson"
						data={highlightFc}
					>
						<Layer
							id="c2-waypoint-highlight-ring"
							type="circle"
							paint={{
								"circle-radius": 18,
								"circle-color": "rgba(0,0,0,0)",
								"circle-stroke-color": ["get", "color"],
								"circle-stroke-width": 4,
							}}
						/>
						<Layer
							id="c2-waypoint-highlight-label"
							type="symbol"
							layout={{
								"text-field": ["get", "label"],
								"text-size": 12,
								"text-offset": [0, -2.2],
								"text-anchor": "bottom",
								"text-allow-overlap": true,
								"text-ignore-placement": true,
							}}
							paint={{
								"text-color": ["get", "color"],
								"text-halo-color": "#ffffff",
								"text-halo-width": 2,
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
								{popover.stop != null && (
									<div>
										{popover.stop
											? "stop point"
											: "pass-through"}
									</div>
								)}
								{popover.reachedAt ? (
									<div>
										reached {formatClock(popover.reachedAt)}
									</div>
								) : (
									popover.eta && <div>eta: {popover.eta}</div>
								)}
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
						reachedAt: w.reached_at,
						stop: w.stop,
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
 * Render the active open-source overlays as raster layers.
 *
 * `beforeId` pins them under the C2 feature fill (so they sit above the base map
 * but below the feature / draw / live layers); that id is always present because
 * `FeatureLayers` renders unconditionally. On a vector basemap the caller passes
 * the style's resolved overlay anchor instead, which additionally keeps the
 * overlays under the basemap's own label stack.
 *
 * @param props.beforeId - MapLibre layer id to insert the overlays before.
 */
function OverlayLayers(props: { active: string[]; beforeId: string }) {
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
						beforeId={props.beforeId}
						paint={{ "raster-opacity": 1 }}
					/>
				</Source>
			))}
		</>
	);
}

/**
 * Extrude OSM building footprints as a MapLibre `fill-extrusion` 3D layer.
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

/** One labelled checkbox row in the overlay panel. */
function OverlayToggle(props: {
	id: string;
	checked: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	const controlId = `c2-overlay-${props.id}`;
	return (
		<div className="flex items-center gap-2">
			<Checkbox
				id={controlId}
				checked={props.checked}
				onCheckedChange={props.onToggle}
			/>
			<Label
				htmlFor={controlId}
				className="text-xs font-normal cursor-pointer"
			>
				{props.children}
			</Label>
		</div>
	);
}

/** In-map checklist to toggle overlays live (session-only; config seeds it). */
function OverlayPanel(props: {
	active: string[];
	onToggle: (id: string) => void;
	onClose: () => void;
	buildings3d: boolean;
	/** True when the basemap answers 3D itself (vector), which has a zoom floor. */
	buildingsFromBasemap: boolean;
	onToggleBuildings3d: () => void;
	plannerGraph: boolean;
	onTogglePlannerGraph: () => void;
}) {
	return (
		<div className="absolute top-2 right-2 z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-2 shadow-md w-56 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] overflow-y-auto">
			<div className="flex items-center gap-2 min-w-0">
				<div className="text-xs font-medium truncate">
					Overlay layers
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="Close overlay layers"
						onClick={props.onClose}
					>
						<X />
					</Button>
				</div>
			</div>
			{MAP_OVERLAYS.map((overlay) => (
				<OverlayToggle
					key={overlay.id}
					id={overlay.id}
					checked={props.active.includes(overlay.id)}
					onToggle={() => props.onToggle(overlay.id)}
				>
					{overlay.title}
				</OverlayToggle>
			))}
			{/* Dynamic (time-stamped, animated) overlay — not in MAP_OVERLAYS. */}
			<OverlayToggle
				id={RAINVIEWER_OVERLAY_ID}
				checked={props.active.includes(RAINVIEWER_OVERLAY_ID)}
				onToggle={() => props.onToggle(RAINVIEWER_OVERLAY_ID)}
			>
				RainViewer radar (live)
			</OverlayToggle>
			{/* 3D buildings — the basemap's own extrusion layer on a vector
			    basemap, an Overpass fill-extrusion source on a raster one.
			    Either way not a raster overlay, so it has its own toggle rather
			    than an entry in MAP_OVERLAYS.

			    The zoom floor is named when it applies: the bundled styles
			    carry `building-3d` from z14, so below that an operator would
			    tick the box, see nothing change, and have no way to know why.
			    The Overpass path has no floor, hence the condition. */}
			<OverlayToggle
				id="buildings-3d"
				checked={props.buildings3d}
				onToggle={props.onToggleBuildings3d}
			>
				3D buildings
				{props.buildingsFromBasemap && (
					<span className="text-muted-foreground">(zoom 14+)</span>
				)}
			</OverlayToggle>
			{/* Planner navigation graph — a faint node/edge backdrop fetched from
			    the C2 (c2.planner.graph), not a raster overlay. */}
			<OverlayToggle
				id="planner-graph"
				checked={props.plannerGraph}
				onToggle={props.onTogglePlannerGraph}
			>
				Planner graph
			</OverlayToggle>
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
		<div className="absolute top-2 left-2 z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-2 shadow-md w-64 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] overflow-y-auto">
			<div className="text-xs font-medium">Save map feature</div>
			<Input
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="Feature name"
				className="h-8"
			/>
			<Select
				value={featureType}
				onValueChange={(value) => setFeatureType(value as FeatureType)}
			>
				<SelectTrigger size="sm" className="w-full">
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
					className="flex-1"
					disabled={props.busy || name.trim().length === 0}
					onClick={() => props.onConfirm(name.trim(), featureType)}
				>
					<Save />
					Save
				</Button>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Cancel"
					disabled={props.busy}
					onClick={props.onCancel}
				>
					<X />
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
	/**
	 * The map this edit was opened against.
	 *
	 * Provenance for the cross-map upsert guard (`map-editing-guards.ts`):
	 * `c2.map.features.update` is a PUT upsert, so a pending edit carried across a
	 * map switch would silently copy one map's feature into another. Recorded at
	 * the moment the edit starts and checked again at the write.
	 */
	mapName?: string;
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
	/** The selected map, stamped onto a pending save for the cross-map guard. */
	selectedMap: string;
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
	basemapApiKey?: string;
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

	const { startingLocation, resolvedLocation } = useMapInit();
	// True once the map instance exists. `mapRef` is a ref, so nothing re-runs
	// when it is populated; effects that need the live map key on this instead.
	const [mapObserved, setMapObserved] = useState(false);

	// 3D buildings. On a vector basemap the bundled style already carries the
	// geometry in a hidden `building-3d` extrusion, so there is nothing to fetch
	// and nothing to render ourselves — only a layer to show.
	// Null = the operator has not said, so the basemap decides (see
	// `buildings3d` below). Only their explicit choice is stored, the same shape
	// as the View/Edit override: a plain `false` default would mean a vector
	// basemap opened flat despite carrying the buildings for nothing.
	const [buildings3dChoice, setBuildings3dChoice] = useState<boolean | null>(
		null,
	);
	// The Overpass fallback for a raster basemap: footprints from the SAME
	// building fetch the risk-import path uses, as an extrusion
	// FeatureCollection (null until the first fetch resolves). Stays null for
	// the lifetime of a vector basemap.
	//
	// Stored WITH the scope it was fetched for, and rendered only while that
	// still matches: footprints are clipped to the picked geofence, so a
	// collection kept across a geofence change — or across a trip through a
	// vector basemap and back — would draw the previous geofence's buildings as
	// if they were the current ones, which is the plausible-but-wrong display
	// this widget's other rules exist to prevent.
	const [buildings, setBuildings] = useState<{
		scope: string;
		fc: BuildingExtrusionFeatureCollection;
	} | null>(null);
	// Whether the basemap answers "where are the buildings" by itself. The two
	// paths are mutually exclusive: running both would extrude the same city
	// twice, once from the tiles and once from Overpass, in two different
	// heights and two different greys.
	const basemapCarriesBuildings = isVectorBasemap(props.mapUrl);

	// On by default wherever it is free: a vector basemap already ships the
	// geometry, so showing it costs a visibility flip and nothing else. The
	// raster path is off by default and stays that way — there, enabling it means
	// an Overpass fetch, which is not something to do to a public API because a
	// panel happened to open. An explicit choice wins over both, and because the
	// default is derived rather than seeded into state, switching the basemap
	// moves it too (until the operator says otherwise).
	const buildings3d = buildings3dChoice ?? basemapCarriesBuildings;

	// The style depends on the basemap and the key, and on nothing the operator
	// toggles — see `use-map-style.ts`: a new style object makes react-map-gl
	// call `setStyle(next, { diff: true })`, whose diff deletes every
	// imperatively added source and layer, terra-draw's authoring layers
	// included. The 3D flip is applied to the live map below instead.
	const mapStyle = useMapStyle(props.mapUrl, props.basemapApiKey);
	// Where the raster overlays (open-source tiles, radar) slot into the style.
	// `resolveAnchor` returns undefined for a raster basemap — it carries no
	// anchors — and MapLibre THROWS on a `beforeId` naming a layer the style does
	// not contain, so the C2 feature fill stays the fallback. Never pass a bare
	// anchor constant.
	const overlayBeforeId =
		resolveAnchor(mapStyle, ORMI_STYLE_ANCHORS.overlay) ??
		"c2-features-fill";

	// Show or hide the basemap's own 3D building layer, in place.
	//
	// Re-applied on `styledata` because a style swap (the operator picking a
	// different basemap) reinstates the layer as the bundled style ships it,
	// hidden — without this the toggle would read as on over a flat map. The
	// helper no-ops when the layer is absent, which is every raster basemap, so
	// this needs no basemap branch of its own.
	useEffect(() => {
		if (!mapObserved) return;
		const map = mapRef.current?.getMap();
		if (!map) return;
		const apply = () =>
			setLayerVisibility(map, ORMI_BUILDINGS_3D_LAYER, buildings3d);
		apply();
		map.on("styledata", apply);
		return () => {
			map.off("styledata", apply);
		};
	}, [mapObserved, buildings3d]);
	const mapRef = useRef<MapRef>(null);
	const drawRef = useRef<TerraDraw | null>(null);
	// The widget's own box (shared responsive helper): a narrow panel gets a
	// compact toolbar so the map keeps most of the height.
	const [mapRootRef, { size: mapSize }] = useContainerSize<HTMLDivElement>();
	const compactToolbar = mapSize === "xs";
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
	//
	// This is the operator's own choice only. The map can also be in View because
	// the mission's plan is committed — see `viewOnly` below, which is what the
	// UI reads.
	const [readOnly, setReadOnly] = useState(false);
	// The mission status under which the operator last took Edit back over a
	// committed plan, so that permission does not silently carry across the next
	// transition. See `map-view-mode.ts`.
	const [editUnlockedAt, setEditUnlockedAt] = useState<MissionStatus | null>(
		null,
	);
	// Operator-chosen draw shape (line / polygon / rectangle). Mission context
	// defaults to polygon (the core "can't draw a polygon" fix); map-editor context
	// constrains it by the selected feature_type below.
	const [drawShape, setDrawShape] = useState<DrawShape>("polygon");
	const selectedMission = useSelectedMission();

	// The selected mission's live status, from the same store the lifecycle panel
	// reads. Null when no feedback topic is configured, which is not a signal —
	// see `map-view-mode.ts`.
	const missionFeedback = useMissionFeedbackExact(selectedMission);
	const missionOrigin = useMissionFeedbackOrigin(selectedMission);
	const liveStatus = props.feedbackTopic
		? (missionFeedback?.status ?? null)
		: null;

	// The vehicles whose Nav2 plan is drawn: the selected mission's, while it is
	// STARTED and heard live. A stable, sorted id list so the subscription set only changes when
	// the membership does.
	const trajectoryAgentIdsKey =
		props.feedbackTopic &&
		missionFeedback &&
		missionOrigin === "live" &&
		missionFeedback.status === MissionStatus.STARTED
			? [...new Set(missionFeedback.tasks.map((t) => t.vehicle_id))]
					.filter(Boolean)
					.sort()
					.join(",")
			: "";
	const trajectoryAgentIds = useMemo(
		() => (trajectoryAgentIdsKey ? trajectoryAgentIdsKey.split(",") : []),
		[trajectoryAgentIdsKey],
	);

	// Showing rather than authoring. Derived, never stored: approving a mission
	// commits its plan, and a map left armed over geometry the C2 has already
	// dispatched is an invitation to edit it. Deriving also keeps this out of an
	// effect — a status-driven `setState` would re-render on every feedback
	// message, and silencing that lint rule would opt this whole body out of
	// React Compiler.
	const viewOnly = resolveViewOnly({
		readOnly,
		inMissionContext: context === "mission",
		status: liveStatus,
		editUnlockedAt,
	});

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
	 * here (draw / vehicle / behavior / geometry) propagate to the mission editor and
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
		selectedMap: "",
	});
	useEffect(() => {
		drawCtxRef.current = {
			context,
			tool,
			mapFeatureType,
			selectedMission,
			selectedMap,
		};
	}, [context, tool, mapFeatureType, selectedMission, selectedMap]);

	// Toggle a single overlay on/off (session-only; config seeds the initial set).
	const toggleOverlay = useCallback((id: string) => {
		setActiveOverlays((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	}, []);

	// Toggle the 3D-buildings layer. Turning it off drops any cached footprints so
	// a later re-enable refetches for the current geofence / map view — which
	// matters on the raster path only; a vector basemap caches nothing here.
	const toggleBuildings3d = useCallback(() => {
		if (buildings3d) setBuildings(null);
		setBuildings3dChoice(!buildings3d);
	}, [buildings3d]);

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

	/**
	 * True once the camera has been placed by something more specific than the
	 * operator's own coordinates (a selected map's bounds). Gates the geolocation
	 * fly below so the two never fight over the viewport.
	 */
	const cameraPlacedRef = useRef(false);

	// Fit the map view to a registry entry's bounds, when present.
	const fitToBounds = useCallback((entry?: MapRegistryEntry) => {
		const map = mapRef.current?.getMap();
		if (!map || !entry?.bounds) return;
		const { minLon, minLat, maxLon, maxLat } = entry.bounds;
		cameraPlacedRef.current = true;
		map.fitBounds(
			[
				[minLon, minLat],
				[maxLon, maxLat],
			],
			{ padding: 40, duration: 600 },
		);
	}, []);

	/**
	 * Fly to the operator's resolved location, once.
	 *
	 * `initialViewState` is read once at map creation, long before the browser's
	 * geolocation prompt can be answered — so the resolved position used to be
	 * computed and then thrown away, and every operator always started at the
	 * hard-coded Brussels default. An imperative move is the only thing MapLibre
	 * accepts afterwards.
	 *
	 * Skipped when a selected map's bounds have already placed the camera: the map
	 * the operator is working on beats where they happen to be sitting, and a late
	 * geolocation answer yanking the view away from it would be worse than the bug.
	 */
	const flownToLocationRef = useRef(false);
	useEffect(() => {
		if (!mapObserved || !resolvedLocation) return;
		if (flownToLocationRef.current || cameraPlacedRef.current) return;
		const map = mapRef.current?.getMap();
		if (!map) return;
		flownToLocationRef.current = true;
		cameraPlacedRef.current = true;
		map.flyTo({ center: resolvedLocation, zoom: 14, duration: 800 });
	}, [mapObserved, resolvedLocation]);

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

	/**
	 * Monotonic sequence for feature fetches.
	 *
	 * `fetchFeatures` closes over `selectedMap`. The MOUNT effect below had a
	 * `cancelled` flag, but the post-write refetches (`confirmSave`,
	 * `deleteFeature`, both OSM imports) had nothing at all: switching maps while
	 * one was in flight let it resolve afterwards and call `setFeatures` with map
	 * **A**'s features while **B** was selected — the operator then edits, picks
	 * and deletes against a list that belongs to another map. Every path now takes
	 * a ticket and drops its result if a newer fetch has started.
	 *
	 * The ticket alone orders fetches; it does not say WHICH map a result is for.
	 * A write that resolves after a switch (a delete, a save, a confirmed import
	 * whose closure still names the old map) starts the newest fetch — for the
	 * map being left. Its features would then be edited under the new map's name,
	 * and the PUT upsert copies them there. So each fetch also records the map it
	 * asked for and is dropped unless that is still the selected map.
	 */
	const featuresSeqRef = useRef(0);
	/**
	 * The currently selected map, readable from an async continuation. Written
	 * by {@link changeSelectedMap} at the moment of the switch (so a fetch that
	 * resolves before the re-render is already recognised as stale) and kept in
	 * step with every other `setSelectedMap` by the effect below.
	 */
	const selectedMapRef = useRef(selectedMap);
	useEffect(() => {
		selectedMapRef.current = selectedMap;
	}, [selectedMap]);

	// Apply a fresh feature fetch to state (shared by the effect + writes).
	const refetchFeatures = useCallback(async () => {
		const seq = ++featuresSeqRef.current;
		const requestedMap = selectedMap;
		const next = await fetchFeatures();
		if (seq !== featuresSeqRef.current) return; // superseded
		if (requestedMap !== selectedMapRef.current) return; // another map now
		if (next) setFeatures(next);
	}, [fetchFeatures, selectedMap]);

	useEffect(() => {
		const seq = ++featuresSeqRef.current;
		const requestedMap = selectedMap;
		let cancelled = false;
		void (async () => {
			const next = await fetchFeatures();
			if (cancelled || seq !== featuresSeqRef.current) return;
			if (requestedMap !== selectedMapRef.current) return;
			if (next) setFeatures(next);
		})();
		return () => {
			cancelled = true;
		};
	}, [fetchFeatures, selectedMap]);

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
	// changes. Load coordination: if a slot already exists (the mission editor loaded it, or an
	// in-progress edit lives there), ADOPT it — do not refetch and clobber the
	// edit. Only fetch + `setMissionDraft` when no slot exists, so the editor and the map never
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
		const enteringView = !viewOnly;
		setReadOnly(enteringView);
		// Leaving View is also how the operator overrides a committed plan's
		// stand-down, so remember the status it was permitted under: the next
		// transition (approved → started) is a new fact and takes the map back.
		setEditUnlockedAt(enteringView ? null : liveStatus);
		if (enteringView) {
			setTool("view");
			setPending(null);
			editingDrawIdRef.current = null;
			clearDraw(drawRef.current);
		}
	}, [viewOnly, liveStatus]);

	/**
	 * Abort handle for the operator-triggered Overpass imports.
	 *
	 * `fetchOsmRoads` / `fetchOsmBuildings` both accept a signal and both import
	 * paths passed nothing, so a query against a large geofence kept running after
	 * the operator switched maps or closed the panel, held `busy` true, and could
	 * still write `setError` into an unmounted-or-moved-on widget. The 3D-buildings
	 * effect already did this correctly; the two imports now match it. Starting a
	 * new import aborts the previous one — there is one shared busy flag, so two
	 * concurrent imports could not be represented anyway. A map switch aborts
	 * it too ({@link resetMapEditingState}).
	 */
	const osmAbortRef = useRef<AbortController | null>(null);
	useEffect(
		() => () => {
			osmAbortRef.current?.abort();
		},
		[],
	);

	/**
	 * Drop every transient map-editor selection.
	 *
	 * Shared by the map switch and the create/delete paths so they cannot drift.
	 * `pending` is the one that mattered: it carries the `featureId` of a feature
	 * on the map being left, and `c2.map.features.update` is a PUT **upsert**, so
	 * confirming it after a switch copied that feature into the newly selected map
	 * — live data corruption with no error and nothing on screen. Clearing
	 * `pickedId` alone (the old behaviour) left exactly that state behind.
	 */
	const resetMapEditingState = useCallback(() => {
		setPickedId(null);
		setPending(null);
		// An Overpass import and its confirm dialog both target the map being
		// left: abort the one and close the other, so neither lands on the new map.
		osmAbortRef.current?.abort();
		setConfirmState(null);
		editingDrawIdRef.current = null;
		clearDraw(drawRef.current);
		setTool("view");
	}, []);

	/** Select a different map, discarding any edit scoped to the previous one. */
	const changeSelectedMap = useCallback(
		(name: string) => {
			selectedMapRef.current = name;
			setSelectedMap(name);
			resetMapEditingState();
		},
		[resetMapEditingState],
	);

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

	// terra-draw lifecycle — construct on map load, tear down on unmount. Also
	// where the live map becomes reachable for the effects that need it.
	const handleMapLoad = useCallback(() => {
		const map = mapRef.current?.getMap();
		if (!map) return;
		setMapObserved(true);
		if (drawRef.current) return;
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
					// Provenance for the cross-map guard (a create cannot corrupt,
					// but stamping both origins keeps the invariant simple).
					mapName: ctx.selectedMap,
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
	//
	// `viewOnly` disarms it here rather than by resetting `tool`: the map can
	// enter View on a status change, which is not an event this widget handles,
	// and a tool left armed would keep drawing under a toolbar that has put its
	// authoring controls away. Static is the same neutral mode the view tool
	// uses, so nothing on screen is removed — only the arming.
	useEffect(() => {
		const draw = drawRef.current;
		if (!draw || !draw.enabled) return;
		if (!viewOnly && tool === "draw" && canEdit) {
			draw.setMode(drawGeometryMode);
		} else if (!viewOnly && tool === "edit" && canEdit) {
			draw.setMode("select");
		} else {
			draw.setMode("static");
		}
	}, [viewOnly, tool, canEdit, drawGeometryMode]);

	/** Confirm a pending MAP-feature save: POST (create) or PUT (edit). */
	const confirmSave = useCallback(
		async (name: string, featureType: FeatureType) => {
			if (!pending) return;
			if (!selectedMap) {
				setError("Select a map first.");
				return;
			}
			// Second line of defence against the PUT-upsert corruption. The map
			// switch already clears `pending`; this refuses the write even if some
			// future path forgets to, because the cost of being wrong is a feature
			// silently cloned into another operator's map.
			if (crossMapEdit(pending, selectedMap)) {
				setError(crossMapEditMessage(pending, selectedMap));
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
							DrawFeature | undefined)
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
	const editFeature = useCallback((feature: C2Feature, mapName: string) => {
		const draw = drawRef.current;
		if (!draw) return;
		const drawn = c2FeatureToDrawFeature(feature);
		if (!drawn) {
			// Name the actual reason. terra-draw authors single-part geometry
			// only, so a MultiPolygon / MultiLineString the backend accepts and
			// this map RENDERS cannot be loaded into the draw layer — "can't be
			// edited" alone left the operator clicking Edit repeatedly.
			setError(
				describeUneditableGeometry(feature) ??
					"Feature geometry can't be edited.",
			);
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
			// Provenance: which map this edit belongs to. The write path
			// refuses to upsert it into a different one.
			mapName,
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
			// `{ features: [...] }` in the same body (the C2 maps API contract).
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

	/** Begin an OSM query, aborting any previous one; returns its signal. */
	const beginOsmFetch = useCallback((): AbortSignal => {
		osmAbortRef.current?.abort();
		const controller = new AbortController();
		osmAbortRef.current = controller;
		return controller.signal;
	}, []);

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
			const signal = beginOsmFetch();
			setBusy(true);
			const result = await fetchOsmRoads(bbox, signal);
			// A replaced import must not re-enable the controls while its
			// successor still runs: only the latest import releases `busy` (an
			// import aborted by a map switch is still the latest, and does).
			if (osmAbortRef.current?.signal === signal) setBusy(false);
			if (signal.aborted) return;
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
		[selectedMap, props.featuresAddDef, importOsmRoads, beginOsmFetch],
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
			const signal = beginOsmFetch();
			setBusy(true);
			const result = await fetchOsmBuildings(bbox, signal);
			// A replaced import must not re-enable the controls while its
			// successor still runs: only the latest import releases `busy` (an
			// import aborted by a map switch is still the latest, and does).
			if (osmAbortRef.current?.signal === signal) setBusy(false);
			if (signal.aborted) return;
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
		[selectedMap, props.featuresAddDef, importOsmBuildings, beginOsmFetch],
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
		changeSelectedMap(name);
	}, [props.mapsCreateDef, mapsCreateCall, refetchMaps, changeSelectedMap]);

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
		const list = await refetchMaps();
		changeSelectedMap(list[0]?.name ?? "");
	}, [
		props.mapsDeleteDef,
		selectedMap,
		mapsDeleteCall,
		refetchMaps,
		changeSelectedMap,
	]);

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
	 * The mission editor's advanced `transit` / `start` / `arrival_time` blocks are preserved.
	 * Authoring all four owned fields here is what breaks the save deadlock: a
	 * mission the browser created (empty) gains the required quartet and validates.
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
		// ⚠ RE-READ AT WRITE TIME. `missionConfig` is the render closure's draft,
		// captured before the `loadMissionConfig` await above. Using it meant an
		// edit made in the mission editor during that round trip was
		// overwritten by the pre-await value and its dirty flag cleared — the
		// operator lost the edit AND the warning that would have told them.
		const current = getMissionDraft(selectedMission) ?? missionConfig;

		// Capture the live in-draw edit (if any) into the geometry list by index.
		let geometries = current.objective?.geometries ?? [];
		const liveId = editingDrawIdRef.current;
		if (pickedGeomIndex != null && liveId != null) {
			const live = drawRef.current?.getSnapshotFeature(liveId) as
				DrawFeature | undefined;
			if (live) {
				const inline = drawFeatureToInlineGeometry(live);
				geometries = geometries.map((g, i) =>
					i === pickedGeomIndex ? inline : g,
				);
			}
		}
		const merged = cleanMissionConfig(
			hydrateMissionDraft(
				mergeMissionOwnedFields(fresh, {
					geometries,
					vehicles: current.vehicles ?? [],
					behavior: current.behavior,
					name: current.name,
				}),
			),
		);
		// Validate the CLEANED config — the same object that is about to be sent,
		// and the same thing the editor validates. See `liveMissionIssues` below.
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
		// Commit the saved config as the shared draft ONLY while nothing raced
		// us. The comparison is over the MAP-OWNED fields alone, and against the
		// draft as it was READ at write time (`current`) — never against `merged`.
		// `merged` carries the live in-draw reshape (which the shared draft never
		// held) and the name as normalised for the wire, so comparing against it
		// reported a conflict on every reshape save. An editor change to
		// `transit`/`start` is not a conflict with a write that never touched
		// them; a change to the fields this save persisted is.
		//
		// Only the owned fields are folded in: the editor's unsaved
		// `transit`/`start` edits survive, and the draft stays dirty while they
		// still differ from what the server now holds.
		const readSignature = missionOwnedFieldsSignature(current);
		const outcome = commitSavedDraft(
			selectedMission,
			merged,
			(draft) => missionOwnedFieldsSignature(draft) === readSignature,
			{
				apply: (draft) => applyMissionOwnedFields(draft, merged),
				isSaved: (next) => missionContentEquals(next, merged),
			},
		);
		if (outcome === "kept-dirty") {
			// The save still persisted the live reshape. Fold it into the draft
			// when its geometry list is untouched by the concurrent edit, so
			// clearing the draw layer below does not drop it and the next save
			// does not revert it.
			if (geometries !== current.objective?.geometries) {
				const readGeometries = JSON.stringify(
					current.objective?.geometries ?? [],
				);
				editMissionDraft(selectedMission, (draft) =>
					JSON.stringify(draft.objective?.geometries ?? []) ===
					readGeometries
						? {
								...draft,
								objective: { ...draft.objective, geometries },
							}
						: draft,
				);
			}
			setError(
				"Saved — but the mission changed while the save was in flight, so your newer edits were kept and are still unsaved.",
			);
		}
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
				if (tool === "edit") editFeature(hit.feature, selectedMap);
				else if (tool === "delete") requestDeleteFeature(hit.feature);
				return;
			}
			setPickedGeomIndex(hit.index);
			if (tool === "edit") editMissionGeometry(hit.index);
			else if (tool === "delete") deleteMissionGeometry(hit.index);
		},
		[
			tool,
			selectedMap,
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
	// ⚠ Validated on the CLEANED config, not the raw draft.
	//
	// THE DEADLOCK THIS BREAKS — the map validated `missionConfig` raw while the
	// editor validated `cleanMissionConfig(draft)`. JSON-Forms materializes the
	// optional blocks as empty objects, so a draft carrying `transit: {}` failed
	// C2's all-or-nothing transit rule HERE and passed THERE: the same mission
	// showed as savable in the editor and permanently un-savable in the map, with
	// an error naming a field the map has no control to fix. Both paths now
	// validate exactly what gets sent.
	const cleanedMissionConfig = useMemo(
		() => (missionConfig ? cleanMissionConfig(missionConfig) : null),
		[missionConfig],
	);
	const liveMissionIssues = useMemo(
		() =>
			cleanedMissionConfig
				? validateMissionConfig(cleanedMissionConfig)
				: [],
		[cleanedMissionConfig],
	);

	// Issues to surface: prefer the post-save merged issues when present, else the
	// live ones. Error-severity blocks save; warnings are advisory.
	const missionErrorIssues = (
		missionIssues.length > 0 ? missionIssues : liveMissionIssues
	).filter((i) => i.severity === "error");

	// Whether the working mission would pass validation (mirrors the mission editor's `submittable`);
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
	// only while a mission is being edited and not read-only.
	const markersSelectable =
		context === "mission" && missionConfig != null && !viewOnly;

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

	// What a fetched collection is valid for. A geofence ring is its own scope;
	// an unscoped fetch takes the map view, which is a moving target, so it gets
	// one shared key rather than pretending to track the viewport.
	const buildings3dScope = useMemo(
		() => (buildings3dRing ? JSON.stringify(buildings3dRing) : "view"),
		[buildings3dRing],
	);

	// Fetch building footprints once when 3D is toggled on (and whenever the
	// scoping geofence changes while on); off → drop the source. The fetch is the
	// SAME Overpass building read the risk import uses; only the output differs.
	//
	// Skipped entirely on a vector basemap: the style's own `building-3d` layer
	// is already showing them, so this would be a network round trip to a public
	// API, a second set of extrusions over the first, and one more way for the
	// toggle to fail.
	useEffect(() => {
		if (!buildings3d || basemapCarriesBuildings) return;
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
			setBuildings({
				scope: buildings3dScope,
				fc: osmBuildingsToExtrusionFc(
					result.data as OverpassBuildingWay[],
					ring ?? undefined,
				),
			});
		})();
		return () => controller.abort();
	}, [
		buildings3d,
		buildings3dRing,
		buildings3dScope,
		basemapCarriesBuildings,
	]);

	return (
		<div
			ref={mapRootRef}
			className="h-full w-full min-w-0 flex flex-col text-sm"
		>
			{/* Toolbar — wraps; in a narrow panel labels shorten so it stays
			    at most two rows and does not eat the map. */}
			<div
				className={`flex items-center p-2 shrink-0 flex-wrap border-b min-w-0 ${compactToolbar ? "gap-1" : "gap-2"}`}
			>
				{/* Context toggle — which thing the map is authoring. */}
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					aria-label="Map context"
					value={context}
					onValueChange={(value) => {
						if (value) changeContext(value as MapContext);
					}}
				>
					<ToggleGroupItem
						value="map-editor"
						className={TOGGLE_ITEM_CLASS}
					>
						{compactToolbar ? "Map" : "Map editor"}
					</ToggleGroupItem>
					<ToggleGroupItem
						value="mission"
						className={TOGGLE_ITEM_CLASS}
					>
						Mission
					</ToggleGroupItem>
				</ToggleGroup>
				{/* Mode switch: View locks every authoring affordance, Author
				    unlocks them. Labelled "Author" rather than "Edit" so it cannot
				    be mistaken for the geometry Edit tool beside it. When the map
				    stood down by itself — the mission's plan is committed — the
				    title says so: an operator who did not press this cannot
				    otherwise tell why the tools went away, and would reach for the
				    gear or reload. Choosing Author still takes the map back. */}
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					aria-label="Map mode"
					title={
						viewOnly
							? readOnly
								? "View mode — authoring locked"
								: "View mode — this mission's plan is approved; choose Author to edit it anyway"
							: "Author mode — authoring enabled"
					}
					value={viewOnly ? "view" : "author"}
					onValueChange={(value) => {
						if (value && (value === "view") !== viewOnly)
							toggleReadOnly();
					}}
				>
					<ToggleGroupItem
						value="view"
						aria-label="View mode"
						className={TOGGLE_ITEM_CLASS}
					>
						<Lock />
						{compactToolbar ? null : "View"}
					</ToggleGroupItem>
					<ToggleGroupItem
						value="author"
						aria-label="Author mode"
						className={TOGGLE_ITEM_CLASS}
					>
						<LockOpen />
						{compactToolbar ? null : "Author"}
					</ToggleGroupItem>
				</ToggleGroup>

				{/* Tools */}
				{!viewOnly && (
					<>
						<Separator
							orientation="vertical"
							className="data-[orientation=vertical]:h-6"
						/>
						<ToggleGroup
							type="single"
							variant="outline"
							size="sm"
							aria-label="Map tool"
							value={tool}
							onValueChange={(value) => {
								if (value) setTool(value as MapTool);
							}}
						>
							{(
								[
									["view", "Pick"],
									["draw", "Draw"],
									["edit", "Edit"],
									["delete", "Delete"],
								] as [MapTool, string][]
							).map(([value, label]) => (
								<ToggleGroupItem
									key={value}
									value={value}
									className={TOGGLE_ITEM_CLASS}
									disabled={value !== "view" && !canEdit}
								>
									{label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</>
				)}

				{/* Shape buttons — the geometry the Draw tool authors. In map-editor it
				    is constrained by the feature_type (road → line only, hidden;
				    geofence/risk → polygon or rectangle); in mission the operator
				    chooses freely (point / line / polygon / rectangle). */}
				{!viewOnly && availableShapes.length > 1 && (
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						aria-label="Draw shape"
						value={
							availableShapes.includes(drawShape)
								? drawShape
								: effectiveShape
						}
						onValueChange={(value) => {
							if (value) setDrawShape(value as DrawShape);
						}}
					>
						{availableShapes.map((shape) => (
							<ToggleGroupItem
								key={shape}
								value={shape}
								className={TOGGLE_ITEM_CLASS}
							>
								{SHAPE_LABELS[shape]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				)}

				<Separator
					orientation="vertical"
					className="data-[orientation=vertical]:h-6"
				/>

				{context === "map-editor" ? (
					<>
						<Select
							value={selectedMap || undefined}
							onValueChange={changeSelectedMap}
						>
							<SelectTrigger
								size="sm"
								className="w-44 max-w-full"
							>
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
						{!viewOnly && (
							<>
								<Button
									size={compactToolbar ? "icon-sm" : "sm"}
									variant="outline"
									aria-label="New map"
									disabled={busy || !props.mapsCreateDef}
									onClick={() => void createMap()}
								>
									<Plus />
									{compactToolbar ? null : "New map"}
								</Button>
								<Button
									size="icon-sm"
									variant="outline"
									className="text-destructive"
									disabled={
										busy ||
										!selectedMap ||
										!props.mapsDeleteDef
									}
									title="Delete map"
									aria-label="Delete map"
									onClick={requestDeleteMap}
								>
									<Trash2 />
								</Button>
							</>
						)}
						<Badge variant="secondary">
							{features.length} features
						</Badge>
						{/* Feature-type buttons — each implies its draw geometry
						    (road → line, geofence/risk → polygon). */}
						{!viewOnly && (
							<>
								<Separator
									orientation="vertical"
									className="data-[orientation=vertical]:h-6"
								/>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									aria-label="Feature type to draw"
									value={mapFeatureType}
									onValueChange={(value) => {
										if (value)
											setMapFeatureType(
												value as FeatureType,
											);
									}}
								>
									{(
										[
											["road", "Road"],
											["geofence", "Geofence"],
											["risk", "Risk"],
										] as [FeatureType, string][]
									).map(([value, label]) => (
										<ToggleGroupItem
											key={value}
											value={value}
											className={TOGGLE_ITEM_CLASS}
										>
											{label}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</>
						)}
						{/* Import ▾ — roads or risk-from-buildings into the picked
						    geofence. Disabled (with a tooltip) until a geofence is
						    picked; hidden in read-only mode. */}
						{!viewOnly && (
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
														disabled={
															busy ||
															!importGeofence ||
															!props.featuresAddDef
														}
													>
														<Download />
														Import
														<ChevronDown />
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
					variant={overlaysOpen ? "secondary" : "outline"}
					className="ml-auto"
					aria-pressed={overlaysOpen}
					onClick={() => setOverlaysOpen((open) => !open)}
				>
					<Layers />
					Layers
					{activeOverlays.length > 0 && (
						<Badge variant="secondary" className="px-1">
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
			{context === "map-editor" && pickedFeature && !viewOnly && (
				<div className="flex items-center gap-2 px-2 py-1 shrink-0 border-b bg-muted/40 text-xs">
					<span className="truncate flex-1" title={pickedId ?? ""}>
						Picked: {pickedFeature.properties?.name ?? pickedId} (
						{pickedFeature.properties?.feature_type ?? "?"})
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => editFeature(pickedFeature, selectedMap)}
					>
						Edit
					</Button>
					<Button
						size="icon-sm"
						variant="outline"
						className="text-destructive"
						title="Delete feature"
						aria-label="Delete feature"
						disabled={busy}
						onClick={() => requestDeleteFeature(pickedFeature)}
					>
						<Trash2 />
					</Button>
				</div>
			)}

			{/* Mission: behavior + a read-only vehicle-allocation summary (the
			    PRIMARY allocation affordance is clicking the agent
			    markers). The map authors the full required quartet, so a new mission
			    can save without the mission editor. */}
			{context === "mission" &&
				selectedMission &&
				missionConfig &&
				!viewOnly && (
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
								<SelectTrigger
									size="sm"
									className="w-52 max-w-full"
								>
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
			{context === "mission" && selectedMission && !viewOnly && (
				<div className="flex items-center gap-2 px-2 py-1 shrink-0 border-b bg-muted/40 text-xs">
					{pickedGeomIndex != null ? (
						<>
							<span className="truncate flex-1">
								Picked geometry #{pickedGeomIndex + 1}
							</span>
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									editMissionGeometry(pickedGeomIndex)
								}
							>
								Edit
							</Button>
							<Button
								size="icon-sm"
								variant="outline"
								className="text-destructive"
								title="Delete geometry"
								aria-label="Delete geometry"
								onClick={() =>
									deleteMissionGeometry(pickedGeomIndex)
								}
							>
								<Trash2 />
							</Button>
						</>
					) : (
						<span className="truncate flex-1 text-muted-foreground">
							Pick / draw a mission geometry, then save.
						</span>
					)}
					<Button
						size="sm"
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
						<Save />
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
				{/* Land on the running mission when the page opens mid-mission
				    with nothing selected (exactly one live active mission;
				    never overrides a selection). */}
				<AutoSelectActiveMission
					enabled={Boolean(props.feedbackTopic)}
				/>
				{/* Stored snapshot of the selected mission when nothing live
				    is known (e.g. a finished mission after a reload). */}
				{props.feedbackTopic && (
					<MissionFeedbackHistorySync selectedId={selectedMission} />
				)}
				{context === "map-editor" && pending && !viewOnly && (
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
						buildingsFromBasemap={basemapCarriesBuildings}
						onToggleBuildings3d={toggleBuildings3d}
						plannerGraph={plannerGraph}
						onTogglePlannerGraph={togglePlannerGraph}
					/>
				)}
				{/* MSAA on the WebGL context — see maps-box-viewer. MapLibre
				    shader-antialiases its own fills, lines and symbols, but not
				    the fill-extrusion silhouettes of the 3D buildings layer.
				    Context attributes are fixed at creation, so this is not an
				    operator toggle. */}
				<MapLibreMap
					ref={mapRef}
					canvasContextAttributes={{ antialias: true }}
					mapStyle={mapStyle}
					initialViewState={{
						longitude: startingLocation[0],
						latitude: startingLocation[1],
						zoom: 14,
					}}
					maxZoom={MAP_MAX_ZOOM}
					onLoad={handleMapLoad}
					onClick={handleMapClick}
					style={{ width: "100%", height: "100%" }}
				>
					{/* North indicator + ground scale. Always on: rotation is
					    enabled here and nothing else says which way is north,
					    and past the basemap's own tile depth the imagery is
					    overzoomed, so its detail no longer indicates distance
					    either. Bottom-right: both panels own the top corners. */}
					<MapChrome />
					<OverlayLayers
						active={activeOverlays}
						beforeId={overlayBeforeId}
					/>
					{activeOverlays.includes(RAINVIEWER_OVERLAY_ID) && (
						<RainviewerOverlay beforeId={overlayBeforeId} />
					)}
					{/* Planner navigation graph — faint backdrop UNDER the
					    operator's features (beforeId), drawn before them. */}
					{plannerGraph && plannerGraphFc && (
						<PlannerGraphLayer data={plannerGraphFc} />
					)}
					{/* Both feature layers always render, in distinct styles. */}
					<FeatureLayers features={features} />
					<MissionFeatureLayers geometries={missionGeometryFc} />
					{/* The raster fallback only: on a vector basemap the
					    buildings are a layer of the style itself. Drawn only
					    while the collection still matches the geofence it was
					    clipped to. */}
					{buildings3d &&
						!basemapCarriesBuildings &&
						buildings?.scope === buildings3dScope && (
							<Buildings3DLayer data={buildings.fc} />
						)}
					{/* Primary agent markers: one localization subscription per
					    namespaced agent, in its own signature-stable provider.
					    The roster carries no ROS source, so subscriptions fall
					    back to the operator's configured telemetry source (the
					    edge-feedback topic, else the mission-feedback topic). */}
					{/* Where each robot has been (session breadcrumb) and what
					    it is planning (Nav2 global plan, v2 trajectories only). */}
					<BreadcrumbLayer />
					{trajectoryAgentIds.length > 0 && (
						<AgentTrajectoryOverlay
							fallbackSource={localizationFallbackSource}
							agentIds={trajectoryAgentIds}
						/>
					)}
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
			<PanelEmptyState>
				No C2 datasource available. Add a C2 Control datasource to draw
				and manage maps and mission geometry.
			</PanelEmptyState>
		);
	}

	return (
		<MissionMapBody
			mapUrl={props.mapUrl?.trim() || DEFAULT_MAP_URL}
			basemapApiKey={props.basemapApiKey}
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
 * Widget definition for the mission map widget.
 * @returns Widget definition.
 */
export function MissionMapDefinition(): WidgetDefinition<MissionMapProps> {
	return {
		id: "c2-mission-map-widget",
		name: "C2 Mission Map",
		description: "Edit map features and geometry",
		titleProp: "title",
		icon: <MapIcon />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				mapUrl: {
					type: "string",
					title: "Base map",
					oneOf: basemapOneOf(),
					default: DEFAULT_MAP_URL,
				},
				basemapApiKey: {
					type: "string",
					title: "Basemap API Key",
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
					scope: "#/properties/basemapApiKey",
					rule: {
						effect: "SHOW",
						condition: {
							scope: "#/properties/mapUrl",
							schema: { enum: [...BASEMAPS_REQUIRING_KEY] },
						},
					},
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
						role: "secondary",
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
		extensibilityHook: c2DatasourceSelectHook,
	} as WidgetDefinition<MissionMapProps>;
}
