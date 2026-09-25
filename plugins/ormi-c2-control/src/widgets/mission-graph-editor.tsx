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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
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
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import {
	Background,
	ControlButton,
	Controls,
	Handle,
	MarkerType,
	MiniMap,
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
	useConnection,
	useReactFlow,
	useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	Bot,
	ChevronDown,
	CircleHelp,
	GitBranch,
	Hourglass,
	Loader2,
	Lock,
	LockOpen,
	MapPin,
	Navigation,
	LayoutGrid,
	Puzzle,
	Redo2,
	RefreshCw,
	Repeat,
	Save,
	ScanLine,
	Trash2,
	Undo2,
	Workflow,
	X,
	Zap,
} from "lucide-react";
import {
	Fragment,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import { type CatalogFeature } from "../state/c2-catalog-store";
import { useAgents } from "../state/c2-agents-store";
import { useMissionFeedbackExact } from "../state/mission-feedback-store";
import {
	editMissionDraft,
	useMissionDraft,
} from "../state/mission-draft-store";
import {
	editMissionGraph,
	getMissionGraph,
	redoMissionGraph,
	undoMissionGraph,
	useMissionGraphHistory,
	hasMissionGraph,
	setMissionGraph,
	useMissionGraph,
	useMissionGraphDirty,
} from "../state/mission-graph-store";
import {
	adoptStoredAssets,
	hasMissionAssets,
	isMissionAssetsDirty,
	useMissionAssets,
} from "../state/mission-assets-store";
import { saveMissionWithGraph } from "../state/mission-save";
import { subscribeGraphFocus } from "../state/graph-focus-store";
import { subscribeAssetFocus } from "../state/asset-focus-store";
import { assetUses } from "./mission-asset-tree";
import { useActiveMap, useSelectedMission } from "../state/selection-store";
import { assetFeatureTypes, assetId } from "./mission-assets";
import {
	applyDrop,
	applySelectionChanges,
	dropChoices,
	dropOrphanedEdges,
	copySelection,
	describeNodeDeletion,
	formatCondition,
	graphModeTitle,
	inspectedNodeId,
	layoutLanes,
	pasteClip,
	type GraphClip,
	programMarks,
	readStoredGraph,
	resolveGraphDraftWrite,
	resolveGraphViewOnly,
	revealDelta,
	applyNodeSizes,
	type NodeSize,
	type DropChoice,
	type GraphLoadState,
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
	nextNodePosition,
	normalizeCondition,
	propagateAgents,
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
import { humanizeMissionIssues } from "./mission-config-words";
import {
	PORT_TYPE_LABEL,
	assetPortType,
	connectionPlan,
	nodePorts,
	withArticle,
	type NodePorts,
	type PortSpec,
	type PortType,
} from "./mission-graph-ports";
import { PanelEmptyState } from "./panel-empty-state";
import { atMost, useContainerSize } from "./responsive";
import { MissionStatus } from "../types/c2-types";
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
 * coloured by what it carries (`mission-graph-ports.ts`): the dark `agent`
 * ports carry the ROBOT from step to step (the chain), green ports carry
 * places (waypoint / zone), pink carry true/false, amber carry contacts. A
 * drag is only accepted into an input of the same type; a refused drag says
 * why. Dropping a wire on empty canvas offers the nodes that could take it,
 * already wired.
 *
 * - An **action** takes the robot and its target (picked on the node, or
 *   wired from an asset), and hands the robot on when it is done. Its `done`
 *   says so to anyone who waits for it; a Coverage also reports each contact
 *   (`on contact`).
 * - A **Hold until** takes the robot and keeps it until all (or any) of what
 *   is wired into it holds: another step's `done`, a time, a contact count.
 * - An **On contact** node takes a Coverage's contacts and sends its robot to
 *   each in turn (its `position` is the target of the loop's Navigate), then
 *   lets it go on `no more`.
 * - A **condition** is a true/false: elapsed time, contacts found.
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
 * - **The asset list is the mission's.** A mission is a map, its assets and a
 *   graph: the pickers offer the mission's own waypoints, zones and cues
 *   (`state/mission-assets-store.ts`), so one drawn on the mission map beside
 *   it reaches them with no refresh.
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
	/**
	 * While a wire is being dragged: `portKey` → whether it could land there.
	 * `null` when no drag is in progress, which is the resting state.
	 */
	dragFit: Record<string, boolean> | null;
	/** `portKey` of the port the keyboard armed, when it is on THIS node. */
	armedPort: string | null;
	/** Showing rather than authoring: the inline pickers stand down. */
	viewOnly: boolean;
	/** Edit this node (the inline pickers). */
	onPatch: (nodeId: string, patch: Partial<MissionGraphNode>) => void;
	/** Enter/Space on a port: arm it, or finish the wire it started. */
	onPortKey: (ref: PortHandleRef) => void;
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
 *
 * Every entry is a SEMANTIC token. `bool` was `--chart-1`, a categorical chart
 * slot: those rotate hue between the themes (orange in light, blue in dark), so
 * "true/false" had no colour an operator could learn. The three place types
 * deliberately share `--success` — see {@link PORT_SHAPE}.
 */
const PORT_COLOR: Record<PortType, string> = {
	agent: "var(--foreground)",
	waypoint: "var(--success)",
	zone: "var(--success)",
	asset: "var(--success)",
	bool: "var(--info)",
	event: "var(--warning)",
};

/** How a port's dot is drawn. */
type PortShape = "square" | "circle" | "diamond" | "ring";

/**
 * The shape of each port type's dot.
 *
 * Colour alone cannot carry six types honestly: `waypoint`, `zone` and `asset`
 * are all places and all green, and the app has no sixth semantic colour to
 * give them. So the rule is two-dimensional and stated that way in the legend —
 * **colour says what family, shape says which member of it**: a green circle is
 * somewhere to go, a green square an area to sweep, a green ring an asset whose
 * type is not known yet (it fits either). The dark square is the robot, the blue
 * diamond a true/false, the amber circle contacts.
 *
 * What is NOT claimed anywhere any more is "connect dots of the same colour":
 * it was never the rule (an `asset` fits a `waypoint` input, a `zone` does not
 * fit a `waypoint` one), and the editor now shows the real answer while the
 * operator drags — see `dragFit`.
 */
const PORT_SHAPE: Record<PortType, PortShape> = {
	agent: "square",
	waypoint: "circle",
	zone: "square",
	asset: "ring",
	bool: "diamond",
	event: "circle",
};

/** How a port dot reads right now. */
type PortDotState = "idle" | "fits" | "dimmed" | "armed";

/** The visible dot's diameter, in px at zoom 1. */
const PORT_DOT_SIZE = 10;

/**
 * The transparent hit target around it.
 *
 * The dot is the only way to wire anything, and at 10 px it is a smaller target
 * than any button in the app — measured at ~6 px on screen at the zoom the
 * canvas opens at. The hit area is the handle itself and the dot is a child, so
 * the target grows without the canvas turning into a field of blobs.
 */
const PORT_HIT_SIZE = 22;

/**
 * The handle element: a transparent, centred hit target.
 *
 * @param side - Which edge of the node it sits on.
 * @returns Inline style for the `<Handle>`.
 */
function portHitStyle(side: "left" | "right") {
	const shift = side === "left" ? "-50%" : "50%";
	return {
		width: PORT_HIT_SIZE,
		height: PORT_HIT_SIZE,
		minWidth: PORT_HIT_SIZE,
		minHeight: PORT_HIT_SIZE,
		background: "transparent",
		border: "none",
		borderRadius: 999,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		transform: `translate(${shift}, -50%)`,
	} as const;
}

/**
 * The visible dot inside a handle.
 *
 * Its look carries the live connection state, which is why it is a child
 * element and not the handle's own `background`: an inline `background` on the
 * handle beats xyflow's `.connectingto.valid` rules outright, so for as long as
 * it was set there NOTHING highlighted as valid and nothing greyed out while a
 * wire was being dragged — the help text claimed a rule the canvas never showed.
 *
 * @param type - What the port carries.
 * @param state - How it reads right now.
 * @returns Inline style for the dot.
 */
function portDotStyle(type: PortType, state: PortDotState) {
	const shape = PORT_SHAPE[type];
	const color = PORT_COLOR[type];
	const size = state === "fits" || state === "armed" ? 14 : PORT_DOT_SIZE;
	return {
		width: size,
		height: size,
		boxSizing: "border-box" as const,
		background: shape === "ring" ? "var(--background)" : color,
		border:
			shape === "ring"
				? `3px solid ${color}`
				: `1px solid var(--background)`,
		borderRadius: shape === "square" || shape === "diamond" ? 2 : 999,
		transform: shape === "diamond" ? "rotate(45deg)" : undefined,
		opacity: state === "dimmed" ? 0.2 : 1,
		boxShadow:
			state === "fits" || state === "armed"
				? "0 0 0 3px var(--ring)"
				: undefined,
		transition: "width 80ms, height 80ms, opacity 80ms",
	} as const;
}

/**
 * Shape + accent per node kind, so a chain reads at a glance: agents are
 * pills, steps are cards, a Hold until is a gate, an On contact node a loop,
 * the values that feed them are small tags.
 */
const KIND_STYLE: Record<
	GraphNodeKind,
	{ label: string; shape: string; header: string; icon: typeof Bot }
> = {
	agent: {
		label: "Agent",
		// The chain's own colour, the one its `agent` port carries: a node
		// accent that disagrees with the port it emits is a second colour
		// system nobody stated.
		shape: "rounded-2xl border-2 border-foreground/60 min-w-36",
		header: "bg-foreground/10",
		icon: Bot,
	},
	action: {
		label: "Action",
		shape: "rounded-md border border-foreground/40 min-w-48",
		header: "bg-muted",
		icon: Zap,
	},
	wait: {
		label: "Hold until",
		shape: "rounded-md border-2 border-dashed border-warning min-w-40",
		header: "bg-warning/15",
		icon: Hourglass,
	},
	on_contact: {
		label: "On contact",
		shape: "rounded-md border-2 border-warning min-w-44",
		header: "bg-warning/15",
		icon: Repeat,
	},
	condition: {
		label: "Condition",
		// `--info`, the colour of the true/false its `value` port carries.
		shape: "rounded-full border border-info min-w-40",
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

/** The "no value" option — Radix Select refuses an empty string. */
const UNSET = "__unset__";

/**
 * The key a port is addressed by inside one node.
 *
 * An action's agent INPUT and its agent OUTPUT share the id `agent` — they are
 * two ends of the same thing — so anything keyed per port has to carry the side
 * as well, or a valid drop target would light its own source up too.
 *
 * @param side - `source` (an output) or `target` (an input).
 * @param id - The port id.
 * @returns The key.
 */
function portKey(side: "source" | "target", id: string): string {
	return `${side}:${id}`;
}

/** One end of a wire the operator is building with the keyboard. */
interface PortHandleRef {
	node: string;
	port: string;
	side: "source" | "target";
}

/**
 * One port: the transparent hit target, the dot inside it, and the keyboard
 * route to wiring it.
 *
 * There was no keyboard path to an edge at all — the graph could be read with
 * Tab and authored only with a pointer. Enter (or Space) on a port arms it,
 * Enter on a port of the other side completes the wire, Escape cancels; the
 * armed port carries the same halo a valid drop target does, so the two
 * gestures look like one feature.
 */
function GraphHandle(props: {
	nodeId: string;
	port: PortSpec;
	side: "source" | "target";
	nodeLabel: string;
	state: PortDotState;
	onPortKey?: (ref: PortHandleRef) => void;
}) {
	const { port, side, nodeId, nodeLabel } = props;
	const what = port.label || PORT_TYPE_LABEL[port.type];
	const direction = side === "source" ? "output" : "input";
	return (
		<Handle
			type={side === "source" ? "source" : "target"}
			position={side === "source" ? Position.Right : Position.Left}
			id={port.id}
			style={portHitStyle(side === "source" ? "right" : "left")}
			className="focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
			tabIndex={0}
			role="button"
			aria-label={`${nodeLabel}: ${what} ${direction} (${PORT_TYPE_LABEL[port.type]}). Enter to link.`}
			title={`${what} ${direction === "output" ? "out" : "in"}`}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				event.stopPropagation();
				props.onPortKey?.({ node: nodeId, port: port.id, side });
			}}
		>
			<span
				className="pointer-events-none"
				style={portDotStyle(port.type, props.state)}
			/>
		</Handle>
	);
}

/**
 * One row of ports: an input on the left edge, an output on the right. The
 * handles sit inside the row, so each lines up with its caption.
 */
function PortRow(props: {
	nodeId: string;
	nodeLabel: string;
	input?: PortSpec;
	output?: PortSpec;
	wiredFrom: Record<string, string[]>;
	/** {@link portKey} → whether a wire being dragged could land there; null when none is. */
	dragFit: Record<string, boolean> | null;
	/** {@link portKey} of the port the keyboard has armed, if it is on this node. */
	armed: string | null;
	onPortKey?: (ref: PortHandleRef) => void;
}) {
	const { input, output, dragFit, armed } = props;
	const stateOf = (side: "source" | "target", id: string): PortDotState => {
		const key = portKey(side, id);
		if (armed === key) return "armed";
		if (!dragFit) return "idle";
		return dragFit[key] ? "fits" : "dimmed";
	};
	return (
		<div className="relative flex items-center justify-between gap-3 h-5 px-3 text-[10px] text-muted-foreground">
			{input ? (
				<>
					<GraphHandle
						nodeId={props.nodeId}
						nodeLabel={props.nodeLabel}
						port={input}
						side="target"
						state={stateOf("target", input.id)}
						onPortKey={props.onPortKey}
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
					<GraphHandle
						nodeId={props.nodeId}
						nodeLabel={props.nodeLabel}
						port={output}
						side="source"
						state={stateOf("source", output.id)}
						onPortKey={props.onPortKey}
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
		dragFit,
		armedPort,
		viewOnly,
		onPatch,
		onPortKey,
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
		(node.kind === "wait" && (wiredFrom.when?.length ?? 0) === 0) ||
		(node.kind === "on_contact" && (wiredFrom.event?.length ?? 0) === 0);

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
					nodeId={id}
					nodeLabel={node.label || KIND_STYLE[node.kind].label}
					input={ports.inputs[index]}
					output={ports.outputs[index]}
					wiredFrom={wiredFrom}
					dragFit={dragFit}
					armed={armedPort}
					onPortKey={onPortKey}
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
						disabled={viewOnly}
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
					// A real ToggleGroup rather than two bare `<button>`s: the
					// hand-rolled pair was a ~14 px-tall target with no
					// `aria-pressed`, no focus ring and no disabled state. The
					// house control is the same control the mission map's
					// toolbars use.
					<div className="nodrag nokey flex items-center gap-1.5">
						<ToggleGroup
							type="single"
							variant="outline"
							size="sm"
							aria-label="Let go when"
							disabled={viewOnly}
							value={node.mode ?? "all"}
							onValueChange={(value) => {
								if (value === "all" || value === "any")
									onPatch(node.id, { mode: value });
							}}
						>
							<ToggleGroupItem
								value="all"
								className="h-6 px-1.5 text-[10px]"
								title="When all inputs hold"
							>
								All of
							</ToggleGroupItem>
							<ToggleGroupItem
								value="any"
								className="h-6 px-1.5 text-[10px]"
								title="When any input holds"
							>
								Any of
							</ToggleGroupItem>
						</ToggleGroup>
						<span className="text-[10px] text-muted-foreground">
							{wiredFrom.when?.length ?? 0} input
							{(wiredFrom.when?.length ?? 0) === 1 ? "" : "s"}
						</span>
					</div>
				)}

				{node.kind === "on_contact" && (
					<span
						className={`truncate ${(wiredFrom.event?.length ?? 0) > 0 ? "" : "text-destructive"}`}
					>
						{(wiredFrom.event?.length ?? 0) > 0
							? `each contact of ${wiredFrom.event?.join(", ")}`
							: "wire a Coverage's “on contact” in"}
					</span>
				)}

				{node.kind === "condition" && (
					<span
						className={`truncate ${node.condition ? "" : "text-destructive"}`}
						title={conditionText}
					>
						{conditionText}
					</span>
				)}

				{(node.kind === "action" ||
					node.kind === "wait" ||
					node.kind === "on_contact") &&
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

/**
 * What Ctrl+C copied: nodes and the edges between them. Module-level, so a
 * copy survives switching missions (a pasted asset then names the other
 * mission's asset, which the compiler reports).
 */
let graphClipboard: GraphClip | null = null;

/** Shared empty selection, so an unselected canvas keeps a stable identity. */
const NO_SELECTION: readonly string[] = Object.freeze([]);

/** No node measured yet, as one shared map. */
const NO_SIZES: ReadonlyMap<string, NodeSize> = new Map();

/** Air left between a node pulled into view and the edge it came in from. */
const REVEAL_MARGIN = 16;

/** How long the pan that brings a clicked node into view takes. */
const REVEAL_MS = 200;

/**
 * "No wire is being dragged", as one frozen object. `useConnection` compares its
 * selector's result shallowly, so a fresh literal per store update would
 * re-render every node on every pointer move of an unrelated pan.
 */
const NO_DRAG: { side: "source" | "target" | ""; node: string; port: string } =
	Object.freeze({ side: "", node: "", port: "" });

/** Default caption for a newly added node. */
const KIND_DEFAULT_LABEL: Record<GraphNodeKind, string> = {
	agent: "Agent",
	asset: "Asset",
	action: "Action",
	condition: "When",
	wait: "Hold until",
	on_contact: "On contact",
};

/** The robot's edges are the chain: solid, heavier, arrowed. */
const AGENT_EDGE_STYLE = { stroke: PORT_COLOR.agent, strokeWidth: 2 } as const;

/** The type a stored edge carries: its source port's. */
function edgeType(
	edge: MissionGraphEdge,
	nodesById: ReadonlyMap<string, MissionGraphNode>,
	featureTypes: Readonly<Record<string, string>>,
): PortType {
	const source = nodesById.get(edge.source);
	if (!source) return "agent";
	return (
		nodePorts(source, featureTypes).outputs.find(
			(port) => port.id === edge.source_port,
		)?.type ?? "agent"
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
				width: type === "agent" ? 16 : 12,
				height: type === "agent" ? 16 : 12,
			},
			style:
				type === "agent"
					? AGENT_EDGE_STYLE
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

/** Breathing room left around the graph when the view is fitted to it. */
const FIT_PADDING = 0.15;

/**
 * The smallest canvas a fit is believed at.
 *
 * `fitView` computes a zoom from the container's CURRENT box, and this widget
 * lives in a FlexLayout tab that mounts at its pre-layout size. Fitting then —
 * which is what the `fitView` prop and a mission-keyed `fitView()` both did —
 * solves for a few hundred pixels and is never recomputed, so every open showed
 * two enormous nodes with the rest off-screen. Below this the box is not
 * believed to be the real one yet.
 */
const MIN_FIT_BOX = 200;

// ============================================================================
// Theme
// ============================================================================

/**
 * Subscribe to whatever could change the app's light/dark resolution.
 *
 * The theme is a class on `<html>` (next-themes writes it there), so the class
 * attribute is the honest source; the media query is watched too because
 * `theme: "system"` leaves the class to follow it.
 *
 * @param onChange - Called when the resolution may have changed.
 * @returns Unsubscribe.
 */
function subscribeToColorScheme(onChange: () => void): () => void {
	if (typeof document === "undefined") return () => {};
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "data-theme", "style"],
	});
	const media = window.matchMedia?.("(prefers-color-scheme: dark)");
	media?.addEventListener("change", onChange);
	return () => {
		observer.disconnect();
		media?.removeEventListener("change", onChange);
	};
}

/** Whether the app is currently rendering dark. */
function readIsDark(): boolean {
	if (typeof document === "undefined") return false;
	return document.documentElement.classList.contains("dark");
}

/** Server snapshot: light, so the first paint matches the un-themed document. */
function readIsDarkOnServer(): boolean {
	return false;
}

/**
 * Whether the app is in dark mode.
 *
 * Read off the document rather than through `next-themes`, which this plugin
 * does not declare as a dependency — and `useSyncExternalStore` over an
 * identity-stable boolean rather than a `useState` + effect, per AGENTS.md's
 * React-Compiler-and-external-stores rule.
 *
 * xyflow needs this because it themes itself: without `colorMode` its minimap
 * is a solid white rectangle in the dark theme, its controls a white stack and
 * its attribution white on white.
 *
 * @returns True when dark.
 */
function useIsDarkTheme(): boolean {
	return useSyncExternalStore(
		subscribeToColorScheme,
		readIsDark,
		readIsDarkOnServer,
	);
}

/**
 * Colour of a node in the minimap — its kind's accent.
 *
 * Its default node colour is a light grey on a light grey background. A token
 * is safe here: xyflow applies it as a `style` fill, where `var()` resolves.
 * (Whether a node is drawn at all is a different matter: see
 * {@link applyNodeSizes}.)
 *
 * @param node - The canvas node.
 * @returns A raw theme token.
 */
function miniMapNodeColor(node: Node): string {
	const kind = (node.data as CanvasNodeData | undefined)?.node?.kind;
	switch (kind) {
		case "agent":
			return "var(--foreground)";
		case "asset":
			return "var(--success)";
		case "condition":
			return "var(--info)";
		case "wait":
		case "on_contact":
			return "var(--warning)";
		default:
			return "var(--muted-foreground)";
	}
}

/** The canvas + inspector, once the call definitions are resolved. */
function MissionGraphEditorBody(props: {
	missionsListDef: RemoteCallDefinition;
	missionsSaveDef?: RemoteCallDefinition;
	mapsListDef?: RemoteCallDefinition;
	defaultMap?: string;
}) {
	const missionId = useSelectedMission();
	const graph = useMissionGraph(missionId);
	const dirty = useMissionGraphDirty(missionId);
	const [canUndo, canRedo] = useMissionGraphHistory(missionId);
	/**
	 * The drag in progress: every position change of one drag shares its key,
	 * so undo takes the whole move back in one step.
	 */
	const moveGesture = useRef(0);
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

	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	/**
	 * The mission whose stored graph was made by the previous editor and was
	 * not read — by id, so switching missions cannot carry the notice over.
	 */
	const [outdatedFor, setOutdatedFor] = useState<string | null>(null);
	const [dropMenu, setDropMenu] = useState<DropMenu | null>(null);
	/**
	 * A refused (or missed) connection, said WHERE it happened.
	 *
	 * The refusal used to land in the panel-wide notice bar at the very top, in
	 * muted tone — up to 800 px from the port the operator was looking at, in
	 * the same colour as "Mission saved.". Here it is a destructive-toned card
	 * at the pointer.
	 */
	const [dropNotice, setDropNotice] = useState<{
		text: string;
		left: number;
		top: number;
	} | null>(null);
	/** The operator's own View/Author choice. See {@link resolveGraphViewOnly}. */
	const [readOnly, setReadOnly] = useState(false);
	/**
	 * The mission status under which the operator last took Author back over a
	 * committed plan, so that permission does not silently carry across the next
	 * transition (approved → started). See `map-view-mode.ts`.
	 */
	const [editUnlockedAt, setEditUnlockedAt] = useState<MissionStatus | null>(
		null,
	);
	/** The port a keyboard connection gesture is being built from. */
	const [keyFrom, setKeyFrom] = useState<PortHandleRef | null>(null);
	/** Whether the mission check (the status badge's popover) is open. */
	const [checkOpen, setCheckOpen] = useState(false);
	/** A node delete waiting to be confirmed, because it destroys wiring. */
	const [confirmDelete, setConfirmDelete] = useState<{
		nodeId: string;
		label: string;
		edges: number;
	} | null>(null);
	/** The canvas box, for `getBoundingClientRect` so a drop can be placed. */
	const canvasBox = useRef<HTMLDivElement>(null);
	/**
	 * The canvas AND the details panel beside it, measured together so the view
	 * is fitted once the tab has its real size. Not the canvas alone: the canvas
	 * narrows whenever the details panel opens, and that is a click, not a
	 * resize, so it must not re-fit the graph under the operator's pointer.
	 */
	const [workAreaRef, workAreaMeasure] = useContainerSize<HTMLDivElement>();
	/** The whole panel's width, which decides whether the mode captions fit. */
	const [rootRef, { size: panelSize }] = useContainerSize<HTMLDivElement>();
	/** xyflow themes itself; without this its minimap and controls stay light. */
	const dark = useIsDarkTheme();
	/**
	 * Selection is EPHEMERAL UI state, held here and mirrored into the canvas
	 * arrays — never written into the persisted graph, which would mark a
	 * mission dirty for a click.
	 */
	const [selectedNodeIds, setSelectedNodeIds] =
		useState<readonly string[]>(NO_SELECTION);
	const [selectedEdgeIds, setSelectedEdgeIds] =
		useState<readonly string[]>(NO_SELECTION);
	/**
	 * What xyflow measured of each node, carried back on the canvas nodes
	 * ({@link applyNodeSizes}): without it the minimap draws no node at all.
	 */
	const [nodeSizes, setNodeSizes] =
		useState<ReadonlyMap<string, NodeSize>>(NO_SIZES);
	// "Show me this node", from the mission feedback's list of where each
	// agent is: select it and bring it into view. Acted on per request (a
	// subscription, not an effect over the latest), reading the mission and
	// graph through a latest-ref so the subscription is made once.
	const {
		setCenter,
		getNode,
		screenToFlowPosition,
		fitView,
		getViewport,
		setViewport,
	} = useReactFlow();
	/**
	 * A node selected together with a camera move of its own (the focus
	 * requests below), which the reveal must not interrupt.
	 */
	const revealHandledFor = useRef<string | null>(null);
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
				revealHandledFor.current = node.id;
				const measured = getNode(node.id)?.measured;
				void setCenter(
					node.position.x + (measured?.width ?? 180) / 2,
					node.position.y + (measured?.height ?? 80) / 2,
					{ zoom: 1.1, duration: 400 },
				);
			}),
		[getNode, setCenter],
	);
	// An asset picked in the asset panel: select every node that uses it.
	useEffect(
		() =>
			subscribeAssetFocus((request) => {
				const { missionId: shownId, graph: shownGraph } =
					focusTarget.current;
				if (!shownId || request.missionId !== shownId) return;
				const uses = assetUses(shownGraph ?? null, request.featureId);
				setSelectedEdgeIds(NO_SELECTION);
				setSelectedNodeIds(uses.length > 0 ? uses : NO_SELECTION);
				const first = shownGraph?.nodes.find((n) => n.id === uses[0]);
				if (!first) return;
				revealHandledFor.current = first.id;
				const measured = getNode(first.id)?.measured;
				void setCenter(
					first.position.x + (measured?.width ?? 180) / 2,
					first.position.y + (measured?.height ?? 80) / 2,
					{ zoom: 1.1, duration: 400 },
				);
			}),
		[getNode, setCenter],
	);
	/** Map resolved from the registry — the last resort, see `fallbackMap`. */
	const [registryMap, setRegistryMap] = useState<string>("");
	const { pending, run } = useAsyncAction<string>();
	const busy = pending !== null;

	const { execute: executeMissionsList } = missionsList;
	const { execute: executeMapsList } = mapsList;

	/**
	 * The map a mission that has no map yet is placed on, when this editor is
	 * the first to load it: the map the mission map is showing, then the
	 * configured one, then whatever the registry lists first. A mission that
	 * has a map keeps it; the mission map follows it.
	 */
	const sharedMap = useActiveMap();
	const fallbackMap =
		sharedMap || props.defaultMap?.trim() || registryMap || "";

	/**
	 * Adopt the stored graph document for a mission.
	 *
	 * No document is the normal state of a mission nobody has authored a graph
	 * for — an empty canvas, not an error. A document this build cannot read is
	 * NOT that: it still describes an allocation the operator committed, so no
	 * graph slot is loaded for it at all. That is the whole fix — the editor
	 * used to load an empty graph, which (the graph being the sole author of
	 * `vehicles` / `objective.geometries`) wrote the allocation away before the
	 * operator had touched anything, and Save then persisted the loss. With no
	 * slot, `resolveGraphDraftWrite` has nothing to write, `saveMissionWithGraph`
	 * leaves the stored document alone, and the canvas says what is there and
	 * asks for a deliberate {@link startFreshGraph}.
	 */
	const adoptStoredGraph = useCallback((id: string, data: unknown) => {
		const load = readStoredGraph(id, data);
		if (load.kind === "outdated") {
			setOutdatedFor(id);
			return;
		}
		setOutdatedFor((prev) => (prev === id ? null : prev));
		setMissionGraph(id, load.graph);
	}, []);

	/**
	 * Replace an unreadable stored graph with a new, empty one — the deliberate
	 * action the named-unsupported canvas asks for. Nothing is written to the
	 * store until it is pressed.
	 */
	const startFreshGraph = useCallback(() => {
		if (!missionId) return;
		setMissionGraph(missionId, emptyMissionGraph());
		setOutdatedFor((prev) => (prev === missionId ? null : prev));
	}, [missionId]);

	/** Whether this mission's stored graph is one this build can read. */
	const graphLoad: GraphLoadState =
		outdatedFor === missionId ? "outdated" : "ready";

	// ---- Load the graph and the assets for the active mission --------------
	//
	// Coordinated through the stores, exactly as the mission draft is: a slot
	// that already exists is adopted rather than refetched, so a second editor
	// on the same mission cannot clobber an in-progress edit with a load.
	useEffect(() => {
		if (!missionId) return;
		const needGraph = !hasMissionGraph(missionId);
		const needAssets = !hasMissionAssets(missionId);
		if (!needGraph && !needAssets) return;
		let cancelled = false;
		void (async () => {
			const result = await executeMissionsList({});
			if (cancelled || !missionId) return;
			if (!result.success) {
				setError(
					result.error ?? "Could not load missions from the C2.",
				);
				return;
			}
			setError(null);
			if (needGraph && !hasMissionGraph(missionId))
				adoptStoredGraph(missionId, result.data);
			if (needAssets && !hasMissionAssets(missionId))
				adoptStoredAssets(missionId, result.data, fallbackMap);
		})();
		return () => {
			cancelled = true;
		};
		// A later map switch re-runs this and finds both slots: no refetch, and
		// a placed mission is never moved.
	}, [missionId, executeMissionsList, adoptStoredGraph, fallbackMap]);

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

	// ---- The mission's own assets -------------------------------------------
	//
	// A mission is a map, its assets and a graph: the pickers offer the
	// mission's waypoints, zones and cues, and the targets are checked against
	// them exactly as the fog checks them at submit. Null until loaded, and
	// then the targets are not checked (an unknown is not a verdict).
	const missionAssets = useMissionAssets(missionId);
	const assetFeatures = useMemo<CatalogFeature[]>(
		() =>
			(missionAssets?.features ?? []).map((feature) => ({
				feature_id: assetId(feature),
				name: feature.properties?.name,
				feature_type: feature.properties?.feature_type,
			})),
		[missionAssets],
	);
	const assetTypes = useMemo(
		() => (missionAssets ? assetFeatureTypes(missionAssets) : undefined),
		[missionAssets],
	);
	/** For the port types, which need a map (an unknown target is untyped). */
	const featureTypes = useMemo(() => assetTypes ?? {}, [assetTypes]);

	const agentNames = useMemo(() => {
		const out: Record<string, string> = {};
		for (const agent of agents) out[agent.agent_id] = agent.name;
		return out;
	}, [agents]);

	const featureNames = useMemo(() => {
		const out: Record<string, string> = {};
		for (const feature of assetFeatures) {
			out[feature.feature_id] = feature.name || feature.feature_id;
		}
		return out;
	}, [assetFeatures]);

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
	 * The compiled slice, with the mission's assets: every target must be one
	 * of them and of its action's type (TARGET_MISSING / TARGET_TYPE), the
	 * same check the fog makes at submit.
	 */
	const compiled = useMemo(
		() => (graph ? compileMissionGraph(graph, assetTypes) : null),
		[graph, assetTypes],
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
		const slice = resolveGraphDraftWrite(graph, compiled, draft, graphLoad);
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
	}, [missionId, graph, compiled, draft, graphLoad]);

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

	// ---- Showing rather than authoring -------------------------------------
	//
	// Approving a mission commits its plan. The mission map has stood its
	// authoring tools down on that for as long as it has shipped; this editor
	// never did, so an operator watching a running mission could nudge or
	// retarget a node, have it land in the shared draft, and have the next
	// Submit carry it. Same rule, same module, DERIVED rather than stored — see
	// `map-view-mode.ts` and `resolveGraphViewOnly`.
	const liveStatus = feedback?.status ?? null;
	const viewOnlyInput = {
		readOnly,
		status: liveStatus,
		editUnlockedAt,
	};
	const viewOnly = resolveGraphViewOnly(viewOnlyInput);
	const modeTitle = graphModeTitle(viewOnlyInput);

	/**
	 * Take View / Author. Leaving View is also how the operator overrides a
	 * committed plan's stand-down, so the status it was permitted under is
	 * remembered: the next transition is a new fact and takes the editor back.
	 */
	const setMode = useCallback(
		(wantView: boolean) => {
			setReadOnly(wantView);
			setEditUnlockedAt(wantView ? null : liveStatus);
			if (wantView) {
				setDropMenu(null);
				setDropNotice(null);
				setKeyFrom(null);
			}
		},
		[liveStatus],
	);
	const runMarks = useMemo(() => {
		const agentNodes = new Map<string, string[]>();
		const nodeLabels: Record<string, string> = {};
		for (const node of graph?.nodes ?? []) {
			nodeLabels[node.id] = node.label || node.action || node.id;
			if (node.kind !== "agent" || !node.agent_id) continue;
			agentNodes.set(node.agent_id, [
				...(agentNodes.get(node.agent_id) ?? []),
				node.id,
			]);
		}
		return programMarks(agentNodes, feedback?.program, nodeLabels);
	}, [graph, feedback?.program]);

	// ---- Canvas edits ------------------------------------------------------

	const patchNode = useCallback(
		(nodeId: string, patch: Partial<MissionGraphNode>) => {
			if (!missionId || viewOnly) return;
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
		[missionId, viewOnly],
	);

	/**
	 * Say why a wire was refused, WHERE it was refused.
	 *
	 * A message about a gesture belongs at the gesture. Clamped into the canvas
	 * so a drop at the very edge cannot put its own explanation off-screen.
	 *
	 * @param text - The reason, in the operator's terms.
	 * @param point - Client coordinates of the drop, when there was one.
	 */
	const showDropNotice = useCallback(
		(text: string, point?: { clientX: number; clientY: number }) => {
			const box = canvasBox.current?.getBoundingClientRect();
			if (!box) return;
			const left = point
				? Math.min(Math.max(point.clientX - box.left, 8), box.width - 8)
				: box.width / 2;
			const top = point
				? Math.min(Math.max(point.clientY - box.top, 8), box.height - 8)
				: 48;
			setDropNotice({ text, left, top });
		},
		[],
	);

	/**
	 * Wire two ports. The one path both the pointer and the keyboard take, so a
	 * rule can never hold for one gesture and not the other.
	 */
	const connectPorts = useCallback(
		(
			from: { node: string; port: string },
			to: { node: string; port: string },
			point?: { clientX: number; clientY: number },
		) => {
			if (!missionId || viewOnly) return;
			let refused: string | null = null;
			editMissionGraph(missionId, (current) => {
				const result = wireGraph(current, from, to, featureTypes);
				if ("reason" in result) {
					refused = result.reason;
					return current;
				}
				return result.graph;
			});
			if (refused) showDropNotice(refused, point);
			else setDropNotice(null);
		},
		[missionId, viewOnly, featureTypes, showDropNotice],
	);

	const onConnect = useCallback(
		(connection: Connection) => {
			connectPorts(
				{
					node: connection.source,
					port: connection.sourceHandle ?? "",
				},
				{
					node: connection.target,
					port: connection.targetHandle ?? "",
				},
			);
		},
		[connectPorts],
	);

	/**
	 * Enter / Space on a port: arm it, or finish the wire it started.
	 *
	 * The same port twice cancels, as does Escape. Two ports of the same side
	 * is not a wire and says so rather than silently re-arming, which is how an
	 * operator ends up believing they connected something.
	 */
	const onPortKey = useCallback(
		(ref: PortHandleRef) => {
			if (viewOnly) return;
			setDropMenu(null);
			if (!keyFrom) {
				setKeyFrom(ref);
				setDropNotice(null);
				return;
			}
			if (keyFrom.node === ref.node && keyFrom.port === ref.port) {
				setKeyFrom(null);
				return;
			}
			if (keyFrom.side === ref.side) {
				showDropNotice(
					keyFrom.side === "source"
						? "Both are outputs. Finish on an input (left side of a node)."
						: "Both are inputs. Start from an output (right side of a node).",
				);
				return;
			}
			const source = keyFrom.side === "source" ? keyFrom : ref;
			const target = keyFrom.side === "source" ? ref : keyFrom;
			connectPorts(
				{ node: source.node, port: source.port },
				{ node: target.node, port: target.port },
			);
			setKeyFrom(null);
		},
		[viewOnly, keyFrom, connectPorts, showDropNotice],
	);

	/**
	 * The handle a wire is being dragged from, or {@link NO_DRAG}.
	 *
	 * A SELECTOR over xyflow's store, not the whole connection: `connection.to`
	 * changes on every pointer move, and the panel would re-render the entire
	 * canvas at animation rate. What is selected is shallow-compared, so this
	 * changes exactly twice per gesture — once at the start, once at the end.
	 */
	const dragOrigin = useConnection((connection) =>
		connection.inProgress && connection.fromHandle
			? {
					side: connection.fromHandle.type,
					node: connection.fromHandle.nodeId,
					port: connection.fromHandle.id ?? "",
				}
			: NO_DRAG,
	);

	/**
	 * While a wire is being dragged: for every node, which of its ports could
	 * take it.
	 *
	 * This is the answer the canvas never gave. xyflow only marks the handle the
	 * pointer is currently ON (`.connectingto.valid`), which cannot tell an
	 * operator where to aim — and the old inline `background` on the handle beat
	 * even that rule, so nothing lit up and nothing greyed out at all. The rule
	 * is `connectionPlan`, the same one that decides the drop, so what lights up
	 * and what is accepted cannot disagree.
	 */
	const dragFitByNode = useMemo(() => {
		if (!graph || !dragOrigin.node) return null;
		const fromSource = dragOrigin.side === "source";
		const originSide: "source" | "target" = fromSource
			? "source"
			: "target";
		const origin = { node: dragOrigin.node, port: dragOrigin.port };
		const out = new Map<string, Record<string, boolean>>();
		for (const node of graph.nodes) {
			const ports = nodePorts(node, featureTypes);
			const fits: Record<string, boolean> = {};
			// The port being dragged from keeps its own highlight.
			if (node.id === dragOrigin.node) {
				fits[portKey(originSide, dragOrigin.port)] = true;
			}
			for (const port of fromSource ? ports.inputs : ports.outputs) {
				const here = { node: node.id, port: port.id };
				const plan = fromSource
					? connectionPlan(
							graph.nodes,
							graph.edges,
							origin,
							here,
							featureTypes,
						)
					: connectionPlan(
							graph.nodes,
							graph.edges,
							here,
							origin,
							featureTypes,
						);
				fits[portKey(fromSource ? "target" : "source", port.id)] =
					plan.ok;
			}
			out.set(node.id, fits);
		}
		return out;
	}, [graph, dragOrigin, featureTypes]);

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
			const kindLabel = KIND_STYLE[node.kind].label;
			return {
				id: node.id,
				type: "c2",
				position: node.position,
				measured: nodeSizes.get(node.id),
				selected: nodeSelection.has(node.id),
				// The node wrapper is `tabindex=0 role="group"` and carried no
				// name at all, so a screen reader announced twelve identical
				// groups. xyflow also resets its own focus outline
				// (`.react-flow__node.selectable:focus-visible { outline: none }`),
				// which is why a focused node was pixel-identical to an
				// unfocused one — and Delete then destroyed a node the operator
				// could not see was selected. A `ring` (box-shadow) rather than
				// an `outline`, so xyflow's reset cannot win.
				ariaLabel: `${kindLabel}: ${node.label || kindLabel}${
					problem ? `. Problem: ${problem}` : ""
				}`,
				className:
					"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md",
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
					dragFit: dragFitByNode?.get(node.id) ?? null,
					armedPort:
						keyFrom && keyFrom.node === node.id
							? portKey(keyFrom.side, keyFrom.port)
							: null,
					viewOnly,
					onPatch: patchNode,
					onPortKey,
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
		nodeSizes,
		dragFitByNode,
		keyFrom,
		viewOnly,
		patchNode,
		onPortKey,
	]);
	const canvasEdges = useMemo(
		() => (graph ? toCanvasEdges(graph, featureTypes, edgeSelection) : []),
		[graph, featureTypes, edgeSelection],
	);

	/**
	 * The node the details panel is open for: exactly one selected node and
	 * nothing else ({@link inspectedNodeId}). The panel's visibility IS this
	 * value, so it cannot drift from the selection.
	 */
	const selectedNode = useMemo(() => {
		const id = inspectedNodeId(selectedNodeIds, selectedEdgeIds);
		return id
			? (graph?.nodes.find((node) => node.id === id) ?? null)
			: null;
	}, [graph, selectedNodeIds, selectedEdgeIds]);

	// ---- Keeping the inspected node out from under the panel ----------------
	//
	// Opening the panel narrows the canvas and deliberately leaves the view
	// where it is, so a node clicked near the right edge can end up beneath the
	// panel. Once the panel is laid out (a layout effect: the canvas narrowed in
	// this same commit), the view pans by the least that shows the whole node,
	// and not at all when it is already in view. Keyed on the id alone, so
	// editing the node never moves anything.
	const inspectedId = selectedNode?.id ?? null;
	useLayoutEffect(() => {
		const handled = revealHandledFor.current === inspectedId;
		revealHandledFor.current = null;
		if (!inspectedId || handled) return;
		const canvas = canvasBox.current;
		const element = canvas?.querySelector(
			`.react-flow__node[data-id="${CSS.escape(inspectedId)}"]`,
		);
		if (!canvas || !element) return;
		const { dx, dy } = revealDelta(
			element.getBoundingClientRect(),
			canvas.getBoundingClientRect(),
			REVEAL_MARGIN,
		);
		if (dx === 0 && dy === 0) return;
		const { x, y, zoom } = getViewport();
		void setViewport(
			{ x: x + dx, y: y + dy, zoom },
			{ duration: REVEAL_MS },
		);
	}, [inspectedId, getViewport, setViewport]);

	const deleteNodes = useCallback(
		(nodeIds: readonly string[]) => {
			if (!missionId || viewOnly || nodeIds.length === 0) return;
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
		[missionId, viewOnly],
	);

	const deleteEdges = useCallback(
		(edgeIds: readonly string[]) => {
			if (!missionId || viewOnly || edgeIds.length === 0) return;
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
		[missionId, viewOnly],
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
			const sizes = changes.flatMap((change) =>
				change.type === "dimensions" && change.dimensions
					? [{ id: change.id, ...change.dimensions }]
					: [],
			);
			if (sizes.length > 0) {
				setNodeSizes((prev) => applyNodeSizes(prev, sizes));
			}

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

			// Selection is the one change that still lands in View: reading a
			// running graph means clicking nodes.
			if (viewOnly) return;

			const removed = changes.flatMap((change) =>
				change.type === "remove" ? [change.id] : [],
			);
			if (removed.length > 0) {
				// The Delete key is the fast path an operator repeats, so it
				// keeps working without a modal — but it leaves the undo cue
				// on screen, which the canvas never did. The inspector's
				// Delete, which is deliberate and single, confirms instead.
				const cost = removed.map((id) =>
					describeNodeDeletion(graph, id),
				);
				const links = cost.reduce((sum, one) => sum + one.edges, 0);
				deleteNodes(removed);
				setNotice(
					`Deleted ${
						cost.length === 1
							? `“${cost[0]?.label}”`
							: `${cost.length} nodes`
					}${links > 0 ? ` and ${links} link${links === 1 ? "" : "s"}` : ""}. Ctrl+Z to undo.`,
				);
			}

			const positional = changes.filter(
				(change) => change.type === "position",
			);
			if (positional.length === 0) return;
			const gesture = `move:${moveGesture.current}`;
			// The drop ends the gesture: the next drag is a step of its own.
			if (positional.some((change) => change.dragging === false)) {
				moveGesture.current += 1;
			}
			editMissionGraph(
				missionId,
				(current) => {
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
				},
				gesture,
			);
		},
		[missionId, viewOnly, graph, deleteNodes],
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

			if (viewOnly) return;
			const removed = changes.flatMap((change) =>
				change.type === "remove" ? [change.id] : [],
			);
			if (removed.length > 0) deleteEdges(removed);
		},
		[missionId, viewOnly, deleteEdges],
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

	/**
	 * A drag that ended somewhere other than a valid input: over a port it
	 * does not fit, say why; on empty canvas, offer the nodes that would take
	 * it.
	 */
	const onConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
			if (!graph || state.isValid || !state.fromHandle || viewOnly)
				return;
			const from = state.fromHandle;
			const side = from.type === "source" ? "source" : "target";
			const fromPort = from.id ?? "";
			const point =
				"changedTouches" in event ? event.changedTouches[0] : event;
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
				if (!plan.ok) showDropNotice(plan.reason, point);
				return;
			}
			const fromNode = graph.nodes.find(
				(node) => node.id === from.nodeId,
			);
			const ports = fromNode
				? nodePorts(fromNode, featureTypes)
				: { inputs: [], outputs: [] };
			const port = (
				side === "source" ? ports.outputs : ports.inputs
			).find((p) => p.id === fromPort);
			// Dropped on a node, away from its ports. It used to produce
			// NOTHING AT ALL — the commonest way to miss, and the one the
			// operator is least able to explain to themselves.
			const target = event.target as Element | null;
			if (target?.closest?.(".react-flow__node")) {
				showDropNotice(
					port
						? `Drop on a ${PORT_TYPE_LABEL[port.type]} port, not on the node.`
						: "Drop on a port, not on the node.",
					point,
				);
				return;
			}
			if (!fromNode || !port) return;
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
			if (choices.length === 0 || !missionId) {
				showDropNotice(
					`Nothing takes ${withArticle(PORT_TYPE_LABEL[port.type])} from this port. Add the node first, then wire it.`,
					point,
				);
				return;
			}
			const box = canvasBox.current?.getBoundingClientRect();
			if (!point || !box) return;
			setDropNotice(null);
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
		[
			graph,
			viewOnly,
			featureTypes,
			screenToFlowPosition,
			missionId,
			showDropNotice,
		],
	);

	/** Create the picked node where the wire was dropped, already wired. */
	const createFromDrop = useCallback(
		(menu: DropMenu, choice: DropChoice) => {
			setDropMenu(null);
			if (!missionId || viewOnly) return;
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
			if (refused) {
				showDropNotice(refused);
				return;
			}
			setDropNotice(null);
			setSelectedNodeIds([id]);
			setSelectedEdgeIds(NO_SELECTION);
		},
		[missionId, viewOnly, featureTypes, showDropNotice],
	);

	const addNode = useCallback(
		(kind: GraphNodeKind, extra: Partial<MissionGraphNode> = {}) => {
			if (!missionId || viewOnly) return;
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
		[missionId, viewOnly],
	);

	/**
	 * Add an agent node that ALLOCATES an agent, not a blank one: the first
	 * fleet agent the graph does not already carry, through the shared
	 * {@link addAgentNode} (the same implementation the mission map's marker
	 * toggle uses). A blank node when the fleet is unknown or fully allocated.
	 */
	const addAgent = useCallback(() => {
		if (!missionId || viewOnly) return;
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
	}, [missionId, viewOnly, graph, agents, addNode]);

	/** Select exactly one node — the issue list's click-through. */
	const selectOnlyNode = useCallback((nodeId: string) => {
		setSelectedNodeIds([nodeId]);
		setSelectedEdgeIds(NO_SELECTION);
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedNodeIds((prev) => (prev.length > 0 ? NO_SELECTION : prev));
		setSelectedEdgeIds((prev) => (prev.length > 0 ? NO_SELECTION : prev));
	}, []);

	// ---- Fitting the view to the graph -------------------------------------
	//
	// The view is fitted when the work area is ACTUALLY SIZED, and re-fitted if
	// it is resized — but never under the operator: once they have panned or
	// zoomed themselves, the view is theirs until they switch mission. The work
	// area is the canvas plus the details panel, so opening or closing the
	// panel (which only narrows the canvas, and xyflow keeps the transform
	// anchored top-left) never moves the graph.
	const nodeCount = graph?.nodes.length ?? 0;
	const { width: canvasWidth, height: canvasHeight } = workAreaMeasure;
	const operatorMovedView = useRef(false);
	const lastFitKey = useRef("");
	const onMoveStart = useCallback((event: unknown) => {
		// A programmatic move (our own `fitView`) passes a null event; only a
		// real gesture takes the view away from us.
		if (event) operatorMovedView.current = true;
	}, []);
	useEffect(() => {
		operatorMovedView.current = false;
		lastFitKey.current = "";
	}, [missionId]);
	useEffect(() => {
		if (canvasWidth < MIN_FIT_BOX || canvasHeight < MIN_FIT_BOX) return;
		if (nodeCount === 0) return;
		const key = `${missionId}|${canvasWidth}x${canvasHeight}`;
		if (lastFitKey.current === key) return;
		// A re-fit on resize is a courtesy; the operator's own view is not.
		const first = lastFitKey.current === "";
		if (!first && operatorMovedView.current) return;
		lastFitKey.current = key;
		// The opening fit is animated; the ones that track a resize drag are
		// not, or every intermediate width would start its own 300 ms tween.
		void fitView({ duration: first ? 300 : 0, padding: FIT_PADDING });
	}, [missionId, canvasWidth, canvasHeight, nodeCount, fitView]);

	// ---- Keyboard ----------------------------------------------------------

	/**
	 * Refuse a delete the operator did not aim at the canvas: xyflow's
	 * `deleteKeyCode` listens on the DOCUMENT, so Backspace in the label field
	 * would otherwise delete the node being named.
	 */
	const onBeforeDelete = useCallback(
		async () => !viewOnly && shouldHandleGraphShortcut(),
		[viewOnly],
	);

	/** Take back / do again the last edit (a whole drag is one). */
	const undo = useCallback(() => {
		if (viewOnly) return;
		if (missionId && undoMissionGraph(missionId)) setDropMenu(null);
	}, [missionId, viewOnly]);
	const redo = useCallback(() => {
		if (viewOnly) return;
		if (missionId && redoMissionGraph(missionId)) setDropMenu(null);
	}, [missionId, viewOnly]);

	/** One lane per agent, in the order its robot takes the steps. */
	const tidy = useCallback(() => {
		if (!missionId || viewOnly) return;
		editMissionGraph(missionId, layoutLanes);
		void fitView({ duration: 300, padding: FIT_PADDING });
	}, [missionId, viewOnly, fitView]);

	/** Copy the selected nodes (not agents) and the edges between them. */
	const copy = useCallback(() => {
		if (!graph) return;
		const clip = copySelection(graph, selectedNodeIds);
		if (clip) graphClipboard = clip;
	}, [graph, selectedNodeIds]);

	/** Paste what was copied, beside the originals, and select the copies. */
	const paste = useCallback(() => {
		const clip = graphClipboard;
		if (!missionId || viewOnly || !clip) return;
		let pasted: string[] = [];
		editMissionGraph(missionId, (current) => {
			const result = pasteClip(current, clip);
			pasted = result.ids;
			return result.graph;
		});
		setSelectedEdgeIds(NO_SELECTION);
		setSelectedNodeIds(pasted);
	}, [missionId, viewOnly]);

	/**
	 * Escape closes the drop menu, then clears the selection. Ctrl/Cmd+Z
	 * undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, Ctrl/Cmd+C and +V copy and
	 * paste nodes — none of them while typing in a field.
	 */
	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			const mod = event.ctrlKey || event.metaKey;
			const key = event.key.toLowerCase();
			if (
				mod &&
				(key === "z" || key === "y" || key === "c" || key === "v")
			) {
				if (!shouldHandleGraphShortcut(event.nativeEvent)) return;
				event.preventDefault();
				if (key === "c") copy();
				else if (key === "v") paste();
				else if (key === "y" || event.shiftKey) redo();
				else undo();
				return;
			}
			if (event.key !== "Escape") return;
			if (dropMenu) {
				setDropMenu(null);
				return;
			}
			// A half-built keyboard wire is the nearest thing to "cancel".
			if (keyFrom) {
				setKeyFrom(null);
				return;
			}
			if (dropNotice) {
				setDropNotice(null);
				return;
			}
			if (!shouldHandleGraphShortcut(event.nativeEvent)) return;
			clearSelection();
		},
		[
			clearSelection,
			dropMenu,
			keyFrom,
			dropNotice,
			undo,
			redo,
			copy,
			paste,
		],
	);

	// ---- Deleting a node ---------------------------------------------------

	/**
	 * Delete a node — through a confirmation when it takes wiring with it.
	 *
	 * An unwired node is its own explanation and goes straight away; one in the
	 * middle of a chain takes the steps either side of it apart, and nothing
	 * said so until it was gone. Both paths leave the undo cue on screen, which
	 * the canvas never did either.
	 */
	const requestDeleteNode = useCallback(
		(nodeId: string) => {
			if (viewOnly) return;
			const doomed = describeNodeDeletion(graph, nodeId);
			if (doomed.edges === 0) {
				deleteNodes([nodeId]);
				setNotice(`Deleted “${doomed.label}”. Ctrl+Z to undo.`);
				return;
			}
			setConfirmDelete({ nodeId, ...doomed });
		},
		[graph, viewOnly, deleteNodes],
	);

	/** Carry out a confirmed node deletion. */
	const confirmDeleteNode = useCallback(() => {
		if (!confirmDelete) return;
		deleteNodes([confirmDelete.nodeId]);
		setNotice(
			`Deleted “${confirmDelete.label}” and ${confirmDelete.edges} link${
				confirmDelete.edges === 1 ? "" : "s"
			}. Ctrl+Z to undo.`,
		);
		setConfirmDelete(null);
	}, [confirmDelete, deleteNodes]);

	// ---- Persistence -------------------------------------------------------

	/**
	 * Save the mission and its graph, as ONE action — the same one the map's
	 * Save mission runs ({@link saveMissionWithGraph}).
	 */
	const saveMission = useCallback(() => {
		if (!missionId || !graph) return;
		if (!props.missionsSaveDef) {
			setError("This C2 cannot save missions.");
			return;
		}
		return run("save", async () => {
			const result = await saveMissionWithGraph(missionId, {
				list: () => executeMissionsList({}),
				save: (doc) => missionsSave.execute({ mission: doc }),
			});
			if (!result.ok) {
				const issues = humanizeMissionIssues(
					(result.issues ?? []).filter(
						(issue) => issue.severity === "error",
					),
				).map((issue) =>
					issue.path
						? `${issue.path}: ${issue.message}`
						: issue.message,
				);
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
					? "Mission saved. Newer edits are not saved yet."
					: compiles
						? "Mission saved."
						: "Mission saved. The C2 will refuse it until the errors are fixed.",
			);
		});
	}, [
		missionId,
		graph,
		compiles,
		props.missionsSaveDef,
		missionsSave,
		executeMissionsList,
		run,
	]);

	const reload = useCallback(() => {
		if (!missionId) return;
		return run("reload", async () => {
			const result = await executeMissionsList({});
			if (!result.success) {
				setError(
					result.error ?? "Could not load missions from the C2.",
				);
				return;
			}
			setError(null);
			setNotice(null);
			adoptStoredGraph(missionId, result.data);
			// Unsaved asset edits (drawn on the map) are not thrown away by a
			// graph reload.
			if (!isMissionAssetsDirty(missionId))
				adoptStoredAssets(missionId, result.data, fallbackMap);
		});
	}, [missionId, executeMissionsList, adoptStoredGraph, fallbackMap, run]);

	if (!missionId) {
		return (
			<PanelEmptyState>
				Select a mission to edit its graph.
			</PanelEmptyState>
		);
	}

	// A narrow widget drops the View/Author captions and keeps the icons.
	const narrow = atMost("md", panelSize);
	const verdict = compiles
		? "C2 will accept"
		: errorCount > 0
			? `Submit blocked · ${errorCount} to fix`
			: "Submit blocked";
	const outdated = graphLoad === "outdated";

	return (
		// `tabIndex={-1}` makes the panel the nearest focusable ancestor, so a
		// click anywhere inside it lands focus in this subtree and the Escape
		// shortcut below is reachable without a window listener. The focus ring
		// is restored on `focus-visible` — the blanket `outline-none` that used
		// to be here left keyboard focus invisible everywhere inside.
		<div
			ref={rootRef}
			className="h-full min-w-0 flex flex-col gap-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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
					disabled={!draft || viewOnly}
					title={
						draft
							? viewOnly
								? "Choose Author to rename."
								: undefined
							: "Open this mission on the mission map first."
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

				{/* Showing vs authoring. Labelled "Author" rather than "Edit" so
				    it reads as a mode and not as a tool, exactly as on the
				    mission map — and when the editor stood down by ITSELF the
				    title says why, because an operator who pressed nothing
				    cannot otherwise tell where the tools went. */}
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					aria-label="Graph mode"
					title={modeTitle}
					value={viewOnly ? "view" : "author"}
					onValueChange={(value) => {
						if (value && (value === "view") !== viewOnly)
							setMode(value === "view");
					}}
				>
					<ToggleGroupItem
						value="view"
						aria-label="View mode"
						className="flex-none px-2.5"
					>
						<Lock />
						{narrow ? null : "View"}
					</ToggleGroupItem>
					<ToggleGroupItem
						value="author"
						aria-label="Author mode"
						className="flex-none px-2.5"
					>
						<LockOpen />
						{narrow ? null : "Author"}
					</ToggleGroupItem>
				</ToggleGroup>

				{!viewOnly && !outdated && (
					<>
						<Separator
							orientation="vertical"
							className="data-[orientation=vertical]:h-6"
						/>

						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={addAgent}
							title="Allocate a fleet agent"
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
							title="Sweep a zone"
						>
							<ScanLine />
							Coverage
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => addNode("wait")}
							title="Wait until its inputs hold"
						>
							<Hourglass />
							Hold until
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => addNode("on_contact")}
							title="Visit each contact a Coverage reports"
						>
							<Repeat />
							On contact
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => addNode("condition")}
							title="A true/false for a Hold until"
						>
							<GitBranch />
							Condition
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => addNode("asset")}
							title="A map asset to target"
						>
							<MapPin />
							Asset
						</Button>

						<Separator
							orientation="vertical"
							className="data-[orientation=vertical]:h-6"
						/>

						<Button
							size="icon-sm"
							variant="ghost"
							disabled={!canUndo}
							onClick={undo}
							title="Undo (Ctrl+Z)"
							aria-label="Undo"
						>
							<Undo2 />
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							disabled={!canRedo}
							onClick={redo}
							title="Redo (Ctrl+Shift+Z)"
							aria-label="Redo"
						>
							<Redo2 />
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={
								busy || !graph || graph.nodes.length === 0
							}
							onClick={tidy}
							title="Arrange the graph automatically"
						>
							<LayoutGrid />
							Tidy
						</Button>
					</>
				)}

				<Separator
					orientation="vertical"
					className="data-[orientation=vertical]:h-6"
				/>

				{dirty && <Badge variant="outline">unsaved</Badge>}

				{/* The C2's verdict, in the operator's terms rather than the
				    compiler's. It says what is blocked — Submit — because Save
				    is deliberately still open beside it. It is also the way in
				    to the mission check: what the mission allocates, and every
				    issue, each one a click through to its node. */}
				<Popover open={checkOpen} onOpenChange={setCheckOpen}>
					<PopoverTrigger asChild>
						<Badge
							asChild
							variant={compiles ? "outline" : "destructive"}
							className={`cursor-pointer outline-none hover:brightness-110 ${
								compiles ? "border-success text-success" : ""
							}`}
						>
							<button
								type="button"
								aria-label={`${verdict}, mission check`}
							>
								{verdict}
								<ChevronDown />
							</button>
						</Badge>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						className="nokey flex w-80 flex-col gap-2 p-2"
					>
						<MissionCheck
							vehicles={compiled?.vehicles.length ?? 0}
							objectives={compiled?.geometries.length ?? 0}
							compiles={compiles}
							issues={issues}
							onSelectNode={(nodeId) => {
								selectOnlyNode(nodeId);
								setCheckOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>

				{/* The ONE filled button on this panel: the action it is here
				    for. Everything else is an outline. */}
				<Button
					size="sm"
					className="ml-auto"
					disabled={busy || !graph || !props.missionsSaveDef}
					onClick={() => void saveMission()}
					title="Save the mission, its graph and its assets"
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

			{outdated ? (
				// The repo's named-unsupported vocabulary — dashed border, muted
				// puzzle, the state named, an explicit action — and NOT error
				// vocabulary: nothing has gone wrong, this build simply cannot
				// read what is stored. Critically, no empty graph is loaded
				// behind it, so the mission's allocation is untouched until the
				// operator deliberately starts again.
				<div className="flex-1 min-h-0 flex items-center justify-center p-6">
					<div className="flex max-w-md flex-col items-center gap-3 rounded-md border border-dashed p-6 text-center">
						<Puzzle className="size-8 text-muted-foreground" />
						<p className="font-medium">
							This graph was made by an older editor and cannot be
							opened.
						</p>
						<Button size="sm" onClick={startFreshGraph}>
							Start a new graph
						</Button>
						<p className="text-[11px] text-muted-foreground">
							Saving the new graph replaces the old one.
						</p>
					</div>
				</div>
			) : (
				<div className="flex-1 min-h-0 flex min-w-0" ref={workAreaRef}>
					{/* Canvas */}
					<div
						className="relative flex-1 min-w-0 min-h-0"
						ref={canvasBox}
					>
						<ReactFlow
							nodes={canvasNodes}
							edges={canvasEdges}
							nodeTypes={NODE_TYPES}
							colorMode={dark ? "dark" : "light"}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onConnect={onConnect}
							onConnectEnd={onConnectEnd}
							onMoveStart={onMoveStart}
							isValidConnection={isValidConnection}
							onBeforeDelete={onBeforeDelete}
							nodesDraggable={!viewOnly}
							nodesConnectable={!viewOnly}
							onPaneClick={() => {
								setDropMenu(null);
								setDropNotice(null);
							}}
							deleteKeyCode={viewOnly ? null : DELETE_KEY_CODES}
							connectionLineStyle={{ strokeWidth: 2 }}
							proOptions={{ hideAttribution: false }}
						>
							<Background />
							{/* The shortcuts live with the canvas they are for,
							    in xyflow's own control stack, which takes its
							    theme from `colorMode` like the zoom buttons. */}
							<Controls showInteractive={false}>
								<Popover>
									<PopoverTrigger asChild>
										<ControlButton
											aria-label="Shortcuts"
											title="Shortcuts"
										>
											{/* xyflow fills its control icons;
											    this one is drawn in strokes. */}
											<CircleHelp
												style={{ fill: "none" }}
											/>
										</ControlButton>
									</PopoverTrigger>
									<PopoverContent
										side="right"
										align="end"
										className="flex w-72 flex-col gap-2 p-3"
									>
										<span className="text-xs font-medium">
											Shortcuts
										</span>
										<GraphHelp viewOnly={viewOnly} />
									</PopoverContent>
								</Popover>
							</Controls>
							{/* Every colour here reaches the DOM as a CSS custom
							    property or a `style` fill, never an SVG
							    attribute, so theme tokens resolve. The mask is
							    a tint of the card rather than a darker or
							    lighter shade of it: a black mask on the
							    near-black dark card, and a white one on the
							    white light card, left the view window
							    invisible. Its outline is given a width because
							    xyflow's default is one unit of the MINIMAP'S
							    scale, well under a pixel. */}
							<MiniMap
								pannable
								zoomable
								nodeColor={miniMapNodeColor}
								nodeStrokeColor="var(--border)"
								bgColor="var(--card)"
								maskColor="color-mix(in oklab, var(--muted-foreground) 22%, transparent)"
								maskStrokeColor="var(--ring)"
								maskStrokeWidth={1.5}
							/>
							<Panel position="top-left">
								<PortLegend />
							</Panel>
						</ReactFlow>

						{/* A refused or missed connection, said where it
						    happened rather than 800 px away at the top of the
						    panel, and in destructive tone rather than the tone
						    "Mission saved." uses. */}
						{dropNotice && (
							<div
								role="alert"
								className="absolute z-20 flex max-w-64 items-start gap-1.5 rounded-md border border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive shadow-md"
								style={{
									left: dropNotice.left,
									top: dropNotice.top,
									transform: "translate(-50%, 8px)",
								}}
							>
								<span className="min-w-0">
									{dropNotice.text}
								</span>
								<button
									type="button"
									aria-label="Dismiss"
									className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
									onClick={() => setDropNotice(null)}
								>
									<X className="size-3" />
								</button>
							</div>
						)}

						{dropMenu && dropMenu.missionId === missionId && (
							<div
								role="menu"
								aria-label="Add and wire a node"
								className="nokey absolute z-10 flex flex-col min-w-36 rounded-md border bg-popover p-1 text-xs shadow-md"
								style={{
									left: dropMenu.left,
									top: dropMenu.top,
								}}
								onKeyDown={(event) => {
									if (event.key !== "Escape") return;
									event.stopPropagation();
									setDropMenu(null);
								}}
								onBlur={(event) => {
									if (
										!event.currentTarget.contains(
											event.relatedTarget as HTMLElement | null,
										)
									)
										setDropMenu(null);
								}}
							>
								<span className="px-2 py-1 text-[10px] text-muted-foreground">
									Add and wire
								</span>
								{dropMenu.choices.map((choice, index) => (
									<button
										key={choice.key}
										type="button"
										role="menuitem"
										// The first item takes focus, so the menu
										// is operable from the keyboard the moment
										// it opens.
										autoFocus={index === 0}
										className="rounded px-2 py-1 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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

					{/* The details panel: open for exactly one selected node,
					    because it is where a node's parameters are changed, and
					    read-only in View because it is also the only place they
					    can be read. `nokey` is xyflow's own opt-out: no key
					    pressed inside this panel is ever read as a canvas
					    shortcut, so Backspace in the label field cannot delete
					    the node being named. */}
					{selectedNode && (
						<div
							className="w-64 shrink-0 border-l flex flex-col min-h-0 nokey"
							role="region"
							aria-label="Node details"
						>
							<div className="flex items-center gap-2 min-w-0 border-b px-2 py-1">
								<span className="min-w-0 truncate text-xs font-medium">
									{selectedNode.label ||
										KIND_STYLE[selectedNode.kind].label}
								</span>
								<div className="ml-auto flex shrink-0 items-center gap-1">
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Close"
										title="Close"
										onClick={clearSelection}
									>
										<X />
									</Button>
								</div>
							</div>
							<ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block">
								<div className="p-2 flex flex-col gap-2">
									<NodeInspector
										node={selectedNode}
										wiredFrom={
											(
												canvasNodes.find(
													(node) =>
														node.id ===
														selectedNode.id,
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
										readOnly={viewOnly}
										onPatch={(patch) =>
											patchNode(selectedNode.id, patch)
										}
										onDelete={() =>
											requestDeleteNode(selectedNode.id)
										}
									/>
								</div>
							</ScrollArea>
						</div>
					)}
				</div>
			)}

			{/* Deleting a node that carries wiring says what breaks, and both
			    delete paths leave the undo cue on screen. */}
			<AlertDialog
				open={confirmDelete != null}
				onOpenChange={(open) => {
					if (!open) setConfirmDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmDelete
								? `Delete “${confirmDelete.label}” and its ${confirmDelete.edges} link${
										confirmDelete.edges === 1 ? "" : "s"
									}?`
								: ""}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Ctrl+Z to undo.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDeleteNode}>
							Delete node
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/**
 * What each port carries.
 *
 * Every port type has a row. The old legend listed four of six and folded
 * `waypoint`, `zone` and `asset` into one "place" entry — while the help text
 * beside it told the operator to match colours, which for those three could not
 * be done because they share one. Colour is the family, shape is the member.
 */
function PortLegend() {
	const rows: [PortType, string][] = [
		["agent", "the robot's chain"],
		["waypoint", "a place to go"],
		["zone", "an area to sweep"],
		["asset", "a map asset (either kind)"],
		["bool", "true / false"],
		["event", "contacts"],
	];
	return (
		<div className="flex flex-col gap-0.5 rounded border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">
			{rows.map(([type, text]) => (
				<span key={type} className="flex items-center gap-1.5">
					<span className="inline-flex size-3 items-center justify-center">
						<span style={portDotStyle(type, "idle")} />
					</span>
					{text}
				</span>
			))}
		</div>
	);
}

/**
 * The shortcuts nothing on screen shows, as a compact list. The port legend is
 * on the canvas, and drag-and-drop is left to the canvas's own highlighting.
 */
const GRAPH_SHORTCUTS: readonly (readonly [string, string])[] = [
	["Enter on two ports", "Link them"],
	["Drop a link on the canvas", "Add a wired node"],
	["Delete / Backspace", "Delete selection"],
	["Esc", "Cancel, clear selection"],
	["Ctrl+Z / Ctrl+Y", "Undo / redo"],
	["Ctrl+C / Ctrl+V", "Copy / paste"],
];

/**
 * The shortcut list behind the toolbar's help button. In View it still lists
 * them, after saying where editing is, because the list is also how a keyboard
 * operator learns that ports can be linked without a mouse.
 */
function GraphHelp(props: { viewOnly: boolean }) {
	return (
		<>
			{props.viewOnly && (
				<p className="text-xs text-muted-foreground">
					Choose <strong>Author</strong> to edit.
				</p>
			)}
			<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
				{GRAPH_SHORTCUTS.map(([keys, does]) => (
					<Fragment key={keys}>
						<dt className="font-medium">{keys}</dt>
						<dd className="text-muted-foreground">{does}</dd>
					</Fragment>
				))}
			</dl>
		</>
	);
}

/** "1 vehicle", "3 vehicles". */
function countOf(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The mission check, behind the toolbar's verdict badge: what the mission
 * allocates, and every issue, each a click through to its node.
 */
function MissionCheck(props: {
	vehicles: number;
	objectives: number;
	compiles: boolean;
	issues: readonly MissionGraphIssue[];
	onSelectNode: (nodeId: string) => void;
}) {
	return (
		<>
			<span className="text-xs text-muted-foreground">
				{countOf(props.vehicles, "vehicle")} ·{" "}
				{countOf(props.objectives, "objective")}
			</span>
			{!props.compiles && (
				<span className="text-[11px] text-muted-foreground">
					Save still works.
				</span>
			)}
			{props.issues.length > 0 ? (
				<div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
					{props.issues.map((issue, index) => (
						<IssueRow
							key={`${issue.nodeId ?? "graph"}-${index}`}
							issue={issue}
							onSelect={() => {
								if (issue.nodeId)
									props.onSelectNode(issue.nodeId);
							}}
						/>
					))}
				</div>
			) : (
				<span className="text-xs text-muted-foreground">
					No issues.
				</span>
			)}
		</>
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
			className={`text-left text-[11px] rounded px-1.5 py-1 ${tone} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
				issue.nodeId
					? "cursor-pointer hover:brightness-110"
					: "cursor-default opacity-80"
			}`}
			onClick={props.onSelect}
			disabled={!issue.nodeId}
			title={
				issue.nodeId ? "Show the node" : "Applies to the whole graph"
			}
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
	/** Showing rather than authoring. */
	readOnly?: boolean;
	onChange: (condition: GraphCondition | undefined) => void;
}) {
	const { condition, readOnly } = props;
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
				disabled={readOnly}
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
					{/* A step being done is its `done` output, wired. */}
					{CONDITION_OPS.filter((op) => op !== "StepDone").map(
						(op) => (
							<SelectItem key={op} value={op}>
								{CONDITION_OP_SHAPE[op].label}
							</SelectItem>
						),
					)}
				</SelectContent>
			</Select>

			{condition && shape && (
				<>
					{shape.key === "zone" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Zone</Label>
							<Select
								disabled={readOnly}
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

					{shape.key === "flag" && (
						<div className="flex flex-col gap-1">
							<Label className="text-[11px]">Flag name</Label>
							{/* A flag IS a name the fog looks up in `s.flags` —
							    free text is correct here. */}
							<Input
								disabled={readOnly}
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
								disabled={readOnly}
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
								disabled={readOnly}
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
								disabled={readOnly}
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
							disabled={readOnly}
							checked={condition.negate}
							onCheckedChange={(checked) =>
								update({ negate: checked === true })
							}
						/>
						Invert (NOT)
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
	/** Showing rather than authoring: every control stands down. */
	readOnly: boolean;
	onPatch: (patch: Partial<MissionGraphNode>) => void;
	onDelete: () => void;
}) {
	const { node, readOnly } = props;
	const targetWired = props.wiredFrom.target ?? [];
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label className="text-xs">{KIND_STYLE[node.kind].label}</Label>
				{/* A destructive action says what it does. A bare red glyph is
				    a guess the operator has to make about the one control on
				    this panel they cannot take back without an undo. */}
				{!readOnly && (
					<Button
						size="sm"
						variant="ghost"
						className="text-destructive hover:text-destructive"
						onClick={props.onDelete}
					>
						<Trash2 />
						Delete node
					</Button>
				)}
			</div>

			{/* A label is a caption the operator writes for themselves — the one
			    thing on a node that is genuinely free text. */}
			<Input
				className="h-8"
				value={node.label}
				placeholder="Label"
				aria-label="Node label"
				disabled={readOnly}
				onChange={(event) =>
					props.onPatch({ label: event.target.value })
				}
			/>

			{node.kind === "agent" && (
				<Select
					value={node.agent_id || UNSET}
					disabled={readOnly}
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
						disabled={readOnly}
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
						Edit its geometry on the mission map.
					</p>
				</>
			)}

			{node.kind === "action" && (
				<>
					<Select
						value={node.action ?? UNSET}
						disabled={readOnly}
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
							disabled={readOnly}
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
					disabled={readOnly}
					onValueChange={(value) =>
						props.onPatch({ mode: value as WaitMode })
					}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							When all inputs hold
						</SelectItem>
						<SelectItem value="any">
							When any input holds
						</SelectItem>
					</SelectContent>
				</Select>
			)}

			{node.kind === "on_contact" && (
				<p className="text-[11px] text-muted-foreground">
					Visits each contact in turn, then leaves on &ldquo;no
					more&rdquo;.
					{(props.wiredFrom.event?.length ?? 0) > 0
						? ` Contacts of: ${props.wiredFrom.event?.join(", ")}.`
						: " Wire a Coverage's “on contact” into it."}
				</p>
			)}

			{node.kind === "condition" && (
				<ConditionEditor
					condition={node.condition}
					zones={props.zones}
					readOnly={readOnly}
					onChange={(condition) => props.onPatch({ condition })}
				/>
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

	if (!missionsListDef) {
		return (
			<PanelEmptyState>
				No C2 datasource. Add a C2 Control datasource.
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
	// The mission-control page seeds its panels by calling this factory from
	// OUTSIDE render, so it must stay hook-free. It returns JSX (`icon`), which
	// is enough for the React Compiler to take it for a component and give it a
	// `useMemoCache` call — the dev build does exactly that, and the page then
	// dies on "Invalid hook call" before it can apply its layout. Opt out.
	"use no memo";
	return {
		id: "c2-mission-graph-widget",
		name: "C2 Mission Graph",
		description: "Edit a mission's behaviour graph",
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
