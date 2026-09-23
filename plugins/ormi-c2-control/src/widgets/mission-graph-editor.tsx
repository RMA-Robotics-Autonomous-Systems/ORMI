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
	MarkerType,
	Panel,
	Position,
	ReactFlow,
	ReactFlowProvider,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type FinalConnectionState,
	type Node,
	type NodeChange,
	type NodeProps,
	type NodeTypes,
	useReactFlow,
	useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	Bot,
	GitBranch,
	Hourglass,
	Loader2,
	MapPin,
	Navigation,
	RefreshCw,
	Save,
	ScanLine,
	Trash2,
	Workflow,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
	editMissionGraph,
	getMissionGraph,
	hasMissionGraph,
	setMissionGraph,
	useMissionGraph,
	useMissionGraphDirty,
} from "../state/mission-graph-store";
import { saveMissionWithGraph } from "../state/mission-save";
import { subscribeGraphFocus } from "../state/graph-focus-store";
import { useActiveMap, useSelectedMission } from "../state/selection-store";
import type { C2Feature } from "../types/c2-types";
import { readFeatureId } from "./feature-geojson";
import {
	applyDrop,
	applySelectionChanges,
	dropChoices,
	dropOrphanedEdges,
	formatCondition,
	programMarks,
	resolveGraphDraftWrite,
	type DropChoice,
	type DropOrigin,
	type RunMark,
	type RunTone,
	shouldHandleGraphShortcut,
	sortIssuesBySeverity,
	wireGraph,
} from "./mission-graph-editor-helpers";
import {
	CONDITION_OPS,
	CONDITION_OP_SHAPE,
	GRAPH_ACTIONS,
	SENSOR_MODALITIES,
	addAgentNode,
	compileMissionGraph,
	emptyMissionGraph,
	freshGraphId,
	graphCompiles,
	graphDocId,
	isOutdatedGraphDocument,
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
	type WaitMode,
} from "./mission-graph";
import {
	PORT_TYPE_LABEL,
	assetPortType,
	connectionPlan,
	nodePorts,
	type NodePorts,
	type PortSpec,
	type PortType,
} from "./mission-graph-ports";
import { PanelEmptyState } from "./panel-empty-state";
import { useAsyncAction } from "./use-async-action";

/**
 * The mission behaviour-graph editor.
 *
 * ## What it is for
 *
 * The operator plans each agent's mission by hand: an agent node, then its
 * chain of steps — go somewhere, sweep a zone, wait until something holds —
 * wired left to right. The fog compiles exactly this graph and runs it
 * (`mission-program.ts` mirrors its rules), so what is on the canvas IS the
 * mission, and everything the fog would refuse is listed here, on the node it
 * is about, before submit.
 *
 * ## Typed ports
 *
 * Every node shows what it takes in (left) and gives out (right), each port
 * coloured by what it carries (`mission-graph-ports.ts`): the dark "then"
 * ports make the chain, green ports carry places (waypoint / zone), blue carry
 * agents, orange carry true/false. A drag is only accepted into an input of
 * the same type; a refused drag says why. Dropping a wire on empty canvas
 * offers the nodes that could take it, already wired.
 *
 * - An **action**'s target is picked on the node, or wired from an asset node
 *   (one asset can feed several actions).
 * - A **Wait** sits on the chain before a step and holds it until all (or any)
 *   of the conditions wired into it hold.
 * - A **condition** is a true/false: elapsed time, findings, an agent holding.
 *
 * ## The rules it is built on
 *
 * - **A node names an asset by `feature_id` and never carries coordinates.**
 *   Zones and waypoints are assets and live in the map; the graph references
 *   them. Two homes for one geometry is two answers to "where".
 * - **The graph is the SOLE AUTHOR of the mission's allocation.** `vehicles`,
 *   `objective.geometries`, `behavior` and the C2's `graph_compiles` gate are
 *   written into the shared draft as the operator authors, with no button in
 *   between. A second writer would bring back the race where whichever wrote
 *   last wins and nothing on screen says which.
 * - **The graph is never a field on the mission draft.** `InitMission.srv`
 *   caps `mission_config` at 10 000 characters and the whole draft rides into
 *   it. The mission carries a `graph_ref` string; the graph is its own
 *   document. See `state/mission-graph-store.ts`.
 * - **Free text is for names.** The node label and the mission name are typed;
 *   an action comes from `GRAPH_ACTIONS`, a condition is built field by field
 *   off `CONDITION_OP_SHAPE`. A control that lets an operator type a value
 *   nothing downstream recognises fails silently.
 * - **The asset list tracks the map.** The features come from the shared
 *   catalogue the mission map publishes on every fetch, scoped to ONE map, so
 *   drawing a zone on the map beside it reaches these pickers with no refresh.
 *   The editor still fetches for itself when nothing has published that map.
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

/** A picked map feature, as the node pickers list it. */
interface FeatureOption {
	feature_id: string;
	name: string;
}

