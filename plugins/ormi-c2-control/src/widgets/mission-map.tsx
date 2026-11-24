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
	Check,
	ChevronDown,
	Download,
	Layers,
	Loader2,
	Lock,
	LockOpen,
	Magnet,
	Map as MapIcon,
	PenLine,
	Plus,
	Redo2,
	Save,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
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

import { c2DatasourceProperty } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import { C2Feature, MissionConfig, MissionStatus } from "../types/c2-types";
import {
	MissionConfigIssue,
	validateMissionConfig,
} from "../types/mission-config-validation";
import { publishMapFeatures } from "../state/c2-catalog-store";
import {
	getAgentName,
	useAgentName,
	useAgents,
} from "../state/c2-agents-store";
import { setActiveMap, useSelectedMission } from "../state/selection-store";
import {
	hasMissionDraft,
	setMissionDraft,
	useMissionDraft,
} from "../state/mission-draft-store";
import {
	adoptStoredAssets,
	getMissionAssets,
	hasMissionAssets,
	placeMissionAssets,
	useMissionAssets,
} from "../state/mission-assets-store";
import { saveMissionWithGraph } from "../state/mission-save";
import { useMissionUndoState } from "../state/mission-history-store";
import { editMission, redoMission, undoMission } from "../state/mission-undo";
import {
	routeUndo,
	type UndoRouteState,
	type UndoScope,
} from "./editor-undo-route";
import {
	findAsset,
	importAsset,
	isMissionAssetType,
	removeAsset,
	upsertAsset,
} from "./mission-assets";
import { generateMissionId } from "./mission-list";
import { assetCenter } from "./mission-asset-tree";
import { PICK_TOLERANCE_PX, choosePick, startsNewDrawing } from "./map-pick";
import {
	publishLayerFeatures,
	publishLayerSelection,
	subscribeFeatureSelectionRequests,
	subscribeMapFeatureFocus,
	useMapLayers,
	type MapFeatureSelectionRequest,
} from "../state/map-layers-store";
import { subscribeAssetFocus } from "../state/asset-focus-store";
import {
	clearEditorSelection,
	getEditorSelection,
	selectedIdsOf,
	setEditorSelection,
	useSelectedIds,
	useSelectionIsGroup,
} from "../state/editor-selection-store";
import { useRelatedIds } from "./use-related-ids";
import { RelatedSelectionLayer } from "./related-layer";
import {
	editorKeyAction,
	editorPanelProps,
	shouldHandleEditorKey,
	trackEditorPanels,
	type EditorKeyEvent,
} from "./editor-keys";
import { undoNoticeFor, type UndoNotice } from "./undo-notice";
import { UndoNoticeBar } from "./undo-notice-bar";
import {
	getMissionContacts,
	selectContact,
} from "../state/mission-contacts-store";
import {
	ASSET_CATEGORIES,
	CATEGORISED_FEATURE_TYPES,
	DrawFeature,
	FEATURE_TYPES,
	FEATURE_TYPE_GEOMETRY,
	FEATURE_TYPE_LABELS,
	FeatureType,
	GEOMETRY_CLASS_LABELS,
	c2FeatureToDrawFeature,
	canRetypeFeature,
	describeUneditableGeometry,
	drawFeatureToC2Feature,
	isFeatureType,
	readFeatureCategory,
	readFeatureId,
	retypeTargets,
} from "./feature-geojson";
import {
	DrawShape,
	cleanMissionConfig,
	drawShapeToMode,
	hasUsableCoordinates,
	hydrateMissionDraft,
} from "./mission-editor-helpers";
import {
	DRAW_FINISH_DISTANCE_PX,
	classifyDrawFinish,
	nextPendingOnFinish,
} from "./map-draw-finish";
import {
	canFinishDrawing,
	drawHint,
	drawKeyAction,
	newShapeDiscard,
	nextMapTool,
	placedDrawPoints,
	takesFinishButton,
	type DrawingFeature,
	type MapTool,
} from "./map-draw-tool";
import {
	SELECT_POINTER_DISTANCE_PX,
	deleteVertex,
	hasCoarsePointer,
	mapSelectOptions,
	vertexAtClick,
	type SelectedVertex,
	type VertexCandidate,
	type VertexPosition,
} from "./map-vertex-edit";
import {
	browserStorage,
	buildSnapTargets,
	createSnapHook,
	createSnapIndicatorStore,
	readSnapEnabled,
	snapTolerancePx,
	writeSnapEnabled,
	type SnapHookContext,
	type SnapTarget,
} from "./map-snap";
import { SnapIndicatorLayer } from "./map-snap-layer";
import {
	GroupCard,
	GroupSelectionLayer,
	groupCategoryOptions,
} from "./map-group-card";
import {
	EMPTY_MOVE,
	addOffsets,
	isZeroOffset,
	mercatorOffset,
	recordMoveStep,
	redoMove,
	totalOffset,
	translateGeometry,
	undoMove,
	type MercatorOffset,
	type MoveHistory,
} from "./map-group-move";
import {
	applyGroupDraft,
	bulkDeleteQuestion,
	bulkReport,
	changeSelection,
	closesOpenFeature,
	commonValue,
	featureCount,
	groupActions,
	groupRetypeTargets,
	groupTakesCategory,
	groupTargets,
	sameSelection,
	type BulkOutcome,
	type GroupMember,
	type MultiSelection,
} from "./map-multi-select";
import {
	editCardSide,
	handlePositions,
	type EditCardSide,
} from "./map-edit-card";
import {
	canRedo,
	canUndo,
	recordGeometry,
	redoGeometry,
	undoGeometry,
	type GeometryHistory,
} from "./map-edit-history";
import {
	mapStateLabel,
	hasUnsavedChanges,
	openShapeContact,
	selectionChangeOnClick,
	type DrawCandidate,
	type EditSnapshot,
} from "./map-selection";
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
	missionGeometriesToFeatureCollection,
} from "./mission-geometry";
import { hasAgentNode, toggleAgentNode } from "./mission-graph";
import {
	getMissionGraph,
	hasMissionGraph,
	useMissionGraph,
} from "../state/mission-graph-store";
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
import { RouteLegend } from "./route-legend";
import {
	type RouteKind,
	feedbackRouteKind,
	routeCasingLayer,
	routeCoreLayer,
} from "./route-styles";
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
	setLayerVisibility,
} from "@workspace/utils";
import { MapChrome } from "@workspace/utils/map-chrome";
import { crossMapEdit, crossMapEditMessage } from "./map-editing-guards";
import {
	FindingsIngest,
	FindingsLayer,
	FindingsReadout,
	type FindingsTopicBinding,
} from "./findings-layer";
import { FINDING_RAW_TYPE } from "./findings";
import { MissionContactPopup } from "./contact-popup";
import { MissionContactsWatch } from "./mission-contacts-watch";
import { RAINVIEWER_OVERLAY_ID } from "./maps-shared/rainviewer";
import { mapLayersProperty } from "@workspace/ormi-core/map-layers";
import {
	handleMapError,
	MapLayersOverlay,
	RasterOverlayLayers,
	useMapRasterLayers,
	type RasterOverlayLayer,
} from "@workspace/ormi-core/map-layers/map";
import { RAINVIEWER_ANCHOR_ID, RainviewerOverlay } from "./rainviewer-overlay";

/**
 * Where the raster overlays (map-server layers, radar) slot in: under the
 * basemap's labels on a vector style, under the C2 feature fill otherwise.
 * Bare ids on purpose: `RasterOverlayLayers` and `RainviewerOverlay` resolve
 * them against the live map's layer order before every move, so a raster
 * basemap (no anchors) or a basemap swap in flight never names a layer the
 * map does not contain.
 */
const OVERLAY_BEFORE_IDS = [
	ORMI_STYLE_ANCHORS.overlay,
	"c2-features-fill",
] as const;

/**
 * Mission map widget on the first-class maps API.
 *
 * ## THE MAP IS WHERE ASSETS LIVE; THE GRAPH SAYS WHO DOES WHAT
 *
 * This widget authors **assets** and nothing else. Every draw — in either
 * context — becomes a named, typed MapDB feature through the inline naming
 * prompt, and a mission reaches it only as a `{ feature_id }` reference a
 * behaviour-graph node emitted. The map used to have a second home for
 * geometry (inline `objective.geometries[]`), a behaviour dropdown and a
 * vehicle toggle, all of which authored fields `compileMissionGraph` also
 * writes; two authors over one set of fields is last-writer-wins, and the map's
 * save was always the last writer. They are gone.
 *
 * What is left of the mission here: clicking an agent marker toggles that
 * agent's NODE in the mission's behaviour graph, and Save writes the shared
 * draft (`mergeStoredMission` + `c2.missions.*`, fetch-modify-save, so nothing
 * the draft has never seen is destroyed).
 *
 * Two CONTEXTS remain (toolbar segmented toggle), and the authoring tools mean
 * the SAME thing in both — they act on the selected map's assets:
 *  - `map-editor` — the map and its assets (`c2.maps.*` +
 *    `c2.map.features.*`). Geometry is constrained per `feature_type`
 *    (`FEATURE_TYPE_GEOMETRY`), which the backend validates too.
 *  - `mission` — adds the active mission's allocation readout and its Save.
 *    Gated on a selected mission (`useSelectedMission`).
 *
 * Within each context the TOOL is one of: view/pick · draw · edit · delete.
 *
 * Both feature layers render ALWAYS, in distinct styles, regardless of context:
 *  (a) map-feature layer — the selected map's features (muted palette).
 *  (b) mission-feature layer — inline objective geometry stored by builds
 *      before the graph owned the objective (distinct accent), projected
 *      read-only by `mission-geometry.ts`. Nothing writes that form any more.
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
 * Map-feature CRUD is one-shot remote calls with refetch-after-write. A retype
 * is a PUT through the backend's `normalizeFeature` and is therefore legal only
 * within a geometry class — see `retypeTargets` in `feature-geojson.ts`.
 */

/** The editing context: which feature set the operator is authoring. */
type MapContext = "map-editor" | "mission";

/**
 * Toolbar segmented-control items size to their label. The stock item is
 * `flex-1`, which splits a group into equal columns — fine for "On / Off", but it
 * squeezes the longest label ("Geofence", "Rectangle") against its borders.
 */
const TOGGLE_ITEM_CLASS = "flex-none px-2.5";

/**
 * What Save mission does, worded as the assets panel and the node editor word
 * it: three surfaces, one action, and an operator must not be left wondering
 * whether they write different things.
 */
const SAVE_MISSION_TITLE = "Saves the mission, graph and assets";

/** Human labels for the toolbar shape picker. */
const SHAPE_LABELS: Record<DrawShape, string> = {
	point: "Point",
	line: "Line",
	polygon: "Polygon",
	rectangle: "Rectangle",
};

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
	/** Raster layers from the user's map servers (`MapLayerRef[]`). */
	mapLayers?: unknown;
	/** `/multi_robot/mission_feedback` topic for the waypoint overlay. */
	feedbackTopic?: SelectedTopic;
	/**
	 * `/multi_robot/edge/feedback` topic — FALLBACK marker source for agents
	 * without a namespace (the embedded `odometry`, geographic-gated). Namespaced
	 * agents are plotted from their per-agent localization stream instead.
	 */
	agentTopic?: SelectedTopic;
	/**
	 * The contacts: `/mission/findings` (stamped with their mission, latched)
	 * or `/payload/observation` (raw, no mission).
	 */
	observationTopic?: SelectedTopic;
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
 * marker is the PRIMARY robot-allocation affordance: clicking it toggles an
 * `agent` NODE in the mission's behaviour graph via `onSelect`. An allocated
 * agent (`selected`) renders visually distinct — an amber ring + filled badge —
 * vs the outline of an unallocated one. The click stops propagation so it does
 * not also fall through to the map's feature-pick handler.
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
	/** Whether the mission graph already carries an `agent` node for this id. */
	isAllocated?: (agentId: string) => boolean;
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
					selected={props.isAllocated?.(agent.id)}
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
	isAllocated?: (agentId: string) => boolean;
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
				isAllocated={props.isAllocated}
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
			{/* Driven: see `route-styles.ts`. */}
			<Layer
				id="c2-breadcrumbs-casing"
				type="line"
				{...routeCasingLayer("driven")}
			/>
			<Layer
				id="c2-breadcrumbs-line"
				type="line"
				{...routeCoreLayer("driven")}
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
			{/* The live path: dots on a casing (`route-styles.ts`). The
			    casings are basemap-relative, not theme-relative: the style
			    comes from `mapUrl` and never follows the app theme, and
			    MapLibre paint cannot read a CSS variable in any case. */}
			<Layer
				id="c2-trajectories-casing"
				type="line"
				{...routeCasingLayer("intent")}
			/>
			<Layer
				id="c2-trajectories-line"
				type="line"
				{...routeCoreLayer("intent")}
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

/** The feedback route's kinds, bottom to top. */
const FEEDBACK_ROUTE_KINDS: readonly RouteKind[] = [
	"driven",
	"preview",
	"planned",
];

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
	isAllocated?: (agentId: string) => boolean;
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

	// Route line features: per task, the REMAINING part (planned once the
	// mission is committed, a preview before) and the DONE part (driven),
	// split at `current_waypoint_index` (MissionFeedback v2; with a v1
	// producer everything is "remaining"). One filtered layer per kind, since
	// line-dasharray cannot be data-driven within one layer; the looks are in
	// `route-styles.ts`.
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
							kind: feedbackRouteKind(
								"remaining",
								!isPreviewStatus(status),
							),
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
							kind: feedbackRouteKind("done", true),
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
						{/* Driven under planned, every casing under every
						    core (`route-styles.ts`): planned is wide and
						    solid, a plan nobody approved is dashed, what the
						    robot has passed is a thin trace. */}
						{FEEDBACK_ROUTE_KINDS.map((kind) => (
							<Layer
								key={`${kind}-casing`}
								id={`c2-feedback-paths-${kind}-casing`}
								type="line"
								filter={["==", ["get", "kind"], kind]}
								{...routeCasingLayer(kind)}
							/>
						))}
						{FEEDBACK_ROUTE_KINDS.map((kind) => (
							<Layer
								key={kind}
								id={`c2-feedback-paths-${kind}`}
								type="line"
								filter={["==", ["get", "kind"], kind]}
								{...routeCoreLayer(kind)}
							/>
						))}
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
					selected={props.isAllocated?.(agent.id)}
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

/** One labelled checkbox row in the live-layers panel. */
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

/**
 * In-map panel: the map-server layers this map draws (centre only; they are
 * switched in the configuration dialog), then the session-only live layers
 * (radar, 3D buildings, planner graph), which are views of live state rather
 * than catalogue rasters.
 */
