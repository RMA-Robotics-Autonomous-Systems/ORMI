"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	RemoteCallDefinition,
	useAvailableRemoteCalls,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import {
	Background,
	Controls,
	Handle,
	Position,
	ReactFlow,
	ReactFlowProvider,
	addEdge,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type NodeProps,
	type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	Bot,
	GitBranch,
	Loader2,
	MapPin,
	RefreshCw,
	Save,
	Trash2,
	Workflow,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import {
	hasMapFeatures,
	publishMapFeatures,
	useMapAssetFeatures,
	useMapFeatureTypes,
	useMapFeatures,
	type CatalogFeature,
} from "../state/c2-catalog-store";
import { useAgents } from "../state/c2-agents-store";
import { useMissionFeedbackExact } from "../state/mission-feedback-store";
import {
	editMissionDraft,
	useMissionDraft,
} from "../state/mission-draft-store";
import {
	commitSavedGraph,
	editMissionGraph,
	getMissionGraph,
	hasMissionGraph,
	missionGraphSignature,
	setMissionGraph,
	useMissionGraph,
	useMissionGraphDirty,
} from "../state/mission-graph-store";
import { useActiveMap, useSelectedMission } from "../state/selection-store";
import type { C2Feature } from "../types/c2-types";
import { readFeatureId } from "./feature-geojson";
import {
	applySelectionChanges,
	formatCondition,
	programMarks,
	resolveGraphDraftWrite,
	type RunMark,
	type RunTone,
	shouldHandleGraphShortcut,
	sortIssuesBySeverity,
} from "./mission-graph-editor-helpers";
import {
	CONDITION_OPS,
	CONDITION_OP_SHAPE,
	GRAPH_ACTIONS,
	SENSOR_MODALITIES,
	addAgentNode,
	buildGraphDocument,
	compileMissionGraph,
	emptyMissionGraph,
	freshGraphId,
	graphCompiles,
	graphDocId,
	nextNodePosition,
	normalizeCondition,
	propagateAgents,
	readGraphDocument,
	type ConditionOp,
	type GraphAction,
	type GraphCondition,
	type GraphNodeKind,
	type MissionGraph,
	type MissionGraphEdge,
	type MissionGraphIssue,
	type MissionGraphNode,
} from "./mission-graph";
import { PanelEmptyState } from "./panel-empty-state";
import { useAsyncAction } from "./use-async-action";

/**
 * The mission behaviour-graph editor.
 *
 * ## What it is for
 *
 * The target scenario is two survey agents sweeping zones while one effector
 * agent holds at a waypoint and is dispatched when a finding comes in. None of
 * that fits in a `MissionConfig`, which has a vehicle list and an
 * objective-geometry list and no way to say "then", "when" or "who". So the
 * graph is authored here, **compiled** down to the two fields the C2 can carry
 * (`mission-graph.ts`), and **persisted whole** as a sibling document for the
 * fog, which is where conditions and branching are evaluated. Everything the
 * compiler cannot express is reported to the operator rather than quietly
 * dropped.
 *
 * ## The rules it is built on
 *
 * - **A node names an asset by `feature_id` and never carries coordinates.**
 *   Zones, waypoints and cues are assets and live in the map; the graph
 *   references them. Two homes for one geometry is two answers to "where".
 * - **The graph is the SOLE AUTHOR of the mission's allocation.** `vehicles`,
 *   `objective.geometries`, `behavior` and the C2's `graph_compiles` gate are
 *   written into the shared draft as the operator authors, with no button in
 *   between. There used to be one — "Apply to mission" — and it was the seam
 *   that made an authored agent node not count: the mission was refused for
 *   having no agent while the agent was on screen. The mission map has given up
 *   its claim on the same three fields; a second writer would bring the bug
 *   straight back, because whichever wrote last would win and nothing on screen
 *   would say which.
 * - **The graph is never a field on the mission draft.** `InitMission.srv`
 *   caps `mission_config` at 10 000 characters and the whole draft rides into
 *   it. The mission carries a `graph_ref` string, two scalars and the bounded
 *   allocation the C2 carries anyway; the graph is its own document. See
 *   `state/mission-graph-store.ts`.
 * - **Agent assignment flows along "then" edges** to everything reachable, so
 *   it is stated once at the head of a branch. Data edges carry values, not
 *   assignment — consuming a finding is not being commanded by whoever found
 *   it.
 * - **Free text is for names.** The node label and the mission name are typed;
 *   an action comes from `GRAPH_ACTIONS`, a condition is built field by field
 *   off `CONDITION_OP_SHAPE`, and an edge channel is picked. A control that
 *   lets an operator type a value nothing downstream recognises fails silently.
 * - **The asset list tracks the map.** The features come from the shared
 *   catalogue the mission map publishes on every fetch, scoped to ONE map, so
 *   drawing a zone on the map beside it reaches this dropdown with no refresh.
 *   The editor still fetches for itself when nothing has published that map —
 *   the two panels are independent and each has to work alone.
 */

/** Props for the mission-graph editor widget. */
interface MissionGraphEditorProps extends Record<string, unknown> {
	title: string;
	/** Map whose features are offered as assets; empty → the shared active map. */
	defaultMap?: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
}

/** Resolve a C2 call definition by name. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

/** What the canvas needs from a node, beyond xyflow's own fields. */
interface CanvasNodeData extends Record<string, unknown> {
	node: MissionGraphNode;
	/** Agents that reach this node along "then" edges — the propagated set. */
	assigned: string[];
	/** Human name per agent id, resolved once by the parent. */
	agentNames: Record<string, string>;
	/** Human name for the referenced feature, when known. */
	featureName: string;
	/**
	 * The condition rendered as a phrase, resolved once by the parent.
	 *
	 * A `GraphCondition` is an OBJECT — putting one in JSX renders nothing and
	 * fails typecheck — and the card has no access to the id→name maps needed
	 * to render it honestly, so the parent formats it.
	 */
	conditionText: string;
	/** Where the running mission is on this node (the fog's `program`). */
	run?: RunMark;
}

/** Ring + text colour of a node's live mark. */
const RUN_STYLE: Record<RunTone, { ring: string; text: string }> = {
	running: { ring: "ring-2 ring-info", text: "text-info" },
	starting: {
		ring: "ring-1 ring-muted-foreground/50",
		text: "text-muted-foreground",
	},
	waiting: { ring: "ring-2 ring-warning", text: "text-warning" },
	done: { ring: "ring-1 ring-success/60", text: "text-success" },
	failed: { ring: "ring-2 ring-destructive", text: "text-destructive" },
};

/** Icon + accent per node kind. */
const KIND_STYLE: Record<
	GraphNodeKind,
	{ label: string; border: string; icon: typeof Bot }
> = {
	agent: { label: "Agent", border: "border-l-info", icon: Bot },
	asset: { label: "Asset", border: "border-l-success", icon: MapPin },
	action: { label: "Action", border: "border-l-warning", icon: Zap },
	condition: {
		label: "Condition",
		border: "border-l-destructive",
		icon: GitBranch,
	},
};

/** Execution handles take the foreground colour; data handles the info accent. */
const EXEC_HANDLE_STYLE = {
	background: "var(--foreground)",
	borderColor: "var(--background)",
} as const;
const DATA_HANDLE_STYLE = {
	background: "var(--info)",
	borderColor: "var(--background)",
} as const;

/**
 * One node on the canvas.
 *
 * Module-level and stable, both because xyflow keys its internal renderer on
 * `nodeTypes` identity and for the same reason widget components are
 * (AGENTS.md pattern 10): a fresh component identity remounts every node on
 * every render, which on a canvas also resets the drag.
 *
 * Four handles, and which pair a drag starts from is what decides the edge
 * kind — left/right are execution ("then"), top/bottom are data. That is the
 * whole edge-typing UI: an operator drags from the side that means what they
 * meant, and nothing has to be picked from a menu afterwards.
 */
function GraphNodeCard({ data, selected }: NodeProps) {
	const { node, assigned, agentNames, featureName, conditionText, run } =
		data as CanvasNodeData;
	const runStyle = run ? RUN_STYLE[run.tone] : null;
	const style = KIND_STYLE[node.kind];
	const Icon = style.icon;

	const detail =
		node.kind === "agent"
			? node.agent_id
				? (agentNames[node.agent_id] ?? node.agent_id)
				: "no agent selected"
			: node.kind === "asset"
				? node.feature_id
					? featureName || node.feature_id
					: "no feature selected"
				: node.kind === "action"
					? node.action || "no action named"
					: conditionText;

	const incomplete =
		(node.kind === "agent" && !node.agent_id) ||
		(node.kind === "asset" && !node.feature_id) ||
		(node.kind === "action" && !node.action) ||
		(node.kind === "condition" && !node.condition);

	return (
		<div
			className={`rounded-md border border-l-4 bg-background px-2.5 py-1.5 text-xs shadow-sm min-w-40 max-w-56 ${style.border} ${
				selected ? "ring-2 ring-ring" : (runStyle?.ring ?? "")
			} ${incomplete ? "border-dashed" : ""}`}
		>
			{/* Execution in / out (left ⇄ right), then data in / out
			    (top ⇄ bottom). The handle colours are INLINE STYLES reading
			    the raw theme tokens, not Tailwind utilities: xyflow's own
			    `style.css` paints `.react-flow__handle` at the same
			    specificity a utility has, so which one wins would come down
			    to stylesheet order — and `--color-*` is declared under
			    `@theme inline` and is not emitted at runtime, so an inline
			    `var(--color-info)` would resolve to nothing and paint black. */}
			<Handle
				type="target"
				position={Position.Left}
				id="exec-in"
				style={EXEC_HANDLE_STYLE}
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="exec-out"
				style={EXEC_HANDLE_STYLE}
			/>
			<Handle
				type="target"
				position={Position.Top}
				id="data-in"
				style={DATA_HANDLE_STYLE}
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				id="data-out"
				style={DATA_HANDLE_STYLE}
			/>

			<div className="flex items-center gap-1.5 font-medium">
				<Icon className="size-3.5 shrink-0" />
				<span className="truncate">{node.label || style.label}</span>
			</div>
			<div
				className={`truncate ${incomplete ? "text-destructive" : "text-muted-foreground"}`}
				title={detail}
			>
				{detail}
			</div>
			{node.kind !== "agent" && assigned.length > 0 && (
				<div
					className="truncate text-[10px] text-muted-foreground"
					title={`Assigned by "then" edges: ${assigned.join(", ")}`}
				>
					▸{" "}
					{assigned
						.map((id) => agentNames[id] ?? id.slice(0, 8))
						.join(", ")}
				</div>
			)}
			{run && runStyle && (
				<div
					className={`truncate text-[10px] font-medium ${runStyle.text}`}
					title={run.text}
				>
					● {run.text}
				</div>
			)}
		</div>
	);
}

/** Stable `nodeTypes` map — a fresh one remounts the whole canvas. */
const NODE_TYPES: NodeTypes = { c2: GraphNodeCard };

/**
 * Delete AND Backspace, the two keys an operator reaches for.
 *
 * Module-level: a fresh array literal per render re-registers xyflow's key
 * listener on every render.
 */
const DELETE_KEY_CODES = ["Delete", "Backspace"];

/** Shared empty selection, so an unselected canvas keeps a stable identity. */
const NO_SELECTION: readonly string[] = Object.freeze([]);

/** Default caption for a newly added node. */
const KIND_DEFAULT_LABEL: Record<GraphNodeKind, string> = {
	agent: "Agent",
	asset: "Asset",
	action: "Action",
	condition: "When",
};

/**
 * The channels a data edge can carry.
 *
 * One value today, and it is still a `<Select>` rather than an input: an
 * operator who types `findings` gets an edge the fog does not recognise, and
 * nothing on screen says so.
 */
const EDGE_CHANNELS = ["finding"] as const;

/** Turn a stored graph into the canvas's node list. */
function toCanvasNodes(
	graph: MissionGraph,
	assignment: Map<string, string[]>,
	agentNames: Record<string, string>,
	featureNames: Record<string, string>,
	selected: ReadonlySet<string> = new Set(),
	marks: ReadonlyMap<string, RunMark> = new Map(),
): Node[] {
	return graph.nodes.map((node) => ({
		id: node.id,
		type: "c2",
		position: node.position,
		selected: selected.has(node.id),
		data: {
			node,
			assigned: assignment.get(node.id) ?? [],
			agentNames,
			featureName: node.feature_id
				? (featureNames[node.feature_id] ?? "")
				: "",
			conditionText: formatCondition(node.condition, {
				featureNames,
				agentNames,
			}),
			run: marks.get(node.id),
		} satisfies CanvasNodeData,
	}));
}

/** Turn a stored graph into the canvas's edge list. */
function toCanvasEdges(
	graph: MissionGraph,
	selected: ReadonlySet<string> = new Set(),
): Edge[] {
	return graph.edges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.kind === "data" ? "data-out" : "exec-out",
		targetHandle: edge.kind === "data" ? "data-in" : "exec-in",
		animated: edge.kind === "data",
		selected: selected.has(edge.id),
		label: edge.kind === "data" ? (edge.channel ?? "data") : "then",
		style:
			edge.kind === "data"
				? { stroke: "var(--info)", strokeDasharray: "4 3" }
				: { stroke: "var(--foreground)" },
	}));
}