/** What the canvas needs from a node, beyond xyflow's own fields. */
interface CanvasNodeData extends Record<string, unknown> {
	node: MissionGraphNode;
	ports: NodePorts;
	/** Input port id → captions of the nodes wired into it. */
	wiredFrom: Record<string, string[]>;
	/** Agents that reach this node — the propagated set. */
	assigned: string[];
	/** Human name per agent id, resolved once by the parent. */
	agentNames: Record<string, string>;
	/** Human name for the referenced feature, when known. */
	featureName: string;
	/** The asset's map feature type, when known. */
	featureType: string;
	/**
	 * The condition rendered as a phrase, resolved once by the parent.
	 *
	 * A `GraphCondition` is an OBJECT — putting one in JSX renders nothing —
	 * and the card has no access to the id→name maps needed to render it
	 * honestly, so the parent formats it.
	 */
	conditionText: string;
	/** Actions: the map features its target can be picked from. */
	targetOptions: readonly FeatureOption[];
	/** Where the running mission is on this node (the fog's `program`). */
	run?: RunMark;
	/** Edit this node (the inline pickers). */
	onPatch: (nodeId: string, patch: Partial<MissionGraphNode>) => void;
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

/**
 * What each port type is painted with. Raw theme tokens in INLINE styles, not
 * Tailwind utilities: xyflow's own `style.css` paints handles and edges at the
 * same specificity a utility has, and `--color-*` is declared under
 * `@theme inline` and is not emitted at runtime.
 */
const PORT_COLOR: Record<PortType, string> = {
	flow: "var(--foreground)",
	waypoint: "var(--success)",
	zone: "var(--success)",
	asset: "var(--success)",
	agent: "var(--info)",
	bool: "var(--chart-1)",
};

/**
 * Shape + accent per node kind, so a chain reads at a glance: agents are
 * pills, steps are cards, a Wait is a gate, the values that feed them are
 * small tags.
 */
const KIND_STYLE: Record<
	GraphNodeKind,
	{ label: string; shape: string; header: string; icon: typeof Bot }
> = {
	agent: {
		label: "Agent",
		shape: "rounded-2xl border-2 border-info min-w-36",
		header: "bg-info/15",
		icon: Bot,
	},
	action: {
		label: "Action",
		shape: "rounded-md border border-foreground/40 min-w-48",
		header: "bg-muted",
		icon: Zap,
	},
	wait: {
		label: "Wait",
		shape: "rounded-md border-2 border-dashed border-warning min-w-40",
		header: "bg-warning/15",
		icon: Hourglass,
	},
	condition: {
		label: "Condition",
		shape: "rounded-full border border-[var(--chart-1)] min-w-40",
		header: "",
		icon: GitBranch,
	},
	asset: {
		label: "Asset",
		shape: "rounded-sm border border-success min-w-36",
		header: "bg-success/10",
		icon: MapPin,
	},
};

/**
 * A handle's look: the chain ("then") is a square, true/false a diamond,
 * everything else a dot — distinguishable without colour.
 */
function handleStyle(type: PortType, side: "left" | "right") {
	const shift = side === "left" ? "-50%" : "50%";
	return {
		width: 10,
		height: 10,
		background: PORT_COLOR[type],
		borderColor: "var(--background)",
		borderRadius: type === "flow" || type === "bool" ? 2 : 999,
		transform:
			type === "bool"
				? `translate(${shift}, -50%) rotate(45deg)`
				: `translate(${shift}, -50%)`,
	} as const;
}

/** The "no value" option — Radix Select refuses an empty string. */
const UNSET = "__unset__";

/**
 * One row of ports: an input on the left edge, an output on the right. The
 * handles sit inside the row, so each lines up with its caption.
 */
function PortRow(props: {
	input?: PortSpec;
	output?: PortSpec;
	wiredFrom: Record<string, string[]>;
}) {
	const { input, output } = props;
	return (
		<div className="relative flex items-center justify-between gap-3 h-5 px-3 text-[10px] text-muted-foreground">
			{input ? (
				<>
					<Handle
						type="target"
						position={Position.Left}
						id={input.id}
						style={handleStyle(input.type, "left")}
						title={`${input.label || PORT_TYPE_LABEL[input.type]} in`}
					/>
					<span className="truncate">
						{input.label}
						{input.id !== "in" &&
							(props.wiredFrom[input.id]?.length ?? 0) > 0 && (
								<span className="text-foreground">
									{" "}
									← {props.wiredFrom[input.id]?.join(", ")}
								</span>
							)}
					</span>
				</>
			) : (
				<span />
			)}
			{output ? (
				<>
					<span className="truncate text-right">{output.label}</span>
					<Handle
						type="source"
						position={Position.Right}
						id={output.id}
						style={handleStyle(output.type, "right")}
						title={`${output.label || PORT_TYPE_LABEL[output.type]} out`}
					/>
				</>
			) : null}
		</div>
	);
}

/**
 * One node on the canvas.
 *
 * Module-level and stable, both because xyflow keys its internal renderer on
 * `nodeTypes` identity and for the same reason widget components are
 * (AGENTS.md pattern 10): a fresh component identity remounts every node on
 * every render, which on a canvas also resets the drag.
 */
function GraphNodeCard({ id, data, selected }: NodeProps) {
	const {
		node,
		ports,
		wiredFrom,
		assigned,
		agentNames,
		featureName,
		featureType,
		conditionText,
		targetOptions,
		run,
		onPatch,
	} = data as CanvasNodeData;
	const runStyle = run ? RUN_STYLE[run.tone] : null;
	const style = KIND_STYLE[node.kind];
	const Icon =
		node.kind === "action"
			? node.action === "COVERAGE"
				? ScanLine
				: node.action === "NAVIGATE"
					? Navigation
					: Zap
			: style.icon;
	const rows = Math.max(ports.inputs.length, ports.outputs.length);
	// xyflow measures a node's handles when it resizes, not when a handle is
	// added: a condition switched to Agent holding gains its agent input at the
	// same size, and a wire into it would never be drawn. Re-measure whenever
	// the set of ports changes.
	const updateNodeInternals = useUpdateNodeInternals();
	const portSignature = [
		...ports.inputs.map((port) => `i:${port.id}:${port.type}`),
		...ports.outputs.map((port) => `o:${port.id}:${port.type}`),
	].join("|");
	useEffect(() => {
		updateNodeInternals(id);
	}, [id, portSignature, updateNodeInternals]);
	const targetWired = (wiredFrom.target?.length ?? 0) > 0;

	const incomplete =
		(node.kind === "agent" && !node.agent_id) ||
		(node.kind === "asset" && !node.feature_id) ||
		(node.kind === "action" &&
			(!node.action || (!node.feature_id && !targetWired))) ||
		(node.kind === "condition" && !node.condition) ||
		(node.kind === "wait" && (wiredFrom.when?.length ?? 0) === 0);

	return (
		<div
			className={`bg-background text-xs shadow-sm max-w-64 overflow-visible ${style.shape} ${
				selected ? "ring-2 ring-ring" : (runStyle?.ring ?? "")
			} ${incomplete ? "opacity-90" : ""}`}
		>
			<div
				className={`flex items-center gap-1.5 px-2.5 py-1 font-medium ${style.header} ${
					node.kind === "condition" ? "px-4" : ""
				} rounded-t-[inherit]`}
			>
				<Icon className="size-3.5 shrink-0" />
				<span className="truncate">{node.label || style.label}</span>
				<span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground">
					{node.kind === "action"
						? (node.action ?? "action")
						: style.label}
				</span>
			</div>

			{Array.from({ length: rows }, (_, index) => (
				<PortRow
					key={index}
					input={ports.inputs[index]}
					output={ports.outputs[index]}
					wiredFrom={wiredFrom}
				/>
			))}

			<div className="px-2.5 pb-1.5 pt-0.5 flex flex-col gap-1">
				{node.kind === "agent" && (
					<span
						className={
							node.agent_id ? "truncate" : "text-destructive"
						}
					>
						{node.agent_id
							? (agentNames[node.agent_id] ?? node.agent_id)
							: "no agent selected"}
					</span>
				)}

				{node.kind === "asset" && (
					<span
						className={`truncate ${node.feature_id ? "" : "text-destructive"}`}
						title={node.feature_id}
					>
						{node.feature_id
							? `${featureName || node.feature_id}${featureType ? ` · ${featureType}` : ""}`
							: "no map feature picked"}
					</span>
				)}

				{/* The inline target picker: the same thing as wiring an asset
				    in, so it steps aside while one is wired. */}
				{node.kind === "action" && !targetWired && (
					<Select
						value={node.feature_id || UNSET}
						onValueChange={(value) =>
							onPatch(node.id, {
								feature_id: value === UNSET ? undefined : value,
							})
						}
					>
						<SelectTrigger
							size="sm"
							className={`nodrag nokey h-6 w-full text-[11px] ${node.feature_id ? "" : "text-destructive"}`}
						>
							<SelectValue
								placeholder={
									node.action === "COVERAGE"
										? "Pick a zone"
										: "Pick a waypoint"
								}
							/>
						</SelectTrigger>
						<SelectContent className="nokey">
							<SelectItem value={UNSET}>
								{node.action === "COVERAGE"
									? "Pick a zone"
									: "Pick a waypoint"}
							</SelectItem>
							{targetOptions.map((option) => (
								<SelectItem
									key={option.feature_id}
									value={option.feature_id}
								>
									{option.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				{node.kind === "wait" && (
					<div className="nodrag nokey flex items-center gap-1">
						{(["all", "any"] as const).map((mode) => (
							<button
								key={mode}
								type="button"
								className={`rounded px-1.5 py-0.5 text-[10px] border ${
									(node.mode ?? "all") === mode
										? "bg-warning/25 border-warning font-medium"
										: "border-transparent text-muted-foreground"
								}`}
								onClick={() => onPatch(node.id, { mode })}
								title={
									mode === "all"
										? "Go on when EVERY condition wired in holds"
										: "Go on when ANY condition wired in holds"
								}
							>
								{mode === "all" ? "All of" : "Any of"}
							</button>
						))}
						<span className="text-[10px] text-muted-foreground">
							{wiredFrom.when?.length ?? 0} condition
							{(wiredFrom.when?.length ?? 0) === 1 ? "" : "s"}
						</span>
					</div>
				)}

				{node.kind === "condition" && (
					<span
						className={`truncate ${node.condition ? "" : "text-destructive"}`}
						title={conditionText}
					>
						{conditionText}
					</span>
				)}

				{(node.kind === "action" || node.kind === "wait") &&
					assigned.length > 0 && (
						<span
							className="truncate text-[10px] text-muted-foreground"
							title={`Run by ${assigned.join(", ")}`}
						>
							▸{" "}
							{assigned
								.map((id) => agentNames[id] ?? id.slice(0, 8))
								.join(", ")}
						</span>
					)}
				{run && runStyle && (
					<span
						className={`truncate text-[10px] font-medium ${runStyle.text}`}
						title={run.text}
					>
						● {run.text}
					</span>
				)}
			</div>
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
	wait: "Wait",
};

/** The flow ("then") edges are the chain: solid, heavier, arrowed. */
const FLOW_EDGE_STYLE = { stroke: PORT_COLOR.flow, strokeWidth: 2 } as const;

/** The type a stored edge carries: its source port's. */
function edgeType(
	edge: MissionGraphEdge,
	nodesById: ReadonlyMap<string, MissionGraphNode>,
	featureTypes: Readonly<Record<string, string>>,
): PortType {
	const source = nodesById.get(edge.source);
	if (!source) return "flow";
	return (
		nodePorts(source, featureTypes).outputs.find(
			(port) => port.id === edge.source_port,
		)?.type ?? "flow"
	);
}

/** Turn a stored graph into the canvas's edge list. */
function toCanvasEdges(
	graph: MissionGraph,
	featureTypes: Readonly<Record<string, string>>,
	selected: ReadonlySet<string> = new Set(),
): Edge[] {
	const byId = new Map(graph.nodes.map((node) => [node.id, node]));
	return graph.edges.map((edge) => {
		const type = edgeType(edge, byId, featureTypes);
		const color = PORT_COLOR[type];
		return {
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: edge.source_port,
			targetHandle: edge.target_port,
			selected: selected.has(edge.id),
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color,
				width: type === "flow" ? 16 : 12,
				height: type === "flow" ? 16 : 12,
			},
			style:
				type === "flow"
					? FLOW_EDGE_STYLE
					: {
							stroke: color,
							strokeWidth: 1.5,
							strokeDasharray: "5 4",
						},
		};
	});
}

/** The features an action's target can be picked from. */
function optionsFor(
	action: string | undefined,
	assets: readonly CatalogFeature[],
): FeatureOption[] {
	const wanted =
		action === "COVERAGE"
			? "zone"
			: action === "NAVIGATE"
				? "waypoint"
				: null;
	return assets
		.filter(
			(feature) =>
				wanted === null ||
				assetPortType(feature.feature_type) === wanted,
		)
		.map((feature) => ({
			feature_id: feature.feature_id,
			name: feature.name || feature.feature_id,
		}));
}

/** Where a dropped wire opened the create menu. */
interface DropMenu {
	/** Menu position, relative to the canvas box. */
	left: number;
	top: number;
	/** Where the new node goes, in canvas coordinates. */
	at: { x: number; y: number };
	from: DropOrigin;
	/** The mission whose canvas it was opened on. */
	missionId: string;
	choices: DropChoice[];
}

/** The id a drop choice is probed with before anything is created. */
const DROP_PROBE_ID = "__drop-probe__";

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
	 * The mission whose stored graph was made by the previous editor and was
	 * not read — by id, so switching missions cannot carry the notice over.
	 */
	const [outdatedFor, setOutdatedFor] = useState<string | null>(null);
	const [dropMenu, setDropMenu] = useState<DropMenu | null>(null);
	const canvasBox = useRef<HTMLDivElement>(null);
	/**
	 * Selection is EPHEMERAL UI state, held here and mirrored into the canvas
	 * arrays — never written into the persisted graph, which would mark a
	 * mission dirty for a click.
	 */
	const [selectedNodeIds, setSelectedNodeIds] =
		useState<readonly string[]>(NO_SELECTION);
	const [selectedEdgeIds, setSelectedEdgeIds] =
		useState<readonly string[]>(NO_SELECTION);
	// "Show me this node", from the mission feedback's list of where each
	// agent is: select it and bring it into view. Acted on per request (a
	// subscription, not an effect over the latest), reading the mission and
	// graph through a latest-ref so the subscription is made once.
	const { setCenter, getNode, screenToFlowPosition } = useReactFlow();
	const focusTarget = useRef<{
		missionId: string | null;
		graph: MissionGraph | null;
	}>({ missionId: null, graph: null });
	useEffect(() => {
		focusTarget.current = { missionId, graph };
	});
	useEffect(
		() =>
			subscribeGraphFocus((request) => {
				const { missionId: shownId, graph: shownGraph } =
					focusTarget.current;
				if (!shownId || request.missionId !== shownId) return;
				const node = shownGraph?.nodes.find(
					(n) => n.id === request.nodeId,
				);
				if (!node) return;
				setSelectedEdgeIds(NO_SELECTION);
				setSelectedNodeIds([node.id]);
				const measured = getNode(node.id)?.measured;
				void setCenter(
					node.position.x + (measured?.width ?? 180) / 2,
					node.position.y + (measured?.height ?? 80) / 2,
					{ zoom: 1.1, duration: 400 },
				);
			}),
		[getNode, setCenter],
	);
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
	 * resolve their own map and the pickers can describe a map nobody is
	 * looking at.
	 */
	const sharedMap = useActiveMap();
	const mapName = props.defaultMap?.trim() || sharedMap || registryMap || "";

	/**
	 * The stored graph document for a mission, read off one list call: the
	 * graph, or an empty canvas — flagged when the stored one is outdated.
	 */
	const adoptStoredGraph = useCallback((id: string, data: unknown) => {
		const raw = data as { missions?: unknown[] } | unknown[] | null;
		const list = Array.isArray(raw)
			? raw
			: Array.isArray(raw?.missions)
				? raw.missions
				: [];
		const wanted = graphDocId(id);
		const found = list.find(
			(entry) =>
				entry != null &&
				typeof entry === "object" &&
				(entry as { mission_id?: unknown }).mission_id === wanted,
		);
		// No document is the normal state of a mission nobody has authored
		// a graph for — an empty canvas, not an error. An outdated one is
		// not converted: the operator is told, and the next save replaces it.
		setOutdatedFor((prev) =>
			isOutdatedGraphDocument(found) ? id : prev === id ? null : prev,
		);
		setMissionGraph(id, readGraphDocument(found) ?? emptyMissionGraph());
	}, []);

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
			adoptStoredGraph(missionId, result.data);
		})();
		return () => {
			cancelled = true;
		};
	}, [missionId, executeMissionsList, adoptStoredGraph]);

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
	// fetches the map itself when nothing has published it yet.
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
	const navigateOptions = useMemo(
		() => optionsFor("NAVIGATE", assetFeatures),
		[assetFeatures],
	);
	const coverageOptions = useMemo(
		() => optionsFor("COVERAGE", assetFeatures),
		[assetFeatures],
	);

	const assignment = useMemo(
		() => (graph ? propagateAgents(graph) : new Map<string, string[]>()),
		[graph],
	);

	/**
	 * The compiled slice, with the feature types: without them a COVERAGE
	 * pointed at a waypoint raises nothing here, and the planner accepts the
	 * mission and returns an empty route. Nothing moves, and nothing said why.
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
	/** Node id → its first error, drawn on the node. */
	const nodeErrors = useMemo(() => {
		const out = new Map<string, string>();
		for (const issue of issues) {
			if (
				issue.severity === "error" &&
				issue.nodeId &&
				!out.has(issue.nodeId)
			)
				out.set(issue.nodeId, issue.message);
		}
		return out;
	}, [issues]);

	// ---- The graph IS the mission's allocation ------------------------------
	//
	// THE GRAPH IS THE SOLE AUTHOR of `vehicles`, `objective.geometries` and
	// `behavior`. `resolveGraphDraftWrite` carries the whole decision (and its
	// reasoning) and returns `null` when the draft already says this, which is
	// what keeps an edit-free render from marking the mission dirty or
	// re-notifying the store into a loop.
	useEffect(() => {
		if (!missionId || !draft) return;
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

	// ---- Canvas edits ------------------------------------------------------

	const patchNode = useCallback(
		(nodeId: string, patch: Partial<MissionGraphNode>) => {
			if (!missionId) return;
			editMissionGraph(missionId, (current) =>
				// A port the node no longer has takes its wire with it (a
				// condition that stops being Agent holding loses its agent).
				dropOrphanedEdges(
					{
						...current,
						nodes: current.nodes.map((node) =>
							node.id === nodeId ? { ...node, ...patch } : node,
						),
					},
					nodeId,
				),
			);
		},
		[missionId],
	);

	const canvasNodes = useMemo((): Node[] => {
		if (!graph) return [];
		const byId = new Map(graph.nodes.map((node) => [node.id, node]));
		const wired = new Map<string, Record<string, string[]>>();
		for (const edge of graph.edges) {
			const source = byId.get(edge.source);
			const into = wired.get(edge.target) ?? {};
			into[edge.target_port] = [
				...(into[edge.target_port] ?? []),
				source?.label || edge.source,
			];
			wired.set(edge.target, into);
		}
		return graph.nodes.map((node) => {
			const mark = runMarks.get(node.id);
			const problem = nodeErrors.get(node.id);
			return {
				id: node.id,
				type: "c2",
				position: node.position,
				selected: nodeSelection.has(node.id),
				data: {
					node,
					ports: nodePorts(node, featureTypes),
					wiredFrom: wired.get(node.id) ?? {},
					assigned: assignment.get(node.id) ?? [],
					agentNames,
					featureName: node.feature_id
						? (featureNames[node.feature_id] ?? "")
						: "",
					featureType: node.feature_id
						? (featureTypes[node.feature_id] ?? "")
						: "",
					conditionText: formatCondition(node.condition, {
						featureNames,
						agentNames,
					}),
					targetOptions:
						node.action === "COVERAGE"
							? coverageOptions
							: navigateOptions,
					// A live mark wins; otherwise the node's first error.
					run:
						mark ??
						(problem
							? { tone: "failed" as const, text: problem }
							: undefined),
					onPatch: patchNode,
				} satisfies CanvasNodeData,
			};
		});
	}, [
		graph,
		featureTypes,
		assignment,
		agentNames,
		featureNames,
		navigateOptions,
		coverageOptions,
		nodeSelection,
		runMarks,
		nodeErrors,
		patchNode,
	]);
	const canvasEdges = useMemo(
		() => (graph ? toCanvasEdges(graph, featureTypes, edgeSelection) : []),
		[graph, featureTypes, edgeSelection],
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

	const deleteNodes = useCallback(
		(nodeIds: readonly string[]) => {
			if (!missionId || nodeIds.length === 0) return;
			const doomed = new Set(nodeIds);
			editMissionGraph(missionId, (current) => ({
				...current,
				nodes: current.nodes.filter((node) => !doomed.has(node.id)),
				// Edges to a node that no longer exists are what break a graph
				// renderer, so they go with it.
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
	 * - `position` is the only xyflow-owned field the STORE keeps, so the
	 *   change set is applied to a throwaway node list and only the resulting
	 *   positions are written back.
	 * - `select` is ephemeral and lands in component state.
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
					current.nodes.map((node) => ({
						id: node.id,
						position: node.position,
						data: {},
					})),
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

	/** Edge changes from the canvas: selection, and removal. */
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

	/**
	 * Whether a drag may land here: same type, not already wired, and a step
	 * keeps one step before it. xyflow greys a refused target out as the
	 * pointer reaches it; the reason is said on release.
	 */
	const isValidConnection = useCallback(
		(connection: Edge | Connection) =>
			graph != null &&
			connectionPlan(
				graph.nodes,
				graph.edges,
				{
					node: connection.source,
					port: connection.sourceHandle ?? "",
				},
				{
					node: connection.target,
					port: connection.targetHandle ?? "",
				},
				featureTypes,
			).ok,
		[graph, featureTypes],
	);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (!missionId) return;
			let refused: string | null = null;
			editMissionGraph(missionId, (current) => {
				const result = wireGraph(
					current,
					{
						node: connection.source,
						port: connection.sourceHandle ?? "",
					},
					{
						node: connection.target,
						port: connection.targetHandle ?? "",
					},
					featureTypes,
				);
				if ("reason" in result) {
					refused = result.reason;
					return current;
				}
				return result.graph;
			});
			setNotice(refused);
		},
		[missionId, featureTypes],
	);

	/**
	 * A drag that ended somewhere other than a valid input: over a port it
	 * does not fit, say why; on empty canvas, offer the nodes that would take
	 * it.
	 */
	const onConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
			if (!graph || state.isValid || !state.fromHandle) return;
			const from = state.fromHandle;
			const side = from.type === "source" ? "source" : "target";
			const fromPort = from.id ?? "";
			if (state.toHandle) {
				const to = state.toHandle;
				const plan =
					side === "source"
						? connectionPlan(
								graph.nodes,
								graph.edges,
								{ node: from.nodeId, port: fromPort },
								{ node: to.nodeId, port: to.id ?? "" },
								featureTypes,
							)
						: connectionPlan(
								graph.nodes,
								graph.edges,
								{ node: to.nodeId, port: to.id ?? "" },
								{ node: from.nodeId, port: fromPort },
								featureTypes,
							);
				if (!plan.ok) setNotice(plan.reason);
				return;
			}
			// Dropped on a node, away from its ports: nothing to create there.
			// (`state.toNode` is only set near a handle, so the DOM is asked.)
			const target = event.target as Element | null;
			if (target?.closest?.(".react-flow__node")) return;
			const fromNode = graph.nodes.find(
				(node) => node.id === from.nodeId,
			);
			if (!fromNode) return;
			const ports = nodePorts(fromNode, featureTypes);
			const port = (
				side === "source" ? ports.outputs : ports.inputs
			).find((p) => p.id === fromPort);
			if (!port) return;
			const origin = { node: from.nodeId, port: fromPort, side } as const;
			// Only what would actually be wired: a probe of each choice.
			const choices = dropChoices(side, port.type).filter(
				(choice) =>
					applyDrop(
						graph,
						origin,
						choice,
						DROP_PROBE_ID,
						{ x: 0, y: 0 },
						featureTypes,
					) !== null,
			);
			if (choices.length === 0 || !missionId) return;
			const point =
				"changedTouches" in event ? event.changedTouches[0] : event;
			const box = canvasBox.current?.getBoundingClientRect();
			if (!point || !box) return;
			setDropMenu({
				left: point.clientX - box.left,
				top: point.clientY - box.top,
				at: screenToFlowPosition({
					x: point.clientX,
					y: point.clientY,
				}),
				from: origin,
				missionId,
				choices,
			});
		},
		[graph, featureTypes, screenToFlowPosition, missionId],
	);

	/** Create the picked node where the wire was dropped, already wired. */
	const createFromDrop = useCallback(
		(menu: DropMenu, choice: DropChoice) => {
			setDropMenu(null);
			if (!missionId) return;
			// A menu opened on another mission's canvas creates nothing here.
			if (menu.missionId !== missionId) return;
			const id = freshGraphId(choice.node.kind);
			let refused: string | null = null;
			editMissionGraph(missionId, (current) => {
				const next = applyDrop(
					current,
					menu.from,
					choice,
					id,
					menu.at,
					featureTypes,
				);
				if (!next) {
					refused = "That node cannot be wired there any more.";
					return current;
				}
				return next;
			});
			setNotice(refused);
			if (refused) return;
			setSelectedNodeIds([id]);
			setSelectedEdgeIds(NO_SELECTION);
		},
		[missionId, featureTypes],
	);

	const addNode = useCallback(
		(kind: GraphNodeKind, extra: Partial<MissionGraphNode> = {}) => {
			if (!missionId) return;
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
						...(kind === "wait" ? { mode: "all" as const } : {}),
						...extra,
					},
				],
			}));
			setSelectedNodeIds([id]);
			setSelectedEdgeIds(NO_SELECTION);
		},
		[missionId],
	);

	/**
	 * Add an agent node that ALLOCATES an agent, not a blank one: the first
	 * fleet agent the graph does not already carry, through the shared
	 * {@link addAgentNode} (the same implementation the mission map's marker
	 * toggle uses). A blank node when the fleet is unknown or fully allocated.
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
		// store rather than guessed.
		const added = getMissionGraph(missionId)?.nodes.find(
			(node) => !before.has(node.id),
		);
		if (added) setSelectedNodeIds([added.id]);
		setSelectedEdgeIds(NO_SELECTION);
	}, [missionId, graph, agents, addNode]);

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
	 * Refuse a delete the operator did not aim at the canvas: xyflow's
	 * `deleteKeyCode` listens on the DOCUMENT, so Backspace in the label field
	 * would otherwise delete the node being named.
	 */
	const onBeforeDelete = useCallback(
		async () => shouldHandleGraphShortcut(),
		[],
	);

	/** Escape closes the drop menu, then clears the selection. */
	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== "Escape") return;
			if (dropMenu) {
				setDropMenu(null);
				return;
			}
			if (!shouldHandleGraphShortcut(event.nativeEvent)) return;
			clearSelection();
		},
		[clearSelection, dropMenu],
	);

	// ---- Persistence -------------------------------------------------------

	/**
	 * Save the mission and its graph, as ONE action — the same one the map's
	 * Save mission runs ({@link saveMissionWithGraph}).
	 */
	const saveMission = useCallback(() => {
		if (!missionId || !graph) return;
		if (!props.missionsSaveDef) {
			setError("c2.missions.save is unavailable");
			return;
		}
		return run("save", async () => {
			const result = await saveMissionWithGraph(missionId, {
				list: () => executeMissionsList({}),
				save: (doc) => missionsSave.execute({ mission: doc }),
				featureTypes,
			});
			if (!result.ok) {
				const issues = (result.issues ?? [])
					.filter((issue) => issue.severity === "error")
					.map((issue) => `${issue.path}: ${issue.message}`);
				setError(
					issues.length > 0
						? `${result.error} ${issues.join(" · ")}`
						: result.error,
				);
				return;
			}
			setError(null);
			if (result.graphSaved) {
				setOutdatedFor((prev) => (prev === missionId ? null : prev));
			}
			setNotice(
				result.keptDirty
					? "Mission saved, but you have newer edits that are not."
					: compiles
						? "Mission saved."
						: "Mission saved, but the graph does not compile — the C2 will refuse it until the errors below are fixed.",
			);
		});
	}, [
		missionId,
		graph,
		compiles,
		props.missionsSaveDef,
		missionsSave,
		executeMissionsList,
		featureTypes,
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
			setError(null);
			setNotice(null);
			adoptStoredGraph(missionId, result.data);
		});
	}, [missionId, executeMissionsList, adoptStoredGraph, run]);

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
				    save mechanics the map uses. */}
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
					onClick={() =>
						addNode("action", {
							label: "Navigate",
							action: "NAVIGATE",
						})
					}
					title="Go to a waypoint"
				>
					<Navigation />
					Navigate
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() =>
						addNode("action", {
							label: "Coverage",
							action: "COVERAGE",
						})
					}
					title="Sweep a zone with the payload sensors"
				>
					<ScanLine />
					Coverage
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => addNode("wait")}
					title="Hold the chain until all (or any) of the conditions wired in hold"
				>
					<Hourglass />
					Wait
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => addNode("condition")}
					title="A true/false to wire into a Wait: elapsed time, findings, an agent holding"
				>
					<GitBranch />
					Condition
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => addNode("asset")}
					title="A map asset, to wire into one or more actions"
				>
					<MapPin />
					Asset
				</Button>

				<Separator
					orientation="vertical"
					className="data-[orientation=vertical]:h-6"
				/>

				{dirty && <Badge variant="outline">unsaved</Badge>}

				{/* The C2's verdict, in the operator's terms rather than the
				    compiler's. */}
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
						title="The C2 refuses this mission until the errors listed on the right are fixed."
					>
						C2 will refuse this mission
						{errorCount > 0 ? ` · ${errorCount} to fix` : ""}
					</Badge>
				)}

				<Button
					size="sm"
					className="ml-auto"
					disabled={busy || !graph || !props.missionsSaveDef}
					onClick={() => void saveMission()}
					title="Saves the mission and its graph together"
				>
					{pending === "save" ? (
						<Loader2 className="animate-spin" />
					) : (
						<Save />
					)}
					Save mission
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

			{outdatedFor === missionId && (
				<div className="text-xs text-warning bg-warning/10 px-2 py-1 shrink-0">
					This mission&apos;s graph was made by the previous editor
					and cannot be opened. Build it again here; saving the
					mission replaces the old one.
				</div>
			)}
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
				<div
					className="relative flex-1 min-w-0 min-h-0"
					ref={canvasBox}
				>
					<ReactFlow
						nodes={canvasNodes}
						edges={canvasEdges}
						nodeTypes={NODE_TYPES}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						onConnectEnd={onConnectEnd}
						isValidConnection={isValidConnection}
						onBeforeDelete={onBeforeDelete}
						onPaneClick={() => setDropMenu(null)}
						deleteKeyCode={DELETE_KEY_CODES}
						connectionLineStyle={{ strokeWidth: 2 }}
						fitView
						proOptions={{ hideAttribution: false }}
					>
						<Background />
						<Controls showInteractive={false} />
						<Panel position="top-left">
							<PortLegend />
						</Panel>
					</ReactFlow>

					{dropMenu && dropMenu.missionId === missionId && (
						<div
							className="nokey absolute z-10 flex flex-col min-w-36 rounded-md border bg-popover p-1 text-xs shadow-md"
							style={{ left: dropMenu.left, top: dropMenu.top }}
						>
							<span className="px-2 py-1 text-[10px] text-muted-foreground">
								Add and wire
							</span>
							{dropMenu.choices.map((choice) => (
								<button
									key={choice.key}
									type="button"
									className="rounded px-2 py-1 text-left hover:bg-accent"
									onClick={() =>
										createFromDrop(dropMenu, choice)
									}
								>
									{choice.label}
								</button>
							))}
						</div>
					)}
				</div>

				{/* Inspector + issues. `nokey` is xyflow's own opt-out: no key
				    pressed inside this panel is ever read as a canvas shortcut,
				    so Backspace in the label field cannot delete the node
				    being named. */}
				<div className="w-64 shrink-0 border-l flex flex-col min-h-0 nokey">
					<ScrollArea className="flex-1 min-h-0">
						<div className="p-2 flex flex-col gap-2">
							{selectedEdge ? (
								<EdgeInspector
									edge={selectedEdge}
									type={edgeType(
										selectedEdge,
										new Map(
											(graph?.nodes ?? []).map((node) => [
												node.id,
												node,
											]),
										),
										featureTypes,
									)}
									onDelete={() =>
										deleteEdges([selectedEdge.id])
									}
								/>
							) : selectedNode ? (
								<NodeInspector
									node={selectedNode}
									wiredFrom={
										(
											canvasNodes.find(
												(node) =>
													node.id === selectedNode.id,
											)?.data as
												CanvasNodeData | undefined
										)?.wiredFrom ?? {}
									}
									agents={agents.map((agent) => ({
										id: agent.agent_id,
										name: agent.name,
									}))}
									assets={assetFeatures}
									zones={zoneFeatures}
									targetOptions={
										selectedNode.action === "COVERAGE"
											? coverageOptions
											: navigateOptions
									}
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
										Each agent&apos;s chain runs left to
										right: drag from an output dot (right of
										a node) to an input dot (left) of the
										same colour. Drop a wire on empty canvas
										to add the node it needs.
									</p>
									<p className="text-[11px] text-muted-foreground">
										<strong>Delete</strong> or{" "}
										<strong>Backspace</strong> removes what
										is selected. <strong>Esc</strong> clears
										the selection. Neither fires while you
										are typing in a field.
									</p>
								</>
							)}

							<Separator />

							{/* What the mission currently allocates. It is written
							    into the draft as the operator authors — there
							    is nothing to press. */}
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