function LiveLayersPanel(props: {
	mapLayers: readonly RasterOverlayLayer[];
	mapRef: React.RefObject<MapRef | null>;
	rainviewer: boolean;
	onToggleRainviewer: () => void;
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
			<div className="flex items-start gap-2 min-w-0">
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					{/* Map-server layers, centre only. Renders nothing while
					    no map-server layer is drawn. */}
					<MapLayersOverlay
						layers={props.mapLayers}
						mapRef={props.mapRef}
						title="Map layers"
					/>
					<span className="text-muted-foreground px-1 text-xs font-medium uppercase">
						Live layers
					</span>
				</div>
				<Button
					size="icon-sm"
					variant="ghost"
					className="shrink-0"
					aria-label="Close layers"
					onClick={props.onClose}
				>
					<X />
				</Button>
			</div>
			{/* Dynamic (time-stamped, animated): not a catalogue raster. */}
			<OverlayToggle
				id={RAINVIEWER_OVERLAY_ID}
				checked={props.rainviewer}
				onToggle={props.onToggleRainviewer}
			>
				RainViewer radar
			</OverlayToggle>
			{/* 3D buildings — the basemap's own extrusion layer on a vector
			    basemap, an Overpass fill-extrusion source on a raster one.
			    Either way not a raster overlay, so it has its own toggle.

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
 * palette. `risk` polygons are filled more strongly than `geofence` outlines,
 * and `zone` — an asset a mission objective names by `feature_id` — takes its
 * own sky tint so an area a mission will sweep is not read as terrain. Point
 * assets (`waypoint`) render as a dot; a `cue` is deliberately NOT drawn here,
 * because an operator-placed cue and a robot contact are one record and belong
 * to the findings layer (see `findings-layer.tsx`) — drawing it twice, in two
 * palettes, would say they were two different things.
 *
 * `feature_id`/`feature_type`/`category` ride in the properties so the View
 * tool can pick a feature under the cursor and the styling can key on the type.
 */
function FeatureLayers(props: {
	features: C2Feature[];
	/** The picked feature, outlined so the operator sees what is picked. */
	selectedId?: string | null;
}) {
	const fc = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: props.features
				.filter((f) => f.geometry && f.geometry.coordinates != null)
				.filter((f) => f.properties?.feature_type !== "cue")
				.map((f) => ({
					type: "Feature" as const,
					properties: {
						feature_id: readFeatureId(f) ?? "",
						name: f.properties?.name ?? "",
						feature_type: f.properties?.feature_type ?? "",
						category: readFeatureCategory(f) ?? "",
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
						"match",
						["get", "feature_type"],
						"risk",
						"#b91c1c",
						"zone",
						"#0284c7",
						"#64748b",
					],
					"fill-opacity": [
						"match",
						["get", "feature_type"],
						"risk",
						0.25,
						"zone",
						0.2,
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
				paint={{
					"line-color": [
						"match",
						["get", "feature_type"],
						"zone",
						"#0369a1",
						"#475569",
					],
					"line-width": 1.5,
				}}
			/>
			<Layer
				id="c2-features-circle"
				type="circle"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 5,
					"circle-color": [
						"match",
						["get", "feature_type"],
						"waypoint",
						"#059669",
						"#64748b",
					],
					"circle-stroke-color": "#1e293b",
					"circle-stroke-width": 1,
				}}
			/>
			{/* The picked feature, outlined on top (usability test
			    2026-11-12: a pick showed only as a line of text). */}
			<Layer
				id="c2-features-selected-line"
				type="line"
				filter={[
					"all",
					["==", ["get", "feature_id"], props.selectedId ?? ""],
					["!=", ["geometry-type"], "Point"],
				]}
				paint={{
					"line-color": "#f59e0b",
					"line-width": 4,
				}}
			/>
			<Layer
				id="c2-features-selected-circle"
				type="circle"
				filter={[
					"all",
					["==", ["get", "feature_id"], props.selectedId ?? ""],
					["==", ["geometry-type"], "Point"],
				]}
				paint={{
					"circle-radius": 9,
					"circle-color": "rgba(0,0,0,0)",
					"circle-stroke-color": "#f59e0b",
					"circle-stroke-width": 3,
				}}
			/>
		</Source>
	);
}

/**
 * The selected vertex of the shape open for editing, as a ring around its
 * handle. A declarative layer: it never touches the style object, so
 * terra-draw's layers survive it.
 */
function SelectedVertexLayer(props: { position: VertexPosition }) {
	const [lng, lat] = props.position;
	const data = useMemo(
		() => ({
			type: "Feature" as const,
			properties: {},
			geometry: { type: "Point" as const, coordinates: [lng, lat] },
		}),
		[lng, lat],
	);
	return (
		<Source id="c2-selected-vertex" type="geojson" data={data}>
			<Layer
				id="c2-selected-vertex-ring"
				type="circle"
				paint={{
					"circle-radius": 10,
					"circle-color": "rgba(0,0,0,0)",
					"circle-stroke-color": "#f59e0b",
					"circle-stroke-width": 3,
				}}
			/>
		</Source>
	);
}

/**
 * The map's own waypoints and zones while a mission is open: a LIBRARY the
 * operator imports copies from, drawn faint and dashed so it never reads as
 * the mission's. Picked (not edited) on its own layers.
 */
function LibraryLayers(props: { features: C2Feature[] }) {
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
		<Source id="c2-library" type="geojson" data={fc}>
			<Layer
				id="c2-library-fill"
				type="fill"
				filter={["==", ["geometry-type"], "Polygon"]}
				paint={{ "fill-color": "#64748b", "fill-opacity": 0.06 }}
			/>
			<Layer
				id="c2-library-line"
				type="line"
				filter={["==", ["geometry-type"], "Polygon"]}
				paint={{
					"line-color": "#64748b",
					"line-width": 1,
					"line-dasharray": [2, 2],
				}}
			/>
			<Layer
				id="c2-library-circle"
				type="circle"
				filter={["==", ["geometry-type"], "Point"]}
				paint={{
					"circle-radius": 4,
					"circle-color": "#ffffff",
					"circle-opacity": 0.6,
					"circle-stroke-color": "#64748b",
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
 * features. Each feature carries its source `index` so a specific entry can
 * be told apart. Pure
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

/** The "no category" option value — Radix Select refuses an empty string. */
const NO_CATEGORY = "__none__";

/**
 * Inline name + feature_type (+ category) prompt for a MAP asset, shown after a
 * draw finishes and when an existing asset is opened for editing. This is the
 * ONLY way a drawn shape becomes part of a mission: it is saved as a named,
 * typed MapDB feature, and the behaviour graph then references it by
 * `feature_id`. There is no second home for geometry.
 *
 * ## Retype is constrained to the geometry class
 *
 * `PUT /maps/:name/features/:featureId` replaces the document through the
 * backend's `normalizeFeature`, which validates `feature_type` against
 * `GEOM_FOR_TYPE`. So the type may change — that is the point — but only among
 * the types that take the geometry already drawn: area ⇄ area, point ⇄ point,
 * and `road` (the only line type) alone. The illegal options stay VISIBLE and
 * disabled, saying what they would need, rather than disappearing: a picker
 * that silently drops four of six types reads as a build that forgot them. The
 * legal set comes from {@link retypeTargets}, derived from
 * `FEATURE_TYPE_GEOMETRY` — never a second hardcoded table, which is how a
 * client ends up offering a save the server rejects.
 *
 * The **category** row appears only for the asset types that carry one
 * ({@link CATEGORISED_FEATURE_TYPES}); a holding position is the motivating
 * case, and until the backend started preserving arbitrary feature properties
 * there was nowhere to say so. A category the feature already carries that is
 * not in {@link ASSET_CATEGORIES} is offered as its own option rather than
 * being silently reset to "none" — the list is an authoring convenience, not
 * the vocabulary.
 */
function SavePrompt({
	cardRef,
	...props
}: {
	/** Heading: the stored name of the feature open, or what a new shape is. */
	title: string;
	name: string;
	featureType: FeatureType;
	/** The type drawn or stored: fixes the legal retype targets. */
	initialType: FeatureType;
	category: string;
	/** The category the feature arrived with, kept as an option. */
	initialCategory: string;
	/** Report a change to the name, type or category. */
	onChange: (patch: {
		name?: string;
		featureType?: FeatureType;
		category?: string;
	}) => void;
	/** True when an existing stored asset is being edited (vs. a fresh draw). */
	editing: boolean;
	/** Save is offered: there are changes and a name. */
	canSave: boolean;
	onSave: () => void;
	onCancel: () => void;
	/** Delete the whole feature (an edit only); confirm-gated by the caller. */
	onDelete?: () => void;
	/** Undo a geometry step of this edit; disabled with none. */
	onUndo: () => void;
	/** Redo a geometry step undone; disabled with none. */
	onRedo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	/**
	 * Escape in the name field: the map's own Escape (cancel an edit,
	 * discard a new shape). The map's key handler ignores a key typed into
	 * a field, so the field answers Enter and Escape itself.
	 */
	onEscape: () => void;
	/** Focus the name field on open: a shape just drawn needs its name. */
	focusName: boolean;
	busy: boolean;
	/** The top corner it sits in, clear of the shape (`map-edit-card.ts`). */
	side: EditCardSide;
	/** The card's root, measured for its placement. */
	cardRef: React.RefObject<HTMLDivElement | null>;
}) {
	const nameRef = useRef<HTMLInputElement>(null);
	const { focusName } = props;
	useEffect(() => {
		if (focusName) nameRef.current?.focus({ preventScroll: true });
	}, [focusName]);
	const takesCategory = CATEGORISED_FEATURE_TYPES.includes(props.featureType);
	// The geometry is already drawn by the time this opens (both on a fresh
	// draw and on an edit), so the legal targets are fixed by the type it was
	// drawn as.
	const legalTypes = useMemo(
		() => new Set<FeatureType>(retypeTargets(props.initialType)),
		[props.initialType],
	);
	const categoryOptions = useMemo(() => {
		const known = [...ASSET_CATEGORIES] as string[];
		if (props.initialCategory && !known.includes(props.initialCategory)) {
			known.unshift(props.initialCategory);
		}
		return known;
	}, [props.initialCategory]);

	return (
		<div
			ref={cardRef}
			role="group"
			aria-label={props.title}
			data-side={props.side}
			className={`absolute top-2 ${props.side === "left" ? "left-2" : "right-2"} z-10 bg-background/95 border rounded-md p-2 flex flex-col gap-2 shadow-md w-64 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] overflow-y-auto`}
		>
			<div className="truncate text-xs font-medium" title={props.title}>
				{props.title}
			</div>
			<Input
				ref={nameRef}
				value={props.name}
				onChange={(e) => props.onChange({ name: e.target.value })}
				onKeyDown={(e) => {
					// A key that composes a character (an IME) is not a command.
					if (e.nativeEvent.isComposing) return;
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						if (props.canSave && !props.busy) props.onSave();
					} else if (e.key === "Escape") {
						e.preventDefault();
						props.onEscape();
					}
				}}
				placeholder="Feature name"
				className="h-8"
			/>
			<Select
				value={props.featureType}
				onValueChange={(value) =>
					props.onChange({ featureType: value as FeatureType })
				}
			>
				<SelectTrigger size="sm" className="w-full">
					<SelectValue placeholder="Feature type" />
				</SelectTrigger>
				<SelectContent>
					{FEATURE_TYPES.map((type) => (
						<SelectItem
							key={type}
							value={type}
							disabled={!legalTypes.has(type)}
						>
							{FEATURE_TYPE_LABELS[type]}
							{!legalTypes.has(type) &&
								` (needs a ${GEOMETRY_CLASS_LABELS[FEATURE_TYPE_GEOMETRY[type]]})`}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{legalTypes.size === 1 && (
				<div className="text-[11px] text-muted-foreground">
					Redraw to change the type.
				</div>
			)}
			{takesCategory && (
				<Select
					value={props.category || NO_CATEGORY}
					onValueChange={(value) =>
						props.onChange({
							category: value === NO_CATEGORY ? "" : value,
						})
					}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue placeholder="Category" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NO_CATEGORY}>No category</SelectItem>
						{categoryOptions.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
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
					disabled={props.busy || !props.canSave}
					onClick={props.onSave}
				>
					<Save />
					Save
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="any-pointer-coarse:min-h-11"
					disabled={props.busy}
					onClick={props.onCancel}
				>
					<X />
					Cancel
				</Button>
				{props.onDelete && (
					<Button
						size="icon-sm"
						variant="outline"
						className="text-destructive any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
						aria-label="Delete feature"
						title="Delete feature"
						disabled={props.busy}
						onClick={props.onDelete}
					>
						<Trash2 />
					</Button>
				)}
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
	/**
	 * The mission whose asset this edit is (a waypoint, zone or cue of the
	 * mission open in mission context). Such an edit is written to that
	 * mission's assets, never to the map. Undefined for a map feature.
	 */
	missionId?: string;
	/**
	 * The mission open when a NEW shape was drawn. Confirmed as a waypoint,
	 * zone or cue it goes to that mission — never to whichever one is open by
	 * the time the prompt is confirmed.
	 */
	drawnInMission?: string;
	/** The name as the operator is editing it. */
	name: string;
	/** The type as the operator is editing it. */
	featureType: FeatureType;
	/**
	 * The type the shape was drawn or stored as. Fixes the legal retype
	 * targets (`retypeTargets`): the geometry does not change with the type.
	 */
	initialType: FeatureType;
	/** Asset sub-classification (`properties.category`), "" for none. */
	category: string;
	/**
	 * The stored feature as it was opened, for an edit: what Save and the
	 * discard question compare against ({@link hasUnsavedChanges}).
	 * Undefined for a shape just drawn, which is unsaved by definition.
	 */
	original?: EditSnapshot;
	/**
	 * The stored feature's own property bag, carried across the edit so a
	 * property this build does not know about is written back rather than
	 * dropped. Undefined on a create — there is nothing to preserve yet.
	 */
	properties?: Record<string, unknown>;
	/**
	 * Geometry steps of this edit, for Undo and Redo. Held on the edit so it
	 * starts empty with every edit and ends with it. Undefined for none yet.
	 */
	history?: GeometryHistory<DrawFeature["geometry"]>;
}

/**
 * The pending save after the open shape's geometry changed (a drag, a
 * vertex deleted, a vertex inserted): it takes the new feature and records
 * the step for Undo.
 *
 * @param prev - The pending save open now.
 * @param feature - The shape as it now is.
 * @param continuesLastStep - The change completes the last step's gesture
 *   (see `recordGeometry`).
 * @returns The next pending save.
 */
function pendingWithGeometry(
	prev: PendingSave,
	feature: DrawFeature,
	continuesLastStep = false,
): PendingSave {
	return {
		...prev,
		feature,
		history: recordGeometry(
			prev.history,
			prev.feature.geometry,
			feature.geometry,
			{ continuesLastStep },
		),
	};
}

/**
 * Snapshot of the values the stable terra-draw `finish` handler reads. Kept in a
 * ref so the handler (registered once on map load) always sees the current
 * context/tool/featureType without re-registering — the React-Compiler-safe
 * alternative to closing over reactive state.
 */
interface DrawContextRef {
	/** The feature_type the finished draw is offered for saving as. */
	mapFeatureType: FeatureType;
	/** The selected map, stamped onto a pending save for the cross-map guard. */
	selectedMap: string;
	/** The mission open when the draw started (mission context), or null. */
	missionScope: string | null;
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

/**
 * Put a geometry back on a shape in the draw layer.
 * @param draw - The terra-draw instance holding the shape.
 * @param id - terra-draw id of the shape.
 * @param geometry - The geometry to restore.
 * @returns The shape as it now is, or null when terra-draw refused it.
 */
function restoreGeometry(
	draw: TerraDraw,
	id: string | number,
	geometry: DrawFeature["geometry"],
): DrawFeature | null {
	try {
		draw.updateFeatureGeometry(id, geometry);
	} catch (error) {
		console.error("[c2 map] terra-draw refused the restored shape", error);
		return null;
	}
	return (draw.getSnapshotFeature(id) as unknown as DrawFeature) ?? null;
}

/** A stored feature a click (or a request from a panel) selects. */
interface MapHit {
	id: string;
	feature: C2Feature;
	/** The map's own asset, shown as a library in a mission: never edited. */
	library: boolean;
}

/** Stands for a shape just drawn, which has no `feature_id` yet. */
const NEW_SHAPE_ID = "\u0000new-shape";

/**
 * Focus on these answers Enter itself: the map must not also save. Focus
 * inside an open list or menu answers Escape and Delete too.
 */
const KEY_CONTROL_SELECTOR =
	'button,a[href],[role="button"],[role="combobox"],[role="radio"],[role="checkbox"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"]';
const KEY_POPUP_SELECTOR = '[role="listbox"],[role="menu"]';

/** No features. */
const NO_FEATURES: readonly C2Feature[] = Object.freeze([]);

/** No group selected. */
const NO_GROUP: readonly string[] = Object.freeze([]);

/**
 * A window key event as the editor's dispatcher reads it: the key, its
 * modifiers, and whether focus is on a control or inside an open list.
 * @param event - The key event.
 * @returns The event for {@link editorKeyAction}.
 */
function keyEventOf(event: KeyboardEvent): EditorKeyEvent {
	const target = event.target instanceof Element ? event.target : null;
	return {
		key: event.key,
		ctrlKey: event.ctrlKey,
		metaKey: event.metaKey,
		altKey: event.altKey,
		shiftKey: event.shiftKey,
		onControl: target?.closest(KEY_CONTROL_SELECTOR) != null,
		inPopup: target?.closest(KEY_POPUP_SELECTOR) != null,
	};
}

/**
 * A map click this soon after terra-draw finished a new shape is the click
 * that finished it (MapLibre's `click` follows terra-draw's `pointerup`
 * within the same input), not a new one.
 */
const FINISH_CLICK_GRACE_MS = 250;

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
	missionContactsDef?: RemoteCallDefinition;
	feedbackTopic?: SelectedTopic;
	agentTopic?: SelectedTopic;
	observationTopic?: SelectedTopic;
	mapLayers?: unknown;
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
	// Raster layers from the user's map servers. Rendered as declarative
	// children at `OVERLAY_BEFORE_IDS`; the style object above never sees them.
	const raster = useMapRasterLayers(props.mapLayers, {
		maxZoom: MAP_MAX_ZOOM,
	});

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
	/**
	 * This panel's id for the editor's keys (`editor-keys.ts`): a key is the
	 * map's when focus is in it, or it was pressed in last.
	 */
	const panelId = useId();
	useEffect(() => trackEditorPanels(), []);
	const compactToolbar = mapSize === "xs";
	// terra-draw id of the feature currently loaded into the draw layer for
	// editing. Captured when `editFeature` adds it, so the
	// save path can read the LIVE (post-drag/reshape) geometry by id rather than
	// re-serializing the stale pre-edit snapshot.
	const editingDrawIdRef = useRef<string | number | null>(null);
	/**
	 * The line and polygon draw modes, kept for the hint chip's Finish
	 * button. terra-draw 1.31.2 has no public call that finishes a shape in
	 * progress: its finish is the mode's `keyEvents.finish` key (Enter, the
	 * default this map keeps), read in the mode's `onKeyUp`. Finish calls that
	 * on the active mode, which runs terra-draw's own close, including its
	 * refusal of a polygon with fewer than three corners.
	 */
	const finishableModesRef = useRef<{
		linestring: TerraDrawLineStringMode | null;
		polygon: TerraDrawPolygonMode | null;
	}>({ linestring: null, polygon: null });
	/**
	 * When terra-draw last finished a new shape (`performance.now()`). The
	 * click that finished it reaches the map's own click handler right after,
	 * once the map is back in select, where it would select a vertex of the
	 * new shape and take focus from its name field.
	 */
	const newShapeFinishedAtRef = useRef(-Infinity);
	/** Removes the pointer listeners the terra-draw setup adds; on unmount. */
	const drawListenersCleanupRef = useRef<(() => void) | null>(null);

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

	// The findings channels. NOT routed through `LocalDataSourcesProvider` with
	// the topics above: that provider keeps one value per topic per drain tick,
	// and a `Finding` stream is accumulated rather than observed — coalescing it
	// loses findings with nothing on screen to say so. They go through the
	// datasource subscription registry with `lossless: true` instead; see
	// `findings-layer.tsx` and `state/findings-store.ts`.
	const findingsBindings = useMemo<FindingsTopicBinding[]>(
		() => [{ topic: props.observationTopic, channel: "observation" }],
		[props.observationTopic],
	);
	const findingsBound = Boolean(props.observationTopic);

	// --- Two-mode model -----------------------------------------------------
	// Mission editing is the daily task; map editing is occasional → default here.
	const [context, setContext] = useState<MapContext>("mission");
	const [tool, setTool] = useState<MapTool>("select");
	// Read-only (View) mode: hides every authoring affordance and disarms the
	// Draw tool; map features + mission geometry still render and pan/zoom work.
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
	/**
	 * The map's pick and its group are the editor's one selection
	 * (`state/editor-selection-store.ts`) while the map owns it: a mission
	 * asset as an `asset`, anything else on the map as a `map-feature`. A
	 * selection made in another panel picks nothing here; what it relates
	 * to is outlined instead ({@link RelatedSelectionLayer}).
	 */
	const pickMission =
		context === "mission" && selectedMission ? selectedMission : null;
	const pickedFeatureIds = useSelectedIds("map-feature", selectedMap, "map");
	const pickedAssetIds = useSelectedIds("asset", pickMission, "map");
	const selectionIsGroup = useSelectionIsGroup();
	const pickedId = selectionIsGroup
		? null
		: (pickedAssetIds[0] ?? pickedFeatureIds[0] ?? null);
	const groupIds = selectionIsGroup ? pickedFeatureIds : NO_GROUP;
	/** Where a pick belongs, for the setters below (read when they run). */
	const pickScopeRef = useRef({ map: selectedMap, mission: pickMission });
	useEffect(() => {
		pickScopeRef.current = { map: selectedMap, mission: pickMission };
	});
	/** Pick one feature or asset (the map then owns the selection), or let go of the pick. */
	const setPickedId = useCallback((id: string | null) => {
		if (id === null) {
			const current = getEditorSelection();
			if (current.owner === "map" && !current.group)
				clearEditorSelection("map");
			return;
		}
		const { map, mission } = pickScopeRef.current;
		const assets = mission ? getMissionAssets(mission) : null;
		setEditorSelection(
			[
				mission && assets && findAsset(assets, id)
					? { kind: "asset", missionId: mission, id }
					: { kind: "map-feature", map, id },
			],
			"map",
		);
	}, []);
	const [pending, setPending] = useState<PendingSave | null>(null);
	/**
	 * Points placed on the shape Draw is authoring, for the hint chip's
	 * Finish button ({@link placedDrawPoints}). 0 with nothing in progress.
	 */
	const [drawPoints, setDrawPoints] = useState(0);
	/**
	 * The vertex of the open shape the operator clicked, which Delete and
	 * Backspace remove. terra-draw has no selected-vertex state of its own.
	 * Shown only while that shape is open for editing.
	 */
	const [selectedVertex, setSelectedVertex] = useState<SelectedVertex | null>(
		null,
	);
	/**
	 * The group selected in the map editor (`map-multi-select.ts`): two or
	 * more features, or one that cannot be opened. Empty outside a group,
	 * where a single selected feature is simply the one open (`pending`).
	 */
	/** Replace the group (two or more features, or one that cannot be opened). */
	const setGroupIds = useCallback(
		(
			next:
				| readonly string[]
				| ((prev: readonly string[]) => readonly string[]),
		) => {
			const { map } = pickScopeRef.current;
			const current = getEditorSelection();
			const isGroup = current.owner === "map" && current.group;
			const prev = isGroup
				? selectedIdsOf(current, "map-feature", map)
				: [];
			const ids = typeof next === "function" ? next(prev) : next;
			if (ids.length === 0) {
				if (isGroup) clearEditorSelection("map");
				return;
			}
			setEditorSelection(
				ids.map((id) => ({ kind: "map-feature" as const, map, id })),
				"map",
				{ group: true },
			);
		},
		[],
	);
	/**
	 * What the group card holds until Save: a type and a category for all,
	 * and the move as its drags (`map-group-move.ts`).
	 */
	const [groupDraft, setGroupDraft] = useState<{
		featureType?: FeatureType;
		category?: string;
		move: MoveHistory;
	}>({ move: EMPTY_MOVE });
	/** Move is armed: a drag anywhere on the map moves the group. */
	const [moveArmed, setMoveArmed] = useState(false);
	/** The drag under way while Move is armed, not committed yet. */
	const [liveMoveOffset, setLiveMoveOffset] = useState<MercatorOffset | null>(
		null,
	);
	/** Drop the group and everything its card holds. */
	const clearGroup = useCallback(() => {
		setGroupIds([]);
		setGroupDraft({ move: EMPTY_MOVE });
		setMoveArmed(false);
		setLiveMoveOffset(null);
	}, [setGroupIds]);
	/**
	 * Snapping to the other features, on unless this browser turned it off
	 * (the toolbar's Snap toggle). terra-draw's hooks read it through a ref:
	 * they are installed once, when the map loads.
	 */
	const [snapEnabled, setSnapEnabled] = useState(() =>
		readSnapEnabled(browserStorage()),
	);
	const snapEnabledRef = useRef(snapEnabled);
	/** Where the pointer snaps right now, for the indicator layer. */
	const [snapIndicator] = useState(createSnapIndicatorStore);
	useEffect(() => {
		snapEnabledRef.current = snapEnabled;
		if (!snapEnabled) snapIndicator.set(null);
	}, [snapEnabled, snapIndicator]);
	/** The key that bypasses snapping while held, as this keyboard names it. */
	const [snapBypassKey] = useState(() =>
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
			? "Option"
			: "Alt",
	);
	const toggleSnap = useCallback(() => {
		const next = !snapEnabled;
		setSnapEnabled(next);
		writeSnapEnabled(browserStorage(), next);
	}, [snapEnabled]);
	/**
	 * A shape is open for editing: a stored feature a click opened, or a
	 * shape Draw just finished (one-shot: the map is back in select). Both
	 * show their handles and take the edit keys.
	 */
	const shapeOpen = !viewOnly && tool !== "draw" && pending != null;
	/**
	 * The stored feature open for editing (select-first: a click on a feature
	 * opens it), or null. A shape just drawn is open too but has no
	 * `feature_id` yet.
	 */
	const openEditId =
		shapeOpen && pending?.featureId != null ? pending.featureId : null;
	/** The open shape is one Draw just finished, not saved yet. */
	const newShapeOpen = shapeOpen && pending?.featureId == null;
	/** Whether the pending save would write something new. */
	const pendingDirty =
		pending != null &&
		hasUnsavedChanges(
			{
				name: pending.name,
				featureType: pending.featureType,
				category: pending.category,
				geometry: pending.feature.geometry,
			},
			pending.original,
		);
	const shownVertex = shapeOpen ? selectedVertex : null;
	/** The open edit has a geometry step to undo, or one to redo. */
	const undoable = canUndo(pending?.history);
	const redoable = canRedo(pending?.history);
	/** The top corner of the edit card, kept clear of the open shape. */
	const [editCardPlacement, setEditCardPlacement] =
		useState<EditCardSide>("left");
	const editCardRef = useRef<HTMLDivElement | null>(null);
	const openGeometry = shapeOpen ? pending?.feature.geometry : undefined;
	/** Feature_type chosen for the NEXT map-feature draw (drives the draw tool). */
	const [mapFeatureType, setMapFeatureType] = useState<FeatureType>("road");

	// --- Mission state ------------------------------------------------------
	/**
	 * Working copy of the active mission, bound to the SHARED draft store so edits
	 * here (draw / vehicle / behavior / geometry) propagate to the other
	 * authoring panels and vice-versa. A {@link MissionDraft} is a superset of {@link MissionConfig}, so
	 * all the reads/memos below treat it as a `MissionConfig` unchanged.
	 */
	const missionConfig = useMissionDraft(selectedMission);
	/**
	 * The mission open here, in mission context. A mission is a map, its
	 * assets and a graph: while one is open its waypoints, zones and cues are
	 * ITS assets (drawn, edited and deleted in the mission, saved by Save
	 * mission), and the map's own ones are a library to import copies from.
	 */
	const missionScope =
		context === "mission" && selectedMission ? selectedMission : null;
	const missionAssets = useMissionAssets(missionScope);
	/** The open mission's one history, shared with the node editor. */
	const missionUndo = useMissionUndoState(missionScope);
	const [missionIssues, setMissionIssues] = useState<MissionConfigIssue[]>(
		[],
	);

	// --- Shared UI state ----------------------------------------------------
	const [error, setError] = useState<string | null>(null);
	/** A mission asset deleted at once, with the Undo that puts it back. */
	const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
	const [busy, setBusy] = useState(false);
	/** What a running OpenStreetMap import is doing, shown over the map. */
	const [osmProgress, setOsmProgress] = useState<string | null>(null);
	/**
	 * Pending destructive confirmation, driving the shadcn AlertDialog. `null` when
	 * idle. `onConfirm` runs the actual delete once the operator confirms (replaces
	 * the blocking `window.confirm`).
	 */
	const [confirmState, setConfirmState] = useState<{
		title: string;
		description: string;
		/** The confirm button's label; "Delete" when absent. */
		confirmLabel?: string;
		/** The dismiss button's label; "Cancel" when absent. */
		cancelLabel?: string;
		onConfirm: () => void;
	} | null>(null);
	const [plannerStatus, setPlannerStatus] = useState<PlannerStatus | null>(
		null,
	);
	// RainViewer radar: session-only, off on open.
	const [rainviewer, setRainviewer] = useState(false);
	const activeLayerCount = raster.layers.length + (rainviewer ? 1 : 0);
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
		mapFeatureType: "road",
		selectedMap: "",
		missionScope: null,
	});
	useEffect(() => {
		drawCtxRef.current = { mapFeatureType, selectedMap, missionScope };
	}, [mapFeatureType, selectedMap, missionScope]);

	const toggleRainviewer = useCallback(() => {
		setRainviewer((on) => !on);
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
		// The ONE publish point for the shared feature catalogue. Every mount,
		// map switch, save, delete and OSM import goes through `fetchFeatures`,
		// so widening this single call is what keeps the graph editor's asset
		// dropdown in step with what is drawn on the map — no refresh button,
		// no second fetcher. The `feature_type` rides along because two
		// questions downstream need it and a name cannot answer either: which
		// features may be offered as mission assets, and which are zones (which
		// is what the graph compiler derives `behavior` from).
		publishMapFeatures(
			selectedMap,
			nextFeatures.flatMap((f) => {
				const id = readFeatureId(f);
				return id
					? [
							{
								feature_id: id,
								name: f.properties?.name,
								feature_type: f.properties?.feature_type,
							},
						]
					: [];
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
		// Publish the map the operator is looking at, so a panel that has to
		// talk about "this map" (the behaviour-graph editor's asset list)
		// follows it instead of resolving one of its own. Two panels each
		// picking "the first map in the registry" is how an operator ends up
		// offering assets that are not on the map beside them. A no-op when
		// unchanged, so this ref sync costs nothing.
		setActiveMap(selectedMap);
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
	// changes. Load coordination: if a slot already exists (another panel loaded it, or an
	// in-progress edit lives there), ADOPT it — do not refetch and clobber the
	// edit. Only fetch + `setMissionDraft` when no slot exists, so two panels never
	// double-fetch the same mission and a cross-widget edit survives the bind.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (!selectedMission) return;
			if (hasMissionDraft(selectedMission)) {
				// Already in the shared store → bind to it, no fetch.
				return;
			}
			const config = await loadMissionConfig(selectedMission);
			if (cancelled) return;
			if (config) setMissionDraft(hydrateMissionDraft(config));
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
			setTool("select");
			setPending(null);
			clearGroup();
			editingDrawIdRef.current = null;
			clearDraw(drawRef.current);
		}
	}, [viewOnly, liveStatus, clearGroup]);

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
		clearGroup();
		editingDrawIdRef.current = null;
		clearDraw(drawRef.current);
		setTool("select");
	}, [clearGroup, setPickedId]);

	/** Select a different map, discarding any edit scoped to the previous one. */
	const changeSelectedMap = useCallback(
		(name: string) => {
			selectedMapRef.current = name;
			setSelectedMap(name);
			resetMapEditingState();
		},
		[resetMapEditingState],
	);

	// ---- The open mission's map and assets ---------------------------------
	//
	// Loaded once per mission (the graph editor may have loaded them already:
	// the store coordinates), then the map FOLLOWS the mission: a mission is
	// drawn on its map, so opening it shows that map. A mission with no map
	// yet is placed on the one shown. Runs in an async continuation, never as
	// a synchronous set in the effect body.
	const missionMap = missionAssets?.map ?? "";
	useEffect(() => {
		if (!missionScope) return;
		let cancelled = false;
		void (async () => {
			if (!hasMissionAssets(missionScope)) {
				const result = await executeMissionsList({});
				if (cancelled) return;
				if (!result.success) {
					setError(result.error ?? "Failed to read the mission");
					return;
				}
				if (!hasMissionAssets(missionScope))
					adoptStoredAssets(
						missionScope,
						result.data,
						selectedMapRef.current,
					);
			} else {
				await Promise.resolve();
				if (cancelled) return;
			}
			const map = getMissionAssets(missionScope)?.map ?? "";
			if (!map) placeMissionAssets(missionScope, selectedMapRef.current);
			else if (map !== selectedMapRef.current) changeSelectedMap(map);
		})();
		return () => {
			cancelled = true;
		};
		// selectedMap: a mission not placed yet is placed once a map is known
		// (the maps list may arrive after the mission), and a view moved off a
		// placed mission's map (a new map, a deleted one) comes back to it.
	}, [
		missionScope,
		missionMap,
		selectedMap,
		executeMissionsList,
		changeSelectedMap,
	]);

	/**
	 * The map picker. In a mission with no assets yet, picking a map moves
	 * the mission there; once it has assets its map is fixed (the picker is
	 * disabled), because its targets are drawn on it.
	 */
	const pickMap = useCallback(
		(name: string) => {
			changeSelectedMap(name);
			if (missionScope) {
				editMission(missionScope, `Place on ${name}`, {
					assets: (assets) =>
						assets.features.length === 0 && assets.map !== name
							? { ...assets, map: name }
							: assets,
				});
			}
		},
		[changeSelectedMap, missionScope],
	);
	const missionMapFixed =
		missionScope != null && (missionAssets?.features.length ?? 0) > 0;

	/**
	 * What the map layers draw: the map's features, and in a mission its own
	 * assets in place of the map's waypoints, zones and cues — those are the
	 * {@link libraryFeatures}, drawn apart for import.
	 */
	const shownFeatures = useMemo(
		() =>
			missionScope && missionAssets
				? [
						...features.filter(
							(f) =>
								!isMissionAssetType(f.properties?.feature_type),
						),
						...missionAssets.features,
					]
				: features,
		[features, missionScope, missionAssets],
	);
	const libraryFeatures = useMemo(
		() =>
			missionScope && missionAssets
				? features.filter((f) =>
						isMissionAssetType(f.properties?.feature_type),
					)
				: [],
		[features, missionScope, missionAssets],
	);
	// Hidden and locked layers, set from the assets panel's layer list
	// (`state/map-layers-store.ts`). Hidden: not drawn (so not picked).
	// Locked: drawn, never picked.
	const mapLayers = useMapLayers();
	const lockedLayers = mapLayers.locked;
	const renderedFeatures = useMemo(
		() =>
			mapLayers.hidden.size === 0
				? shownFeatures
				: shownFeatures.filter(
						(f) =>
							!mapLayers.hidden.has(
								String(f.properties?.feature_type ?? ""),
							),
					),
		[shownFeatures, mapLayers.hidden],
	);
	const renderedLibraryFeatures = useMemo(
		() =>
			mapLayers.hidden.size === 0
				? libraryFeatures
				: libraryFeatures.filter(
						(f) =>
							!mapLayers.hidden.has(
								String(f.properties?.feature_type ?? ""),
							),
					),
		[libraryFeatures, mapLayers.hidden],
	);
	// What a pointer snaps to: every stored feature drawn on the map (the
	// mission's assets and the library too, in a mission) on a visible
	// layer, locked ones included, except the one open for editing, whose
	// live shape is in terra-draw.
	const snapTargetsRef = useRef<SnapTarget[]>([]);
	const snapTargets = useMemo(
		() =>
			buildSnapTargets(
				[...renderedFeatures, ...renderedLibraryFeatures],
				mapLayers,
				openEditId,
			),
		[renderedFeatures, renderedLibraryFeatures, mapLayers, openEditId],
	);
	useEffect(() => {
		snapTargetsRef.current = snapTargets;
	}, [snapTargets]);
	// Publish the map's own features for the panel's layer list. In a
	// mission, its waypoints, zones and cues are listed by the asset tree,
	// so only the map's other layers are published.
	useEffect(() => {
		const listed = missionScope
			? features.filter(
					(f) => !isMissionAssetType(f.properties?.feature_type),
				)
			: features;
		publishLayerFeatures(
			selectedMap,
			listed.flatMap((f) => {
				const id = readFeatureId(f);
				if (!id) return [];
				return [
					{
						featureId: id,
						name:
							typeof f.properties?.name === "string" &&
							f.properties.name.length > 0
								? f.properties.name
								: id,
						featureType: String(f.properties?.feature_type ?? ""),
					},
				];
			}),
		);
	}, [features, selectedMap, missionScope]);

	// --- Multi-select (map editor) -----------------------------------------
	// Several features are selected with the panel's checkboxes or a
	// Shift-click (`map-multi-select.ts`). The map editor only: in a mission
	// the map's own waypoints, zones and cues are a library, and its assets
	// are the mission's, edited one at a time.
	/** Selecting several features is offered. */
	const multiSelectEnabled =
		context === "map-editor" && !viewOnly && selectedMap.length > 0;
	/** A group is selected and its card shows. */
	const groupActive = multiSelectEnabled && groupIds.length > 0;
	/** The group's stored features, in selection order. */
	const groupStored = useMemo(
		() =>
			groupActive
				? groupIds.flatMap((id) => {
						const stored = features.find(
							(f) => readFeatureId(f) === id,
						);
						return stored ? [stored] : [];
					})
				: [],
		[groupActive, groupIds, features],
	);
	const groupMembers = useMemo<GroupMember[]>(
		() =>
			groupStored.map((stored) => {
				const id = readFeatureId(stored) ?? "";
				const featureType = String(
					stored.properties?.feature_type ?? "",
				);
				const name =
					typeof stored.properties?.name === "string" &&
					stored.properties.name.trim().length > 0
						? stored.properties.name
						: id;
				return {
					id,
					name,
					featureType,
					category: readFeatureCategory(stored) ?? "",
					locked: mapLayers.locked.has(featureType),
					hidden: mapLayers.hidden.has(featureType),
				};
			}),
		[groupStored, mapLayers.locked, mapLayers.hidden],
	);
	const groupSplit = useMemo(
		() => groupTargets(groupMembers),
		[groupMembers],
	);
	/** The group's features a bulk action applies to (not locked). */
	const groupEligibleStored = useMemo(() => {
		const eligible = new Set(groupSplit.eligible.map((m) => m.id));
		return groupStored.filter((f) => eligible.has(readFeatureId(f) ?? ""));
	}, [groupStored, groupSplit.eligible]);
	/** The move committed so far (every finished drag). */
	const groupOffset = useMemo(
		() => totalOffset(groupDraft.move),
		[groupDraft.move],
	);
	/** One write per feature the draft changes. */
	const groupChanges = useMemo(() => {
		const draft = {
			featureType: groupDraft.featureType,
			category: groupDraft.category,
			offset: groupOffset,
		};
		return groupEligibleStored.flatMap((stored) => {
			const id = readFeatureId(stored);
			const feature = applyGroupDraft(stored, draft);
			if (!id || !feature) return [];
			const name =
				groupSplit.eligible.find((m) => m.id === id)?.name ?? id;
			return [{ id, name, feature }];
		});
	}, [
		groupEligibleStored,
		groupDraft.featureType,
		groupDraft.category,
		groupOffset,
		groupSplit.eligible,
	]);
	/** Save would write something. */
	const groupDirty = groupChanges.length > 0;
	/** The move shown: the committed one plus the drag under way. */
	const previewOffset = useMemo(
		() =>
			liveMoveOffset
				? addOffsets(groupOffset, liveMoveOffset)
				: groupOffset,
		[groupOffset, liveMoveOffset],
	);
	/** The moving features as drawn now, by id; null with no move. */
	const groupMoved = useMemo(() => {
		if (isZeroOffset(previewOffset)) return null;
		const moved = new Map<string, C2Feature>();
		for (const stored of groupEligibleStored) {
			const id = readFeatureId(stored);
			if (!id || !stored.geometry) continue;
			moved.set(id, {
				...stored,
				geometry: translateGeometry(
					stored.geometry as { type: string; coordinates: unknown },
					previewOffset,
				),
			});
		}
		return moved;
	}, [groupEligibleStored, previewOffset]);
	/** What the feature layers draw: the moving group where it is now. */
	const displayFeatures = useMemo(
		() =>
			groupMoved
				? renderedFeatures.map(
						(f) => groupMoved.get(readFeatureId(f) ?? "") ?? f,
					)
				: renderedFeatures,
		[renderedFeatures, groupMoved],
	);
	/** The group as outlined: every drawn member, moved ones where they are. */
	const groupOutline = useMemo(() => {
		const hidden = new Set(groupSplit.hidden.map((member) => member.id));
		return groupStored
			.filter((f) => !hidden.has(readFeatureId(f) ?? ""))
			.map((f) => groupMoved?.get(readFeatureId(f) ?? "") ?? f);
	}, [groupStored, groupSplit.hidden, groupMoved]);
	/** What the group card offers. */
	const groupActionState = groupActions({
		eligible: groupSplit.eligible,
		draft: groupDraft,
		viewOnly,
		busy,
		canUpdate: Boolean(props.featuresUpdateDef),
		canDelete: Boolean(props.featuresDeleteDef),
	});
	const groupLegalTypes = useMemo(
		() => groupRetypeTargets(groupSplit.eligible),
		[groupSplit.eligible],
	);
	const sharedType = commonValue(
		groupSplit.eligible.map((member) => member.featureType),
	);
	const groupTypeValue: FeatureType | null =
		groupDraft.featureType ??
		(isFeatureType(sharedType) ? sharedType : null);
	const groupShowCategory = groupTakesCategory(
		groupSplit.eligible,
		groupDraft,
	);
	const groupCategoryValue =
		groupDraft.category ??
		commonValue(groupSplit.eligible.map((member) => member.category));
	const groupCategoryChoices = useMemo(
		() => groupCategoryOptions(ASSET_CATEGORIES, groupEligibleStored),
		[groupEligibleStored],
	);

	// The checkboxes show what is selected: the group, or the one feature
	// open. Published after the features above, so a map switch has reset
	// the list's selection before this writes the new one.
	const publishedSelection = (
		groupActive
			? groupIds
			: multiSelectEnabled && openEditId
				? [openEditId]
				: []
	).join("\u0000");
	useEffect(() => {
		publishLayerSelection(
			selectedMap,
			publishedSelection ? publishedSelection.split("\u0000") : [],
			multiSelectEnabled,
		);
	}, [selectedMap, publishedSelection, multiSelectEnabled]);

	// Where the card sits: the top corner covering fewer handles of what it
	// is about (the shape open, or the group as committed), measured at
	// open, after a change and after every pan or zoom.
	const cardGeometries = useMemo(() => {
		if (openGeometry) return [openGeometry];
		if (!groupActive) return null;
		const eligible = new Set(groupEligibleStored);
		return groupStored.flatMap((f) => {
			if (!f.geometry) return [];
			const geometry = f.geometry as {
				type: string;
				coordinates: unknown;
			};
			return [
				eligible.has(f)
					? translateGeometry(geometry, groupOffset)
					: geometry,
			];
		});
	}, [
		openGeometry,
		groupActive,
		groupStored,
		groupEligibleStored,
		groupOffset,
	]);
	useEffect(() => {
		if (!mapObserved || !cardGeometries) return;
		const map = mapRef.current?.getMap();
		if (!map) return;
		const positions = cardGeometries.flatMap((g) => handlePositions(g));
		const place = () => {
			const card = editCardRef.current;
			if (!card) return;
			const handles = positions.map((p) => map.project(p));
			const panelWidth = map.getContainer().clientWidth;
			const size = { width: card.offsetWidth, height: card.offsetHeight };
			setEditCardPlacement((current) =>
				editCardSide(current, handles, panelWidth, size),
			);
		};
		const frame = requestAnimationFrame(place);
		map.on("moveend", place);
		return () => {
			cancelAnimationFrame(frame);
			map.off("moveend", place);
		};
	}, [mapObserved, cardGeometries]);

	/** The open mission's asset with this id, when it is one. */
	const missionAssetOf = useCallback(
		(id: string | null | undefined) =>
			missionScope && missionAssets && id
				? (findAsset(missionAssets, id) ?? null)
				: null,
		[missionScope, missionAssets],
	);

	/** Copy a map (library) asset into the open mission, under a new id. */
	const importIntoMission = useCallback(
		(feature: C2Feature) => {
			if (!missionScope) return;
			const id = generateMissionId();
			const name = feature.properties?.name || "asset";
			editMission(missionScope, `Import ${name}`, {
				assets: (assets) => importAsset(assets, feature, id).assets,
			});
			setPickedId(id);
			setError(null);
		},
		[missionScope, setPickedId],
	);

	// Switch editing context, resetting all transient per-context selections.
	const changeContext = useCallback(
		(next: MapContext) => {
			setContext(next);
			setTool("select");
			setPending(null);
			setPickedId(null);
			setMissionIssues([]);
			// Multi-select is the map editor's: a group never follows into a
			// mission.
			clearGroup();
			editingDrawIdRef.current = null;
			clearDraw(drawRef.current);
		},
		[clearGroup, setPickedId],
	);

	// terra-draw lifecycle — construct on map load, tear down on unmount. Also
	// where the live map becomes reachable for the effects that need it.
	const handleMapLoad = useCallback(() => {
		const map = mapRef.current?.getMap();
		if (!map) return;
		setMapObserved(true);
		if (drawRef.current) return;
		const coarsePointer = hasCoarsePointer();
		// Snapping to the other features (map-snap.ts). Alt (Option on a
		// Mac) held bypasses it; the toolbar's Snap toggle is the real
		// control, and the touch path.
		let snapBypassHeld = false;
		const snapDeps = {
			enabled: () => snapEnabledRef.current && !snapBypassHeld,
			targets: () => snapTargetsRef.current,
			tolerancePx: snapTolerancePx(coarsePointer),
			finishDistancePx: DRAW_FINISH_DISTANCE_PX,
			onIndicator: snapIndicator.set,
		};
		const drawSnapHook = createSnapHook({
			...snapDeps,
			gesture: "drawing",
		});
		// terra-draw marks its own snaps with a guidance point; the map's
		// indicator (SnapIndicatorLayer) replaces it.
		const drawSnapping = {
			snapping: { toCustom: drawSnapHook },
			styles: { snappingPointWidth: 0, snappingPointOutlineWidth: 0 },
		};
		// A small finish distance: the 40 px default closed polygons and
		// ended lines mid-trace (DRAW_FINISH_DISTANCE_PX). Snapping never
		// moves it: terra-draw tests the raw pointer for a finish, and the
		// hook does not snap there.
		const lineMode = new TerraDrawLineStringMode({
			pointerDistance: DRAW_FINISH_DISTANCE_PX,
			...drawSnapping,
		});
		const polygonMode = new TerraDrawPolygonMode({
			pointerDistance: DRAW_FINISH_DISTANCE_PX,
			...drawSnapping,
		});
		// The point mode has no snapping option: a new point is snapped
		// when it finishes, and its indicator follows the pointer here.
		const mapSnapContext: SnapHookContext = {
			getCurrentGeometrySnapshot: () => null,
			project: (lng, lat) => map.project([lng, lat]),
			unproject: (x, y) => map.unproject([x, y]),
		};
		finishableModesRef.current = {
			linestring: lineMode,
			polygon: polygonMode,
		};
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
				lineMode,
				polygonMode,
				new TerraDrawRectangleMode(),
				// Feature editing: select-mode editing enabled per geometry (see
				// `MAP_SELECT_FLAGS`): feature dragging, midpoints that insert a
				// vertex on a click or a drag, and draggable/deletable vertices
				// (a point is feature-draggable only).
				// Delete never removes the whole shape: terra-draw's default
				// binding did, while the open save kept the old geometry and
				// Save re-wrote it unchanged. Delete and Backspace remove the
				// selected vertex instead. Clicks and Escape never deselect:
				// the open edit owns the selection (`MAP_SELECT_OPTIONS`).
				// Handles sized for the pointers present (larger for a finger).
				// A dragged vertex snaps to the other features.
				new TerraDrawSelectMode(
					mapSelectOptions(
						coarsePointer,
						createSnapHook({ ...snapDeps, gesture: "dragging" }),
					),
				),
			],
		});
		draw.start();
		draw.setMode("static");
		// Whether a pointer is down on the map: a midpoint vertex inserted
		// while it is starts a drag, and the drag's end completes the same
		// Undo step.
		let pointerDown = false;
		let insertStartedDrag = false;
		const onPointerDown = () => {
			pointerDown = true;
		};
		const onPointerUp = () => {
			pointerDown = false;
			// The gesture ended: a drag landed, or a point was placed.
			snapIndicator.set(null);
		};
		// Alt held, read from every pointer and key event before terra-draw
		// sees it (window, capture phase).
		const onModifiers = (event: PointerEvent | KeyboardEvent) => {
			if (event.altKey === snapBypassHeld) return;
			snapBypassHeld = event.altKey;
			if (snapBypassHeld) snapIndicator.set(null);
		};
		const onBlur = () => {
			snapBypassHeld = false;
		};
		// The point mode's indicator, from the same hook its finish uses.
		const onPointMove = (event: PointerEvent) => {
			if (draw.getMode() !== "point") return;
			const box = container.getBoundingClientRect();
			drawSnapHook(
				{
					containerX: event.clientX - box.left,
					containerY: event.clientY - box.top,
				},
				mapSnapContext,
			);
		};
		const onPointerLeave = () => snapIndicator.set(null);
		const container = map.getCanvasContainer();
		container.addEventListener("pointerdown", onPointerDown, true);
		container.addEventListener("pointermove", onPointMove);
		container.addEventListener("pointerleave", onPointerLeave);
		window.addEventListener("pointerup", onPointerUp, true);
		window.addEventListener("pointercancel", onPointerUp, true);
		window.addEventListener("pointerdown", onModifiers, true);
		window.addEventListener("pointermove", onModifiers, true);
		window.addEventListener("keydown", onModifiers, true);
		window.addEventListener("keyup", onModifiers, true);
		window.addEventListener("blur", onBlur);
		drawListenersCleanupRef.current = () => {
			container.removeEventListener("pointerdown", onPointerDown, true);
			container.removeEventListener("pointermove", onPointMove);
			container.removeEventListener("pointerleave", onPointerLeave);
			window.removeEventListener("pointerup", onPointerUp, true);
			window.removeEventListener("pointercancel", onPointerUp, true);
			window.removeEventListener("pointerdown", onModifiers, true);
			window.removeEventListener("pointermove", onModifiers, true);
			window.removeEventListener("keydown", onModifiers, true);
			window.removeEventListener("keyup", onModifiers, true);
			window.removeEventListener("blur", onBlur);
		};
		/**
		 * Snap a point the point mode just placed, where its indicator was.
		 * @param id - The new point's terra-draw id.
		 */
		const snapNewPoint = (id: string | number) => {
			const point = draw.getSnapshotFeature(id);
			if (point?.geometry.type !== "Point") return;
			const [lng, lat] = point.geometry.coordinates as [number, number];
			const at = map.project([lng, lat]);
			const snapped = drawSnapHook(
				{ containerX: at.x, containerY: at.y },
				mapSnapContext,
			);
			if (!snapped) return;
			try {
				draw.updateFeatureGeometry(id, {
					type: "Point",
					coordinates: snapped,
				});
			} catch (error) {
				console.error(
					"[c2 map] terra-draw refused the snapped point",
					error,
				);
			}
		};
		// EVERY finished draw becomes an ASSET — one route, both contexts. It
		// opens the naming prompt, is saved as a named, typed MapDB feature, and
		// is then referenced by `feature_id` from a behaviour-graph node. The
		// mission branch that used to append the shape straight onto
		// `objective.geometries` as inline geometry is gone: that was the second
		// home for geometry, and a shape living there had no name, no type, and
		// no way for the graph to name it. [lng,lat] preserved end-to-end.
		draw.on("finish", (id, context) => {
			// Any edit renumbers or moves the vertices: the selected one is
			// no longer the one the operator clicked.
			setSelectedVertex(null);
			if (context?.mode === "point" && context.action === "draw")
				snapNewPoint(id);
			snapIndicator.set(null);
			const snap = draw.getSnapshotFeature(id);
			if (!snap) return;
			const drawn = snap as unknown as DrawFeature;
			// A select-mode finish (vertex drag, vertex delete, midpoint
			// insert, whole-feature move) is an EDIT of the shape already
			// open: it keeps that save's id, name and type and only takes the
			// new geometry. Treating it as a new drawing is what made every
			// reshape save as a duplicate (usability test 2026-11-12).
			const isNewShape = classifyDrawFinish(context, true) === "create";
			// A degenerate draw (no coordinates, a one-point line, a ring of
			// fewer than 4 positions) is refused HERE rather than at the save,
			// so the operator is told instead of filling in a name for a shape
			// that would draw nothing and could not be picked again.
			if (
				isNewShape &&
				!hasUsableCoordinates(
					drawn.geometry?.coordinates,
					drawn.geometry?.type,
				)
			) {
				setError("That shape has too few points. Draw it again.");
				clearDraw(draw);
				return;
			}
			const ctx = drawCtxRef.current;
			const continuesLastStep =
				insertStartedDrag && context?.action === "dragCoordinate";
			insertStartedDrag =
				context?.action === "insertMidpoint" && pointerDown;
			setPending((prev) =>
				classifyDrawFinish(context, prev !== null) === "update" &&
				prev !== null
					? pendingWithGeometry(prev, drawn, continuesLastStep)
					: nextPendingOnFinish<DrawFeature, PendingSave>(
							prev,
							drawn,
							context,
							(feature) => ({
								feature,
								name: "",
								featureType: ctx.mapFeatureType,
								initialType: ctx.mapFeatureType,
								category: "",
								// Provenance for the cross-map guard (a create cannot
								// corrupt, but stamping both origins keeps the invariant
								// simple).
								mapName: ctx.selectedMap,
								drawnInMission: ctx.missionScope ?? undefined,
							}),
						),
			);
			if (!isNewShape) return;
			// One-shot: the map returns to select by itself and the new shape
			// opens exactly like a clicked stored feature, with its handles
			// and its card. Save reads its live geometry by this id.
			editingDrawIdRef.current = id;
			newShapeFinishedAtRef.current = performance.now();
			setDrawPoints(0);
			setTool((tool) => nextMapTool(tool, "finish-new"));
			// After the draw mode's own close has returned: selecting switches
			// terra-draw to its select mode, which stops the draw mode.
			queueMicrotask(() => {
				if (drawRef.current !== draw || !draw.enabled) return;
				if (draw.hasFeature(id)) draw.selectFeature(id);
			});
		});
		draw.on("deselect", () => setSelectedVertex(null));
		// The shape Draw has in progress, whose placed points the Finish
		// button reads. Guidance points (closing, snapping) come and go
		// while it is drawn and are not it.
		let inProgressId: string | number | null = null;
		draw.on("change", (ids, type, changeContext) => {
			if (type === "delete") {
				// The shape in progress dropped: Escape, or its mode stopping.
				if (inProgressId !== null && ids.includes(inProgressId)) {
					inProgressId = null;
					setDrawPoints(0);
				}
			} else if (draw.getMode() !== "select") {
				for (const id of ids) {
					const placed = placedDrawPoints(
						draw.getSnapshotFeature(id) as
							DrawingFeature | undefined,
					);
					if (placed !== null) {
						inProgressId = id;
						setDrawPoints(placed);
						break;
					}
				}
			}
			// Starting a new shape clears the pick, which can arrive while
			// the Draw tool is armed (the assets panel picks too).
			if (!startsNewDrawing(type, draw.getMode(), changeContext)) return;
			setPickedId(null);
		});
		drawRef.current = draw;
	}, [snapIndicator, setPickedId]);

	useEffect(() => {
		return () => {
			drawListenersCleanupRef.current?.();
			drawListenersCleanupRef.current = null;
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

	// Whether the authoring tools are allowed. Both contexts author the SAME
	// thing now — map assets — so the gate is the same in both: a selected map
	// to write them into. A mission no longer has geometry of its own to draw.
	const canEdit = selectedMap.length > 0;

	// Shapes the operator may pick — constrained by the feature_type in BOTH
	// contexts, because every draw is now an asset: a `road` is line-only and a
	// `waypoint`/`cue` is point-only (single option → the picker is hidden),
	// `geofence`/`risk`/`zone` are polygon or rectangle (rectangle is a fast
	// axis-aligned polygon). The backend validates the same mapping server-side
	// (`GEOM_FOR_TYPE`), so a draw the save will reject is never offered.
	const availableShapes = useMemo<DrawShape[]>(() => {
		switch (FEATURE_TYPE_GEOMETRY[mapFeatureType]) {
			case "line":
				return ["line"];
			case "point":
				return ["point"];
			default:
				return ["polygon", "rectangle"];
		}
	}, [mapFeatureType]);

	// The effective draw shape, honoring the feature-type constraint: a `road` is
	// line-only and a `geofence`/`risk`/`zone` is polygon-or-rectangle, so a
	// `line` shape is coerced to polygon (and vice-versa).
	const effectiveShape: DrawShape = useMemo(() => {
		const geometry = FEATURE_TYPE_GEOMETRY[mapFeatureType];
		if (geometry === "line") return "line";
		// waypoint / cue are single-vertex assets.
		if (geometry === "point") return "point";
		// geofence / risk / zone → polygon or rectangle (never a line).
		return drawShape === "rectangle" ? "rectangle" : "polygon";
	}, [drawShape, mapFeatureType]);

	// The terra-draw geometry mode for the Draw tool, derived from the shape.
	const drawGeometryMode = drawShapeToMode(effectiveShape);

	// Drive terra-draw mode from the Draw tool, the chosen draw geometry and
	// the feature open for editing (select mode shows its handles).
	//
	// `viewOnly` disarms it here rather than by resetting `tool`: the map can
	// enter View on a status change, which is not an event this widget handles,
	// and a tool left armed would keep drawing under a toolbar that has put its
	// authoring controls away. Static is the same neutral mode the map rests
	// in, so nothing on screen is removed — only the arming.
	//
	// A mode that is already active is not set again: `setMode` stops and
	// restarts it, and restarting the select mode drops the selection
	// `editFeature` just made, hiding the handles the operator needs.
	useEffect(() => {
		const draw = drawRef.current;
		if (!draw || !draw.enabled) return;
		const next =
			!viewOnly && tool === "draw" && canEdit
				? drawGeometryMode
				: shapeOpen && canEdit
					? "select"
					: "static";
		if (draw.getMode() === next) return;
		draw.setMode(next);
		// A snap shown for the mode that stopped is no longer under way.
		snapIndicator.set(null);
	}, [viewOnly, tool, canEdit, drawGeometryMode, shapeOpen, snapIndicator]);

	/** Draw is armed and may draw: the hint chip shows. */
	const drawArmed = !viewOnly && tool === "draw" && canEdit;

	/**
	 * End the open edit or the drawn shape awaiting its name: drop its changes
	 * and its handles. The pick is the caller's.
	 */
	const endEdit = useCallback(() => {
		setPending(null);
		setSelectedVertex(null);
		editingDrawIdRef.current = null;
		clearDraw(drawRef.current);
	}, []);

	/** Confirm a pending MAP-feature save: POST (create) or PUT (edit). */
	const confirmSave = useCallback(
		async (name: string, featureType: FeatureType, category: string) => {
			// Enter and the button can both ask while a write is in flight.
			if (!pending || busy) return;
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
			// Retype legality, client-side. `normalizeFeature` validates the
			// new type against `GEOM_FOR_TYPE`, so a cross-geometry retype
			// comes back as a 400 the operator cannot act on. The prompt
			// already disables those options; this refuses the write anyway,
			// because the two disagreeing is exactly the failure this rule
			// exists to prevent.
			if (!canRetypeFeature(pending.initialType, featureType)) {
				setError(
					`A ${FEATURE_TYPE_LABELS[pending.initialType]} can't become a ${FEATURE_TYPE_LABELS[featureType]}. Redraw it instead.`,
				);
				return;
			}
			// Read the LIVE geometry from terra-draw (capturing any vertex drag /
			// midpoint reshape the operator made in select mode), for an edit
			// and for a shape just drawn, which opens in select mode too; fall
			// back to the pending snapshot if the live feature can't be
			// resolved.
			const liveId = editingDrawIdRef.current;
			const liveFeature =
				liveId != null
					? (drawRef.current?.getSnapshotFeature(liveId) as
							DrawFeature | undefined)
					: undefined;
			const source = liveFeature ?? pending.feature;
			const feature = drawFeatureToC2Feature(source, {
				name,
				feature_type: featureType,
				feature_id: pending.featureId,
				// "" explicitly clears a category the feature used to carry.
				category,
				// The stored bag, so a property this build does not model is
				// written back instead of being dropped by the round trip.
				properties: pending.properties,
			});
			// A mission's asset: an edit of one, or a waypoint / zone / cue
			// drawn while a mission is open. It goes into that mission's
			// assets (saved by Save mission), never onto the map.
			const toMission =
				pending.missionId ??
				(!editing &&
				pending.drawnInMission &&
				isMissionAssetType(featureType)
					? pending.drawnInMission
					: undefined);
			if (toMission) {
				if (toMission !== missionScope) {
					setError(
						"Not saved: this shape belongs to another mission. Reopen that mission, or draw it again.",
					);
					return;
				}
				if (!hasMissionAssets(toMission)) {
					setError(
						"Mission assets are still loading. Try again in a moment.",
					);
					return;
				}
				// Removed meanwhile (the asset panel): an edit must not bring
				// it back.
				if (
					editing &&
					pending.featureId &&
					!findAsset(
						getMissionAssets(toMission) ?? {
							map: "",
							features: [],
						},
						pending.featureId,
					)
				) {
					setError(
						"Not saved: this asset was removed from the mission.",
					);
					setPending(null);
					editingDrawIdRef.current = null;
					clearDraw(drawRef.current);
					setTool("select");
					return;
				}
				if (!isMissionAssetType(featureType)) {
					setError(
						"A mission asset must be a waypoint, zone or cue.",
					);
					return;
				}
				// A mission not placed on a map yet is placed on the one its
				// asset was drawn on.
				// One step of the mission's history; the open edit's own
				// geometry steps end with it.
				editMission(
					toMission,
					`${editing ? "Edit" : "Add"} ${name.trim() || FEATURE_TYPE_LABELS[featureType].toLowerCase()}`,
					{
						assets: (assets) =>
							upsertAsset(
								assets.map
									? assets
									: { ...assets, map: selectedMap },
								feature,
							),
					},
				);
				setError(null);
				setPending(null);
				setPickedId(readFeatureId(feature) ?? null);
				const savedId = readFeatureId(feature);
				if (savedId) selectContact(null);
				editingDrawIdRef.current = null;
				clearDraw(drawRef.current);
				setTool("select");
				return;
			}
			if (editing && !props.featuresUpdateDef) {
				setError("This C2 cannot edit features.");
				return;
			}
			if (!editing && !props.featuresAddDef) {
				setError("This C2 cannot add features.");
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
			setTool("select");
			// A saved edit is done with: the feature goes back to normal.
			if (editing) setPickedId(null);
			await refetchFeatures();
		},
		[
			pending,
			busy,
			selectedMap,
			missionScope,
			props.featuresAddDef,
			props.featuresUpdateDef,
			featuresAddCall,
			featuresUpdateCall,
			refetchFeatures,
			setPickedId,
		],
	);

	/**
	 * Load a stored feature into the draw layer for editing (same id): a map
	 * feature, or with `missionId` one of that mission's assets.
	 */
	const editFeature = useCallback(
		(feature: C2Feature, mapName: string, missionId?: string) => {
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
			// Any type the C2 accepts round-trips as itself. It used to collapse to
			// "road" for everything that was not a geofence or a risk, which would
			// now silently re-type a waypoint, a zone or a cue on the first edit —
			// and `road` takes a LineString, so the save would then be rejected by
			// the geometry check with nothing saying the type had been changed.
			//
			// A type this build does not recognise falls back by GEOMETRY, not to a
			// fixed "road": the prompt derives the legal retype targets from this
			// value, so a point asset falling back to a line type would offer the
			// operator nothing but retypes the server refuses.
			const fallbackType: FeatureType =
				drawn.geometry.type === "Point"
					? "waypoint"
					: drawn.geometry.type === "Polygon"
						? "zone"
						: "road";
			const featureType: FeatureType = isFeatureType(storedType)
				? storedType
				: fallbackType;
			clearDraw(draw);
			setSelectedVertex(null);
			const validations = draw.addFeatures([
				drawn as unknown as GeoJSONStoreFeatures,
			]);
			// terra-draw REFUSES a feature it cannot validate and says so only in
			// the returned result. Ignoring it is what made editing a silent
			// no-op: nothing reached the draw layer, there was no handle to drag,
			// and the prompt still opened and saved the unchanged geometry. A
			// refusal now stops the edit and names terra-draw's reason.
			const loaded = validations[0];
			if (!loaded?.valid || loaded.id == null) {
				const reason =
					loaded?.reason ?? "no result from the draw layer";
				console.error(
					"[c2 map] terra-draw refused the feature opened for editing",
					{ featureId: readFeatureId(feature), reason },
				);
				editingDrawIdRef.current = null;
				setError(
					`This feature can't be opened for editing: ${reason}.`,
				);
				return;
			}
			// Track the terra-draw id so the save path can read the LIVE edited
			// geometry (post drag/reshape) instead of the stale pre-edit snapshot.
			editingDrawIdRef.current = loaded.id;
			// Select it so its handles show at once: a point drags as a whole, a
			// line or polygon shows draggable vertices and midpoints. terra-draw
			// switches to its select mode itself; the tool effect below leaves an
			// already-active select mode alone so this selection survives.
			draw.selectFeature(loaded.id);
			const name =
				typeof feature.properties?.name === "string"
					? feature.properties.name
					: "";
			const category = readFeatureCategory(feature) ?? "";
			setPending({
				feature: drawn,
				featureId: readFeatureId(feature) ?? undefined,
				// Provenance: which map this edit belongs to. The write path
				// refuses to upsert it into a different one.
				mapName,
				missionId,
				name,
				featureType,
				initialType: featureType,
				category,
				// What Save and the discard question compare against.
				original: {
					name,
					featureType,
					category,
					// A copy: terra-draw must never edit the baseline in place.
					geometry: structuredClone(drawn.geometry),
				},
				// Carried verbatim so the save writes back every property the
				// feature arrived with, including ones this build does not model.
				properties: { ...(feature.properties ?? {}) },
			});
			setTool("select");
		},
		[],
	);

	/**
	 * Delete the selected stored map feature, then refetch. The caller is
	 * responsible for confirming (via the AlertDialog) before invoking this.
	 */
	const deleteFeature = useCallback(
		async (feature: C2Feature) => {
			const featureId = readFeatureId(feature);
			// Deleting the feature open for editing ends the edit: its save
			// would otherwise write the feature back (the update is an upsert).
			const endsOpenEdit =
				featureId != null && pending?.featureId === featureId;
			// A mission's asset leaves the mission (saved by Save mission).
			if (missionScope && featureId && missionAssetOf(featureId)) {
				const name = feature.properties?.name || "asset";
				editMission(missionScope, `Delete ${name}`, {
					assets: (assets) => removeAsset(assets, featureId),
				});
				if (pickedId === featureId) setPickedId(null);
				if (endsOpenEdit) endEdit();
				setError(null);
				setUndoNotice(undoNoticeFor(missionScope, `Deleted “${name}”`));
				return;
			}
			if (!props.featuresDeleteDef || !selectedMap || !featureId) {
				setError("This C2 cannot delete features.");
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
				setError(`No feature ${featureId} on the C2. Nothing deleted.`);
				return;
			}
			setError(null);
			if (pickedId === featureId) setPickedId(null);
			if (endsOpenEdit) endEdit();
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
			pending,
			endEdit,
			missionScope,
			missionAssetOf,
			setPickedId,
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
				setError("This C2 cannot add features.");
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
				setError("This C2 cannot add features.");
				return;
			}
			const ring = geofenceRingFromFeature(geofence);
			const bbox = ring ? ringToBbox(ring) : null;
			if (!ring || !bbox) {
				setError("This geofence has no usable polygon.");
				return;
			}
			const signal = beginOsmFetch();
			setBusy(true);
			setOsmProgress("Loading roads from OpenStreetMap…");
			const result = await fetchOsmRoads(bbox, signal);
			// A replaced import must not re-enable the controls while its
			// successor still runs: only the latest import releases `busy` (an
			// import aborted by a map switch is still the latest, and does).
			if (osmAbortRef.current?.signal === signal) {
				setBusy(false);
				setOsmProgress(null);
			}
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
				confirmLabel: "Import",
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
				setError("This C2 cannot add features.");
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
				setError("This C2 cannot add features.");
				return;
			}
			const ring = geofenceRingFromFeature(geofence);
			const bbox = ring ? ringToBbox(ring) : null;
			if (!ring || !bbox) {
				setError("This geofence has no usable polygon.");
				return;
			}
			const signal = beginOsmFetch();
			setBusy(true);
			setOsmProgress("Loading buildings from OpenStreetMap…");
			const result = await fetchOsmBuildings(bbox, signal);
			// A replaced import must not re-enable the controls while its
			// successor still runs: only the latest import releases `busy` (an
			// import aborted by a map switch is still the latest, and does).
			if (osmAbortRef.current?.signal === signal) {
				setBusy(false);
				setOsmProgress(null);
			}
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
				confirmLabel: "Import",
				onConfirm: () => void importOsmBuildings(risks),
			});
		},
		[selectedMap, props.featuresAddDef, importOsmBuildings, beginOsmFetch],
	);

	/** Create a new map (prompt for a name); select it on success. */
	const createMap = useCallback(async () => {
		if (!props.mapsCreateDef) {
			setError("This C2 cannot create maps.");
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
		// pickMap: an open mission with no assets moves to the new map.
		pickMap(name);
	}, [props.mapsCreateDef, mapsCreateCall, refetchMaps, pickMap]);

	/**
	 * Delete the selected map, then reselect the first map. The caller confirms
	 * (via the AlertDialog) before invoking this.
	 */
	const deleteMap = useCallback(async () => {
		if (!props.mapsDeleteDef || !selectedMap) {
			setError("This C2 cannot delete maps.");
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
		pickMap(list[0]?.name ?? "");
	}, [
		props.mapsDeleteDef,
		selectedMap,
		mapsDeleteCall,
		refetchMaps,
		pickMap,
	]);

	// --- Destructive-action confirmation (AlertDialog) ----------------------

	/**
	 * Delete a feature: a mission asset at once (one Undo puts it back, and
	 * the notice carries that Undo), a stored map feature after the
	 * AlertDialog (its DELETE is final).
	 */
	const requestDeleteFeature = useCallback(
		(feature: C2Feature) => {
			if (missionAssetOf(readFeatureId(feature)) != null) {
				void deleteFeature(feature);
				return;
			}
			const label =
				(typeof feature.properties?.name === "string" &&
					feature.properties.name) ||
				readFeatureId(feature) ||
				"feature";
			setConfirmState({
				title: "Delete feature?",
				description: `Permanently delete "${label}" from this map.`,
				onConfirm: () => void deleteFeature(feature),
			});
		},
		[deleteFeature, missionAssetOf],
	);

	/** Open the AlertDialog to confirm deleting the selected map. */
	const requestDeleteMap = useCallback(() => {
		if (!selectedMap) return;
		setConfirmState({
			title: "Delete map?",
			description: `Permanently delete "${selectedMap}" and all its features.`,
			onConfirm: () => void deleteMap(),
		});
	}, [selectedMap, deleteMap]);

	// --- Agent allocation (a GRAPH edit, never a draft field) ---------------

	/**
	 * Toggle an agent NODE in the mission's behaviour graph.
	 *
	 * The marker is the affordance and the node is the state. This used to
	 * write `draft.vehicles` directly, which put the map and the graph in a
	 * fight over the same field — the graph compiles `vehicles` from its agent
	 * nodes, so whichever wrote last won and the operator could not see which.
	 * Now there is one author: the graph. `vehicles` follows from it.
	 *
	 * An unloaded graph slot is REPORTED, never swallowed. `editMissionGraph`
	 * is a no-op without a slot, so a click on a mission whose graph has not
	 * been opened yet would otherwise look like a dead marker.
	 */
	const toggleMissionAgent = useCallback(
		(agentId: string) => {
			if (!selectedMission) return;
			if (!hasMissionGraph(selectedMission)) {
				setError(
					"Open this mission in the node editor, then click the agent again.",
				);
				return;
			}
			// The human name, so the node does not open captioned with a UUID.
			const label = getAgentName(agentId) || undefined;
			const current = getMissionGraph(selectedMission);
			const removing = current != null && hasAgentNode(current, agentId);
			editMission(
				selectedMission,
				`${removing ? "Remove" : "Add"} ${label ?? "agent"}`,
				{ graph: (graph) => toggleAgentNode(graph, agentId, label) },
			);
			setError(null);
		},
		[selectedMission],
	);

	// --- Mission save -------------------------------------------------------

	/**
	 * Save the mission AND its behaviour graph, as one action
	 * ({@link saveMissionWithGraph}): the graph first, then the mission via
	 * fetch-modify-save — re-fetch the stored config, fold the SHARED DRAFT
	 * onto it, validate, then save the whole thing.
	 *
	 * ## One author
	 *
	 * The map no longer contributes any mission field of its own. The draft is
	 * the single in-memory truth — the behaviour graph compiles
	 * `objective.geometries`, `vehicles` and `behavior` into it, and this is
	 * simply where that draft reaches the wire. The old path overlaid four
	 * "map-owned" fields from panel state, which is what threw the graph's
	 * compiled allocation away on the next save.
	 *
	 * ## What the re-fetch is still for
	 *
	 * `transit` / `start` / `arrival_time` have no UI at all right now, and the
	 * backend may carry fields this build has never modelled. Those live only
	 * in the freshly-fetched config, so it is the base and the draft is layered
	 * on top ({@link mergeStoredMission}) — nothing stored is destroyed by a
	 * save.
	 */
	const saveMission = useCallback(async () => {
		// Re-entry guard: the Save button is disabled while `busy`, but a fast
		// double-click can fire two calls before the disable lands — bail if a
		// save is already in flight so the mission can't be double-submitted.
		if (busy) return;
		if (!selectedMission || !missionConfig) return;
		if (!props.missionsSaveDef) {
			setError("This C2 cannot save missions.");
			return;
		}
		setBusy(true);
		// ONE save for the mission and its graph (state/mission-save.ts): the
		// graph first, then the mission re-derived from it.
		const result = await saveMissionWithGraph(selectedMission, {
			list: () => executeMissionsList({}),
			save: (doc) => missionsSaveCall.execute({ mission: doc }),
		});
		setBusy(false);
		if (!result.ok) {
			if (result.stage === "validate")
				setMissionIssues(result.issues ?? []);
			setError(result.error);
			return;
		}
		setMissionIssues(validateMissionConfig(result.mission));
		setError(
			result.keptDirty
				? "Saved. Edits made during the save are still unsaved."
				: null,
		);
		editingDrawIdRef.current = null;
		clearDraw(drawRef.current);
		setTool("select");
	}, [
		busy,
		selectedMission,
		missionConfig,
		props.missionsSaveDef,
		executeMissionsList,
		missionsSaveCall,
	]);

	/**
	 * Resolve the ASSET under a click point — the hit map feature (id + the
	 * resolved {@link C2Feature} for edit/delete), or `null` when nothing is
	 * under the cursor. Pure lookup — no state writes.
	 *
	 * The same answer in both contexts, because everything on the map is an
	 * asset. It used to branch: in mission context it picked an inline
	 * `objective.geometries[]` entry by index instead, which was the second
	 * home for geometry this widget no longer authors.
	 */
	const pickAt = useCallback(
		(point: { x: number; y: number }): MapHit | null => {
			const map = mapRef.current?.getMap();
			if (!map) return null;
			// A few pixels of slack, and the most specific feature under the
			// pointer wins (a point, then a line, then the smallest area), so
			// a geofence drawn on top no longer swallows every click inside
			// it ({@link choosePick}). A locked layer is never picked.
			const at = (layers: string[], from: C2Feature[]) => {
				const hits = map.queryRenderedFeatures(
					[
						[
							point.x - PICK_TOLERANCE_PX,
							point.y - PICK_TOLERANCE_PX,
						],
						[
							point.x + PICK_TOLERANCE_PX,
							point.y + PICK_TOLERANCE_PX,
						],
					],
					{ layers: layers.filter((layer) => map.getLayer(layer)) },
				);
				const candidates = hits.flatMap((hit) => {
					const id = hit.properties?.feature_id;
					if (typeof id !== "string" || id.length === 0) return [];
					const stored = from.find((f) => readFeatureId(f) === id);
					if (!stored) return [];
					return [
						{
							id,
							featureType: String(
								stored.properties?.feature_type ?? "",
							),
							geometry: stored.geometry as
								| { type: string; coordinates: unknown }
								| undefined,
						},
					];
				});
				const id = choosePick(candidates, lockedLayers);
				if (!id) return null;
				const feature = from.find((f) => readFeatureId(f) === id);
				return feature ? { id, feature } : null;
			};
			const shown = at(
				["c2-features-fill", "c2-features-line", "c2-features-circle"],
				shownFeatures,
			);
			if (shown) return { ...shown, library: false };
			// In a mission, the map's own assets are a library: picked to be
			// imported, never edited from here.
			const library = at(
				["c2-library-fill", "c2-library-line", "c2-library-circle"],
				libraryFeatures,
			);
			return library ? { ...library, library: true } : null;
		},
		[shownFeatures, libraryFeatures, lockedLayers],
	);

	/**
	 * The open mission's stored contact under a click, if any: a few pixels
	 * of slack, and the not-real ring counts, since the marks are small.
	 */
	const contactAt = useCallback(
		(point: { x: number; y: number }): string | undefined => {
			const map = mapRef.current?.getMap();
			if (!map || !selectedMission) return undefined;
			const layers = [
				"c2-findings-core",
				"c2-findings-essence-ring",
			].filter((layer) => map.getLayer(layer));
			if (layers.length === 0) return undefined;
			const known = getMissionContacts(selectedMission).contacts;
			return map
				.queryRenderedFeatures(
					[
						[point.x - 6, point.y - 6],
						[point.x + 6, point.y + 6],
					],
					{ layers },
				)
				.map((feature) => feature.properties?.uid)
				.find(
					(uid): uid is string =>
						typeof uid === "string" &&
						known.some((contact) => contact.uid === uid),
				);
		},
		[selectedMission],
	);

	/**
	 * The vertex handle of the open shape under a click, if any. Only the
	 * select mode draws handles, so any other mode finds none.
	 */
	const vertexAt = useCallback(
		(
			point: { x: number; y: number },
			lngLat: { lng: number; lat: number },
		): SelectedVertex | null => {
			const draw = drawRef.current;
			const map = mapRef.current;
			if (!draw || !map || draw.getMode() !== "select") return null;
			const candidates = draw.getFeaturesAtLngLat(lngLat, {
				ignoreSelectFeatures: false,
				pointerDistance: SELECT_POINTER_DISTANCE_PX,
			}) as unknown as VertexCandidate[];
			return vertexAtClick(candidates, (position: VertexPosition) => {
				const xy = map.project(position);
				return Math.hypot(xy.x - point.x, xy.y - point.y);
			});
		},
		[],
	);

	/**
	 * What part of the open shape a click reached, within terra-draw's own
	 * hit radius ({@link openShapeContact}).
	 */
	const openShapeAt = useCallback((lngLat: { lng: number; lat: number }) => {
		const draw = drawRef.current;
		if (!draw || draw.getMode() !== "select") return null;
		const candidates = draw.getFeaturesAtLngLat(lngLat, {
			ignoreSelectFeatures: false,
			pointerDistance: SELECT_POINTER_DISTANCE_PX,
		}) as unknown as DrawCandidate[];
		return openShapeContact(candidates, editingDrawIdRef.current);
	}, []);

	/** Give the map the keyboard, for the keys of the open edit. */
	const focusMap = useCallback(() => {
		mapRef.current?.getCanvas().focus({ preventScroll: true });
	}, []);

	/**
	 * Remove the selected vertex, the keyboard twin of terra-draw's
	 * right-click delete: the open save takes the new geometry, exactly as
	 * the `finish` handler does for a right-click, so Save updates the same
	 * feature.
	 */
	const deleteShownVertex = useCallback(() => {
		const draw = drawRef.current;
		if (!draw || !shownVertex) return;
		const result = deleteVertex(draw, shownVertex);
		setSelectedVertex(null);
		if (!result.ok) {
			setError(result.message);
			return;
		}
		const feature = result.feature as unknown as DrawFeature;
		setPending((prev) =>
			prev === null ? null : pendingWithGeometry(prev, feature),
		);
	}, [shownVertex]);

	/**
	 * Undo or Redo one geometry step of the open edit: put the shape back
	 * in the draw layer (terra-draw redraws its handles) and take it as the
	 * open save's geometry. Undo back to the shape as opened leaves nothing
	 * to save ({@link hasUnsavedChanges}).
	 */
	const stepHistory = useCallback(
		(direction: "undo" | "redo") => {
			const draw = drawRef.current;
			const id = editingDrawIdRef.current;
			if (!draw || id === null || !pending) return;
			const live = draw.getSnapshotFeature(id) as unknown as
				DrawFeature | undefined;
			if (!live) return;
			const step =
				direction === "undo"
					? undoGeometry(pending.history, live.geometry)
					: redoGeometry(pending.history, live.geometry);
			if (!step) return;
			const restored = restoreGeometry(draw, id, step.geometry);
			if (!restored) {
				setError("That change cannot be restored.");
				return;
			}
			setSelectedVertex(null);
			setPending((prev) =>
				prev === null
					? null
					: { ...prev, feature: restored, history: step.history },
			);
		},
		[pending],
	);

	/**
	 * Select a feature, or nothing: pick it, mirror it in the asset panel and,
	 * when authoring, open it for editing with its handles at once. Ends
	 * whatever was open first; the caller has already asked about changes.
	 *
	 * @param hit - The feature, or null for nothing.
	 * @param open - Open it for editing (false in View).
	 */
	const selectHit = useCallback(
		(hit: MapHit | null, open: boolean) => {
			if (open) endEdit();
			if (!hit) {
				setPickedId(null);
				return;
			}
			selectContact(null);
			setPickedId(hit.id);
			const missionId =
				!hit.library && missionAssetOf(hit.id) ? missionScope : null;
			// In a mission, the map's own assets are a library: picked to be
			// imported, never edited from here.
			if (!open || hit.library || !canEdit) return;
			editFeature(hit.feature, selectedMap, missionId ?? undefined);
		},
		[
			endEdit,
			missionScope,
			missionAssetOf,
			canEdit,
			editFeature,
			selectedMap,
			setPickedId,
		],
	);

	/** What to call the pending save in a question about it. */
	const pendingLabel = pending
		? pending.featureId != null
			? pending.original?.name.trim() ||
				FEATURE_TYPE_LABELS[pending.initialType]
			: `the new ${FEATURE_TYPE_LABELS[pending.initialType].toLowerCase()}`
		: "";

	/** The toolbar's one state indicator: what the map is doing. */
	const editLabel = mapStateLabel(
		groupActive
			? moveArmed
				? { kind: "moving", count: groupSplit.eligible.length }
				: { kind: "group", count: groupIds.length }
			: drawArmed
				? {
						kind: "drawing",
						typeLabel: FEATURE_TYPE_LABELS[mapFeatureType],
					}
				: pending && openEditId != null
					? {
							kind: "editing",
							name: pending.original?.name ?? pending.name,
							typeLabel: FEATURE_TYPE_LABELS[pending.initialType],
						}
					: pending && newShapeOpen
						? {
								kind: "new",
								typeLabel:
									FEATURE_TYPE_LABELS[pending.initialType],
							}
						: { kind: "idle" },
	);

	/**
	 * Run `then` once the pending save may be dropped: at once when it has no
	 * changes, after the operator says Discard when it has.
	 */
	const leavePending = useCallback(
		(then: () => void) => {
			if (!pending || !pendingDirty) {
				then();
				return;
			}
			setConfirmState({
				title: `Discard changes to ${pendingLabel}?`,
				description: "Unsaved changes are lost.",
				confirmLabel: "Discard",
				cancelLabel: "Keep editing",
				onConfirm: then,
			});
		},
		[pending, pendingDirty, pendingLabel],
	);

	/**
	 * Run `then` once the group card's changes may be dropped: at once
	 * without changes, after the operator says Discard with them.
	 */
	const leaveGroup = useCallback(
		(then: () => void) => {
			if (!groupActive || !groupDirty) {
				then();
				return;
			}
			setConfirmState({
				title: `Discard changes to ${featureCount(groupChanges.length)}?`,
				description: "Unsaved changes are lost.",
				confirmLabel: "Discard",
				cancelLabel: "Keep editing",
				onConfirm: then,
			});
		},
		[groupActive, groupDirty, groupChanges.length],
	);

	/**
	 * Whether a feature can be selected alone and open for editing: one on
	 * a locked or hidden layer, or one whose geometry the editor cannot
	 * load, stays a group of one instead.
	 */
	const canOpenAlone = useCallback(
		(id: string) => {
			const stored = features.find((f) => readFeatureId(f) === id);
			if (!stored) return false;
			const type = String(stored.properties?.feature_type ?? "");
			if (mapLayers.locked.has(type) || mapLayers.hidden.has(type))
				return false;
			return c2FeatureToDrawFeature(stored) != null;
		},
		[features, mapLayers.locked, mapLayers.hidden],
	);

	/**
	 * Make a selection the map's: one feature opens as a click opens it,
	 * a group closes whatever was open. The card's changes start over.
	 * The caller has already asked about unsaved changes.
	 */
	const applySelection = useCallback(
		(next: MultiSelection) => {
			setGroupDraft({ move: EMPTY_MOVE });
			setMoveArmed(false);
			setLiveMoveOffset(null);
			if (next.openId !== null) {
				setGroupIds([]);
				if (next.openId === openEditId) return;
				const stored = features.find(
					(f) => readFeatureId(f) === next.openId,
				);
				if (stored)
					selectHit(
						{ id: next.openId, feature: stored, library: false },
						true,
					);
				return;
			}
			endEdit();
			setPickedId(null);
			setTool("select");
			setGroupIds(next.groupIds);
		},
		[openEditId, features, selectHit, endEdit, setGroupIds, setPickedId],
	);

	/**
	 * Add features to the selection or take them out: a checkbox, a
	 * layer's "select all", or a Shift-click. Asks first when it would drop
	 * unsaved changes: the feature open, or the group card's.
	 */
	const requestSelectionChange = useCallback(
		(ids: readonly string[], mode: MapFeatureSelectionRequest["mode"]) => {
			if (!multiSelectEnabled) return;
			const current: MultiSelection = {
				groupIds: groupActive ? groupIds : [],
				openId: openEditId,
			};
			const next = changeSelection(current, ids, mode, canOpenAlone);
			if (sameSelection(current, next)) return;
			const proceed = () => applySelection(next);
			if (groupActive) {
				leaveGroup(proceed);
				return;
			}
			if (
				pending &&
				(pending.featureId == null || closesOpenFeature(current, next))
			) {
				leavePending(proceed);
				return;
			}
			proceed();
		},
		[
			multiSelectEnabled,
			groupActive,
			groupIds,
			openEditId,
			canOpenAlone,
			applySelection,
			leaveGroup,
			pending,
			leavePending,
		],
	);

	/** Drop the group card's changes and disarm Move; the group stays. */
	const cancelGroupChanges = useCallback(() => {
		setGroupDraft({ move: EMPTY_MOVE });
		setMoveArmed(false);
		setLiveMoveOffset(null);
	}, []);

	/** Undo or Redo one drag of the group move. */
	const stepGroupMove = useCallback((direction: "undo" | "redo") => {
		setGroupDraft((draft) => {
			const move =
				direction === "undo"
					? undoMove(draft.move)
					: redoMove(draft.move);
			return move ? { ...draft, move } : draft;
		});
	}, []);

	/**
	 * Where an Undo or a Redo on the map goes ({@link routeUndo}): the open
	 * edit's geometry steps, then the group's move, then the mission's
	 * history. An open edit with unsaved changes it has no step for (a new
	 * name) holds the mission's history back: a step taken under it would
	 * change the asset it is about to save.
	 */
	const groupCanUndo = groupDraft.move.steps.length > 0;
	const groupCanRedo = groupDraft.move.undone.length > 0;
	const missionInReach = missionScope != null && !(shapeOpen && pendingDirty);
	const undoRouteState = useMemo<UndoRouteState>(
		() => ({
			edit: shapeOpen ? { canUndo: undoable, canRedo: redoable } : null,
			group: groupActive
				? { canUndo: groupCanUndo, canRedo: groupCanRedo }
				: null,
			mission: missionInReach
				? {
						canUndo: missionUndo.canUndo,
						canRedo: missionUndo.canRedo,
					}
				: null,
			frozen: viewOnly,
		}),
		[
			shapeOpen,
			undoable,
			redoable,
			groupActive,
			groupCanUndo,
			groupCanRedo,
			missionInReach,
			missionUndo.canUndo,
			missionUndo.canRedo,
			viewOnly,
		],
	);
	const canUndoHere = routeUndo("undo", undoRouteState) !== null;
	const canRedoHere = routeUndo("redo", undoRouteState) !== null;
	const undoHereLabel =
		routeUndo("undo", undoRouteState) === "mission"
			? missionUndo.undoLabel
			: "";
	const redoHereLabel =
		routeUndo("redo", undoRouteState) === "mission"
			? missionUndo.redoLabel
			: "";

	/**
	 * Take one step in a history {@link routeUndo} chose. A mission step
	 * taken while a shape is open closes it first (it has nothing unsaved),
	 * so the shape is drawn again from what the step put back.
	 */
	const stepUndo = useCallback(
		(direction: "undo" | "redo", scope: UndoScope) => {
			if (scope === "edit") {
				stepHistory(direction);
				return;
			}
			if (scope === "group") {
				stepGroupMove(direction);
				return;
			}
			if (!missionScope) return;
			if (pending) endEdit();
			if (direction === "undo") undoMission(missionScope);
			else redoMission(missionScope);
		},
		[stepHistory, stepGroupMove, missionScope, pending, endEdit],
	);

	/** Undo or Redo from the toolbar. */
	const pressUndo = useCallback(
		(direction: "undo" | "redo") => {
			const scope = routeUndo(direction, undoRouteState);
			if (scope) stepUndo(direction, scope);
		},
		[undoRouteState, stepUndo],
	);

	/**
	 * Save the group card's changes: one PUT per feature they change. What
	 * the C2 accepts is applied; what it refuses is named, stays selected
	 * and keeps the card's changes for another Save. Nothing is retried.
	 */
	const saveGroup = useCallback(async () => {
		if (busy || !groupActive || groupChanges.length === 0) return;
		if (!props.featuresUpdateDef) {
			setError("This C2 cannot edit features.");
			return;
		}
		const mapName = selectedMap;
		const changes = groupChanges;
		setLiveMoveOffset(null);
		setBusy(true);
		const outcomes: BulkOutcome[] = [];
		for (const change of changes) {
			const result = await featuresUpdateCall.execute({
				name: mapName,
				featureId: change.id,
				feature: change.feature,
			});
			outcomes.push({
				id: change.id,
				name: change.name,
				ok: result.success,
				error: result.success ? undefined : result.error,
			});
		}
		setBusy(false);
		// A map switch meanwhile dropped the group; the refetch is its own.
		if (selectedMapRef.current !== mapName) return;
		const report = bulkReport(outcomes, "save");
		const saved = new Map(
			changes
				.filter((change) => report.succeeded.includes(change.id))
				.map((change) => [change.id, change.feature]),
		);
		setFeatures((prev) =>
			prev.map((f) => saved.get(readFeatureId(f) ?? "") ?? f),
		);
		if (report.failed.length === 0) {
			setGroupDraft({ move: EMPTY_MOVE });
			setMoveArmed(false);
		} else {
			// The card's changes stay for the features not saved, so the
			// ones saved leave the group: a second Save must not apply them
			// again.
			setGroupIds((prev) => prev.filter((id) => !saved.has(id)));
		}
		await refetchFeatures();
		// After the refetch, which clears the error bar when it succeeds.
		setError(report.message);
	}, [
		busy,
		groupActive,
		groupChanges,
		props.featuresUpdateDef,
		selectedMap,
		featuresUpdateCall,
		refetchFeatures,
		setGroupIds,
	]);

	/**
	 * Delete features of the group: one DELETE each. What the C2 deletes
	 * leaves the map and the group; what it refuses is named and stays
	 * selected. Nothing is retried.
	 */
	const deleteGroup = useCallback(
		async (targets: readonly { id: string; name: string }[]) => {
			if (!props.featuresDeleteDef) {
				setError("This C2 cannot delete features.");
				return;
			}
			const mapName = selectedMap;
			setLiveMoveOffset(null);
			setBusy(true);
			const outcomes: BulkOutcome[] = [];
			for (const target of targets) {
				const result = await featuresDeleteCall.execute({
					name: mapName,
					featureId: target.id,
				});
				// `{ deleted: 0 }` is a 200 that deleted nothing.
				const deleted = result.success
					? (result.data as { deleted?: number } | null)?.deleted
					: undefined;
				const ok = result.success && deleted !== 0;
				outcomes.push({
					id: target.id,
					name: target.name,
					ok,
					error: ok
						? undefined
						: result.success
							? "not on the C2"
							: result.error,
				});
			}
			setBusy(false);
			if (selectedMapRef.current !== mapName) return;
			const report = bulkReport(outcomes, "delete");
			const gone = new Set(report.succeeded);
			setFeatures((prev) =>
				prev.filter((f) => !gone.has(readFeatureId(f) ?? "")),
			);
			setGroupIds((prev) => prev.filter((id) => !gone.has(id)));
			await refetchFeatures();
			// After the refetch, which clears the error bar when it succeeds.
			setError(report.message);
		},
		[
			props.featuresDeleteDef,
			selectedMap,
			featuresDeleteCall,
			refetchFeatures,
			setGroupIds,
		],
	);

	/** Ask before deleting the group's features, naming them. */
	const requestDeleteGroup = useCallback(() => {
		if (!groupActionState.delete) return;
		const targets = groupSplit.eligible.map((member) => ({
			id: member.id,
			name: member.name,
		}));
		const question = bulkDeleteQuestion(
			targets.map((target) => target.name),
			groupSplit.locked.length,
		);
		setConfirmState({
			...question,
			onConfirm: () => void deleteGroup(targets),
		});
	}, [groupActionState.delete, groupSplit, deleteGroup]);

	/**
	 * Select a feature (or nothing) on the operator's behalf: a click, or a
	 * panel naming a feature. A click on the feature already open is
	 * terra-draw's; anything else asks before unsaved changes are dropped
	 * ({@link selectionChangeOnClick}).
	 */
	const requestSelect = useCallback(
		(hit: MapHit | null) => {
			// View shows: it picks, and never touches an edit.
			if (viewOnly) {
				selectHit(hit, false);
				return;
			}
			// A plain click (or a name in the list) ends the group and
			// selects as a click always does.
			if (groupActive) {
				leaveGroup(() => {
					clearGroup();
					selectHit(hit, true);
				});
				return;
			}
			const openId = pending ? (pending.featureId ?? NEW_SHAPE_ID) : null;
			switch (
				selectionChangeOnClick(openId, pendingDirty, hit?.id ?? null)
			) {
				case "stay":
					return;
				case "switch":
					selectHit(hit, true);
					return;
				case "ask":
					leavePending(() => selectHit(hit, true));
			}
		},
		[
			viewOnly,
			pending,
			pendingDirty,
			selectHit,
			leavePending,
			groupActive,
			leaveGroup,
			clearGroup,
		],
	);

	/** Cancel: discard the pending save's changes and deselect. */
	const cancelPending = useCallback(() => {
		endEdit();
		setPickedId(null);
		setTool("select");
	}, [endEdit, setPickedId]);

	/** Save the pending feature, when there is something to save. */
	const savePending = useCallback(() => {
		if (!pending || !pendingDirty) return;
		const name = pending.name.trim();
		if (name.length === 0) return;
		const category = CATEGORISED_FEATURE_TYPES.includes(pending.featureType)
			? pending.category
			: "";
		void confirmSave(name, pending.featureType, category);
	}, [pending, pendingDirty, confirmSave]);

	/** Ask to delete the whole feature open for editing. */
	const requestDeleteOpen = useCallback(() => {
		if (openEditId == null) return;
		const stored = shownFeatures.find(
			(f) => readFeatureId(f) === openEditId,
		);
		if (stored) requestDeleteFeature(stored);
	}, [openEditId, shownFeatures, requestDeleteFeature]);

	/**
	 * Discard the shape Draw just finished: at once while it has no name
	 * (most often a shape drawn by accident), asking first once a name is
	 * typed ({@link newShapeDiscard}).
	 */
	const discardNewShape = useCallback(() => {
		if (!pending || newShapeDiscard(pending.name) === "discard") {
			cancelPending();
			return;
		}
		leavePending(cancelPending);
	}, [pending, cancelPending, leavePending]);

	/** Escape on the open shape: cancel an edit, discard a new shape. */
	const escapeOpenShape = useCallback(() => {
		if (newShapeOpen) discardNewShape();
		else cancelPending();
	}, [newShapeOpen, discardNewShape, cancelPending]);

	/**
	 * Arm or disarm the Draw tool. Arming it closes the open edit, asking
	 * first about unsaved changes. Disarming drops a shape half drawn
	 * (terra-draw discards it when its mode stops).
	 */
	const toggleDraw = useCallback(() => {
		if (tool === "draw") {
			setTool((current) => nextMapTool(current, "toggle"));
			return;
		}
		const arm = () => {
			clearGroup();
			endEdit();
			// The pick's outline and bar have nothing to do with the shape
			// about to be drawn.
			setPickedId(null);
			setDrawPoints(0);
			setTool((current) => nextMapTool(current, "toggle"));
			// terra-draw reads its finish key (Enter) from the map: a Draw
			// button left focused would take Enter and disarm instead.
			focusMap();
		};
		if (groupActive) leaveGroup(arm);
		else leavePending(arm);
	}, [
		tool,
		leavePending,
		endEdit,
		focusMap,
		groupActive,
		leaveGroup,
		clearGroup,
		setPickedId,
	]);

	/** The hint chip's Finish: complete the line or polygon in progress. */
	const finishDrawing = useCallback(() => {
		const draw = drawRef.current;
		if (!draw || !draw.enabled) return;
		const mode = draw.getMode();
		const instance =
			mode === "linestring" || mode === "polygon"
				? finishableModesRef.current[mode]
				: null;
		instance?.onKeyUp({
			key: "Enter",
			heldKeys: [],
			preventDefault: () => {},
		});
	}, []);

	// The key of the armed Draw tool: Escape disarms, before the first point
	// or with a shape half drawn (which is dropped). Enter is terra-draw's own
	// finish key and is left to it, as is everything else while it draws.
	useEffect(() => {
		if (!drawArmed) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!shouldHandleEditorKey(event, panelId)) return;
			const target =
				event.target instanceof Element ? event.target : null;
			const action = drawKeyAction({
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				altKey: event.altKey,
				inPopup: target?.closest(KEY_POPUP_SELECTOR) != null,
			});
			if (action !== "disarm") return;
			event.preventDefault();
			setTool((current) => nextMapTool(current, "escape"));
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [drawArmed, panelId]);

	// The keys of the open shape (a stored feature, a mission asset, or one
	// Draw just finished), when the key is the map's own
	// (`editor-keys.ts`): Delete and Backspace remove the selected vertex
	// (with none selected: a mission asset goes at once, with Undo in its
	// notice; a stored feature asks; a new shape is discarded, asking once
	// it is named), Enter saves, Escape cancels an edit and discards a new
	// shape. A key typed into a field (the naming card handles its own Enter
	// and Escape) or pressed over a dialog is not for the map; neither is
	// Enter on a focused button, nor anything pressed inside an open list or
	// menu.
	const openIsMissionAsset =
		!newShapeOpen && missionAssetOf(pending?.featureId) != null;
	useEffect(() => {
		if (!shapeOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!shouldHandleEditorKey(event, panelId)) return;
			const action = editorKeyAction(keyEventOf(event), {
				vertexSelected: shownVertex != null,
				deletes: openIsMissionAsset ? "now" : "ask",
				canSave: pendingDirty,
				canUndo: canUndoHere,
				canRedo: canRedoHere,
				canEscape: true,
			});
			if (!action) return;
			event.preventDefault();
			switch (action) {
				case "undo":
				case "redo": {
					const scope = routeUndo(action, undoRouteState);
					if (scope) stepUndo(action, scope);
					return;
				}
				case "delete-vertex":
					deleteShownVertex();
					return;
				case "delete":
				case "ask-delete":
					if (newShapeOpen) discardNewShape();
					else requestDeleteOpen();
					return;
				case "save":
					savePending();
					return;
				case "escape-step":
					escapeOpenShape();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		panelId,
		shapeOpen,
		newShapeOpen,
		openIsMissionAsset,
		shownVertex,
		pendingDirty,
		canUndoHere,
		canRedoHere,
		undoRouteState,
		stepUndo,
		deleteShownVertex,
		requestDeleteOpen,
		discardNewShape,
		savePending,
		escapeOpenShape,
	]);

	// The keys of a selected group, when the key is the map's own: Delete
	// and Backspace ask to delete its features, Enter saves the card's
	// changes, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) undo and redo a
	// drag of the move (then the mission's history), and Escape drops the
	// card's changes, or with none clears the selection.
	useEffect(() => {
		if (!groupActive) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!shouldHandleEditorKey(event, panelId)) return;
			const action = editorKeyAction(keyEventOf(event), {
				deletes: "ask",
				canSave: groupDirty,
				canUndo: canUndoHere,
				canRedo: canRedoHere,
				canEscape: true,
			});
			if (!action) return;
			event.preventDefault();
			switch (action) {
				case "undo":
				case "redo": {
					const scope = routeUndo(action, undoRouteState);
					if (scope) stepUndo(action, scope);
					return;
				}
				case "delete-vertex":
				case "delete":
				case "ask-delete":
					requestDeleteGroup();
					return;
				case "save":
					void saveGroup();
					return;
				case "escape-step":
					if (groupDirty || moveArmed || liveMoveOffset)
						cancelGroupChanges();
					else clearGroup();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		panelId,
		groupActive,
		groupDirty,
		canUndoHere,
		canRedoHere,
		undoRouteState,
		stepUndo,
		moveArmed,
		liveMoveOffset,
		requestDeleteGroup,
		saveGroup,
		cancelGroupChanges,
		clearGroup,
	]);

	// Move armed: a drag anywhere on the map moves the whole group by the
	// pointer's offset (`map-group-move.ts`), shown live; the drag's end is
	// one step of the move. The map does not pan meanwhile. Pointer events
	// with capture, so a finger works as a mouse does and a release outside
	// the map still ends the drag. No snapping: a group has no one vertex
	// the operator aims with.
	const groupMoving = groupActive && moveArmed;
	useEffect(() => {
		if (!groupMoving || !mapObserved) return;
		const map = mapRef.current?.getMap();
		if (!map) return;
		const container = map.getCanvasContainer();
		map.dragPan.disable();
		container.style.cursor = "move";
		let start: [number, number] | null = null;
		let pointerId: number | null = null;
		let latest: MercatorOffset | null = null;
		let frame = 0;
		const lngLatOf = (event: PointerEvent): [number, number] => {
			const box = container.getBoundingClientRect();
			const at = map.unproject([
				event.clientX - box.left,
				event.clientY - box.top,
			]);
			return [at.lng, at.lat];
		};
		const onDown = (event: PointerEvent) => {
			if (start !== null || !event.isPrimary) return;
			if (event.pointerType === "mouse" && event.button !== 0) return;
			start = lngLatOf(event);
			pointerId = event.pointerId;
			container.setPointerCapture(event.pointerId);
		};
		const onMove = (event: PointerEvent) => {
			if (start === null || event.pointerId !== pointerId) return;
			latest = mercatorOffset(start, lngLatOf(event));
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				setLiveMoveOffset(latest);
			});
		};
		const onUp = (event: PointerEvent) => {
			if (start === null || event.pointerId !== pointerId) return;
			const step = mercatorOffset(start, lngLatOf(event));
			start = null;
			pointerId = null;
			cancelAnimationFrame(frame);
			frame = 0;
			setLiveMoveOffset(null);
			setGroupDraft((draft) => ({
				...draft,
				move: recordMoveStep(draft.move, step),
			}));
		};
		const onCancel = (event: PointerEvent) => {
			if (event.pointerId !== pointerId) return;
			start = null;
			pointerId = null;
			cancelAnimationFrame(frame);
			frame = 0;
			setLiveMoveOffset(null);
		};
		container.addEventListener("pointerdown", onDown);
		container.addEventListener("pointermove", onMove);
		container.addEventListener("pointerup", onUp);
		container.addEventListener("pointercancel", onCancel);
		container.addEventListener("lostpointercapture", onCancel);
		return () => {
			cancelAnimationFrame(frame);
			container.removeEventListener("pointerdown", onDown);
			container.removeEventListener("pointermove", onMove);
			container.removeEventListener("pointerup", onUp);
			container.removeEventListener("pointercancel", onCancel);
			container.removeEventListener("lostpointercapture", onCancel);
			container.style.cursor = "";
			map.dragPan.enable();
		};
	}, [groupMoving, mapObserved]);

	/**
	 * Map click. The Draw tool's clicks are terra-draw's. Otherwise a click
	 * selects what it hits and opens it for editing (select-first), and a
	 * click on empty map ends the selection:
	 *  - on a vertex handle of the open shape, it selects that vertex;
	 *  - on a midpoint of the open shape, it is terra-draw's (inserts one);
	 *  - on another feature or empty map, it switches, asking first when
	 *    the open edit has changes.
	 */
	const handleMapClick = useCallback(
		(event: {
			point: { x: number; y: number };
			lngLat: { lng: number; lat: number };
			originalEvent?: { shiftKey?: boolean };
		}) => {
			// The keys act on what the map shows. MapLibre keeps focus where it
			// was on a click, so a toolbar button clicked last would still
			// take Enter (terra-draw's finish key while Draw is armed).
			if (tool === "draw") {
				focusMap();
				return;
			}
			// The click that finished a new shape, arriving once the map is
			// back in select: the shape is open, and its name field keeps
			// the focus.
			if (
				performance.now() - newShapeFinishedAtRef.current <
				FINISH_CLICK_GRACE_MS
			) {
				return;
			}
			// A drag of the group move ends where it was let go; the click
			// MapLibre adds after a short one is part of it.
			if (groupMoving) return;
			focusMap();
			// Shift-click adds a feature to the selection, or takes it out.
			if (multiSelectEnabled && event.originalEvent?.shiftKey) {
				const hit = pickAt(event.point);
				if (hit && !hit.library)
					requestSelectionChange([hit.id], "toggle");
				return;
			}
			const editing = shapeOpen;
			if (editing) {
				// A click on a vertex handle of the open shape selects that
				// vertex; it is not a pick of whatever lies under it.
				const vertex = vertexAt(event.point, event.lngLat);
				setSelectedVertex(vertex);
				if (vertex) return;
			}
			const reached = editing ? openShapeAt(event.lngLat) : null;
			if (reached === "guidance") return;
			const hit = pickAt(event.point);
			// A contact is a report to read, never geometry to edit. It wins
			// over a feature under it, except while a feature is open:
			// authored geometry first then.
			const contactHit =
				hit && editing ? undefined : contactAt(event.point);
			if (selectedMission && contactHit) {
				if (!editing) setPickedId(null);
				selectContact({ missionId: selectedMission, uid: contactHit });
				return;
			}
			// Just off an open line or point, within terra-draw's reach:
			// still that shape.
			if (!hit && reached === "shape") return;
			requestSelect(hit);
		},
		[
			tool,
			shapeOpen,
			focusMap,
			selectedMission,
			pickAt,
			contactAt,
			vertexAt,
			openShapeAt,
			requestSelect,
			groupMoving,
			multiSelectEnabled,
			requestSelectionChange,
			setPickedId,
		],
	);

	// The panels ask to show a feature: the assets panel's layer list (one
	// of the map's features) and the mission's asset tree (one of its
	// assets). The map flies to it and selects it as a click would. Read
	// through a ref so each subscription is made once.
	const focusRef = useRef<{
		selectedMap: string;
		missionScope: string | null;
		shownFeatures: C2Feature[];
		missionAssets: typeof missionAssets;
		requestSelect: (hit: MapHit | null) => void;
		requestSelectionChange: (
			ids: readonly string[],
			mode: MapFeatureSelectionRequest["mode"],
		) => void;
	}>({
		selectedMap: "",
		missionScope: null,
		shownFeatures: [],
		missionAssets: null,
		requestSelect: () => {},
		requestSelectionChange: () => {},
	});
	useEffect(() => {
		focusRef.current = {
			selectedMap,
			missionScope,
			shownFeatures,
			missionAssets,
			requestSelect,
			requestSelectionChange,
		};
	}, [
		selectedMap,
		missionScope,
		shownFeatures,
		missionAssets,
		requestSelect,
		requestSelectionChange,
	]);
	// The panel's checkboxes ask to change the selection.
	useEffect(
		() =>
			subscribeFeatureSelectionRequests((request) => {
				const current = focusRef.current;
				if (request.map !== current.selectedMap) return;
				current.requestSelectionChange(
					request.featureIds,
					request.mode,
				);
			}),
		[],
	);
	const flyToFeature = useCallback((feature: C2Feature, minZoom: number) => {
		const center = assetCenter(feature);
		const map = mapRef.current?.getMap();
		if (center && map) {
			map.flyTo({
				center,
				zoom: Math.max(map.getZoom(), minZoom),
				duration: 600,
			});
		}
	}, []);
	useEffect(
		() =>
			subscribeMapFeatureFocus((request) => {
				const current = focusRef.current;
				if (request.map !== current.selectedMap) return;
				const feature = current.shownFeatures.find(
					(f) => readFeatureId(f) === request.featureId,
				);
				if (!feature) return;
				flyToFeature(feature, 16);
				current.requestSelect({
					id: request.featureId,
					feature,
					library: false,
				});
			}),
		[flyToFeature],
	);
	useEffect(
		() =>
			subscribeAssetFocus((request) => {
				const current = focusRef.current;
				if (!current.missionScope) return;
				if (request.missionId !== current.missionScope) return;
				const feature = current.missionAssets
					? findAsset(current.missionAssets, request.featureId)
					: undefined;
				if (!feature) {
					setPickedId(request.featureId);
					return;
				}
				flyToFeature(feature, 17);
				current.requestSelect({
					id: request.featureId,
					feature,
					library: false,
				});
			}),
		[flyToFeature, setPickedId],
	);

	const pickedFeature = useMemo(
		() =>
			shownFeatures.find((f) => readFeatureId(f) === pickedId) ??
			libraryFeatures.find((f) => readFeatureId(f) === pickedId) ??
			null,
		[shownFeatures, libraryFeatures, pickedId],
	);
	/** The picked feature is the map's, shown as a library in a mission. */
	const pickedIsLibrary =
		pickedFeature != null &&
		!shownFeatures.some((f) => readFeatureId(f) === pickedId);

	// The keys with nothing open and nothing armed, when the key is the map's
	// own: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) take a step in the
	// mission's history, Delete and Backspace delete the picked feature (a
	// mission asset at once, a stored feature after a question; never a
	// library feature, nor anything in View), Escape lets go of the pick.
	const idleDeletes =
		pickedFeature && !viewOnly && !pickedIsLibrary
			? missionAssetOf(pickedId) != null
				? ("now" as const)
				: ("ask" as const)
			: null;
	useEffect(() => {
		if (shapeOpen || groupActive || drawArmed) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!shouldHandleEditorKey(event, panelId)) return;
			const action = editorKeyAction(keyEventOf(event), {
				deletes: idleDeletes,
				canUndo: canUndoHere,
				canRedo: canRedoHere,
				canEscape: pickedId != null,
			});
			if (!action) return;
			event.preventDefault();
			switch (action) {
				case "undo":
				case "redo": {
					const scope = routeUndo(action, undoRouteState);
					if (scope) stepUndo(action, scope);
					return;
				}
				case "delete":
				case "ask-delete":
					if (pickedFeature) requestDeleteFeature(pickedFeature);
					return;
				case "escape-step":
					setPickedId(null);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		panelId,
		shapeOpen,
		groupActive,
		drawArmed,
		idleDeletes,
		canUndoHere,
		canRedoHere,
		pickedId,
		pickedFeature,
		undoRouteState,
		stepUndo,
		requestDeleteFeature,
		missionScope,
		setPickedId,
	]);

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

	// Whether the working mission would pass validation; drives the Save button's
	// disabled state so an invalid save is unreachable.
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

	// Who the mission allocates, read off the behaviour GRAPH — the single
	// author of the allocation. `draft.vehicles` is the graph's COMPILED output
	// and is deliberately not read here: it is stale until the operator applies
	// the graph, and reading it would put a second answer on screen.
	const missionGraph = useMissionGraph(selectedMission);
	// What a selection in another panel relates to on this map (the assets
	// and features the node editor's selected nodes target): outlined
	// dashed, never picked, and the camera stays where it is.
	const relatedAssetIds = useRelatedIds(
		"asset",
		"map",
		missionScope,
		missionGraph,
		missionAssets,
		missionAssets?.map,
	);
	const relatedFeatureIds = useRelatedIds(
		"map-feature",
		"map",
		missionScope,
		missionGraph,
		missionAssets,
		missionAssets?.map,
	);
	const relatedFeatures = useMemo(() => {
		if (relatedAssetIds.length === 0 && relatedFeatureIds.length === 0)
			return NO_FEATURES;
		const ids = new Set([...relatedAssetIds, ...relatedFeatureIds]);
		const seen = new Set<string>();
		return [
			...(missionAssets?.features ?? []),
			...shownFeatures,
			...libraryFeatures,
		].filter((f) => {
			const id = readFeatureId(f) ?? "";
			if (!ids.has(id) || seen.has(id)) return false;
			seen.add(id);
			return true;
		});
	}, [
		relatedAssetIds,
		relatedFeatureIds,
		missionAssets,
		shownFeatures,
		libraryFeatures,
	]);
	// The marker's allocated state. `hasAgentNode` is the seam the graph module
	// exports for exactly this question — never a local re-derivation, so the
	// marker and the node editor can never disagree about what is allocated.
	const isAgentAllocated = useCallback(
		(agentId: string) =>
			missionGraph != null && hasAgentNode(missionGraph, agentId),
		[missionGraph],
	);

	// Robot allocation by clicking agent markers is the PRIMARY affordance, active
	// only while a mission is being edited and not read-only. It writes the
	// GRAPH; an unloaded graph slot is reported by the handler rather than
	// disabling the marker, so the operator learns why instead of clicking a
	// dead dot.
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
			{...editorPanelProps("map", panelId)}
		>
			{/* The open mission's contacts, from the fog — renders nothing. */}
			{props.missionContactsDef && selectedMission && (
				<MissionContactsWatch
					missionId={selectedMission}
					def={props.missionContactsDef}
				/>
			)}
			{/* Findings ingest — renders nothing. Subscribes through the
			    datasource subscription registry (lossless), NOT through the
			    live overlay's `LocalDataSourcesProvider`, which coalesces to
			    the latest value per drain tick. */}
			<FindingsIngest bindings={findingsBindings} />
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
				    be mistaken for editing one feature. When the map
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
								? "View only"
								: "Plan approved: view only"
							: "Authoring on"
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

				{/* The mission's one history, shared with the node editor;
				    an open shape's own steps come first. Kept while the plan
				    is approved, disabled. */}
				{missionScope && (
					<>
						<Button
							size="icon-sm"
							variant="ghost"
							className="any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
							aria-label="Undo"
							title={
								undoHereLabel
									? `Undo: ${undoHereLabel} (Ctrl+Z)`
									: "Undo (Ctrl+Z)"
							}
							disabled={busy || !canUndoHere}
							onClick={() => pressUndo("undo")}
						>
							<Undo2 />
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							className="any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
							aria-label="Redo"
							title={
								redoHereLabel
									? `Redo: ${redoHereLabel} (Ctrl+Shift+Z)`
									: "Redo (Ctrl+Shift+Z)"
							}
							disabled={busy || !canRedoHere}
							onClick={() => pressUndo("redo")}
						>
							<Redo2 />
						</Button>
					</>
				)}

				{/* Draw, and what is open. There is no tool to arm for
				    anything else: a click on a feature selects it and opens
				    it for editing. The label keeps its width when empty, so
				    opening a feature never re-wraps the toolbar. */}
				{!viewOnly && (
					<>
						<Separator
							orientation="vertical"
							className="data-[orientation=vertical]:h-6"
						/>
						{/* Armed: the primary fill, the same size and label, so
						    the toolbar never moves. */}
						<Button
							size="sm"
							variant={drawArmed ? "default" : "outline"}
							aria-pressed={drawArmed}
							disabled={!canEdit}
							onClick={toggleDraw}
						>
							<PenLine />
							Draw
						</Button>
						{/* On by default; kept per browser. Holding Alt
						    (Option) bypasses it, which needs a keyboard, so
						    this is the control. */}
						<Button
							size={compactToolbar ? "icon-sm" : "sm"}
							variant={snapEnabled ? "secondary" : "outline"}
							aria-pressed={snapEnabled}
							aria-label="Snap"
							title={
								snapEnabled
									? `Snap on. Hold ${snapBypassKey} to place freely.`
									: "Snap off"
							}
							onClick={toggleSnap}
						>
							<Magnet
								className={
									snapEnabled ? "text-primary" : undefined
								}
							/>
							{compactToolbar ? null : "Snap"}
						</Button>
						<span
							role="status"
							className={`truncate text-xs text-muted-foreground ${compactToolbar ? "w-24" : "w-40"}`}
							title={editLabel || undefined}
						>
							{editLabel || null}
						</span>
					</>
				)}

				{/* Shape buttons — the geometry the Draw tool authors. In map-editor it
				    is constrained by the feature_type (road → line only, hidden;
				    geofence/risk → polygon or rectangle); in mission the operator
				    chooses freely (point / line / polygon / rectangle). */}
				{/* Always rendered, hidden (not removed) when the type has one
				    shape: adding and removing the group re-wrapped the toolbar
				    and moved the map under the pointer (usability test
				    2026-11-12). */}
				{!viewOnly && (
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						aria-label="Draw shape"
						aria-hidden={
							availableShapes.length > 1 ? undefined : true
						}
						disabled={availableShapes.length <= 1}
						className={
							availableShapes.length > 1 ? undefined : "invisible"
						}
						value={
							availableShapes.includes(drawShape)
								? drawShape
								: effectiveShape
						}
						onValueChange={(value) => {
							if (value) setDrawShape(value as DrawShape);
						}}
					>
						{(availableShapes.length > 1
							? availableShapes
							: (["polygon", "rectangle"] as DrawShape[])
						).map((shape) => (
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

				{/* The asset row renders in BOTH contexts: a mission's objectives
				    are map assets now, so the map picker, the feature-type
				    picker and the import affordances are how an operator
				    authors for a mission too. */}
				<>
					<Select
						value={selectedMap || undefined}
						onValueChange={pickMap}
						disabled={missionMapFixed}
					>
						<SelectTrigger
							size="sm"
							className="w-44 max-w-full"
							title={
								missionMapFixed
									? "Map locked to this mission"
									: undefined
							}
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
								title={
									missionMapFixed
										? "Map locked to this mission"
										: undefined
								}
								disabled={
									busy ||
									!props.mapsCreateDef ||
									missionMapFixed
								}
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
									!props.mapsDeleteDef ||
									missionMapFixed
								}
								title={
									missionMapFixed
										? "Map locked to this mission"
										: "Delete map"
								}
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
							{/* A Select, not a ToggleGroup: the C2 now
							    accepts six feature types (the three asset
							    types — waypoint, zone, cue — joined the
							    three terrain ones), and six labelled
							    toggles push every control to their right
							    off a laptop-width toolbar. The map picker
							    beside it is already a Select, so this is
							    the toolbar's existing vocabulary for "one
							    of a list". */}
							<Select
								value={mapFeatureType}
								onValueChange={(value) => {
									if (isFeatureType(value))
										setMapFeatureType(value);
								}}
							>
								<SelectTrigger
									size="sm"
									className="w-40 max-w-full"
									aria-label="Feature type to draw"
								>
									<SelectValue placeholder="Feature type" />
								</SelectTrigger>
								<SelectContent>
									{FEATURE_TYPES.map((type) => (
										<SelectItem key={type} value={type}>
											{FEATURE_TYPE_LABELS[type]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
													Import risk from buildings
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
					{context === "mission" && (
						<Badge variant="secondary">
							{missionGeometryFc.features.length} objectives
						</Badge>
					)}
				</>

				<PlannerStatusBadge status={plannerStatus} />

				{/* What the findings pipeline has on the map, and what it could
				    not place. The dropped count is shown rather than hidden:
				    `lossless` is a request the datasource may not honour, and a
				    findings layer that is quietly short is the failure this
				    pipeline exists to avoid. */}
				<FindingsReadout
					cueFeatures={shownFeatures}
					bound={findingsBound}
					missionId={selectedMission}
				/>

				<Button
					size="sm"
					variant={overlaysOpen ? "secondary" : "outline"}
					className="ml-auto"
					aria-pressed={overlaysOpen}
					onClick={() => setOverlaysOpen((open) => !open)}
				>
					<Layers />
					Layers
					{activeLayerCount > 0 && (
						<Badge variant="secondary" className="px-1">
							{activeLayerCount}
						</Badge>
					)}
				</Button>
			</div>

			{/* Mission: save. Geometry is no longer picked or edited here — an
			    objective is a graph node pointing at a map asset, so there is
			    nothing on this row but the write. */}
			{context === "mission" && selectedMission && !viewOnly && (
				<div className="flex min-w-0 items-center gap-2 px-2 py-1 shrink-0 border-b bg-muted/40 text-xs">
					<div className="ml-auto flex shrink-0 items-center gap-1">
						<Button
							size="sm"
							variant="outline"
							disabled={
								busy ||
								missionConfig == null ||
								!missionSubmittable
							}
							title={
								missionSubmittable
									? SAVE_MISSION_TITLE
									: "Fix the errors below first"
							}
							onClick={() => void saveMission()}
						>
							<Save />
							Save mission
						</Button>
					</div>
				</div>
			)}

			{/* Map */}
			<div className="relative flex-1 min-h-0">
				{/* Transient bars (errors, hints, the picked asset, mission
				    issues) float over the map instead of being stacked above it:
				    inserting them above the map moved it under the pointer
				    (usability test 2026-11-12). */}
				<div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex max-w-[min(42rem,calc(100%-1rem))] flex-col items-stretch gap-1 [&>*]:pointer-events-auto [&>*]:rounded-md [&>*]:border [&>*]:shadow-sm [&>*]:backdrop-blur">
					{osmProgress && (
						<div
							role="status"
							className="flex items-center gap-2 text-xs bg-background/95 px-2 py-1"
						>
							<Loader2 className="size-3.5 animate-spin" />
							{osmProgress}
						</div>
					)}
					{error && (
						<div className="text-xs text-destructive bg-background/95 border-destructive/40 px-2 py-1 shrink-0">
							{error}
						</div>
					)}
					<UndoNoticeBar
						notice={undoNotice}
						missionId={missionScope}
						frozen={viewOnly}
						onDismiss={() => setUndoNotice(null)}
						className="bg-background/95 px-2 py-0.5 shrink-0"
					/>

					{/* Context hint when authoring is gated off. */}
					{!selectedMap && (
						<div className="text-xs text-muted-foreground bg-background/95 px-2 py-1 shrink-0">
							Select or create a map to draw and manage its
							assets.
						</div>
					)}
					{context === "mission" && !selectedMission && (
						<div className="text-xs text-muted-foreground bg-background/95 px-2 py-1 shrink-0">
							Select a mission to allocate agents and save it.
						</div>
					)}

					{/* Why half the asset row greyed out. The controls carry the same
			    reason on a `title`, but a disabled Button is
			    `pointer-events-none`, so that tooltip never opens — an
			    operator who did not turn them off has nothing to hover and no
			    way to tell a locked toolbar from a broken one. */}
					{missionMapFixed && !viewOnly && (
						<div className="text-xs text-muted-foreground bg-background/95 px-2 py-1 shrink-0">
							Map locked to this mission. Close the mission to
							change it.
						</div>
					)}

					{/* Picked, but not open for editing: a library asset (in a
					    mission, the map's own assets are imported, never
					    edited) or a feature whose geometry cannot be loaded
					    into the editor. Anything else opens on the click, and
					    its card carries the actions. */}
					{pickedFeature &&
						!viewOnly &&
						pickedId !== openEditId &&
						(pickedIsLibrary ||
							c2FeatureToDrawFeature(pickedFeature) == null) && (
							<div className="flex items-center gap-2 px-2 py-1 shrink-0 bg-background/95 text-xs">
								<span
									className="truncate flex-1"
									title={pickedId ?? ""}
								>
									Picked:{" "}
									{pickedFeature.properties?.name ?? pickedId}{" "}
									(
									{pickedFeature.properties?.feature_type ??
										"?"}
									{readFeatureCategory(pickedFeature)
										? ` · ${readFeatureCategory(pickedFeature)}`
										: ""}
									)
								</span>
								{pickedIsLibrary ? (
									<Button
										size="sm"
										variant="outline"
										title="Copy into the mission"
										onClick={() =>
											importIntoMission(pickedFeature)
										}
									>
										Import into mission
									</Button>
								) : (
									<Button
										size="icon-sm"
										variant="outline"
										className="text-destructive"
										title="Delete feature"
										aria-label="Delete feature"
										disabled={busy}
										onClick={() =>
											requestDeleteFeature(pickedFeature)
										}
									>
										<Trash2 />
									</Button>
								)}
								<Button
									size="icon-sm"
									variant="ghost"
									className="any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
									title="Deselect (Escape)"
									aria-label="Deselect"
									onClick={() => setPickedId(null)}
								>
									<X />
								</Button>
							</div>
						)}

					{/* Mission validation errors (blocking). */}
					{context === "mission" && missionErrorIssues.length > 0 && (
						<div className="text-xs text-destructive bg-background/95 border-destructive/40 px-2 py-1 shrink-0 space-y-0.5">
							{missionErrorIssues.map((issue, i) => (
								<div key={`${issue.path}-${i}`}>
									<span className="font-medium">
										{issue.path}
									</span>
									: {issue.message}
								</div>
							))}
						</div>
					)}

					{/* Geofence advisory (non-blocking): objectives outside the loaded
			    geofences would give the planner no routable nodes there. */}
					{context === "mission" &&
						objectivesOutsideGeofenceIndices.length > 0 && (
							<div className="text-xs text-foreground border-warning/40 bg-background/95 px-2 py-1 shrink-0 space-y-0.5">
								{objectivesOutsideGeofenceIndices.map(
									(index) => (
										<div key={`outside-geofence-${index}`}>
											<span className="font-medium">
												Objective #{index + 1}
											</span>{" "}
											is outside the geofence and will
											fail to plan. Draw it inside a
											geofence.
										</div>
									),
								)}
							</div>
						)}
				</div>
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
				{/* The next step while Draw is armed, over the top edge of
				    the map, clear of the corners the edit card and the
				    layers panel own. It floats, so arming never moves the
				    map. A line or a polygon carries Finish: a double-click
				    is unreliable on touch. */}
				{drawArmed && (
					<div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex justify-center">
						<div
							role="status"
							aria-label="Draw"
							className="pointer-events-auto flex max-w-full items-center gap-2 rounded-md border bg-background/95 px-2 py-1 text-xs text-foreground shadow-sm backdrop-blur"
						>
							<PenLine className="size-3.5 shrink-0 text-primary" />
							<span>{drawHint(effectiveShape)}</span>
							{takesFinishButton(effectiveShape) && (
								<Button
									size="sm"
									variant="outline"
									className="h-7 shrink-0 any-pointer-coarse:min-h-11"
									disabled={
										!canFinishDrawing(
											effectiveShape,
											drawPoints,
										)
									}
									onClick={finishDrawing}
								>
									<Check />
									Finish
								</Button>
							)}
						</div>
					</div>
				)}
				{/* The ONE route a drawn shape takes, in both contexts. */}
				{pending && !viewOnly && (
					<SavePrompt
						// Remounted per pending feature, so nothing of the
						// previous one's form survives.
						key={pending.featureId ?? "new"}
						title={
							pending.featureId != null
								? pending.original?.name.trim() ||
									FEATURE_TYPE_LABELS[pending.initialType]
								: "Save map asset"
						}
						name={pending.name}
						featureType={pending.featureType}
						initialType={pending.initialType}
						category={pending.category}
						initialCategory={pending.original?.category ?? ""}
						onChange={(patch) =>
							setPending((prev) =>
								prev === null ? null : { ...prev, ...patch },
							)
						}
						editing={pending.featureId != null}
						canSave={pendingDirty && pending.name.trim().length > 0}
						busy={busy}
						onSave={savePending}
						onCancel={cancelPending}
						onDelete={
							pending.featureId != null
								? requestDeleteOpen
								: undefined
						}
						onEscape={escapeOpenShape}
						onUndo={() => stepHistory("undo")}
						onRedo={() => stepHistory("redo")}
						canUndo={undoable}
						canRedo={redoable}
						side={overlaysOpen ? "left" : editCardPlacement}
						cardRef={editCardRef}
						focusName={pending.featureId == null}
					/>
				)}
				{/* Several features selected: what applies to all of them,
				    in the edit card's place. */}
				{groupActive && (
					<GroupCard
						count={groupIds.length}
						lockedCount={groupSplit.locked.length}
						hiddenCount={groupSplit.hidden.length}
						typeValue={groupTypeValue}
						legalTypes={groupLegalTypes}
						onType={(featureType) =>
							setGroupDraft((draft) => ({
								...draft,
								featureType,
							}))
						}
						showCategory={groupShowCategory}
						categoryValue={groupCategoryValue}
						categoryOptions={groupCategoryChoices}
						onCategory={(category) =>
							setGroupDraft((draft) => ({ ...draft, category }))
						}
						actions={groupActionState}
						moveArmed={moveArmed}
						onToggleMove={() => {
							setMoveArmed((armed) => !armed);
							setLiveMoveOffset(null);
						}}
						canUndo={groupDraft.move.steps.length > 0}
						canRedo={groupDraft.move.undone.length > 0}
						onUndo={() => stepGroupMove("undo")}
						onRedo={() => stepGroupMove("redo")}
						dirty={groupDirty}
						busy={busy}
						onSave={() => void saveGroup()}
						onCancel={cancelGroupChanges}
						onDelete={requestDeleteGroup}
						onClear={() => leaveGroup(clearGroup)}
						side={overlaysOpen ? "left" : editCardPlacement}
						cardRef={editCardRef}
					/>
				)}
				{overlaysOpen && (
					<LiveLayersPanel
						mapLayers={raster.layers}
						mapRef={mapRef}
						rainviewer={rainviewer}
						onToggleRainviewer={toggleRainviewer}
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
					transformRequest={raster.transformRequest}
					onError={handleMapError}
					onLoad={handleMapLoad}
					onClick={handleMapClick}
					// A double-click finishes a line or a polygon while Draw
					// is armed; it must not also zoom.
					doubleClickZoom={!drawArmed}
					// MapLibre's Shift-drag box zoom swallows every
					// Shift-click, which selects here.
					boxZoom={!multiSelectEnabled}
					style={{ width: "100%", height: "100%" }}
				>
					{/* North indicator + ground scale. Always on: rotation is
					    enabled here and nothing else says which way is north,
					    and past the basemap's own tile depth the imagery is
					    overzoomed, so its detail no longer indicates distance
					    either. Bottom-right, one row up: both panels own the
					    top corners and MapLibre's attribution owns the bottom
					    edge. */}
					{/* The legend for the robot lines rides in the same
					    column, above the chrome, so neither covers the
					    attribution under them. */}
					<div className="pointer-events-none absolute right-2 bottom-9 z-10 flex select-none flex-col items-end gap-1.5">
						<RouteLegend />
						<MapChrome className="pointer-events-none select-none" />
					</div>
					{/* Both feature layers always render, in distinct styles. */}
					<LibraryLayers features={renderedLibraryFeatures} />
					<FeatureLayers
						features={displayFeatures}
						selectedId={pickedId}
					/>
					{/* What another panel's selection relates to. */}
					{relatedFeatures.length > 0 && (
						<RelatedSelectionLayer features={relatedFeatures} />
					)}
					{/* The selected group, outlined over the features. */}
					{groupActive && (
						<GroupSelectionLayer features={groupOutline} />
					)}
					<MissionFeatureLayers geometries={missionGeometryFc} />
					{/* Mounts after terra-draw's layers exist, so the ring
					    draws over the vertex handle it marks. */}
					{shownVertex && (
						<SelectedVertexLayer position={shownVertex.position} />
					)}
					{/* Mounts only while a snap shows, so it draws over
					    terra-draw's handles too. */}
					<SnapIndicatorLayer store={snapIndicator} />
					{/* Everything below stacks under "c2-features-fill"
					    (directly, or as the live-resolved fallback), so it
					    mounts after FeatureLayers, which adds it: a direct
					    `beforeId` the map does not contain yet throws. */}
					{/* Planner navigation graph: faint backdrop UNDER the
					    operator's features (beforeId). */}
					{plannerGraph && plannerGraphFc && (
						<PlannerGraphLayer data={plannerGraphFc} />
					)}
					{/* Radar above the map-server stack: the stack sits under
					    the radar's own anchor while it is on. */}
					{rainviewer && (
						<RainviewerOverlay beforeIds={OVERLAY_BEFORE_IDS} />
					)}
					{/* Declarative children: a layer change never touches the
					    style object, so terra-draw's layers survive. */}
					<RasterOverlayLayers
						layers={raster.layers}
						beforeIds={
							rainviewer
								? [RAINVIEWER_ANCHOR_ID, ...OVERLAY_BEFORE_IDS]
								: OVERLAY_BEFORE_IDS
						}
					/>
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
					{/* Cues, contacts and items — ONE layer, because they are
					    one record at different support depths. Operator-placed
					    `cue` map features are lifted into the same record and
					    drawn here, which is why `FeatureLayers` skips them. */}
					<FindingsLayer
						cueFeatures={shownFeatures}
						missionId={selectedMission}
					/>
					<MissionContactPopup missionId={selectedMission} />
					{trajectoryAgentIds.length > 0 && (
						<AgentTrajectoryOverlay
							fallbackSource={localizationFallbackSource}
							agentIds={trajectoryAgentIds}
						/>
					)}
					<AgentLocalizationOverlay
						fallbackSource={localizationFallbackSource}
						selectable={markersSelectable}
						isAllocated={isAgentAllocated}
						onSelectAgent={toggleMissionAgent}
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
								isAllocated={isAgentAllocated}
								onSelectAgent={toggleMissionAgent}
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
				<AlertDialogContent
					onCloseAutoFocus={(event) => {
						// A question asked over an open edit (discard, delete)
						// hands the keyboard back to the map, not to whatever
						// button was focused before it: Enter there would
						// press that button.
						if (openEditId == null && !groupActive) return;
						event.preventDefault();
						focusMap();
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmState?.title}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmState?.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{confirmState?.cancelLabel ?? "Cancel"}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								confirmState?.onConfirm();
								setConfirmState(null);
							}}
						>
							{confirmState?.confirmLabel ?? "Delete"}
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
				noGraph ? undefined : (status.note ?? status.mode ?? undefined)
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
	const missionContactsDef = useMemo(
		() => findCall(calls, C2Call.MissionContacts),
		[calls],
	);

	if (!mapsListDef) {
		return (
			<PanelEmptyState>
				No C2 datasource. Add a C2 Control datasource.
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
			missionContactsDef={missionContactsDef}
			feedbackTopic={props.feedbackTopic}
			agentTopic={props.agentTopic}
			observationTopic={props.observationTopic}
			mapLayers={props.mapLayers}
		/>
	);
};

/**
 * Widget definition for the mission map widget.
 * @returns Widget definition.
 */
export function MissionMapDefinition(): WidgetDefinition<MissionMapProps> {
	// The mission-control page seeds its panels by calling this factory from
	// OUTSIDE render, so it must stay hook-free. It returns JSX (`icon`), which
	// is enough for the React Compiler to take it for a component and give it a
	// `useMemoCache` call — the dev build does exactly that, and the page then
	// dies on "Invalid hook call" before it can apply its layout. Opt out.
	"use no memo";
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
					writeOnly: true,
				},
				defaultMap: {
					type: "string",
					title: "Default map",
				},
				datasource_id: c2DatasourceProperty(),
				mapLayers: mapLayersProperty({ title: "Map layers" }),
				feedbackTopic: {
					type: "object",
					title: "Mission feedback topic",
				},
				agentTopic: {
					type: "object",
					title: "Edge feedback topic",
				},
				observationTopic: {
					type: "object",
					title: "Contacts topic",
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
					scope: "#/properties/mapLayers",
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
				// `payload_msgs/msg/Finding` has no webapp type and no
				// converter, so — exactly as with `c2_msgs/msg/MissionFeedback`
				// above — the slot accepts nothing by webapp type and claims the
				// raw schema name, which is what makes the topic bindable at
				// all. Both channels carry the same message; which one a
				// finding arrived on is provenance, never the classifier.
				{
					type: "TopicSelect",
					scope: "#/properties/observationTopic",
					options: {
						dataRequirements: {
							accepts: [],
							acceptsRaw: [FINDING_RAW_TYPE],
						},
					},
				} as TopicSelectElement,
			],
		} as VerticalLayout,

		data: {
			title: "Mission Map",
			mapUrl: DEFAULT_MAP_URL,
			mapLayers: [],
		},
		Component: MissionMapWidget,
	} as WidgetDefinition<MissionMapProps>;
}