/** The canvas + inspector, once the call definitions are resolved. */
function MissionGraphEditorBody(props: {
	missionsListDef: RemoteCallDefinition;
	missionsSaveDef?: RemoteCallDefinition;
	mapsListDef?: RemoteCallDefinition;
	featuresListDef?: RemoteCallDefinition;
	defaultMap?: string;
}) {
	const missionId = useSelectedMission();
	const graph = useMissionGraph(missionId);
	const dirty = useMissionGraphDirty(missionId);
	const draft = useMissionDraft(missionId);
	const agents = useAgents();

	const missionsList = useRemoteCall<Record<string, never>, unknown>(
		props.missionsListDef,
	);
	const missionsSave = useRemoteCall<{ mission: unknown }, unknown>(
		props.missionsSaveDef ?? props.missionsListDef,
	);
	const mapsList = useRemoteCall<Record<string, never>, unknown>(
		props.mapsListDef ?? props.missionsListDef,
	);
	const featuresList = useRemoteCall<{ name: string }, unknown>(
		props.featuresListDef ?? props.missionsListDef,
	);

	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	/**
	 * Selection is EPHEMERAL UI state, held here and mirrored into the canvas
	 * arrays — never written into the persisted graph, which would mark a
	 * mission dirty for a click.
	 */
	const [selectedNodeIds, setSelectedNodeIds] =
		useState<readonly string[]>(NO_SELECTION);
	const [selectedEdgeIds, setSelectedEdgeIds] =
		useState<readonly string[]>(NO_SELECTION);
	/** Map resolved from the registry — the last resort, see `mapName` below. */
	const [registryMap, setRegistryMap] = useState<string>("");
	const { pending, run } = useAsyncAction<string>();
	const busy = pending !== null;

	const { execute: executeMissionsList } = missionsList;
	const { execute: executeMapsList } = mapsList;
	const { execute: executeFeaturesList } = featuresList;

	/**
	 * Which map's assets this editor offers.
	 *
	 * Configured map first (an operator who pinned one meant it), then the map
	 * the mission map is showing, then whatever the registry lists first. The
	 * middle rung is the one that matters: without it the two panels each
	 * resolve their own map and the dropdown can describe a map nobody is
	 * looking at.
	 */
	const sharedMap = useActiveMap();
	const mapName = props.defaultMap?.trim() || sharedMap || registryMap || "";

	// ---- Load the graph for the active mission -----------------------------
	//
	// Coordinated through the store, exactly as the mission draft is: a slot
	// that already exists is adopted rather than refetched, so a second editor
	// on the same mission cannot clobber an in-progress edit with a load.
	useEffect(() => {
		if (!missionId) return;
		if (hasMissionGraph(missionId)) return;
		let cancelled = false;
		void (async () => {
			const result = await executeMissionsList({});
			if (cancelled || !missionId) return;
			if (!result.success) {
				setError(result.error ?? "Failed to read the mission store");
				return;
			}
			setError(null);
			const raw = result.data as
				{ missions?: unknown[] } | unknown[] | null;
			const list = Array.isArray(raw)
				? raw
				: Array.isArray(raw?.missions)
					? raw.missions
					: [];
			const wanted = graphDocId(missionId);
			const found = list.find(
				(entry) =>
					entry != null &&
					typeof entry === "object" &&
					(entry as { mission_id?: unknown }).mission_id === wanted,
			);
			// No document is the normal state of a mission nobody has authored
			// a graph for — an empty canvas, not an error.
			setMissionGraph(
				missionId,
				readGraphDocument(found) ?? emptyMissionGraph(),
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [missionId, executeMissionsList]);

	// ---- Resolve a map from the registry, only as a last resort ------------
	//
	// Runs when neither the widget config nor the mission map has named one.
	useEffect(() => {
		if (!props.mapsListDef) return;
		if (props.defaultMap?.trim() || registryMap) return;
		let cancelled = false;
		void (async () => {
			const maps = await executeMapsList({});
			if (cancelled || !maps.success) return;
			const rows = (maps.data as { maps?: { name?: string }[] })?.maps;
			const first = rows?.[0]?.name ?? "";
			if (first) setRegistryMap(first);
		})();
		return () => {
			cancelled = true;
		};
	}, [props.mapsListDef, props.defaultMap, registryMap, executeMapsList]);

	// ---- Fallback asset fetch ----------------------------------------------
	//
	// The asset list is READ from the shared catalogue, which the mission map
	// publishes on every one of its fetches — that is what makes a zone drawn
	// next door appear here with no refresh. But the two panels are
	// independent, and the graph editor has to work with the map closed, so it
	// fetches the map itself when nothing has published it yet. Publishing the
	// result puts this editor on the same footing as the map: one catalogue,
	// one shape, whoever got there first.
	useEffect(() => {
		if (!props.featuresListDef || !mapName) return;
		if (hasMapFeatures(mapName)) return;
		let cancelled = false;
		void (async () => {
			const result = await executeFeaturesList({ name: mapName });
			if (cancelled || !result.success) return;
			const raw = result.data as
				{ features?: C2Feature[] } | C2Feature[] | null;
			const list = Array.isArray(raw)
				? raw
				: Array.isArray(raw?.features)
					? raw.features
					: [];
			publishMapFeatures(
				mapName,
				list.flatMap((feature) => {
					const id = readFeatureId(feature);
					return id
						? [
								{
									feature_id: id,
									name: feature.properties?.name,
									feature_type:
										feature.properties?.feature_type,
								},
							]
						: [];
				}),
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [props.featuresListDef, mapName, executeFeaturesList]);

	// ---- The shared, map-scoped asset catalogue ----------------------------
	const mapFeatures = useMapFeatures(mapName);
	const assetFeatures = useMapAssetFeatures(mapName);
	const featureTypes = useMapFeatureTypes(mapName);

	const agentNames = useMemo(() => {
		const out: Record<string, string> = {};
		for (const agent of agents) out[agent.agent_id] = agent.name;
		return out;
	}, [agents]);

	const featureNames = useMemo(() => {
		const out: Record<string, string> = {};
		for (const feature of mapFeatures) {
			out[feature.feature_id] = feature.name || feature.feature_id;
		}
		return out;
	}, [mapFeatures]);

	/** Only zones may answer a zone-shaped condition key. */
	const zoneFeatures = useMemo(
		() =>
			assetFeatures.filter((feature) => feature.feature_type === "zone"),
		[assetFeatures],
	);

	const assignment = useMemo(
		() => (graph ? propagateAgents(graph) : new Map<string, string[]>()),
		[graph],
	);

	/**
	 * The compiled slice, with the feature types.
	 *
	 * `featureTypes` no longer has any part in the `behavior` decision — that
	 * is read off the action nodes, because navigating and covering are things
	 * an agent DOES. What the index is for now is the action/asset PAIRING
	 * check: without it, a COVERAGE action pointed at a waypoint raises nothing
	 * here and the planner accepts the mission, dispatches it and returns an
	 * empty route for every agent. Nothing moves, and nothing said why.
	 */
	const compiled = useMemo(
		() => (graph ? compileMissionGraph(graph, featureTypes) : null),
		[graph, featureTypes],
	);
	const compiles = compiled ? graphCompiles(compiled.issues) : false;
	const errorCount = compiled
		? compiled.issues.filter((issue) => issue.severity === "error").length
		: 0;
	/** Errors first — the blocking item must not be hunted for. */
	const issues = useMemo(
		() => (compiled ? sortIssuesBySeverity(compiled.issues) : []),
		[compiled],
	);

	// ---- The graph IS the mission's allocation ------------------------------
	//
	// There is no "Apply to mission" button any more. It was the seam that made
	// an authored agent node not count: the graph compiled, the result sat in a
	// memo, and the mission draft kept an empty `vehicles` until the operator
	// found a button nothing told them to press — so the C2 refused a mission
	// for having no agent while an agent node was on screen in front of them.
	//
	// THE GRAPH IS NOW THE SOLE AUTHOR of `vehicles`, `objective.geometries`
	// and `behavior`. The mission map has given up its claim on the same three
	// fields, and it must not take them back: two writers over one field is the
	// reported bug in its general form — whichever wrote last wins, the two
	// surfaces disagree about what the mission allocates, and the operator can
	// see neither the race nor which answer was submitted.
	//
	// `resolveGraphDraftWrite` carries the whole decision (and its reasoning)
	// and returns `null` when the draft already says this, which is what keeps
	// an edit-free render from marking the mission dirty or re-notifying the
	// store into a loop.
	useEffect(() => {
		if (!missionId || !draft) return;
		// `draft` structurally satisfies `GraphDraftView`; `graph_compiles` is
		// an unknown field `hydrateMissionDraft` carries through verbatim, so
		// it is optional there and read off the value at runtime.
		const slice = resolveGraphDraftWrite(graph, compiled, draft);
		if (!slice) return;
		editMissionDraft(
			missionId,
			(current) =>
				({
					...current,
					vehicles: slice.vehicles,
					behavior: slice.behavior,
					// One patch, so no render ever observes a fresh allocation
					// beside a stale `graph_compiles: true`.
					graph_compiles: slice.graph_compiles,
					objective: {
						...current.objective,
						geometries: slice.geometries,
					},
				}) as typeof current,
		);
	}, [missionId, graph, compiled, draft]);

	const nodeSelection = useMemo(
		() => new Set(selectedNodeIds),
		[selectedNodeIds],
	);
	const edgeSelection = useMemo(
		() => new Set(selectedEdgeIds),
		[selectedEdgeIds],
	);

	// Live progress of the mission this graph belongs to: the fog reports, per
	// agent, its step and gate. History snapshots count too, so a finished
	// mission still shows where each chain ended.
	const feedback = useMissionFeedbackExact(missionId);
	const runMarks = useMemo(() => {
		const agentNodes = new Map<string, string[]>();
		for (const node of graph?.nodes ?? []) {
			if (node.kind !== "agent" || !node.agent_id) continue;
			agentNodes.set(node.agent_id, [
				...(agentNodes.get(node.agent_id) ?? []),
				node.id,
			]);
		}
		return programMarks(agentNodes, feedback?.program, agentNames);
	}, [graph, feedback?.program, agentNames]);

	const canvasNodes = useMemo(
		() =>
			graph
				? toCanvasNodes(
						graph,
						assignment,
						agentNames,
						featureNames,
						nodeSelection,
						runMarks,
					)
				: [],
		[graph, assignment, agentNames, featureNames, nodeSelection, runMarks],
	);
	const canvasEdges = useMemo(
		() => (graph ? toCanvasEdges(graph, edgeSelection) : []),
		[graph, edgeSelection],
	);

	const selectedNode = useMemo(
		() =>
			selectedNodeIds.length === 1
				? (graph?.nodes.find(
						(node) => node.id === selectedNodeIds[0],
					) ?? null)
				: null,
		[graph, selectedNodeIds],
	);
	const selectedEdge = useMemo(
		() =>
			selectedEdgeIds.length === 1
				? (graph?.edges.find(
						(edge) => edge.id === selectedEdgeIds[0],
					) ?? null)
				: null,
		[graph, selectedEdgeIds],
	);

	// ---- Canvas edits ------------------------------------------------------

	const deleteNodes = useCallback(
		(nodeIds: readonly string[]) => {
			if (!missionId || nodeIds.length === 0) return;
			const doomed = new Set(nodeIds);
			editMissionGraph(missionId, (current) => ({
				...current,
				nodes: current.nodes.filter((node) => !doomed.has(node.id)),
				// Edges to a node that no longer exists are what break a graph
				// renderer, so they go with it. `normalizeGraph` drops them on
				// the way out too, but only after the canvas has already been
				// asked to draw them.
				edges: current.edges.filter(
					(edge) =>
						!doomed.has(edge.source) && !doomed.has(edge.target),
				),
			}));
			setSelectedNodeIds((prev) =>
				prev.some((id) => doomed.has(id))
					? prev.filter((id) => !doomed.has(id))
					: prev,
			);
		},
		[missionId],
	);

	const deleteEdges = useCallback(
		(edgeIds: readonly string[]) => {
			if (!missionId || edgeIds.length === 0) return;
			const doomed = new Set(edgeIds);
			editMissionGraph(missionId, (current) => ({
				...current,
				edges: current.edges.filter((edge) => !doomed.has(edge.id)),
			}));
			setSelectedEdgeIds((prev) =>
				prev.some((id) => doomed.has(id))
					? prev.filter((id) => !doomed.has(id))
					: prev,
			);
		},
		[missionId],
	);

	/**
	 * Node changes from the canvas.
	 *
	 * Three kinds are honoured and they are honoured differently.
	 *
	 * - `position` is the only xyflow-owned field the STORE keeps, so the
	 *   change set is applied to a throwaway node list and only the resulting
	 *   positions are written back.
	 * - `select` is ephemeral and lands in component state. It used to be
	 *   DISCARDED along with everything else, which is why Delete did nothing:
	 *   a node that can never become selected is a node xyflow never emits a
	 *   remove for.
	 * - `remove` routes through {@link deleteNodes}, so a removed node still
	 *   takes its incident edges with it.
	 */
	const onNodesChange = useCallback(
		(changes: NodeChange[]) => {
			if (!missionId) return;

			const selections = changes.flatMap((change) =>
				change.type === "select"
					? [{ id: change.id, selected: change.selected }]
					: [],
			);
			if (selections.length > 0) {
				setSelectedNodeIds((prev) =>
					applySelectionChanges(prev, selections),
				);
			}

			const removed = changes.flatMap((change) =>
				change.type === "remove" ? [change.id] : [],
			);
			if (removed.length > 0) deleteNodes(removed);

			const positional = changes.filter(
				(change) => change.type === "position",
			);
			if (positional.length === 0) return;
			editMissionGraph(missionId, (current) => {
				const applied = applyNodeChanges(
					positional,
					toCanvasNodes(current, new Map(), {}, {}),
				);
				const positions = new Map(
					applied.map((node) => [node.id, node.position]),
				);
				return {
					...current,
					nodes: current.nodes.map((node) => {
						const next = positions.get(node.id);
						return next ? { ...node, position: next } : node;
					}),
				};
			});
		},
		[missionId, deleteNodes],
	);

	/**
	 * Edge changes from the canvas.
	 *
	 * `select` is what was missing: `remove` was handled, but nothing ever
	 * selected an edge, so the operator had no way to produce one.
	 */
	const onEdgesChange = useCallback(
		(changes: EdgeChange[]) => {
			if (!missionId) return;

			const selections = changes.flatMap((change) =>
				change.type === "select"
					? [{ id: change.id, selected: change.selected }]
					: [],
			);
			if (selections.length > 0) {
				setSelectedEdgeIds((prev) =>
					applySelectionChanges(prev, selections),
				);
			}

			const removed = changes.flatMap((change) =>
				change.type === "remove" ? [change.id] : [],
			);
			if (removed.length > 0) deleteEdges(removed);
		},
		[missionId, deleteEdges],
	);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (!missionId || !connection.source || !connection.target) return;
			// The handle the drag started from IS the edge kind. Nothing to
			// pick afterwards, and nothing that can disagree with what the
			// operator drew.
			const kind =
				connection.sourceHandle === "data-out" ? "data" : "exec";
			editMissionGraph(missionId, (current) => {
				// `addEdge` is xyflow's own duplicate check; running it over a
				// projection keeps that behaviour without storing xyflow's edge
				// shape.
				const next = addEdge(
					{
						...connection,
						id: freshGraphId(kind),
					},
					toCanvasEdges(current),
				);
				const added = next.find(
					(edge) =>
						!current.edges.some((stored) => stored.id === edge.id),
				);
				if (!added) return current;
				return {
					...current,
					edges: [
						...current.edges,
						{
							id: added.id,
							source: added.source,
							target: added.target,
							kind,
							...(kind === "data"
								? { channel: EDGE_CHANNELS[0] }
								: {}),
						},
					],
				};
			});
		},
		[missionId],
	);

	const addNode = useCallback(
		(kind: GraphNodeKind) => {
			if (!missionId) return;
			// `freshGraphId` and `nextNodePosition` live beside the graph model
			// rather than here, because the mission map adds nodes too: two
			// callers minting ids two ways is how a collision arrives, and
			// `normalizeGraph` drops a duplicate id outright, so the second
			// node would simply never appear.
			const id = freshGraphId(kind);
			editMissionGraph(missionId, (current) => ({
				...current,
				nodes: [
					...current.nodes,
					{
						id,
						kind,
						label: KIND_DEFAULT_LABEL[kind],
						position: nextNodePosition(current),
					},
				],
			}));
			setSelectedNodeIds([id]);
			setSelectedEdgeIds(NO_SELECTION);
		},
		[missionId],
	);

	/**
	 * Add an agent node that ALLOCATES an agent, not a blank one.
	 *
	 * A blank agent node contributes no vehicle — the compiler reports it as an
	 * error — so a button that added one would still leave the operator with a
	 * mission refused for having no agent until they found the inspector and
	 * picked one. That second gesture is the defect, in miniature.
	 *
	 * So it allocates the first fleet agent the graph does not already carry,
	 * through the shared {@link addAgentNode} — the same implementation the
	 * mission map's marker toggle uses, so an agent added from either surface
	 * is the same node. The operator changes it in the inspector, which is
	 * opened on the new node by the selection below.
	 *
	 * It falls back to a blank node when the fleet is unknown (no C2 yet) or
	 * every known agent is already allocated: the graph must stay authorable
	 * with nothing connected, and the compiler names the blank one.
	 */
	const addAgent = useCallback(() => {
		if (!missionId) return;
		const free = agents.find(
			(agent) =>
				!graph?.nodes.some(
					(node) =>
						node.kind === "agent" &&
						node.agent_id === agent.agent_id,
				),
		);
		if (!free) {
			addNode("agent");
			return;
		}
		const before = new Set(graph?.nodes.map((node) => node.id) ?? []);
		editMissionGraph(missionId, (current) =>
			addAgentNode(current, free.agent_id, free.name),
		);
		// The id is minted inside `addAgentNode`, so it is read back off the
		// store rather than guessed — the alternative is a second id-minting
		// site, which is what this change exists to remove.
		const added = getMissionGraph(missionId)?.nodes.find(
			(node) => !before.has(node.id),
		);
		if (added) setSelectedNodeIds([added.id]);
		setSelectedEdgeIds(NO_SELECTION);
	}, [missionId, graph, agents, addNode]);

	const patchNode = useCallback(
		(nodeId: string, patch: Partial<MissionGraphNode>) => {
			if (!missionId) return;
			editMissionGraph(missionId, (current) => ({
				...current,
				nodes: current.nodes.map((node) =>
					node.id === nodeId ? { ...node, ...patch } : node,
				),
			}));
		},
		[missionId],
	);

	const patchEdge = useCallback(
		(edgeId: string, patch: Partial<MissionGraphEdge>) => {
			if (!missionId) return;
			editMissionGraph(missionId, (current) => ({
				...current,
				edges: current.edges.map((edge) =>
					edge.id === edgeId ? { ...edge, ...patch } : edge,
				),
			}));
		},
		[missionId],
	);

	/** Select exactly one node — the issue list's click-through. */
	const selectOnlyNode = useCallback((nodeId: string) => {
		setSelectedNodeIds([nodeId]);
		setSelectedEdgeIds(NO_SELECTION);
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedNodeIds((prev) => (prev.length > 0 ? NO_SELECTION : prev));
		setSelectedEdgeIds((prev) => (prev.length > 0 ? NO_SELECTION : prev));
	}, []);

	// ---- Keyboard ----------------------------------------------------------

	/**
	 * Refuse a delete the operator did not aim at the canvas.
	 *
	 * xyflow's `deleteKeyCode` listens on the DOCUMENT, so `Delete` and
	 * `Backspace` reach it from anywhere — including the label field, where
	 * Backspace means "erase a character" and deleting the node the operator is
	 * naming is the opposite of what they asked for. `onBeforeDelete` is the
	 * one hook that can veto, and with no event to inspect the guard falls back
	 * to the focused element, which is exactly the case that matters here.
	 */
	const onBeforeDelete = useCallback(
		async () => shouldHandleGraphShortcut(),
		[],
	);

	/**
	 * Escape clears the selection.
	 *
	 * Scoped to this panel rather than the window: the wrapper is focusable, so
	 * a click anywhere inside the editor puts focus in its subtree and the key
	 * bubbles here. A window listener would let one graph editor answer a key
	 * pressed in another panel.
	 */
	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== "Escape") return;
			if (!shouldHandleGraphShortcut(event.nativeEvent)) return;
			clearSelection();
		},
		[clearSelection],
	);

	// ---- Persistence -------------------------------------------------------

	/**
	 * Write the graph as its own document and point the mission at it.
	 *
	 * Two writes, in this order. The sibling document first, so a `graph_ref`
	 * never names a document that is not there; then the reference onto the
	 * shared mission draft, which the map's save path persists with everything
	 * else.
	 *
	 * `graph_ref` is ALL this writes. The compiled slice — `vehicles`,
	 * `objective.geometries`, `behavior` — and the C2's `graph_compiles` gate
	 * are already on the draft, put there by the auto-apply effect above on the
	 * edit that produced them, and re-deriving them here would make the save
	 * path a second writer over fields that have exactly one author. That is
	 * the shape of the bug this change removed; it is not reintroduced for the
	 * convenience of having the verdict to hand.
	 */
	const saveGraph = useCallback(() => {
		if (!missionId || !graph) return;
		if (!props.missionsSaveDef) {
			setError("c2.missions.save is unavailable");
			return;
		}
		const signature = missionGraphSignature(graph);
		return run("save", async () => {
			const result = await missionsSave.execute({
				mission: buildGraphDocument(missionId, graph),
			});
			if (!result.success) {
				setError(result.error ?? "Failed to save the mission graph");
				return;
			}
			setError(null);
			const outcome = commitSavedGraph(missionId, signature);
			const ref = graphDocId(missionId);
			// Read (and write) `graph_ref` as an unknown field rather than
			// declaring it on `MissionDraft`: the draft type is the C2's
			// `MissionConfig`, and every field on it rides into the
			// 10 000-character `mission_config` string.
			//
			// WHAT MAY RIDE THERE. `graph_ref` is a ~45-character string, and
			// the three the auto-apply effect writes are two scalars and a
			// bounded list the C2 carries anyway. NOTHING LARGER MAY FOLLOW
			// THEM — not the issue list, not the node ids, not a compiled
			// summary, and above all not the graph. The cap is enforced by the
			// C2, not by this widget: a draft that outgrows it stops submitting
			// with no error the operator can attribute to the field they added.
			// Anything bigger belongs in the sibling graph document, which is
			// why that document exists.
			//
			// `hydrateMissionDraft` carries unknown fields through verbatim, so
			// it survives a reload with no type change at all.
			const currentDraft = draft as Record<string, unknown> | null;
			if (draft && currentDraft?.graph_ref !== ref) {
				editMissionDraft(
					missionId,
					(current) =>
						({
							...current,
							graph_ref: ref,
						}) as typeof current,
				);
			}
			setNotice(
				outcome === "kept-dirty"
					? "Graph saved, but you have newer edits on the canvas."
					: compiles
						? "Graph saved. Save the mission itself to persist its allocation."
						: "Graph saved, but the graph does not compile — the C2 will refuse this mission until the errors below are fixed.",
			);
		});
	}, [
		missionId,
		graph,
		compiles,
		props.missionsSaveDef,
		missionsSave,
		draft,
		run,
	]);

	const reload = useCallback(() => {
		if (!missionId) return;
		return run("reload", async () => {
			const result = await executeMissionsList({});
			if (!result.success) {
				setError(result.error ?? "Failed to read the mission store");
				return;
			}
			const raw = result.data as
				{ missions?: unknown[] } | unknown[] | null;
			const list = Array.isArray(raw)
				? raw
				: Array.isArray(raw?.missions)
					? raw.missions
					: [];
			const wanted = graphDocId(missionId);
			const found = list.find(
				(entry) =>
					entry != null &&
					typeof entry === "object" &&
					(entry as { mission_id?: unknown }).mission_id === wanted,
			);
			setError(null);
			setNotice(null);
			setMissionGraph(
				missionId,
				readGraphDocument(found) ?? emptyMissionGraph(),
			);
		});
	}, [missionId, executeMissionsList, run]);

	if (!missionId) {
		return (
			<PanelEmptyState>
				Select a mission to author its behaviour graph.
			</PanelEmptyState>
		);
	}

	return (
		// `tabIndex={-1}` makes the panel the nearest focusable ancestor, so a
		// click anywhere inside it lands focus in this subtree and the Escape
		// shortcut below is reachable without a window listener.
		<div
			className="h-full min-w-0 flex flex-col text-sm outline-none"
			tabIndex={-1}
			onKeyDown={onKeyDown}
		>
			{/* Toolbar */}
			<div className="flex items-center gap-1.5 p-2 border-b shrink-0 flex-wrap min-w-0">
				{/* A mission NAME is a name, so free text is right. It writes
				    through to the shared draft, the same store and the same
				    save mechanics the map uses — there is no second save
				    path. */}
				<Input
					className="h-8 w-40 nokey"
					aria-label="Mission name"
					placeholder="Mission name"
					disabled={!draft}
					title={
						draft
							? "Rename this mission. Save the mission to persist it."
							: "This mission is not loaded yet. Open it on the mission map first."
					}
					value={draft?.name ?? ""}
					onChange={(event) =>
						editMissionDraft(missionId, (current) => ({
							...current,
							name: event.target.value,
						}))
					}
				/>

				<Separator
					orientation="vertical"
					className="data-[orientation=vertical]:h-6"
				/>

				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={addAgent}
					title="Allocate a fleet agent to this mission. It counts immediately — the mission's vehicle list follows the graph."
				>
					<Bot />
					Agent
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => addNode("asset")}
				>
					<MapPin />
					Asset
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => addNode("action")}
				>
					<Zap />
					Action
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => addNode("condition")}
				>
					<GitBranch />
					Condition
				</Button>

				<Separator
					orientation="vertical"
					className="data-[orientation=vertical]:h-6"
				/>

				{dirty && <Badge variant="outline">unsaved</Badge>}
				<Badge variant="secondary">
					{graph?.nodes.length ?? 0} nodes
				</Badge>

				{/* The C2's verdict, in the operator's terms rather than the
				    compiler's. "does not compile" describes what this widget
				    did; what the operator needs to know is that submitting is
				    about to be refused and where the reason is written down —
				    their complaint was a refusal with nothing on screen
				    explaining it. */}
				{compiles ? (
					<Badge
						variant="outline"
						className="border-success text-success"
						title="Every requirement is met. The C2 will accept this mission."
					>
						C2 will accept
					</Badge>
				) : (
					<Badge
						variant="destructive"
						title="The C2 refuses this mission until the errors listed on the right are fixed. Submitting it now comes back as GRAPH_NOT_READY."
					>
						C2 will refuse this mission
						{errorCount > 0 ? ` · ${errorCount} to fix` : ""}
					</Badge>
				)}

				<Button
					size="sm"
					className="ml-auto"
					disabled={busy || !graph || !props.missionsSaveDef}
					onClick={() => void saveGraph()}
				>
					{pending === "save" ? (
						<Loader2 className="animate-spin" />
					) : (
						<Save />
					)}
					Save graph
				</Button>
				<Button
					size="icon-sm"
					variant="outline"
					aria-label="Reload graph"
					disabled={busy}
					onClick={() => void reload()}
				>
					<RefreshCw />
				</Button>
			</div>

			{error && (
				<div className="text-xs text-destructive bg-destructive/10 px-2 py-1 shrink-0">
					{error}
				</div>
			)}
			{notice && !error && (
				<div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 shrink-0">
					{notice}
				</div>
			)}

			<div className="flex-1 min-h-0 flex min-w-0">
				{/* Canvas */}
				<div className="flex-1 min-w-0 min-h-0">
					<ReactFlow
						nodes={canvasNodes}
						edges={canvasEdges}
						nodeTypes={NODE_TYPES}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						onBeforeDelete={onBeforeDelete}
						deleteKeyCode={DELETE_KEY_CODES}
						fitView
						proOptions={{ hideAttribution: false }}
					>
						<Background />
						<Controls showInteractive={false} />
					</ReactFlow>
				</div>

				{/* Inspector + issues.
				    `nokey` is xyflow's own opt-out: no key pressed inside this
				    panel is ever read as a canvas shortcut, so Backspace in the
				    label field cannot delete the node being named. It is belt
				    and braces over `onBeforeDelete`, which catches the portalled
				    controls this class cannot reach. */}
				<div className="w-64 shrink-0 border-l flex flex-col min-h-0 nokey">
					<ScrollArea className="flex-1 min-h-0">
						<div className="p-2 flex flex-col gap-2">
							{selectedEdge ? (
								<EdgeInspector
									edge={selectedEdge}
									onPatch={(patch) =>
										patchEdge(selectedEdge.id, patch)
									}
									onDelete={() =>
										deleteEdges([selectedEdge.id])
									}
								/>
							) : selectedNode ? (
								<NodeInspector
									node={selectedNode}
									agents={agents.map((agent) => ({
										id: agent.agent_id,
										name: agent.name,
									}))}
									assets={assetFeatures}
									zones={zoneFeatures}
									onPatch={(patch) =>
										patchNode(selectedNode.id, patch)
									}
									onDelete={() =>
										deleteNodes([selectedNode.id])
									}
								/>
							) : (
								<>
									<p className="text-xs text-muted-foreground">
										Drag from a node&apos;s left/right dot
										for a <strong>then</strong> edge, or
										from its top/bottom dot for a{" "}
										<strong>data</strong> edge. Click a node
										or an edge to edit it.
									</p>
									<p className="text-[11px] text-muted-foreground">
										<strong>Delete</strong> or{" "}
										<strong>Backspace</strong> removes what
										is selected — nodes and edges.{" "}
										<strong>Esc</strong> clears the
										selection. Neither fires while you are
										typing in a field.
									</p>
								</>
							)}

							<Separator />

							{/* What the mission currently allocates. It is written
							    into the draft as the operator authors — there
							    is nothing to press — so this reads as a
							    statement about the mission, not a preview of
							    one. */}
							<div className="flex flex-col gap-1">
								<Label className="text-xs">
									This mission
									{compiles ? (
										<Badge
											variant="outline"
											className="ml-1 border-success text-success"
										>
											ok
										</Badge>
									) : (
										<Badge
											variant="destructive"
											className="ml-1"
										>
											refused
										</Badge>
									)}
								</Label>
								<span className="text-xs text-muted-foreground">
									{compiled?.vehicles.length ?? 0} vehicle(s)
									· {compiled?.geometries.length ?? 0}{" "}
									objective(s)
								</span>
								{!compiles && (
									<span className="text-[11px] text-destructive">
										The C2 will refuse this mission
										{errorCount > 0
											? `. ${errorCount} thing(s) to fix, listed first below:`
											: ". The reasons are listed below."}
									</span>
								)}
							</div>

							{issues.length > 0 && (
								<div className="flex flex-col gap-1">
									{/* Errors first: an operator scanning a
									    mixed list must not have to hunt the
									    blocking one among advisories. */}
									{issues.map((issue, index) => (
										<IssueRow
											key={`${issue.nodeId ?? "graph"}-${index}`}
											issue={issue}
											onSelect={() =>
												issue.nodeId
													? selectOnlyNode(
															issue.nodeId,
														)
													: undefined
											}
										/>
									))}
								</div>
							)}
						</div>
					</ScrollArea>
				</div>
			</div>
		</div>
	);
}