/** What each wire colour carries. Hoisted for a stable identity. */
function PortLegend() {
	const rows: [PortType, string][] = [
		["flow", "then (the chain)"],
		["waypoint", "place"],
		["agent", "agent"],
		["bool", "true/false"],
	];
	return (
		<div className="flex flex-col gap-0.5 rounded border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">
			{rows.map(([type, text]) => (
				<span key={type} className="flex items-center gap-1.5">
					<span
						className="inline-block size-2"
						style={{
							background: PORT_COLOR[type],
							borderRadius:
								type === "flow" || type === "bool" ? 1 : 999,
							transform:
								type === "bool" ? "rotate(45deg)" : undefined,
						}}
					/>
					{text}
				</span>
			))}
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

/**
 * Build a condition form off {@link CONDITION_OP_SHAPE}, and nothing else.
 *
 * Every control below is gated on the SHAPE of the chosen op, read from the one
 * table that is derived from the fog's own `evaluate()` switch.
 */
function ConditionEditor(props: {
	condition?: GraphCondition;
	zones: readonly CatalogFeature[];
	agents: { id: string; name: string }[];
	/** Captions of the agent nodes wired into the agent input, if any. */
	agentWiredFrom: string[];
	onChange: (condition: GraphCondition | undefined) => void;
}) {
	const { condition } = props;
	const shape = condition ? CONDITION_OP_SHAPE[condition.op] : null;

	/**
	 * Apply a patch and RE-NORMALIZE: `normalizeCondition` drops a `key`/`arg`
	 * the new op does not use and clamps the threshold into the unit that op
	 * reads.
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
					// the SAME unit; otherwise that op's own default applies.
					const keepThreshold =
						shape?.threshold ===
						CONDITION_OP_SHAPE[nextOp].threshold;
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
							{props.agentWiredFrom.length > 0 ? (
								<span className="text-[11px] text-muted-foreground">
									Wired from {props.agentWiredFrom.join(", ")}
								</span>
							) : (
								<Select
									value={condition.key || UNSET}
									onValueChange={(value) =>
										update({
											key:
												value === UNSET
													? undefined
													: value,
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
							)}
						</div>
					)}

					{shape.key === "flag" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Flag name</Label>
							{/* A flag IS a name the fog looks up in `s.flags` —
							    free text is correct here. */}
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

					{/* `threshold: "none"` renders NO control at all: a control
					    that changes nothing is a lie. */}
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
						Invert (NOT) — true when this is false
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
	wiredFrom: Record<string, string[]>;
	agents: { id: string; name: string }[];
	assets: readonly CatalogFeature[];
	zones: readonly CatalogFeature[];
	targetOptions: readonly FeatureOption[];
	onPatch: (patch: Partial<MissionGraphNode>) => void;
	onDelete: () => void;
}) {
	const { node } = props;
	const targetWired = props.wiredFrom.target ?? [];
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
						Wire its output into the target of one or more actions.
						The geometry lives on the mission map, not here.
					</p>
				</>
			)}

			{node.kind === "action" && (
				<>
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
					<Label className="text-[11px]">
						{node.action === "COVERAGE" ? "Zone" : "Waypoint"}
					</Label>
					{targetWired.length > 0 ? (
						<span className="text-[11px] text-muted-foreground">
							Wired from {targetWired.join(", ")}
						</span>
					) : (
						<Select
							value={node.feature_id || UNSET}
							onValueChange={(value) =>
								props.onPatch({
									feature_id:
										value === UNSET ? undefined : value,
								})
							}
						>
							<SelectTrigger size="sm" className="w-full">
								<SelectValue placeholder="Pick one" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={UNSET}>None</SelectItem>
								{props.targetOptions.map((option) => (
									<SelectItem
										key={option.feature_id}
										value={option.feature_id}
									>
										{option.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</>
			)}

			{node.kind === "wait" && (
				<Select
					value={node.mode ?? "all"}
					onValueChange={(value) =>
						props.onPatch({ mode: value as WaitMode })
					}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							Go on when ALL conditions hold
						</SelectItem>
						<SelectItem value="any">
							Go on when ANY condition holds
						</SelectItem>
					</SelectContent>
				</Select>
			)}

			{node.kind === "condition" && (
				<ConditionEditor
					condition={node.condition}
					zones={props.zones}
					agents={props.agents}
					agentWiredFrom={props.wiredFrom.agent ?? []}
					onChange={(condition) => props.onPatch({ condition })}
				/>
			)}
		</div>
	);
}

/** The selected edge: what it carries, and a mouse route to deleting it. */
function EdgeInspector(props: {
	edge: MissionGraphEdge;
	type: PortType;
	onDelete: () => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label className="text-xs">
					{props.type === "flow"
						? '"Then" link'
						: `${PORT_TYPE_LABEL[props.type]} link`}
				</Label>
				<Button
					size="icon-sm"
					variant="ghost"
					className="text-destructive"
					aria-label="Delete edge"
					title="Delete this link"
					onClick={props.onDelete}
				>
					<Trash2 />
				</Button>
			</div>
			<p className="text-[11px] text-muted-foreground">
				{props.type === "flow"
					? "The chain: the next step starts when this one ends."
					: `Carries a ${PORT_TYPE_LABEL[props.type]} from "${props.edge.source_port}" into "${props.edge.target_port}".`}
			</p>
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
		// must be OUTSIDE the component that renders `<ReactFlow>`.
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
			"Author a mission's behaviour graph: agents, their chains of actions, waits on conditions, and map assets",
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