/** One compile issue, clickable through to the node it is about. */
function IssueRow(props: { issue: MissionGraphIssue; onSelect: () => void }) {
	const { issue } = props;
	const tone =
		issue.severity === "error"
			? "text-destructive bg-destructive/10"
			: "text-warning bg-warning/10";
	return (
		<button
			type="button"
			className={`text-left text-[11px] rounded px-1.5 py-1 ${tone} ${issue.nodeId ? "cursor-pointer" : "cursor-default"}`}
			onClick={props.onSelect}
			disabled={!issue.nodeId}
		>
			{issue.message}
		</button>
	);
}

/** The "no value" option — Radix Select refuses an empty string. */
const UNSET = "__unset__";

/**
 * Build a condition form off {@link CONDITION_OP_SHAPE}, and nothing else.
 *
 * Every control below is gated on the SHAPE of the chosen op, read from the one
 * table that is derived from the fog's own `evaluate()` switch. A second rule
 * table in the UI would drift the day an op changed, and the drift is silent:
 * the mission submits, the predicate is evaluated against a field the fog does
 * not read, and nothing on screen says which.
 */
function ConditionEditor(props: {
	condition?: GraphCondition;
	zones: readonly CatalogFeature[];
	agents: { id: string; name: string }[];
	onChange: (condition: GraphCondition | undefined) => void;
}) {
	const { condition } = props;
	const shape = condition ? CONDITION_OP_SHAPE[condition.op] : null;

	/**
	 * Apply a patch and RE-NORMALIZE.
	 *
	 * `normalizeCondition` is the shared stripping/coercion rule: it drops a
	 * `key`/`arg` the new op does not use and clamps the threshold into the
	 * unit that op reads. Reimplementing that here is how a stale zone id ends
	 * up on an `ElapsedSeconds` condition.
	 */
	const update = (patch: Partial<GraphCondition>) => {
		if (!condition) return;
		props.onChange(normalizeCondition({ ...condition, ...patch }));
	};

	return (
		<div className="flex flex-col gap-2">
			<Select
				value={condition?.op ?? UNSET}
				onValueChange={(value) => {
					if (value === UNSET) {
						props.onChange(undefined);
						return;
					}
					const nextOp = value as ConditionOp;
					// A threshold only carries over when the new op reads it in
					// the SAME unit. Otherwise it is dropped so
					// `normalizeCondition` substitutes that op's own default —
					// carrying `0` from `ElapsedSeconds` into `ZoneCoveredBy`
					// would make a coverage predicate hold before a robot
					// moved.
					const keepThreshold =
						shape?.threshold ===
						CONDITION_OP_SHAPE[nextOp].threshold;
					// Changing the op re-normalizes, so fields the new op does
					// not read do not linger under a form that stopped showing
					// them.
					props.onChange(
						normalizeCondition({
							...(condition ?? {}),
							op: nextOp,
							...(keepThreshold ? {} : { threshold: undefined }),
						}),
					);
				}}
			>
				<SelectTrigger size="sm" className="w-full">
					<SelectValue placeholder="Predicate" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={UNSET}>No predicate</SelectItem>
					{CONDITION_OPS.map((op) => (
						<SelectItem key={op} value={op}>
							{CONDITION_OP_SHAPE[op].label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{condition && shape && (
				<>
					{shape.key === "zone" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Zone</Label>
							<Select
								value={condition.key || UNSET}
								onValueChange={(value) =>
									update({
										key:
											value === UNSET ? undefined : value,
									})
								}
							>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue placeholder="Zone" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNSET}>
										No zone
									</SelectItem>
									{props.zones.map((zone) => (
										<SelectItem
											key={zone.feature_id}
											value={zone.feature_id}
										>
											{zone.name || zone.feature_id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{shape.key === "agent" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Agent</Label>
							<Select
								value={condition.key || UNSET}
								onValueChange={(value) =>
									update({
										key:
											value === UNSET ? undefined : value,
									})
								}
							>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue placeholder="Agent" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNSET}>
										No agent
									</SelectItem>
									{props.agents.map((agent) => (
										<SelectItem
											key={agent.id}
											value={agent.id}
										>
											{agent.name || agent.id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{shape.key === "flag" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Flag name</Label>
							{/* A flag IS a name the fog looks up in
							    `s.flags` — free text is correct here, and it is
							    written through unnormalized so a space the
							    operator is still typing is not trimmed out from
							    under the cursor. */}
							<Input
								className="h-8"
								placeholder="e.g. lane_cleared"
								value={condition.key ?? ""}
								onChange={(event) =>
									props.onChange({
										...condition,
										key: event.target.value,
									})
								}
							/>
						</div>
					)}

					{shape.arg === "modality" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Modality</Label>
							<Select
								value={condition.arg || UNSET}
								onValueChange={(value) =>
									update({
										arg:
											value === UNSET ? undefined : value,
									})
								}
							>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue placeholder="Modality" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNSET}>
										Any modality
									</SelectItem>
									{SENSOR_MODALITIES.map((modality) => (
										<SelectItem
											key={modality}
											value={modality}
										>
											{modality}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{/* `threshold: "none"` renders NO control at all.
					    `AgentHolding`, `FlagSet`, `Always` and `Never` never
					    read it, and a control that changes nothing is a lie. */}
					{shape.threshold === "fraction" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">
								At least (% of the zone)
							</Label>
							<Input
								className="h-8"
								type="number"
								min={0}
								max={100}
								step={5}
								value={Math.round(condition.threshold * 100)}
								onChange={(event) => {
									const percent = event.target.valueAsNumber;
									update({
										threshold: Number.isFinite(percent)
											? percent / 100
											: 0,
									});
								}}
							/>
						</div>
					)}
					{shape.threshold === "count" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">
								At least (how many)
							</Label>
							<Input
								className="h-8"
								type="number"
								min={0}
								step={1}
								value={condition.threshold}
								onChange={(event) => {
									const count = event.target.valueAsNumber;
									update({
										threshold: Number.isFinite(count)
											? count
											: 0,
									});
								}}
							/>
						</div>
					)}
					{shape.threshold === "seconds" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">
								At least (seconds)
							</Label>
							<Input
								className="h-8"
								type="number"
								min={0}
								step={1}
								value={condition.threshold}
								onChange={(event) => {
									const seconds = event.target.valueAsNumber;
									update({
										threshold: Number.isFinite(seconds)
											? seconds
											: 0,
									});
								}}
							/>
						</div>
					)}

					<Label className="flex items-center gap-2 text-[11px] font-normal">
						<Checkbox
							checked={condition.negate}
							onCheckedChange={(checked) =>
								update({ negate: checked === true })
							}
						/>
						Invert (NOT) — hold when this is false
					</Label>

					<p className="text-[11px] text-muted-foreground">
						Reads: {formatCondition(condition)}
					</p>
				</>
			)}
		</div>
	);
}

/** Edit the selected node. Hoisted for a stable identity. */
function NodeInspector(props: {
	node: MissionGraphNode;
	agents: { id: string; name: string }[];
	assets: readonly CatalogFeature[];
	zones: readonly CatalogFeature[];
	onPatch: (patch: Partial<MissionGraphNode>) => void;
	onDelete: () => void;
}) {
	const { node } = props;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label className="text-xs">{KIND_STYLE[node.kind].label}</Label>
				<Button
					size="icon-sm"
					variant="ghost"
					className="text-destructive"
					aria-label="Delete node"
					title="Delete this node and every edge touching it"
					onClick={props.onDelete}
				>
					<Trash2 />
				</Button>
			</div>

			{/* A label is a caption the operator writes for themselves — the one
			    thing on a node that is genuinely free text. */}
			<Input
				className="h-8"
				value={node.label}
				placeholder="Label"
				aria-label="Node label"
				onChange={(event) =>
					props.onPatch({ label: event.target.value })
				}
			/>

			{node.kind === "agent" && (
				<Select
					value={node.agent_id || UNSET}
					onValueChange={(value) =>
						props.onPatch({
							agent_id: value === UNSET ? undefined : value,
						})
					}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue placeholder="Agent" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={UNSET}>No agent</SelectItem>
						{props.agents.map((agent) => (
							<SelectItem key={agent.id} value={agent.id}>
								{agent.name || agent.id}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{node.kind === "asset" && (
				<>
					<Select
						value={node.feature_id || UNSET}
						onValueChange={(value) =>
							props.onPatch({
								feature_id: value === UNSET ? undefined : value,
							})
						}
					>
						<SelectTrigger size="sm" className="w-full">
							<SelectValue placeholder="Map asset" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={UNSET}>No feature</SelectItem>
							{props.assets.map((asset) => (
								<SelectItem
									key={asset.feature_id}
									value={asset.feature_id}
								>
									{asset.name || asset.feature_id} (
									{asset.feature_type ?? "?"})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-[11px] text-muted-foreground">
						A node names an asset by id. Draw the geometry on the
						mission map — it lives there, not here.
					</p>
				</>
			)}

			{node.kind === "action" && (
				<Select
					value={node.action ?? UNSET}
					onValueChange={(value) =>
						props.onPatch({
							action:
								value === UNSET
									? undefined
									: (value as GraphAction),
						})
					}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue placeholder="Action" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={UNSET}>No action</SelectItem>
						{GRAPH_ACTIONS.map((action) => (
							<SelectItem key={action} value={action}>
								{action}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{node.kind === "condition" && (
				<ConditionEditor
					condition={node.condition}
					zones={props.zones}
					agents={props.agents}
					onChange={(condition) => props.onPatch({ condition })}
				/>
			)}
		</div>
	);
}

/**
 * Edit the selected edge.
 *
 * The operator asked for a mouse route to deleting an edge as well as a
 * keyboard one: a shortcut nobody discovers is not a feature, and a canvas
 * where the only way to undo a wrong drag is a key press is a canvas that
 * traps them.
 */
function EdgeInspector(props: {
	edge: MissionGraphEdge;
	onPatch: (patch: Partial<MissionGraphEdge>) => void;
	onDelete: () => void;
}) {
	const { edge } = props;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label className="text-xs">
					{edge.kind === "data" ? "Data edge" : '"Then" edge'}
				</Label>
				<Button
					size="icon-sm"
					variant="ghost"
					className="text-destructive"
					aria-label="Delete edge"
					title="Delete this edge"
					onClick={props.onDelete}
				>
					<Trash2 />
				</Button>
			</div>

			<p className="text-[11px] text-muted-foreground">
				{edge.kind === "data"
					? "Carries a value from one node to another. It does NOT assign an agent — consuming a finding is not being commanded by whoever found it."
					: "Sequencing. An agent assignment flows along this edge to everything reachable."}
			</p>

			{edge.kind === "data" && (
				<div className="flex flex-col gap-1">
					<Label className="text-[11px]">Channel</Label>
					{/* Picked, never typed: a channel the fog does not know is
					    an edge that silently carries nothing. */}
					<Select
						value={edge.channel || EDGE_CHANNELS[0]}
						onValueChange={(value) =>
							props.onPatch({ channel: value })
						}
					>
						<SelectTrigger size="sm" className="w-full">
							<SelectValue placeholder="Channel" />
						</SelectTrigger>
						<SelectContent>
							{EDGE_CHANNELS.map((channel) => (
								<SelectItem key={channel} value={channel}>
									{channel}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		</div>
	);
}

/** Resolve the call definitions, then render the editor. */
const MissionGraphEditorWidget: React.FC<MissionGraphEditorProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);

	const missionsListDef = useMemo(
		() => findCall(calls, C2Call.MissionsList),
		[calls],
	);
	const missionsSaveDef = useMemo(
		() => findCall(calls, C2Call.MissionsSave),
		[calls],
	);
	const mapsListDef = useMemo(
		() => findCall(calls, C2Call.MapsList),
		[calls],
	);
	const featuresListDef = useMemo(
		() => findCall(calls, C2Call.MapFeaturesList),
		[calls],
	);

	if (!missionsListDef) {
		return (
			<PanelEmptyState>
				No C2 datasource available. Add a C2 Control datasource to
				author mission behaviour graphs.
			</PanelEmptyState>
		);
	}

	return (
		// xyflow needs its provider above anything that uses its store, and it
		// must be OUTSIDE the component that renders `<ReactFlow>` — a provider
		// rendered as a sibling of the canvas gives the canvas nothing.
		<ReactFlowProvider>
			<MissionGraphEditorBody
				missionsListDef={missionsListDef}
				missionsSaveDef={missionsSaveDef}
				mapsListDef={mapsListDef}
				featuresListDef={featuresListDef}
				defaultMap={props.defaultMap}
			/>
		</ReactFlowProvider>
	);
};

/**
 * Widget definition for the mission behaviour-graph editor.
 * @returns Widget definition.
 */
export function MissionGraphEditorDefinition(): WidgetDefinition<MissionGraphEditorProps> {
	return {
		id: "c2-mission-graph-widget",
		name: "C2 Mission Graph",
		description:
			"Author a mission's behaviour graph: agents, map assets, actions and conditions",
		titleProp: "title",
		icon: <Workflow />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				defaultMap: {
					type: "string",
					title: "Map to take assets from",
				},
				datasource_id: {
					type: "string",
					title: "C2 datasource id (optional)",
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
					scope: "#/properties/defaultMap",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/datasource_id",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Mission Graph",
		},
		Component: MissionGraphEditorWidget,
		extensibilityHook: c2DatasourceSelectHook,
	} as WidgetDefinition<MissionGraphEditorProps>;
}
